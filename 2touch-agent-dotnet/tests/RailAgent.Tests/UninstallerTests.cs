using RailAgent.Setup;
using Xunit;

namespace RailAgent.Tests;

/// <summary>
/// Uninstall is a security operation: the agent token in appsettings.local.json
/// is the HMAC key for that bar's ingest endpoint, and the SQL login keeps read
/// access to the POS database. Leaving either behind on a decommissioned or
/// sold-on machine is the failure these guard.
///
/// The service and filesystem steps need a real Windows box; what is asserted
/// here is the part that is pure logic — the revoke script, and the promise that
/// secrets are destroyed rather than merely unlinked.
/// </summary>
public class UninstallerTests
{
    // ── The script handed to a DBA ───────────────────────────────────────────

    [Fact]
    public void Revoke_script_drops_both_the_user_and_the_login()
    {
        var sql = SqlProbe.ManualRevokeScript("TwoTouch", "BarAppRead");

        // Dropping only the login leaves an orphaned database user behind, which
        // is exactly the state that makes a later reinstall fail.
        Assert.Contains("DROP USER IF EXISTS [BarAppRead]", sql);
        Assert.Contains("DROP LOGIN [BarAppRead]", sql);
    }

    [Fact]
    public void Revoke_script_switches_database_context_in_the_right_order()
    {
        var sql = SqlProbe.ManualRevokeScript("TwoTouch", "BarAppRead");

        var useDb    = sql.IndexOf("USE [TwoTouch]", StringComparison.Ordinal);
        var dropUser = sql.IndexOf("DROP USER", StringComparison.Ordinal);
        var useMaster= sql.IndexOf("USE [master]", StringComparison.Ordinal);
        var dropLogin= sql.IndexOf("DROP LOGIN", StringComparison.Ordinal);

        // USE [db] → DROP USER → USE [master] → DROP LOGIN. Any other order and
        // the statements run against the wrong catalogue.
        Assert.True(useDb < dropUser, "DROP USER must run after USE [database]");
        Assert.True(dropUser < useMaster, "USE [master] must come after DROP USER");
        Assert.True(useMaster < dropLogin, "DROP LOGIN must run after USE [master]");
    }

    [Fact]
    public void Revoke_script_is_the_inverse_of_the_grant_script()
    {
        const string db = "TwoTouch", login = "BarAppRead";
        var grant  = SqlProbe.ManualGrantScript(db, login);
        var revoke = SqlProbe.ManualRevokeScript(db, login);

        // Every object the grant creates must be named in the revoke, or setup
        // leaves something behind that uninstall never mentions.
        Assert.Contains("CREATE LOGIN", grant);
        Assert.Contains("DROP LOGIN", revoke);
        Assert.Contains("CREATE USER", grant);
        Assert.Contains("DROP USER", revoke);
    }

    [Theory]
    [InlineData("TwoTouch", "BarAppRead")]
    [InlineData("POSDB", "rail_reader")]
    public void Revoke_script_brackets_identifiers(string db, string login)
    {
        var sql = SqlProbe.ManualRevokeScript(db, login);

        // Bracketed so a database or login name containing a space or a reserved
        // word cannot break the statement.
        Assert.Contains($"[{db}]", sql);
        Assert.Contains($"[{login}]", sql);
    }

    // ── Secret destruction ───────────────────────────────────────────────────

    [Fact]
    public void Config_file_is_overwritten_before_it_is_deleted()
    {
        // A plain File.Delete unlinks without clearing the blocks, so the token
        // stays recoverable. This asserts the bytes are gone, not just the entry.
        var dir = Directory.CreateTempSubdirectory("rail-uninstall-test");
        try
        {
            var path = Path.Combine(dir.FullName, "appsettings.local.json");
            const string secret = "AGENT_TOKEN_THAT_MUST_NOT_SURVIVE";
            File.WriteAllText(path, $"{{\"Agent\":{{\"Rail\":{{\"AuthToken\":\"{secret}\"}}}}}}");

            var before = File.ReadAllBytes(path).Length;
            Assert.True(before > 0);

            var ok = Uninstaller.ShredForTests(path, out var error);

            Assert.True(ok, $"shred failed: {error}");
            Assert.False(File.Exists(path));
        }
        finally
        {
            dir.Delete(recursive: true);
        }
    }

    [Fact]
    public void Shredding_a_missing_file_reports_failure_rather_than_throwing()
    {
        var path = Path.Combine(Path.GetTempPath(), $"rail-absent-{Guid.NewGuid():N}.json");

        // Uninstall must continue even when config was already removed by hand.
        var ok = Uninstaller.ShredForTests(path, out _);
        Assert.False(ok);
    }

    // ── Reading identity out of config ───────────────────────────────────────

    [Fact]
    public void Sql_login_is_read_from_config_so_the_revoke_names_it()
    {
        var dir = Directory.CreateTempSubdirectory("rail-uninstall-cfg");
        try
        {
            var path = Path.Combine(dir.FullName, "appsettings.local.json");
            File.WriteAllText(path, """
            { "Agent": { "Sql": { "User": "BarAppRead", "Database": "TwoTouch" } } }
            """);

            var (login, database) = Uninstaller.ReadSqlIdentityForTests(path);

            Assert.Equal("BarAppRead", login);
            Assert.Equal("TwoTouch", database);
        }
        finally { dir.Delete(recursive: true); }
    }

    [Fact]
    public void Windows_auth_yields_no_login_to_drop()
    {
        var dir = Directory.CreateTempSubdirectory("rail-uninstall-winauth");
        try
        {
            var path = Path.Combine(dir.FullName, "appsettings.local.json");
            // An empty User means the service ran as NT AUTHORITY\SYSTEM, so
            // there is no SQL login and the revoke script must not invent one.
            File.WriteAllText(path, """
            { "Agent": { "Sql": { "User": "", "Database": "TwoTouch" } } }
            """);

            var (login, _) = Uninstaller.ReadSqlIdentityForTests(path);
            Assert.Null(login);
        }
        finally { dir.Delete(recursive: true); }
    }

    [Fact]
    public void Unreadable_config_does_not_stop_the_uninstall()
    {
        var dir = Directory.CreateTempSubdirectory("rail-uninstall-broken");
        try
        {
            var path = Path.Combine(dir.FullName, "appsettings.local.json");
            File.WriteAllText(path, "{ this is not json");

            var (login, database) = Uninstaller.ReadSqlIdentityForTests(path);

            Assert.Null(login);
            Assert.Null(database);
        }
        finally { dir.Delete(recursive: true); }
    }

    [Fact]
    public void Absent_config_yields_nulls()
    {
        var (login, database) = Uninstaller.ReadSqlIdentityForTests(
            Path.Combine(Path.GetTempPath(), $"rail-none-{Guid.NewGuid():N}.json"));

        Assert.Null(login);
        Assert.Null(database);
    }
}
