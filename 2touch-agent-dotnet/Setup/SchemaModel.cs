namespace RailAgent.Setup;

/// <summary>What a target column has to hold for the feed's query to work.</summary>
public enum ColumnKind { Date, Numeric, Text }

/// <summary>One column as INFORMATION_SCHEMA.COLUMNS reports it.</summary>
public sealed record ColumnInfo(string Name, string DataType)
{
    /// <summary>Lowercased, punctuation stripped: net_sales and NetSales both become netsales.</summary>
    public string Normalized { get; } = SchemaNames.Normalize(Name);

    /// <summary>As above, with any Hungarian prefix removed: fTotalSales → totalsales.</summary>
    public string Stripped { get; } = SchemaNames.Normalize(SchemaNames.StripPrefix(Name));

    /// <summary>Words sorted, so fTipsCash and CashTips agree.</summary>
    public string TokenKey { get; } = SchemaNames.TokenKey(Name);

    public bool Fits(ColumnKind kind) => SqlTypes.Fits(DataType, kind);
}

/// <summary>A table or view, with its columns. Both are discovery candidates.</summary>
public sealed record RelationInfo(string Schema, string Name, IReadOnlyList<ColumnInfo> Columns)
{
    /// <summary>Prefix dropped too, so tblSalesHdrHist and VW_tblSalesDaily_Rpt still read as names.</summary>
    public string Normalized { get; } = SchemaNames.Normalize(SchemaNames.StripPrefix(Name));

    /// <summary>Bracket-quoted so a name with a space or a reserved word cannot break the query.</summary>
    public string Quoted => $"[{Schema}].[{Name}]";
}

/// <summary>One required column of a feed, plus what its name tends to look like.</summary>
/// <param name="Key">Matches the property name in <c>Config.ColumnsConfig</c>.</param>
public sealed record FieldSpec(
    string Key,
    string Label,
    ColumnKind Kind,
    string[] Synonyms,
    string[] Keywords);

/// <param name="NameAffinity">Substrings that suggest a relation belongs to this feed.</param>
public sealed record FeedSpec(
    string Key,
    string Label,
    string[] NameAffinity,
    FieldSpec[] Fields);

/// <summary>One column proposal inside a candidate relation.</summary>
public sealed record FieldMatch(FieldSpec Field, ColumnInfo Column, int Score)
{
    /// <summary>
    /// True when the column was chosen on type alone — nothing about its name
    /// suggests it holds this. An INT primary key is a perfectly type-compatible
    /// candidate for "quantity sold", which is exactly the proposal an operator
    /// must be nudged to look at.
    /// </summary>
    public bool IsWeak => Score <= SchemaScorer.TypeBonus;
}

/// <summary>A ranked candidate: the whole relation plus a proposed column per field.</summary>
public sealed record RelationMatch(RelationInfo Relation, int Score, IReadOnlyList<FieldMatch> Fields)
{
    public ColumnInfo ColumnFor(string fieldKey)
        => Fields.First(f => f.Field.Key == fieldKey).Column;

    /// <summary>
    /// Columns proposed for more than one field. Type compatibility is the only
    /// hard gate, so a relation with a single numeric column will offer it for
    /// every amount — a mapping that would double-count. Worth saying out loud
    /// before the operator accepts it.
    /// </summary>
    public IReadOnlyList<string> DuplicatedColumns()
        => Fields.GroupBy(f => f.Column.Name, StringComparer.OrdinalIgnoreCase)
                 .Where(g => g.Count() > 1)
                 .Select(g => g.Key)
                 .ToList();

    /// <summary>Fields matched on type alone. See <see cref="FieldMatch.IsWeak"/>.</summary>
    public IReadOnlyList<FieldMatch> WeakFields()
        => Fields.Where(f => f.IsWeak).ToList();
}

public static class SchemaNames
{
    /// <summary>Lowercase and drop everything that is not a letter or digit.</summary>
    public static string Normalize(string s)
    {
        Span<char> buf = stackalloc char[s.Length];
        var n = 0;
        foreach (var c in s)
            if (char.IsLetterOrDigit(c)) buf[n++] = char.ToLowerInvariant(c);
        return new string(buf[..n]);
    }

