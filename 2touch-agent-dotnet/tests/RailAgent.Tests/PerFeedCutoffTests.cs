using RailAgent.Config;
using RailAgent.Services;
using RailAgent.Setup;
using Xunit;

namespace RailAgent.Tests;

/// <summary>
/// The trading-day cutoff is one number applied to three feeds, and it is only
/// valid on a column that still carries a time.
///
/// These exist because of a real defect: the wizard decided "does the date
/// column carry a time?" from the SALES column alone and applied the answer to
/// all three feeds. Where the labour view exposed a plain `date`, subtracting
/// four hours from midnight moved every shift back a day — so hours were filed,
/// and people were paid, against the wrong night.
/// </summary>
public class PerFeedCutoffTests
{
    // ── The rule ─────────────────────────────────────────────────────────────

    [Theory]
    [InlineData("datetime", true)]
    [InlineData("datetime2", true)]
    [InlineData("smalldatetime", true)]
    [InlineData("datetimeoffset", true)]
    [InlineData("date", false)]     // already rounded — must never be shifted
    public void CarriesTime_identifies_columns_that_may_take_a_cutoff(string sqlType, bool expected)
        => Assert.Equal(expected, SqlTypes.CarriesTime(sqlType));

    [Fact]
    public void A_dateless_column_resolves_to_no_cutoff()
        => Assert.Equal(0, SqlReader.FeedCutoff(dateHasTime: false, configuredCutoff: 4));

    [Fact]
    public void A_timestamped_column_keeps_the_configured_cutoff()
        => Assert.Equal(4, SqlReader.FeedCutoff(dateHasTime: true, configuredCutoff: 4));

    [Fact]
    public void A_zero_cutoff_stays_zero_regardless_of_column_type()
        => Assert.Equal(0, SqlReader.FeedCutoff(dateHasTime: true, configuredCutoff: 0));

    // ── The SQL it produces ──────────────────────────────────────────────────

    [Fact]
    public void Cutoff_zero_emits_a_plain_cast_with_no_date_arithmetic()
    {
        var sql = SqlReader.BusinessDate("[WorkDate]", 0);

        Assert.Equal("CAST([WorkDate] AS DATE)", sql);
        // The whole point: no DATEADD means nothing can move a day.
        Assert.DoesNotContain("DATEADD", sql);
    }

    [Fact]
    public void Cutoff_four_shifts_back_before_truncating()
        => Assert.Equal(
            "CAST(DATEADD(HOUR, -4, [dtmTicketDate]) AS DATE)",
            SqlReader.BusinessDate("[dtmTicketDate]", 4));

    // ── The regression itself ────────────────────────────────────────────────

    [Fact]
    public void Labour_feed_with_a_dateless_column_is_not_shifted_even_when_sales_is()
    {
        // The exact production shape that caused the defect: a sales view with a
        // real timestamp beside a labour view that only stores a date.
        var cfg = new AgentConfig();
        cfg.Sync.BusinessDayCutoffHour = 4;
        cfg.Columns.ZReport.DateHasTime  = true;   // datetime
        cfg.Columns.EwReport.DateHasTime = false;  // date

        var salesCutoff  = SqlReader.FeedCutoff(cfg.Columns.ZReport.DateHasTime,  cfg.Sync.ResolvedCutoffHour);
        var labourCutoff = SqlReader.FeedCutoff(cfg.Columns.EwReport.DateHasTime, cfg.Sync.ResolvedCutoffHour);

        Assert.Equal(4, salesCutoff);
        Assert.Equal(0, labourCutoff);

        var labourSql = SqlReader.EwReportSql("[dbo].[vwLabour]", cfg.Columns.EwReport, 2, labourCutoff);
        Assert.DoesNotContain("DATEADD", labourSql);

        var salesSql = SqlReader.ZReportSql("[dbo].[vwSales]", cfg.Columns.ZReport, 2, salesCutoff);
        Assert.Contains("DATEADD(HOUR, -4", salesSql);
    }

    [Fact]
    public void Every_feed_defaults_to_carrying_time_so_existing_installs_are_unchanged()
    {
        // Config files already in the field have no DateHasTime key. Binding
        // must leave them on the behaviour they were installed with, or a sync
        // after an upgrade would silently re-date a bar's history.
        var cfg = new AgentConfig();

        Assert.True(cfg.Columns.ZReport.DateHasTime);
        Assert.True(cfg.Columns.EwReport.DateHasTime);
        Assert.True(cfg.Columns.ItemAudit.DateHasTime);
    }

    [Fact]
    public void Item_audit_honours_its_own_column_type_too()
    {
        var cfg = new AgentConfig();
        cfg.Sync.BusinessDayCutoffHour = 4;
        cfg.Columns.ItemAudit.DateHasTime = false;

        var sql = SqlReader.ItemAuditSql(
            "[dbo].[vwItems]", cfg.Columns.ItemAudit, 2,
            SqlReader.FeedCutoff(cfg.Columns.ItemAudit.DateHasTime, cfg.Sync.ResolvedCutoffHour));

        Assert.DoesNotContain("DATEADD", sql);
    }
}
