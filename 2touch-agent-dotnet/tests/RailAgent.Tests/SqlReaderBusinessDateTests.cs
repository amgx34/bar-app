using RailAgent.Config;
using RailAgent.Services;
using RailAgent.Setup;
using Xunit;

namespace RailAgent.Tests;

/// <summary>
/// A bar open 17:00-03:00 trades across two calendar dates. Truncating the
/// ticket timestamp filed the post-midnight hours under the following day, so
/// sales appeared on days the venue was closed. These tests pin the rule that
/// fixes it, and guard the two ways it can silently regress: a cast that hides
/// the timestamp from the rule, and a cutoff applied to an already-rounded date.
/// </summary>
public class SqlReaderBusinessDateTests
{
    private static readonly ZReportColumns ZCols = new()
    {
        Date = "[BusinessDate]", Sales = "[NetSales]", CcTips = "[CcTips]", CashTips = "[CashTips]",
    };

    private static readonly HourlySalesColumns HourlyCols = new()
    {
        Date = "[dtmTicketDate]", Sales = "[fNetAmt]", Tips = "[fTipAmt]", TicketNo = "[szTicketNo]",
    };

    private static readonly ServerSalesColumns SrvCols = new()
    {
        Date = "[dtmTicketDate]", ServerName = "[szServerName]",
        Sales = "[fNetAmt]", Tips = "[fTipAmt]", TicketNo = "[szTicketNo]",
    };

    // ── The rule itself ──────────────────────────────────────────────────────

    [Fact]
    public void Cutoff_shifts_the_timestamp_back_before_truncating()
    {
        Assert.Equal(
            "CAST(DATEADD(HOUR, -4, [BusinessDate]) AS DATE)",
            SqlReader.BusinessDate("[BusinessDate]", 4));
    }

    [Fact]
    public void Zero_cutoff_leaves_an_already_rounded_date_alone()
    {
        // Shifting a plain date column would move every night back a day.
        Assert.Equal("CAST([BusinessDate] AS DATE)", SqlReader.BusinessDate("[BusinessDate]", 0));
    }

    [Theory]
    [InlineData(4)]
    [InlineData(6)]
    [InlineData(12)]
    public void Cutoff_is_configurable(int hour)
    {
        Assert.Contains($"DATEADD(HOUR, -{hour},", SqlReader.BusinessDate("[D]", hour));
    }

    // ── All three feeds, and every clause within them ────────────────────────

    [Fact]
    public void ZReport_applies_the_cutoff_in_select_where_and_group_by()
    {
        var sql = SqlReader.ZReportSql("[dbo].[v]", ZCols, lookbackDays: 2, cutoffHour: 4);

        // A cutoff in SELECT but not GROUP BY would fail to compile server-side;
        // one in SELECT but not WHERE would clip the wrong day at the boundary.
        Assert.Equal(3, Occurrences(sql, "DATEADD(HOUR, -4, [BusinessDate])"));
        Assert.DoesNotContain("CAST([BusinessDate] AS DATE)", sql);
    }

    [Fact]
    public void EwReport_applies_the_cutoff()
    {
        var cols = new EwReportColumns { Date = "[WorkDate]" };
        var sql = SqlReader.EwReportSql("[dbo].[v]", cols, lookbackDays: 2, cutoffHour: 4);

        Assert.Contains("DATEADD(HOUR, -4, [WorkDate])", sql);
        Assert.DoesNotContain("CAST([WorkDate] AS DATE)", sql);
    }

    [Fact]
    public void ItemAudit_applies_the_cutoff()
    {
        var cols = new ItemAuditColumns { Date = "[SaleDate]", ItemName = "[I]", Category = "[C]" };
        var sql = SqlReader.ItemAuditSql("[dbo].[v]", cols, lookbackDays: 2, cutoffHour: 4);

        Assert.Contains("DATEADD(HOUR, -4, [SaleDate])", sql);
        Assert.DoesNotContain("CAST([SaleDate] AS DATE)", sql);
    }

    [Fact]
    public void Zero_cutoff_emits_the_original_shape()
    {
        var sql = SqlReader.ZReportSql("[dbo].[v]", ZCols, lookbackDays: 2, cutoffHour: 0);

        Assert.DoesNotContain("DATEADD", sql);
        Assert.Contains("CAST([BusinessDate] AS DATE)", sql);
    }

