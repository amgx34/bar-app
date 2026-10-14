using RailAgent.Config;
using RailAgent.Services;
using RailAgent.Setup;
using Xunit;

namespace RailAgent.Tests;

/// <summary>
/// Pulling history out of a POS box.
///
/// Every normal query is "everything since N days ago" — one lower bound,
/// computed from today, no upper bound at all. That is fine for a five-minute
/// sync and useless for a backfill: without an upper bound the range cannot be
/// cut into pieces, and a year of trade in one POST does not fit inside the
/// ingest route's body limit or its 30-second budget.
/// </summary>
public class BackfillTests
{
    private static readonly HourlySalesColumns Cols = new()
    {
        Date = "[dtmTicketDate]", Sales = "[dcSales]", Tips = "[dcTips]", TicketNo = "[lTicketNo]",
    };

    // ── The upper bound ──────────────────────────────────────────────────────

    [Fact]
    public void Without_an_upper_bound_the_query_is_unchanged()
    {
        // Every existing caller passes no bound and must keep the exact query
        // it has today.
        var sql = SqlReader.HourlySalesSql("[tbl]", Cols, 2, 0);

        Assert.DoesNotContain(" < '", sql);
    }

    [Fact]
    public void An_upper_bound_is_exclusive_so_chunks_cannot_double_count()
    {
        var sql = SqlReader.HourlySalesSql("[tbl]", Cols, 400, 0, until: new DateOnly(2026, 1, 1));

        Assert.Contains("< '2026-01-01'", sql);
    }

    [Fact]
    public void The_upper_bound_is_formatted_independently_of_machine_locale()
    {
        // A POS box set to a culture that renders dates d/M/yyyy would otherwise
        // send SQL Server a date it reads as a different day, or rejects.
        var sql = SqlReader.ServerSalesSql(
            "[tbl]",
            new ServerSalesColumns { Date = "[d]", ServerName = "[s]", Sales = "[v]", Tips = "[t]", TicketNo = "[n]" },
            400, 0, until: new DateOnly(2026, 3, 9));

        Assert.Contains("'2026-03-09'", sql);
    }

    [Fact]
    public void The_upper_bound_is_applied_to_the_business_date_not_the_raw_column()
    {
        // With a 4am cutoff a 1am ticket belongs to the night before, so an
        // upper bound on the raw timestamp would file it in the wrong chunk —
        // and chunk boundaries are exactly where that goes wrong.
        var sql = SqlReader.HourlySalesSql("[tbl]", Cols, 400, 4, until: new DateOnly(2026, 1, 1));

        Assert.Contains($"{SqlReader.BusinessDate("[dtmTicketDate]", 4)} < '2026-01-01'", sql);
    }

    // ── Cutting the range into postable pieces ───────────────────────────────

    [Fact]
    public void A_range_shorter_than_one_chunk_is_a_single_window()
    {
        var chunks = Backfill.Chunks(new DateOnly(2026, 1, 1), new DateOnly(2026, 1, 10), 30);

        Assert.Single(chunks);
        Assert.Equal(new DateOnly(2026, 1, 1), chunks[0].From);
        Assert.Equal(new DateOnly(2026, 1, 10), chunks[0].To);
    }

    [Fact]
    public void Chunks_tile_the_range_without_gap_or_overlap()
    {
        var chunks = Backfill.Chunks(new DateOnly(2026, 1, 1), new DateOnly(2026, 4, 1), 30);

        Assert.Equal(new DateOnly(2026, 1, 1), chunks[0].From);
        Assert.Equal(new DateOnly(2026, 4, 1), chunks[^1].To);

        for (var i = 1; i < chunks.Count; i++)
        {
            // Each window starts exactly where the previous one ended. The
            // upper bound is exclusive, so this is a tiling, not an overlap —
            // a day counted twice would double a night's takings.
            Assert.Equal(chunks[i - 1].To, chunks[i].From);
        }
    }

