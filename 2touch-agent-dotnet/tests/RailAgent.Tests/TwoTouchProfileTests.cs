using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;
using RailAgent.Config;
using RailAgent.Services;
using RailAgent.Setup;
using Xunit;

namespace RailAgent.Tests;

/// <summary>
/// The built-in mapping, run against a faithful copy of the real 2TouchPOS
/// schema. Skips when that database is absent.
///
/// Create it with:
///   sqlcmd -S "lpc:(local)" -E -b -i testdata/05-create-twotouch-schema.sql
///
/// The seed is deliberately round, so these assert exact totals rather than
/// "some rows came back" — a mapping that silently double-counts a join would
/// pass the latter.
/// </summary>
public class TwoTouchProfileTests
{
    private const string Database = "TwoTouchLocal";
    private const int Lookback = 30;

    private static async Task<SqlConnection> ConnectOrSkipAsync()
    {
        var instances = SqlProbe.FindInstances();
        Skip.If(instances.Count == 0, "No local SQL Server instance is installed.");

        foreach (var server in instances)
        {
            try { return await SqlProbe.OpenAsync(SqlProbe.Probe(server, Database), CancellationToken.None); }
            catch (SqlException) { /* try the next instance */ }
        }

        Skip.If(true, $"{Database} not found — run testdata/05-create-twotouch-schema.sql first.");
        throw new InvalidOperationException("unreachable");
    }

    /// <summary>Config with the profile applied, exactly as the wizard would write it.</summary>
    private static async Task<(AgentConfig Cfg, SqlConnection Conn)> ProfiledAsync()
    {
        var conn = await ConnectOrSkipAsync();
        var relations = await SqlProbe.EnumerateAsync(conn, CancellationToken.None);

        var cfg = new AgentConfig();
        foreach (var feed in TwoTouchProfile.Match(relations))
            TwoTouchProfile.Apply(feed, cfg);

        return (cfg, conn);
    }

    [SkippableFact]
    public async Task RecognisesAllThreeFeeds()
    {
        await using var conn = await ConnectOrSkipAsync();
        var relations = await SqlProbe.EnumerateAsync(conn, CancellationToken.None);

        var matched = TwoTouchProfile.Match(relations).Select(f => f.FeedKey).ToList();

        Assert.Equal(3, matched.Count);
        Assert.Contains(FeedSpecs.ZReportKey, matched);
        Assert.Contains(FeedSpecs.EwReportKey, matched);
        Assert.Contains(FeedSpecs.ItemAuditKey, matched);
    }

    [SkippableFact]
    public async Task ZReportTotalsAreExact()
    {
        var (cfg, conn) = await ProfiledAsync();
        await using var _ = conn;

        var rows = await new SqlReader(Options.Create(cfg))
            .QueryZReportsAsync(conn, Lookback, CancellationToken.None);

        Assert.Equal(3, rows.Count);                       // three seeded business days
        foreach (var day in rows)
        {
            Assert.Equal(350m, day.total_sales);           // 200 + 100 Hist, 50 Daily
            Assert.Equal(30m, day.cc_tips);                // payment types 2/7 only
            Assert.Equal(7m, day.cash_tips);               // payment type 0 only
        }
    }

    [SkippableFact]
    public async Task EwReportResolvesEmployeeNamesTwoTablesAway()
    {
        var (cfg, conn) = await ProfiledAsync();
        await using var _ = conn;

        var rows = await new SqlReader(Options.Create(cfg))
            .QueryEwReportsAsync(conn, Lookback, CancellationToken.None);

        // 2 employees x 3 days. The deleted clock row must not appear.
        Assert.Equal(6, rows.Count);
        Assert.Contains(rows, r => r.employee_name == "Alex Rivera");
        Assert.Contains(rows, r => r.employee_name == "Sam Okafor");
        Assert.All(rows, r =>
        {
            Assert.Equal(8m, r.regular_hours);
            Assert.Equal(1.5m, r.overtime_hours);
            Assert.Equal(400m, r.total_sales);
            Assert.Equal(40m, r.tips_paid_out);
        });
    }