    // ── The raw window has to widen, or the oldest day comes back short ──────

    [Fact]
    public void Raw_window_widens_by_a_day_when_a_cutoff_is_active()
    {
        // The profile pushes {cutoff} inside its derived table to keep the index
        // seek. With a cutoff active, a trading day needs tickets from the next
        // calendar morning, so the raw filter must reach back one day further.
        var table = $"(SELECT * FROM t WHERE d >= '{SqlReader.CutoffToken}') x";

        var withCutoff = SqlReader.ZReportSql(table, ZCols, lookbackDays: 2, cutoffHour: 4);
        var without    = SqlReader.ZReportSql(table, ZCols, lookbackDays: 2, cutoffHour: 0);

        var widened = DateTime.Today.AddDays(-3).ToString("yyyy-MM-dd");
        var plain   = DateTime.Today.AddDays(-2).ToString("yyyy-MM-dd");

        Assert.Contains($"d >= '{widened}'", withCutoff);
        Assert.Contains($"d >= '{plain}'", without);
    }

    // ── Column-type detection drives the default ─────────────────────────────

    [Theory]
    [InlineData("datetime")]
    [InlineData("datetime2")]
    [InlineData("smalldatetime")]
    [InlineData("datetimeoffset")]
    public void Timestamp_columns_need_the_cutoff(string type)
        => Assert.True(SqlTypes.CarriesTime(type));

    [Fact]
    public void A_plain_date_column_does_not()
        => Assert.False(SqlTypes.CarriesTime("date"));

    [Fact]
    public void A_non_date_column_does_not()
        => Assert.False(SqlTypes.CarriesTime("varchar"));

    // ── Config clamping — appsettings is hand-edited in the field ────────────

    [Theory]
    [InlineData(-1)]
    [InlineData(13)]
    [InlineData(99)]
    public void Out_of_range_cutoffs_fall_back_to_the_default(int configured)
    {
        var sync = new SyncConfig { BusinessDayCutoffHour = configured };
        Assert.Equal(SyncConfig.DefaultBusinessDayCutoffHour, sync.ResolvedCutoffHour);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(4)]
    [InlineData(12)]
    public void In_range_cutoffs_are_honoured(int configured)
    {
        var sync = new SyncConfig { BusinessDayCutoffHour = configured };
        Assert.Equal(configured, sync.ResolvedCutoffHour);
    }

    [Fact]
    public void Default_is_four()
        => Assert.Equal(4, new SyncConfig().ResolvedCutoffHour);

    // ── Hourly and per-server trade, added for ticket-grain capture ──────────

    [Fact]
    public void HourlySalesSql_GroupsByBusinessDateAndClockHour()
    {
        var sql = SqlReader.HourlySalesSql("dbo.tblSalesHdrHist", HourlyCols, lookbackDays: 2, cutoffHour: 4);

        // The hour must come off the RAW column, not the offset one. Taking
        // DATEPART on the shifted value reports 11pm trade as 7pm.
        Assert.Contains("DATEPART(HOUR, [dtmTicketDate])", sql);
        Assert.Contains("CAST(DATEADD(HOUR, -4, [dtmTicketDate]) AS DATE)", sql);
        Assert.Contains("COUNT(DISTINCT", sql);

        Assert.Equal(
            "GROUP BY CAST(DATEADD(HOUR, -4, [dtmTicketDate]) AS DATE), DATEPART(HOUR, [dtmTicketDate])",
            GroupByClause(sql));
    }

    [Fact]
    public void HourlySalesSql_WithZeroCutoff_StillGroupsByHour()
    {
        // A bar that closes before midnight has cutoff 0. It still has hours.
        var sql = SqlReader.HourlySalesSql("dbo.tblSalesHdrHist", HourlyCols, lookbackDays: 2, cutoffHour: 0);
        Assert.Contains("DATEPART(HOUR, [dtmTicketDate])", sql);
        Assert.DoesNotContain("DATEADD", sql);
    }

