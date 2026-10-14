namespace RailAgent.Services;

/// <summary>Which historical feed a backfill should pull.</summary>
public enum BackfillFeed
{
    Hourly,
    Server,
    ZReport,
    EwReport,
    ItemAudit,
}

/// <summary>
/// Planning for a one-off pull of history out of the POS database.
///
/// The ordinary sync asks for "everything since N days ago" and posts it in one
/// request, which is right for a five-minute cadence over a two-day window and
/// wrong for a year. A year of trade exceeds both the ingest route's body limit
/// and its thirty-second budget, so the range has to be cut into pieces — and
/// cutting it needs an upper bound, which no normal query has.
///
/// Pure, so the arithmetic that decides which nights get sent (and which get
/// sent twice) is settled here rather than inside a loop talking to SQL Server.
/// </summary>
public static class Backfill
{
    public sealed record Window(DateOnly From, DateOnly To);

    /// <summary>
    /// Days per request. Hourly trade is at most 24 rows a night and per-server
    /// perhaps a dozen, so a month is on the order of a thousand rows — well
    /// inside what the route accepts, with room for a busy bar.
    /// </summary>
    public const int DefaultChunkDays = 30;

    /// <summary>
    /// Cuts [from, to) into consecutive windows, oldest first.
    ///
    /// Each window's upper bound is exclusive and is exactly the next window's
    /// lower bound: a tiling, not an overlap. A night included in two windows
    /// would be posted twice, and while the ingest upserts Z reports on
    /// (organization_id, report_date), that is not a property worth leaning on
    /// when the arithmetic can simply be right.
    ///
    /// Oldest first so an interrupted run leaves a contiguous history with a
    /// hole at the recent end — which the ordinary sync's rolling window then
    /// closes on its own.
    /// </summary>
    public static List<Window> Chunks(DateOnly from, DateOnly to, int chunkDays = DefaultChunkDays)
    {
        var windows = new List<Window>();
        if (to <= from) return windows;

        // A zero or negative step would never advance the cursor. Clamping
        // rather than throwing: the caller is a command line, and a stuck loop
        // on a POS box is worse than a sensible default.
        var step = chunkDays > 0 ? chunkDays : DefaultChunkDays;

        var cursor = from;
        while (cursor < to)
        {
            var next = cursor.AddDays(step);
            if (next > to) next = to;
            windows.Add(new Window(cursor, next));
            cursor = next;
        }

        return windows;
    }

    /// <summary>
    /// Which of the requested feeds have no table or view mapped on this box.
    ///
    /// Worth checking before any work starts. A pre-1.3 config carries no
    /// hourly or per-server mapping, so a backfill of those feeds would query
    /// nothing, post nothing and finish reporting zero rows — which reads as
    /// "the POS has no history that far back" rather than "this box was never
    /// told where to look". Those two want completely different responses.
    /// </summary>
    public static IReadOnlyList<BackfillFeed> Unconfigured(
        IReadOnlyList<BackfillFeed> requested, Func<BackfillFeed, string?> tableFor)
        => requested.Where(f => string.IsNullOrWhiteSpace(tableFor(f))).ToList();

    /// <summary>
    /// Reads the --feeds flag.
    ///
    /// Required rather than defaulted, and a name it does not recognise is an
    /// error rather than a silent omission. Backfilling the item audit writes
    /// usage_logs with reason 'pos_sale' and moves current_stock for every night
    /// in range, so which feeds run is a decision with inventory consequences
    /// and must be made out loud. A typo that quietly pulled less than asked
    /// would look exactly like a POS with no history.
    /// </summary>
    public static IReadOnlyList<BackfillFeed> ParseFeeds(string? flag)
    {
        var names = (flag ?? "")
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        if (names.Length == 0)
            throw new ArgumentException("--feeds is required, e.g. --feeds hourly,server");

        var feeds = new List<BackfillFeed>();
        foreach (var name in names)
        {
            feeds.Add(name.ToLowerInvariant() switch
            {
                "hourly"                  => BackfillFeed.Hourly,
                "server"                  => BackfillFeed.Server,
                "z" or "zreport"          => BackfillFeed.ZReport,
                "ew" or "ewreport"        => BackfillFeed.EwReport,
                "items" or "itemaudit"    => BackfillFeed.ItemAudit,
                _ => throw new ArgumentException(
                    $"Unknown feed '{name}'. Valid: hourly, server, z, ew, items."),
            });
        }

        return feeds;
    }
}
