namespace RailAgent.Setup;

/// <summary>
/// Ranks every table and view in the database against a feed's required columns.
///
/// The scoring is deliberately blunt — the operator confirms the result and the
/// mapping is proved with a TOP 5 query before anything is written — so it aims
/// to put the right relation in the top five, not to be right unattended.
/// </summary>
public static class SchemaScorer
{
    public const int SynonymScore  = 10;
    public const int KeywordScore  = 5;
    public const int TypeBonus     = 2;
    public const int AffinityBonus = 8;

    /// <summary>
    /// Best candidates first. A relation is excluded outright when any required
    /// column has no type-compatible candidate in it — a relation you cannot
    /// write the query against is not a worse answer, it is not an answer.
    /// </summary>
    public static IReadOnlyList<RelationMatch> Rank(
        FeedSpec feed,
        IEnumerable<RelationInfo> relations,
        int take = 5)
    {
        var ranked = new List<RelationMatch>();

        foreach (var relation in relations)
        {
            var match = Score(feed, relation);
            if (match is not null) ranked.Add(match);
        }

        return ranked
            .OrderByDescending(m => m.Score)
            .ThenBy(m => m.Relation.Name, StringComparer.OrdinalIgnoreCase)
            .Take(take)
            .ToList();
    }

    /// <summary>Scores one relation, or returns null if it cannot satisfy the feed.</summary>
    public static RelationMatch? Score(FeedSpec feed, RelationInfo relation)
    {
        var fields = new List<FieldMatch>(feed.Fields.Length);
        var total = 0;

        foreach (var field in feed.Fields)
        {
            var best = BestColumn(field, relation);
            if (best is null) return null;      // required column unsatisfiable → drop the relation
            fields.Add(best);
            total += best.Score;
        }

        if (HasAffinity(feed, relation)) total += AffinityBonus;

        return new RelationMatch(relation, total, fields);
    }

    /// <summary>Highest-scoring type-compatible column for one field, or null if there is none.</summary>
    public static FieldMatch? BestColumn(FieldSpec field, RelationInfo relation)
    {
        FieldMatch? best = null;

        foreach (var column in relation.Columns)
        {
            if (!column.Fits(field.Kind)) continue;   // hard gate, see SqlTypes.Fits

            var score = TypeBonus + NameScore(field, column);
            if (best is null || score > best.Score)
                best = new FieldMatch(field, column, score);
        }

        return best;
    }

    private static int NameScore(FieldSpec field, ColumnInfo column)
    {
        // Three readings of the same column name, because a real TwoTouch
        // database writes fTipsCash where the synonym list says "cashtips":
        // as written, with the Hungarian prefix dropped, and word-order-free.
        foreach (var synonym in field.Synonyms)
        {
            if (column.Normalized.Equals(synonym, StringComparison.Ordinal)) return SynonymScore;
            if (column.Stripped.Equals(synonym, StringComparison.Ordinal)) return SynonymScore;
            if (column.TokenKey.Equals(SchemaNames.TokenKey(synonym), StringComparison.Ordinal)) return SynonymScore;
        }

        foreach (var keyword in field.Keywords)
        {
            if (column.Normalized.Contains(keyword, StringComparison.Ordinal)) return KeywordScore;
            if (column.Stripped.Contains(keyword, StringComparison.Ordinal)) return KeywordScore;
        }

        return 0;
    }

    private static bool HasAffinity(FeedSpec feed, RelationInfo relation)
    {
        foreach (var token in feed.NameAffinity)
            if (relation.Normalized.Contains(token, StringComparison.Ordinal)) return true;
        return false;
    }
}