    [Fact]
    public void HourlySalesSql_SumsTheSingleTipsColumn()
    {
        // The feed's source query exposes one Tips alias, not a cc/cash split —
        // unlike ZReportSql, which sums CcTips and CashTips separately.
        var sql = SqlReader.HourlySalesSql("dbo.tblSalesHdrHist", HourlyCols, lookbackDays: 2, cutoffHour: 4);
        Assert.Contains("SUM([fTipAmt])", sql);
    }

    [Fact]
    public void ServerSalesSql_GroupsByBusinessDateAndServer()
    {
        var sql = SqlReader.ServerSalesSql("dbo.tblSalesHdrHist", SrvCols, lookbackDays: 2, cutoffHour: 4);
        Assert.Contains("CAST(DATEADD(HOUR, -4, [dtmTicketDate]) AS DATE)", sql);
        Assert.Contains("COUNT(DISTINCT", sql);

        Assert.Equal(
            "GROUP BY CAST(DATEADD(HOUR, -4, [dtmTicketDate]) AS DATE), [szServerName]",
            GroupByClause(sql));
    }

    [Fact]
    public void ServerSalesSql_SumsTheSingleTipsColumn()
    {
        var sql = SqlReader.ServerSalesSql("dbo.tblSalesHdrHist", SrvCols, lookbackDays: 2, cutoffHour: 4);
        Assert.Contains("SUM([fTipAmt])", sql);
    }

    // ── The regression that started all this ─────────────────────────────────

    [Fact]
    public void TwoTouch_profile_exposes_raw_timestamps_not_truncated_dates()
    {
        // TwoTouchProfile used to emit CAST(h.dtmTicketDate AS DATE), which hid
        // the hour from the cutoff rule and put Saturday's late sales on Sunday.
        Assert.DoesNotContain("CAST(h.dtmTicketDate AS DATE)", TwoTouchProfile.ZReport.Source);
        Assert.DoesNotContain("CAST(p.dtmPmntDate AS DATE)", TwoTouchProfile.ZReport.Source);
        Assert.DoesNotContain("CAST(d.dtmSalesDate AS DATE)", TwoTouchProfile.ItemAudit.Source);
        Assert.DoesNotContain("AS DATE)", TwoTouchProfile.EwReport.Source);

        // ...and still surfaces them under the names the config maps.
        Assert.Contains("AS BusinessDate", TwoTouchProfile.ZReport.Source);
        Assert.Contains("AS ShiftDate", TwoTouchProfile.EwReport.Source);
        Assert.Contains("AS SaleDate", TwoTouchProfile.ItemAudit.Source);
    }

    [Fact]
    public void Saturday_night_into_sunday_lands_on_saturday()
    {
        // The end-to-end shape, expressed as the arithmetic SQL Server performs:
        // a ticket at 01:40 Sunday, shifted back 4h, truncates to Saturday.
        var rungAt = new DateTime(2026, 8, 16, 1, 40, 0);   // Sunday 01:40
        var trading = rungAt.AddHours(-4).Date;

        Assert.Equal(new DateTime(2026, 8, 15), trading);   // Saturday
        Assert.Equal(DayOfWeek.Saturday, trading.DayOfWeek);
    }

    [Fact]
    public void Sunday_afternoon_still_belongs_to_sunday()
    {
        var rungAt = new DateTime(2026, 8, 16, 14, 0, 0);
        Assert.Equal(DayOfWeek.Sunday, rungAt.AddHours(-4).Date.DayOfWeek);
    }

    /// <summary>
    /// The GROUP BY clause on its own line, trimmed — so an assertion on it
    /// checks what is actually grouped rather than merely that the keyword
    /// is present somewhere in the statement.
    /// </summary>
    private static string GroupByClause(string sql)
    {
        var start = sql.IndexOf("GROUP BY", StringComparison.Ordinal);
        Assert.True(start >= 0, "expected a GROUP BY clause");
        var end = sql.IndexOf('\n', start);
        var clause = end < 0 ? sql[start..] : sql[start..end];
        return clause.Trim();
    }

    private static int Occurrences(string haystack, string needle)
    {
        var n = 0;
        for (var i = haystack.IndexOf(needle, StringComparison.Ordinal); i >= 0;
             i = haystack.IndexOf(needle, i + needle.Length, StringComparison.Ordinal))
            n++;
        return n;
    }
}
