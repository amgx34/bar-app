using Xunit;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using RailAgent.Config;
using RailAgent.Services;
using RailAgent.Setup;

namespace RailAgent.Tests;

/// <summary>
/// Upgrading a config that setup wrote before the tender split existed.
///
/// The stake on each side is different, which is why both directions are
/// tested. Failing to upgrade costs a bar the cash/card split until somebody
/// drives to the POS. Upgrading too eagerly destroys a schema mapping somebody
/// hand-wrote for a database this profile does not fit — and takes their whole
/// Z feed down with it.
/// </summary>
public class ProfileMigrationTests
{
    private static AgentConfig WithZSource(string source)
    {
        var cfg = new AgentConfig();
        cfg.Tables.ZReport = source;
        // What a pre-1.1 binary's defaults bind to: no split.
        cfg.Columns.ZReport.CashSales = "0";
        cfg.Columns.ZReport.CardSales = "0";
        return cfg;
    }

    [Fact]
    public void UpgradesAConfigWrittenByTheOldSetup()
    {
        var cfg = WithZSource(ProfileMigration.ZReportV1);

        ProfileMigration.Apply(cfg);

        Assert.True(cfg.ProfileUpgraded);
        Assert.Equal(TwoTouchProfile.ZReport.Source, cfg.Tables.ZReport);
        Assert.Equal("[CashSales]", cfg.Columns.ZReport.CashSales);
        Assert.Equal("[CardSales]", cfg.Columns.ZReport.CardSales);

        // The mapping and the source have to agree, or the query names a column
        // its own derived table does not expose.
        Assert.Contains("AS CashSales", cfg.Tables.ZReport);
        Assert.Contains("AS CardSales", cfg.Tables.ZReport);
    }

    [Fact]
    public void UpgradedConfigProducesARunnableQuery()
    {
        var cfg = WithZSource(ProfileMigration.ZReportV1);
        ProfileMigration.Apply(cfg);

        var sql = SqlReader.ZReportSql(cfg.Tables.ZReport, cfg.Columns.ZReport, 2, 4);

        Assert.Contains("SUM([CashSales]) AS cash_sales", sql);
        Assert.Contains("SUM([CardSales]) AS card_sales", sql);
        // The literal-zero fallback must be gone, or the split stays empty.
        Assert.DoesNotContain("SUM(0)", sql);
    }

    [Fact]
    public void LineEndingsDoNotDefeatTheMatch()
    {
        // The wizard writes this through JSON, and what comes back depends on
        // the machine that wrote it. CRLF must still be recognised as the same
        // query, or the migration silently never fires on Windows — which is
        // every machine this ships to.
        var cfg = WithZSource(ProfileMigration.ZReportV1.Replace("\n", "\r\n"));

        ProfileMigration.Apply(cfg);

        Assert.True(cfg.ProfileUpgraded);
    }

    [Fact]
    public void AHandMappedSchemaIsLeftAlone()
    {
        // A bar on a different POS schema, mapped by hand through the wizard.
        // Replacing this with the 2Touch profile would query tables that do not
        // exist on their server and take out the entire Z feed.
        var cfg = WithZSource("[dbo].[vwNightlyTotals]");
        cfg.Columns.ZReport.Date = "[BizDate]";

        ProfileMigration.Apply(cfg);

        Assert.False(cfg.ProfileUpgraded);
        Assert.Equal("[dbo].[vwNightlyTotals]", cfg.Tables.ZReport);
        Assert.Equal("0", cfg.Columns.ZReport.CashSales);
    }

    [Fact]
    public void AHandEditedProfileIsLeftAlone()
    {
        // Someone added a payment type to the profile the README invites them
        // to edit. It is still recognisably the profile — and it is still their
        // work, so it survives.
        var edited = ProfileMigration.ZReportV1.Replace(
            "p.lPaymentType IN (2, 7)", "p.lPaymentType IN (2, 7, 9)");
        var cfg = WithZSource(edited);

        ProfileMigration.Apply(cfg);

        Assert.False(cfg.ProfileUpgraded);
        Assert.Contains("2, 7, 9", cfg.Tables.ZReport);
    }

