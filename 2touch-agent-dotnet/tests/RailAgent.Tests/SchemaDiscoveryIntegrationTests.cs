using Microsoft.Data.SqlClient;
using RailAgent.Setup;
using Xunit;

namespace RailAgent.Tests;

/// <summary>
/// Discovery against a real SQL Server, on a schema the scorer was not written
/// from. Skips when the database is absent, so `dotnet test` still passes on a
/// machine without SQL Server.
///
/// Create it with:
///   sqlcmd -S "lpc:(local)" -E -b -i testdata/04-create-unlike-schema.sql
/// </summary>
public class SchemaDiscoveryIntegrationTests
{
    private const string Database = "TwoTouchOdd";

    private static async Task<SqlConnection> ConnectOrSkipAsync()
    {
        var instances = SqlProbe.FindInstances();
        Skip.If(instances.Count == 0, "No local SQL Server instance is installed.");

        foreach (var server in instances)
        {
            try { return await SqlProbe.OpenAsync(SqlProbe.Probe(server, Database), CancellationToken.None); }
            catch (SqlException) { /* try the next instance */ }
        }

        Skip.If(true, $"{Database} not found — run testdata/04-create-unlike-schema.sql first.");
        throw new InvalidOperationException("unreachable");
    }

    [SkippableFact]
    public async Task EnumeratesTablesAndTheirColumnTypes()
    {
        await using var conn = await ConnectOrSkipAsync();

        var relations = await SqlProbe.EnumerateAsync(conn, CancellationToken.None);

        var dayClose = relations.Single(r => r.Name == "tblDayClose");
        Assert.Equal("[dbo].[tblDayClose]", dayClose.Quoted);
        Assert.Equal("datetime", dayClose.Columns.Single(c => c.Name == "CloseDate").DataType);
        Assert.Equal("money", dayClose.Columns.Single(c => c.Name == "NetSales").DataType);
    }

    [SkippableTheory]
    [InlineData(FeedSpecs.ZReportKey,   "tblDayClose")]
    [InlineData(FeedSpecs.EwReportKey,  "EmpWorkSummary")]
    [InlineData(FeedSpecs.ItemAuditKey, "ItemSalesAudit")]
    public async Task RanksTheRightRelationFirstForEachFeed(string feedKey, string expected)
    {
        await using var conn = await ConnectOrSkipAsync();
        var relations = await SqlProbe.EnumerateAsync(conn, CancellationToken.None);
        var feed = FeedSpecs.All.Single(f => f.Key == feedKey);

        var ranked = SchemaScorer.Rank(feed, relations);

        Assert.NotEmpty(ranked);
        Assert.Equal(expected, ranked[0].Relation.Name);
    }

    [SkippableFact]
    public async Task ProposesTheRightColumnsWithoutAnyOperatorOverride()
    {
        await using var conn = await ConnectOrSkipAsync();
        var relations = await SqlProbe.EnumerateAsync(conn, CancellationToken.None);

        var z = SchemaScorer.Rank(FeedSpecs.ZReport, relations)[0];
        Assert.Equal("CloseDate",  z.ColumnFor("Date").Name);
        Assert.Equal("NetSales",   z.ColumnFor("Sales").Name);
        Assert.Equal("ChargeTips", z.ColumnFor("CcTips").Name);
        Assert.Equal("CashTips",   z.ColumnFor("CashTips").Name);

        var ew = SchemaScorer.Rank(FeedSpecs.EwReport, relations)[0];
        Assert.Equal("ShiftDate",   ew.ColumnFor("Date").Name);
        Assert.Equal("StaffName",   ew.ColumnFor("EmployeeName").Name);
        Assert.Equal("ServerSales", ew.ColumnFor("TotalSales").Name);
        Assert.Equal("TipsPaid",    ew.ColumnFor("TipsPaidOut").Name);
        Assert.Equal("HoursWorked", ew.ColumnFor("RegularHours").Name);
        Assert.Equal("OvertimeHrs", ew.ColumnFor("OvertimeHours").Name);

        var audit = SchemaScorer.Rank(FeedSpecs.ItemAudit, relations)[0];
        Assert.Equal("TranDate",      audit.ColumnFor("Date").Name);
        Assert.Equal("MenuItemName",  audit.ColumnFor("ItemName").Name);
        Assert.Equal("MajorGroup",    audit.ColumnFor("Category").Name);
        Assert.Equal("UnitsSold",     audit.ColumnFor("QtySold").Name);
        Assert.Equal("ExtendedPrice", audit.ColumnFor("NetSales").Name);
    }

    [SkippableFact]
    public async Task ARelationWithNoUsableDateColumnIsDropped()
    {
        await using var conn = await ConnectOrSkipAsync();
        var relations = await SqlProbe.EnumerateAsync(conn, CancellationToken.None);

        // TerminalPing stores its date as nvarchar and has no other date column,
        // so no amount of name affinity can rescue it.
        var names = SchemaScorer.Rank(FeedSpecs.ZReport, relations, take: 50).Select(r => r.Relation.Name);

        Assert.DoesNotContain("TerminalPing", names);
    }

    [SkippableTheory]
    [InlineData(FeedSpecs.ItemAuditKey, "ItemPriceHistory")]
    [InlineData(FeedSpecs.EwReportKey,  "ShiftNotes")]
    public async Task DecoysRankBelowTheRealRelationAndAreFlaggedAsWeak(string feedKey, string decoy)
    {
        // These survive scoring because an INT primary key is a type-compatible
        // candidate for every numeric field — the gate is type, not plausibility.
        // What must hold is that they lose, and that their invented mappings are
        // marked weak so the operator's eye lands on them.
        await using var conn = await ConnectOrSkipAsync();
        var relations = await SqlProbe.EnumerateAsync(conn, CancellationToken.None);
        var feed = FeedSpecs.All.Single(f => f.Key == feedKey);

        var ranked = SchemaScorer.Rank(feed, relations, take: 50).ToList();
        var decoyRank = ranked.FindIndex(r => r.Relation.Name == decoy);

        Assert.True(decoyRank > 0, $"{decoy} should never out-rank the real relation");
        Assert.NotEmpty(ranked[decoyRank].WeakFields());
        Assert.Empty(ranked[0].WeakFields());
    }

    /// <summary>The mapping the wizard would write must actually run.</summary>
    [SkippableFact]
    public async Task TheProposedMappingProducesAQueryThatRuns()
    {
        await using var conn = await ConnectOrSkipAsync();
        var relations = await SqlProbe.EnumerateAsync(conn, CancellationToken.None);
        var z = SchemaScorer.Rank(FeedSpecs.ZReport, relations)[0];

        string Q(string key) => SqlProbe.QuoteIdentifier(z.ColumnFor(key).Name);
        var sql = Services.SqlReader.ZReportSql(
            z.Relation.Quoted,
            new Config.ZReportColumns
            {
                Date = Q("Date"), Sales = Q("Sales"), CcTips = Q("CcTips"), CashTips = Q("CashTips"),
            },
            lookbackDays: 30,
            cutoffHour: Config.SyncConfig.DefaultBusinessDayCutoffHour,
            top: 5);

        await using var cmd = new SqlCommand(sql, conn);
        await using var reader = await cmd.ExecuteReaderAsync();

        var rows = 0;
        while (await reader.ReadAsync()) rows++;
        Assert.True(rows > 0, "the seeded database should return Z Report rows");
    }
}
