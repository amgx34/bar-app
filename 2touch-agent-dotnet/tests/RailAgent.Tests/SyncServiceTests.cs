using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using RailAgent.Config;
using RailAgent.Models;
using RailAgent.Services;
using Xunit;

namespace RailAgent.Tests;

/// <summary>
/// A bar with no Item Audit view must not have its sync fail on a query it was
/// never going to be able to run — it sends an empty array and keeps the other
/// two feeds flowing.
/// </summary>
public class SyncServiceTests
{
    // HourlySales/ServerSales default to "" (unconfigured) so existing calls to
    // this factory keep the assertions they had before those two feeds existed.
    private static AgentConfig Config(string z, string ew, string audit, string hourly = "", string server = "") => new()
    {
        Tables = { ZReport = z, EwReport = ew, ItemAudit = audit, HourlySales = hourly, ServerSales = server },
        Rail = { OrgId = "3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", AuthToken = new string('a', 64) },
    };

    /// <summary>Records which feeds were queried, without a SQL Server.</summary>
    private sealed class RecordingReader(IOptions<AgentConfig> cfg) : SqlReader(cfg)
    {
        public List<string> Queried { get; } = [];

        // Never opened, so no connection is attempted; SyncService only passes it through.
        public override Task<SqlConnection> OpenAsync(CancellationToken ct) => Task.FromResult(new SqlConnection());

        public override Task<List<ZReportRow>> QueryZReportsAsync(SqlConnection c, int days, CancellationToken ct)
        {
            Queried.Add("z");
            return Task.FromResult(new List<ZReportRow> { new("2026-08-06", 100m, 10m, 5m, 60m, 40m) });
        }

        public override Task<List<EwReportRow>> QueryEwReportsAsync(SqlConnection c, int days, CancellationToken ct)
        {
            Queried.Add("ew");
            return Task.FromResult(new List<EwReportRow> { new("2026-08-06", "Alex", 100m, 10m, 8m, 0m) });
        }

        public override Task<List<ItemAuditRow>> QueryItemAuditAsync(SqlConnection c, int days, CancellationToken ct)
        {
            Queried.Add("audit");
            return Task.FromResult(new List<ItemAuditRow> { new("2026-08-06", "Lager", "Beer", 3m, 21m) });
        }

        public override Task<List<HourlySalesRow>> QueryHourlySalesAsync(SqlConnection c, int days, CancellationToken ct)
        {
            Queried.Add("hourly");
            return Task.FromResult(new List<HourlySalesRow> { new("2026-08-06", 20, 100m, 5, 10m) });
        }

        public override Task<List<ServerSalesRow>> QueryServerSalesAsync(SqlConnection c, int days, CancellationToken ct)
        {
            Queried.Add("server");
            return Task.FromResult(new List<ServerSalesRow> { new("2026-08-06", "Alex", 100m, 5, 10m) });
        }
    }

    /// <summary>Captures the payload instead of posting it.</summary>
    private sealed class CapturingRail(IOptions<AgentConfig> cfg)
        : RailClient(null!, cfg, NullLogger<RailClient>.Instance)
    {
        public IReadOnlyList<ZReportRow>? Z { get; private set; }
        public IReadOnlyList<EwReportRow>? Ew { get; private set; }
        public IReadOnlyList<ItemAuditRow>? Audit { get; private set; }
        public IReadOnlyList<HourlySalesRow>? Hourly { get; private set; }
        public IReadOnlyList<ServerSalesRow>? Server { get; private set; }
        public int Pushes { get; private set; }

        public override Task<string> PushAsync(
            IReadOnlyList<ZReportRow> z, IReadOnlyList<EwReportRow> ew,
            IReadOnlyList<ItemAuditRow> audit, CancellationToken ct,
            IReadOnlyList<HourlySalesRow>? hourlySales = null,
            IReadOnlyList<ServerSalesRow>? serverSales = null)
        {
            Z = z; Ew = ew; Audit = audit; Hourly = hourlySales; Server = serverSales; Pushes++;
            return Task.FromResult("{\"zReports\":0,\"ewReports\":0,\"itemAudit\":0,\"errors\":[]}");
        }
    }

    private static async Task<(RecordingReader Reader, CapturingRail Rail, SyncResult Result)> RunAsync(AgentConfig cfg)
    {
        var options = Options.Create(cfg);
        var reader = new RecordingReader(options);
        var rail = new CapturingRail(options);
        var sync = new SyncService(reader, rail, options, NullLogger<SyncService>.Instance);
        var result = await sync.RunOnceAsync(daysOverride: 2, test: false, CancellationToken.None);
        return (reader, rail, result);
    }