    [Fact]
    public void ACurrentConfigIsUntouchedAndItIsIdempotent()
    {
        var cfg = new AgentConfig();
        TwoTouchProfile.Apply(TwoTouchProfile.ZReport, cfg);
        var before = cfg.Tables.ZReport;

        ProfileMigration.Apply(cfg);
        ProfileMigration.Apply(cfg);

        Assert.False(cfg.ProfileUpgraded);
        Assert.Equal(before, cfg.Tables.ZReport);
        Assert.Equal("[CashSales]", cfg.Columns.ZReport.CashSales);
    }

    [Fact]
    public void ASkippedFeedIsNotMistakenForAnOldOne()
    {
        // An empty Tables entry means "this bar has no Z feed". It must not
        // acquire one.
        var cfg = WithZSource("");

        ProfileMigration.Apply(cfg);

        Assert.False(cfg.ProfileUpgraded);
        Assert.Equal("", cfg.Tables.ZReport);
    }

    [Fact]
    public void TheOldSourceIsWhatTheOldSetupActuallyWrote()
    {
        // Guards the fingerprint itself. The v1 text must differ from the
        // current profile in exactly one way: no tender split. If a future edit
        // to the profile drifts the rest of the query, this fails here rather
        // than by quietly never matching in the field.
        Assert.DoesNotContain("CashSales", ProfileMigration.ZReportV1);
        Assert.DoesNotContain("CardSales", ProfileMigration.ZReportV1);

        static string Strip(string s) => string.Concat(s.Split(
            [' ', '\t', '\r', '\n'], System.StringSplitOptions.RemoveEmptyEntries));

        // Everything the v1 query selected, the current one still selects.
        foreach (var fragment in new[]
        {
            "FROMdbo.tblSalesHdrHisth", "FROMdbo.tblSalesDailyHdrh",
            "FROMdbo.tblSalesHistPmntsp", "FROMdbo.tblSalesDailyPmntsp",
            ")ASrail_z",
        })
        {
            Assert.Contains(fragment, Strip(ProfileMigration.ZReportV1));
            Assert.Contains(fragment, Strip(TwoTouchProfile.ZReport.Source));
        }
    }

    [Fact]
    public void SurvivesTheJsonRoundTripAndTheDiWiring()
    {
        // The whole point is a config on disk that setup wrote long ago, so the
        // path that matters is file -> IConfiguration -> AgentConfig -> the
        // migration. Testing Apply() alone would pass even if the JSON escaping
        // of a multi-line SQL string, or the PostConfigure wiring, were wrong.
        var dir = Directory.CreateTempSubdirectory("rail-migration-test");
        try
        {
            var cfg = new AgentConfig();
            cfg.Tables.ZReport = ProfileMigration.ZReportV1;
            cfg.Columns.ZReport.Date = "[BusinessDate]";
            cfg.Columns.ZReport.Sales = "[NetSales]";
            cfg.Columns.ZReport.CashSales = "0";
            cfg.Columns.ZReport.CardSales = "0";

            // Render + write by hand rather than LocalConfigWriter.Write, which
            // also ACLs the file down to SYSTEM and Administrators. That is
            // right in production — the file holds the agent token — and it
            // locks out a test running as an ordinary user. The JSON being
            // round-tripped is identical either way.
            File.WriteAllText(
                Path.Combine(dir.FullName, LocalConfigWriter.FileName),
                LocalConfigWriter.Render(cfg));

            var configuration = new ConfigurationBuilder()
                .SetBasePath(dir.FullName)
                .AddJsonFile(LocalConfigWriter.FileName, optional: false)
                .Build();

            var services = new ServiceCollection();
            services.Configure<AgentConfig>(configuration.GetSection("Agent"));
            services.PostConfigure<AgentConfig>(ProfileMigration.Apply);

            var loaded = services.BuildServiceProvider()
                .GetRequiredService<IOptions<AgentConfig>>().Value;

            Assert.True(loaded.ProfileUpgraded);
            Assert.Equal("[CashSales]", loaded.Columns.ZReport.CashSales);
            Assert.Contains("AS CashSales", loaded.Tables.ZReport);
        }
        finally
        {
            dir.Delete(recursive: true);
        }
    }
}