    [Fact]
    public void The_last_chunk_is_clamped_to_the_end_of_the_range()
    {
        var chunks = Backfill.Chunks(new DateOnly(2026, 1, 1), new DateOnly(2026, 2, 15), 30);

        Assert.Equal(new DateOnly(2026, 2, 15), chunks[^1].To);
    }

    [Fact]
    public void Oldest_first_so_an_interrupted_backfill_leaves_a_contiguous_history()
    {
        var chunks = Backfill.Chunks(new DateOnly(2026, 1, 1), new DateOnly(2026, 4, 1), 30);

        Assert.True(chunks[0].From < chunks[^1].From);
    }

    [Fact]
    public void An_empty_or_inverted_range_produces_nothing()
    {
        Assert.Empty(Backfill.Chunks(new DateOnly(2026, 1, 1), new DateOnly(2026, 1, 1), 30));
        Assert.Empty(Backfill.Chunks(new DateOnly(2026, 4, 1), new DateOnly(2026, 1, 1), 30));
    }

    [Fact]
    public void A_nonsense_chunk_size_still_terminates()
    {
        // Guards the loop: a zero or negative step would otherwise never advance.
        var chunks = Backfill.Chunks(new DateOnly(2026, 1, 1), new DateOnly(2026, 1, 5), 0);

        Assert.NotEmpty(chunks);
        Assert.Equal(new DateOnly(2026, 1, 5), chunks[^1].To);
    }

    // ── Which feeds ──────────────────────────────────────────────────────────

    [Fact]
    public void Feeds_are_parsed_from_the_comma_separated_flag()
    {
        var feeds = Backfill.ParseFeeds("hourly,server");

        Assert.Contains(BackfillFeed.Hourly, feeds);
        Assert.Contains(BackfillFeed.Server, feeds);
        Assert.DoesNotContain(BackfillFeed.ItemAudit, feeds);
    }

    [Fact]
    public void Feed_names_are_case_and_space_insensitive()
    {
        var feeds = Backfill.ParseFeeds(" Hourly , SERVER ");

        Assert.Equal(2, feeds.Count);
    }

    [Fact]
    public void An_unknown_feed_name_is_rejected_rather_than_ignored()
    {
        // Silently dropping a typo would mean a backfill that quietly moved
        // less than asked, which is indistinguishable from a POS with no data.
        Assert.Throws<ArgumentException>(() => Backfill.ParseFeeds("hourly,sever"));
    }

    [Fact]
    public void No_feeds_at_all_is_rejected()
    {
        Assert.Throws<ArgumentException>(() => Backfill.ParseFeeds(""));
    }

    // ── A feed that was never mapped ─────────────────────────────────────────

    [Fact]
    public void A_requested_feed_with_no_table_is_reported_as_unconfigured()
    {
        // The case that matters: a box still on a pre-1.3 config has no hourly
        // or per-server mapping at all. Backfilling it would query nothing,
        // post nothing and report "0 rows" — indistinguishable from a POS that
        // simply kept no history, and the operator would conclude the data was
        // not there.
        var missing = Backfill.Unconfigured(
            [BackfillFeed.Hourly, BackfillFeed.Server],
            f => f == BackfillFeed.Server ? "[vwServerSales]" : null);

        Assert.Equal([BackfillFeed.Hourly], missing);
    }

    [Fact]
    public void Blank_counts_as_unconfigured_not_as_a_table_named_blank()
    {
        var missing = Backfill.Unconfigured([BackfillFeed.Hourly], _ => "   ");

        Assert.Single(missing);
    }

    [Fact]
    public void Nothing_is_reported_when_every_requested_feed_is_mapped()
    {
        var missing = Backfill.Unconfigured(
            [BackfillFeed.Hourly, BackfillFeed.Server], _ => "[tbl]");

        Assert.Empty(missing);
    }
}