    [Fact]
    public async Task ASkippedFeedIsNeverQueried()
    {
        var (reader, _, _) = await RunAsync(Config("[dbo].[vwZReport]", "[dbo].[vwServerSales]", ""));

        Assert.Equal(["z", "ew"], reader.Queried);
    }

    [Fact]
    public async Task ASkippedFeedIsSentAsAnEmptyArray()
    {
        var (_, rail, _) = await RunAsync(Config("[dbo].[vwZReport]", "[dbo].[vwServerSales]", ""));

        Assert.Equal(1, rail.Pushes);
        Assert.NotNull(rail.Audit);
        Assert.Empty(rail.Audit!);
        Assert.Single(rail.Z!);
        Assert.Single(rail.Ew!);
    }

    [Fact]
    public async Task ConfiguredFeedsAreAllQueried()
    {
        var (reader, rail, result) = await RunAsync(
            Config("[dbo].[vwZReport]", "[dbo].[vwServerSales]", "[dbo].[vwItemAudit]"));

        Assert.Equal(["z", "ew", "audit"], reader.Queried);
        Assert.Single(rail.Audit!);
        Assert.True(result.Ok);
        Assert.Equal(1, result.ItemAudit);
    }

    [Fact]
    public async Task AllFeedsSkippedStillPushesRatherThanThrowing()
    {
        // Degenerate but reachable: a bar mid-reconfiguration should keep the
        // service alive and let Rail see an empty, well-formed payload.
        var (reader, rail, result) = await RunAsync(Config("", "", ""));

        Assert.Empty(reader.Queried);
        Assert.Equal(1, rail.Pushes);
        Assert.True(result.Ok);
    }

    [Fact]
    public async Task TestModeSendsNothing()
    {
        var options = Options.Create(Config("[dbo].[vwZReport]", "", ""));
        var rail = new CapturingRail(options);
        var sync = new SyncService(new RecordingReader(options), rail, options, NullLogger<SyncService>.Instance);

        await sync.RunOnceAsync(daysOverride: 2, test: true, CancellationToken.None);

        Assert.Equal(0, rail.Pushes);
    }

    [Theory]
    [InlineData(null, false)]
    [InlineData("", false)]
    [InlineData("   ", false)]
    [InlineData("[dbo].[vwZReport]", true)]
    public void EnabledTreatsBlankAsSkipped(string? table, bool expected)
        => Assert.Equal(expected, SyncService.Enabled(table));

    [Fact]
    public async Task HourlyAndServerFeedsAreQueriedWhenConfigured()
    {
        var cfg = Config("", "", "", hourly: "[dbo].[vwHourlySales]", server: "[dbo].[vwServerTickets]");

        var (reader, rail, _) = await RunAsync(cfg);

        Assert.Equal(["hourly", "server"], reader.Queried);
        Assert.Single(rail.Hourly!);
        Assert.Single(rail.Server!);
    }

    /// <summary>
    /// The gate: a POS date column with no time component cannot yield an
    /// hour. Running the query anyway would put every ticket in hour 0 — a
    /// curve showing the whole night's trade landing at midnight, which reads
    /// as real data instead of the absence of any. So when
    /// Columns.HourlySales.DateHasTime is false, the hourly query must never
    /// run and hourlySales must reach Rail as null (omitted from the wire
    /// payload), not as an empty or zero-filled array.
    /// </summary>
    [Fact]
    public async Task DateHasTimeFalseSkipsTheHourlyQueryAndSendsNull()
    {
        var cfg = Config("", "", "", hourly: "[dbo].[vwHourlySales]", server: "");
        cfg.Columns.HourlySales.DateHasTime = false;

        var (reader, rail, _) = await RunAsync(cfg);

        Assert.DoesNotContain("hourly", reader.Queried);
        Assert.Null(rail.Hourly);
    }

    [Fact]
    public async Task DateHasTimeTrueStillRunsTheHourlyQuery()
    {
        // Sanity check for the gate above: the default (DateHasTime = true)
        // must not be accidentally caught by the same condition.
        var cfg = Config("", "", "", hourly: "[dbo].[vwHourlySales]", server: "");

        var (reader, rail, _) = await RunAsync(cfg);

        Assert.Contains("hourly", reader.Queried);
        Assert.Single(rail.Hourly!);
    }

    [Fact]
    public async Task ServerFeedIsUnaffectedByTheHourlyDateHasTimeGate()
    {
        // ServerSalesSql does not compute an hour, so its own DateHasTime only
        // governs the business-day cutoff — it has no reason to be skipped.
        var cfg = Config("", "", "", hourly: "", server: "[dbo].[vwServerTickets]");
        cfg.Columns.ServerSales.DateHasTime = false;

        var (reader, rail, _) = await RunAsync(cfg);

        Assert.Contains("server", reader.Queried);
        Assert.Single(rail.Server!);
    }
}