    [SkippableFact]
    public async Task DeletedClockRowsAreExcluded()
    {
        var (cfg, conn) = await ProfiledAsync();
        await using var _ = conn;

        var rows = await new SqlReader(Options.Create(cfg))
            .QueryEwReportsAsync(conn, Lookback, CancellationToken.None);

        // The seed adds one blnDeleted row with 99 hours purely to be excluded.
        Assert.DoesNotContain(rows, r => r.regular_hours == 99m);
    }

    [SkippableFact]
    public async Task ItemAuditResolvesNamesFromTheCatalogue()
    {
        var (cfg, conn) = await ProfiledAsync();
        await using var _ = conn;

        var rows = await new SqlReader(Options.Create(cfg))
            .QueryItemAuditAsync(conn, Lookback, CancellationToken.None);

        // 4 items x 3 days. The detail tables hold only fkItemID — these names
        // can only have come from tblItem/tblCategory.
        Assert.Equal(12, rows.Count);
        Assert.Contains(rows, r => r.item_name == "House Lager" && r.category_name == "Draft Beer");
        Assert.Contains(rows, r => r.item_name == "Well Vodka" && r.category_name == "Liquor");
        Assert.All(rows, r =>
        {
            Assert.Equal(10m, r.qty_sold);   // 6 from Hist + 4 from Daily
            Assert.Equal(60m, r.net_sales);  // 36 + 24, from the RptCtg join
        });
    }

    [SkippableFact]
    public async Task RefundedAndModifierLinesAreExcluded()
    {
        var (cfg, conn) = await ProfiledAsync();
        await using var _ = conn;

        var rows = await new SqlReader(Options.Create(cfg))
            .QueryItemAuditAsync(conn, Lookback, CancellationToken.None);

        // The seed adds a szRefundFlg='N' line and a modifier line with a NULL
        // fkItemID, both at qty 99 / 999.00, purely to be excluded.
        Assert.DoesNotContain(rows, r => r.qty_sold >= 99m);
        Assert.DoesNotContain(rows, r => r.net_sales >= 999m);
        Assert.DoesNotContain(rows, r => string.IsNullOrWhiteSpace(r.item_name));
    }

    [SkippableFact]
    public async Task CutoffIsPushedIntoEveryLeg()
    {
        // The outer WHERE filters CAST(date AS DATE), which cannot seek. On a
        // POS box tblSalesHist is the largest table and this runs every 5
        // minutes, so each leg must also filter its own raw indexed column.
        var (cfg, conn) = await ProfiledAsync();
        await using var _ = conn;

        var sql = SqlReader.ItemAuditSql(cfg.Tables.ItemAudit, cfg.Columns.ItemAudit, Lookback);

        Assert.DoesNotContain(SqlReader.CutoffToken, sql);
        Assert.Equal(2, CountOf(sql, "d.dtmSalesDate >="));
        Assert.Contains($"'{DateTime.Today.AddDays(-Lookback):yyyy-MM-dd}'", sql);
    }

    [SkippableFact]
    public async Task TheProfileSurvivesAConfigRoundTrip()
    {
        // A derived table spanning many lines has to come back out of
        // appsettings.local.json byte-identical, or the service runs different
        // SQL from the one setup proved.
        var (cfg, conn) = await ProfiledAsync();
        await using var _ = conn;

        var json = LocalConfigWriter.Render(cfg);
        using var stream = new MemoryStream(System.Text.Encoding.UTF8.GetBytes(json));
        var bound = new AgentConfig();
        new ConfigurationBuilder().AddJsonStream(stream).Build().GetSection("Agent").Bind(bound);

        Assert.Equal(cfg.Tables.ItemAudit, bound.Tables.ItemAudit);
        Assert.Equal(cfg.Columns.ZReport.CcTips, bound.Columns.ZReport.CcTips);

        var rows = await new SqlReader(Options.Create(bound))
            .QueryZReportsAsync(conn, Lookback, CancellationToken.None);
        Assert.Equal(3, rows.Count);
    }

    private static int CountOf(string haystack, string needle)
    {
        var n = 0;
        for (var i = haystack.IndexOf(needle, StringComparison.Ordinal); i >= 0;
                 i = haystack.IndexOf(needle, i + needle.Length, StringComparison.Ordinal)) n++;
        return n;
    }
}
