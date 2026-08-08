using System.Security.AccessControl;
using System.Security.Principal;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;
using RailAgent.Config;
using RailAgent.Services;
using RailAgent.Setup;
using Xunit;

namespace RailAgent.Tests;

/// <summary>
/// What the wizard writes has to bind back to <see cref="AgentConfig"/>
/// unchanged — the file is the only thing connecting a successful setup to a
/// service that starts an hour later.
/// </summary>
public class LocalConfigWriterTests
{
    private static AgentConfig Sample() => new()
    {
        Sql =
        {
            Server = ".\\SQLEXPRESS", Database = "TwoTouch",
            User = "BarAppRead", Password = "abc_-.!123", Protocol = "lpc:",
        },
        Rail =
        {
            ApiBaseUrl = "https://rail.example.com",
            OrgId = "3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
            AuthToken = new string('a', 64),
        },
        Tables = { ZReport = "[dbo].[vwZReport]", EwReport = "[dbo].[EmpWorkSummary]", ItemAudit = "" },
        Columns =
        {
            ZReport = { Date = "[BusinessDate]", Sales = "[NetSales]", CcTips = "[ChargeTips]", CashTips = "[CashTips]" },
        },
    };

    /// <summary>Round-trips the rendered JSON back through the real binder.</summary>
    private static AgentConfig Bind(AgentConfig source)
    {
        var json = LocalConfigWriter.Render(source);
        using var stream = new MemoryStream(System.Text.Encoding.UTF8.GetBytes(json));
        var config = new ConfigurationBuilder().AddJsonStream(stream).Build();
        var bound = new AgentConfig();
        config.GetSection("Agent").Bind(bound);
        return bound;
    }

    [Fact]
    public void EmitsBracketQuotedIdentifiers()
    {
        var json = LocalConfigWriter.Render(Sample());

        Assert.Contains("\"ZReport\": \"[dbo].[vwZReport]\"", json);
        Assert.Contains("\"Date\": \"[BusinessDate]\"", json);
    }

    [Fact]
    public void RoundTripsEveryFieldTheServiceReads()
    {
        var bound = Bind(Sample());

        Assert.Equal(".\\SQLEXPRESS", bound.Sql.Server);
        Assert.Equal("TwoTouch", bound.Sql.Database);
        Assert.Equal("BarAppRead", bound.Sql.User);
        Assert.Equal("abc_-.!123", bound.Sql.Password);
        Assert.Equal("lpc:", bound.Sql.Protocol);
        Assert.Equal("https://rail.example.com", bound.Rail.ApiBaseUrl);
        Assert.Equal("[dbo].[vwZReport]", bound.Tables.ZReport);
        Assert.Equal("[ChargeTips]", bound.Columns.ZReport.CcTips);
    }

    [Fact]
    public void AnEmptyTableNameRoundTripsAsASkippedFeed()
    {
        var bound = Bind(Sample());

        Assert.Equal("", bound.Tables.ItemAudit);
        Assert.False(SyncService.Enabled(bound.Tables.ItemAudit));
        Assert.True(SyncService.Enabled(bound.Tables.ZReport));
    }

    [Fact]
    public void EmptyUserMeansWindowsAuthNotTheDefaultLogin()
    {
        // The sysadmin path writes "User": "" and the service must NOT fall back
        // to the embedded BarAppRead default — an empty string has to survive.
        var cfg = Sample();
        cfg.Sql.User = "";
        cfg.Sql.Password = "";

        var bound = Bind(cfg);

        Assert.Equal("", bound.Sql.User);
        Assert.Contains("Integrated Security", SqlReader.BuildConnectionString(bound.Sql));
    }

    [Fact]
    public void SqlLoginProducesCredentialsRatherThanIntegratedSecurity()
    {
        var connectionString = SqlReader.BuildConnectionString(Bind(Sample()).Sql);

        Assert.Contains("User ID=BarAppRead", connectionString);
        Assert.Contains("lpc:.\\SQLEXPRESS", connectionString);
        Assert.DoesNotContain("Integrated Security=True", connectionString);
    }

    [Fact]
    public void GeneratedPasswordsAvoidCharactersThatWouldNeedEscaping()
    {
        for (var i = 0; i < 50; i++)
        {
            var password = SqlProbe.GeneratePassword();
            Assert.Equal(32, password.Length);
            Assert.DoesNotContain(password, c => c is '\'' or '"' or '\\' or ';' or '=');
        }
    }

    [Fact]
    public void SchemaSummaryContainsOnlyTheMappingWorthFeedingBack()
    {
        var summary = LocalConfigWriter.RenderSchema(Sample());

        Assert.Contains("\"Tables\"", summary);
        Assert.Contains("\"Columns\"", summary);
        Assert.DoesNotContain("AuthToken", summary);
        Assert.DoesNotContain("Password", summary);
    }

    [Fact]
    public void WritesTheFileWhereTheServiceLooksForIt()
    {
        var dir = Path.Combine(Path.GetTempPath(), "rail-agent-tests-" + Guid.NewGuid().ToString("N"));
        try
        {
            LocalConfigWriter.Write(dir, Sample());
            var path = Path.Combine(dir, LocalConfigWriter.FileName);

            Assert.True(File.Exists(path));
            Assert.Equal("appsettings.local.json", LocalConfigWriter.FileName);
        }
        finally
        {
            Cleanup(dir);
        }
    }

    [Fact]
    public void TheWrittenFileIsReadableOnlyByAdministratorsAndSystem()
    {
        // It holds a SQL password on the fallback path. Note this is why the test
        // above does not read the file back: as an ordinary user, it cannot.
        var dir = Path.Combine(Path.GetTempPath(), "rail-agent-tests-" + Guid.NewGuid().ToString("N"));
        try
        {
            LocalConfigWriter.Write(dir, Sample());
            var acl = new FileInfo(Path.Combine(dir, LocalConfigWriter.FileName)).GetAccessControl();

            Assert.True(acl.AreAccessRulesProtected);   // inheritance broken

            var granted = acl.GetAccessRules(true, false, typeof(SecurityIdentifier))
                .Cast<FileSystemAccessRule>()
                .Select(r => ((SecurityIdentifier)r.IdentityReference).Value)
                .ToHashSet();

            Assert.Equal(2, granted.Count);
            Assert.Contains(new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null).Value, granted);
            Assert.Contains(new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null).Value, granted);
        }
        finally
        {
            Cleanup(dir);
        }
    }

    /// <summary>The ACL denies the test user delete, so restore inheritance first.</summary>
    private static void Cleanup(string dir)
    {
        if (!Directory.Exists(dir)) return;
        foreach (var path in Directory.GetFiles(dir))
        {
            try
            {
                var file = new FileInfo(path);
                var acl = file.GetAccessControl();
                acl.SetAccessRuleProtection(isProtected: false, preserveInheritance: true);
                file.SetAccessControl(acl);
            }
            catch (UnauthorizedAccessException) { /* best effort — it is a temp directory */ }
        }
        try { Directory.Delete(dir, recursive: true); } catch (UnauthorizedAccessException) { }
    }

    [Fact]
    public void OptionsCreateIsEnoughToBuildAReader()
    {
        // Guards the wizard's in-process verification sync, which constructs
        // SqlReader/RailClient by hand rather than through DI.
        var reader = new SqlReader(Options.Create(Sample()));
        Assert.NotNull(reader);
    }
}
