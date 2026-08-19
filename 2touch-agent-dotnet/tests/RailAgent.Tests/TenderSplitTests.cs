using Xunit;
using RailAgent.Config;
using RailAgent.Services;
using RailAgent.Setup;

namespace RailAgent.Tests;

/// <summary>
/// The cash/card split: how it reaches the query, and how a wrong one is caught.
/// </summary>
public class TenderSplitTests
{
    // ── The query ─────────────────────────────────────────────────────────────

    [Fact]
    public void UnmappedSplitEmitsValidSqlRatherThanAMissingColumn()
    {
        // A config written before the split existed deserialises with the
        // defaults. If those named a column, every such bar's Z feed would fail
        // outright — losing sales and tips to gain a split it never had.
        var columns = new ZReportColumns { Date = "[BusinessDate]", Sales = "[NetSales]" };

        Assert.Equal("0", columns.CashSales);
        Assert.Equal("0", columns.CardSales);

        var sql = SqlReader.ZReportSql("[dbo].[ZView]", columns, 2, 4);
        Assert.Contains("SUM(0) AS cash_sales", sql);
        Assert.Contains("SUM(0) AS card_sales", sql);
    }

    [Fact]
    public void TwoTouchProfileMapsTheSplitItsDerivedTableExposes()
    {
        var cfg = new AgentConfig();
        var feed = TwoTouchProfile.ZReport;
        TwoTouchProfile.Apply(feed, cfg);

        Assert.Equal("[CashSales]", cfg.Columns.ZReport.CashSales);
        Assert.Equal("[CardSales]", cfg.Columns.ZReport.CardSales);

        // The aliases the config points at have to exist in the derived table,
        // and cash has to be net of change handed back.
        Assert.Contains("AS CashSales", feed.Source);
        Assert.Contains("AS CardSales", feed.Source);
        Assert.Contains("fCashPaidBack", feed.Source);

        // Every arm of the UNION must have the same column count, or SQL Server
        // rejects the whole statement.
        var arms = feed.Source.Split("UNION ALL");
        Assert.Equal(4, arms.Length);
    }

    // ── The reconciliation warning ────────────────────────────────────────────

    [Fact]
    public void PlausibleNightIsNotFlagged()
    {
        // Net sales 1000, plus tax and tips, tendered as 700 cash + 480 card.
        Assert.Null(SyncService.TenderWarning(1000m, 700m, 480m));
    }

    [Fact]
    public void NothingReportedIsNotFlagged()
    {
        // An unmapped schema sends 0 + 0 every night. That is silence, not an
        // anomaly, and warning about it would train people to ignore the log.
        Assert.Null(SyncService.TenderWarning(1000m, 0m, 0m));
        Assert.Null(SyncService.TenderWarning(0m, 0m, 0m));
    }

    [Fact]
    public void TenderedCashInsteadOfNetIsFlagged()
    {
        // The failure this exists for: change handed back never subtracted, so
        // cash is roughly what walked in the door rather than what stayed.
        var warning = SyncService.TenderWarning(1000m, 1600m, 480m);
        Assert.NotNull(warning);
        Assert.Contains("net of change", warning);
    }

    [Fact]
    public void MissingPaymentTypesAreFlagged()
    {
        // Gift cards, house accounts, a payment type outside the CASE arms.
        var warning = SyncService.TenderWarning(1000m, 200m, 300m);
        Assert.NotNull(warning);
        Assert.Contains("missing from the split", warning);
    }

    [Fact]
    public void RoundTripsThroughTheWrittenConfig()
    {
        var cfg = new AgentConfig();
        cfg.Columns.ZReport.CashSales = "[CashSales]";
        cfg.Columns.ZReport.CardSales = "[CardSales]";
        cfg.Columns.ZReport.DateHasTime = false;

        var json = LocalConfigWriter.Render(cfg);

        Assert.Contains("CashSales", json);
        Assert.Contains("CardSales", json);
        // DateHasTime decides the business-day cutoff. It was decided during
        // setup and never written, so the service fell back to the default and
        // a plain-DATE schema had the cutoff applied twice.
        Assert.Contains("DateHasTime", json);
    }
}