    // A real TwoTouch database is Hungarian-notation throughout: fTotalSales,
    // dtmClaimDate, szDescription, tblSalesHdrHist. Left attached, the prefix
    // defeats every synonym — "ftotalsales" is not "totalsales".
    private static readonly string[] Prefixes =
        ["dtm", "bln", "dbl", "tbl", "vw", "sz", "fk", "pk", "f", "l", "i", "u"];

    /// <summary>
    /// Drops a Hungarian prefix, but only where the remainder starts with a
    /// capital — that is what makes it a prefix rather than the first letter of
    /// the word. Keeps a column genuinely named "item" from becoming "tem".
    /// </summary>
    public static string StripPrefix(string s)
    {
        var trimmed = s.TrimStart('_');
        foreach (var p in Prefixes)
        {
            if (trimmed.Length <= p.Length) continue;
            if (!trimmed.StartsWith(p, StringComparison.Ordinal)) continue;

            var rest = trimmed[p.Length..].TrimStart('_');
            if (rest.Length > 0 && char.IsUpper(rest[0])) return rest;
        }
        return trimmed;
    }

    /// <summary>
    /// Prefix dropped, split into words, sorted, rejoined. Makes compound names
    /// order-insensitive, which is how fTipsCash reaches the synonym "cashtips"
    /// and fTipsCC reaches "cctips".
    /// </summary>
    public static string TokenKey(string s)
    {
        var words = new List<string>();
        var current = new System.Text.StringBuilder();

        foreach (var c in StripPrefix(s))
        {
            if (!char.IsLetterOrDigit(c))
            {
                if (current.Length > 0) { words.Add(current.ToString()); current.Clear(); }
                continue;
            }
            // A capital after a lower-case letter starts a new word: NetSales → Net, Sales.
            if (char.IsUpper(c) && current.Length > 0 && char.IsLower(current[^1]))
            {
                words.Add(current.ToString());
                current.Clear();
            }
            current.Append(char.ToLowerInvariant(c));
        }
        if (current.Length > 0) words.Add(current.ToString());

        words.Sort(StringComparer.Ordinal);
        return string.Concat(words);
    }
}

public static class SqlTypes
{
    private static readonly HashSet<string> Dates =
        new(StringComparer.OrdinalIgnoreCase) { "date", "datetime", "datetime2", "smalldatetime", "datetimeoffset" };

    private static readonly HashSet<string> Numbers =
        new(StringComparer.OrdinalIgnoreCase)
        { "decimal", "numeric", "money", "smallmoney", "float", "real", "int", "bigint", "smallint", "tinyint" };

    private static readonly HashSet<string> Texts =
        new(StringComparer.OrdinalIgnoreCase) { "char", "nchar", "varchar", "nvarchar", "text", "ntext" };

    /// <summary>
    /// Type compatibility is a hard gate, not a preference. An nvarchar cannot be
    /// SUM()-ed and a varchar date cannot be CAST reliably across collations, so a
    /// mismatched column is not a candidate at all.
    /// </summary>
    public static bool Fits(string dataType, ColumnKind kind) => kind switch
    {
        ColumnKind.Date    => Dates.Contains(dataType),
        ColumnKind.Numeric => Numbers.Contains(dataType),
        ColumnKind.Text    => Texts.Contains(dataType),
        _                  => false,
    };

    /// <summary>
    /// True when the column carries a time component, and so needs the
    /// business-day cutoff applied before it is truncated to a trading date.
    ///
    /// A plain <c>date</c> column has already been rounded by whoever wrote it;
    /// shifting it back would move every night to the day before. A
    /// <c>datetime</c> still holds the hour the ticket was rung, which is what
    /// the cutoff needs.
    /// </summary>
    public static bool CarriesTime(string dataType)
        => Dates.Contains(dataType) && !"date".Equals(dataType, StringComparison.OrdinalIgnoreCase);
}
