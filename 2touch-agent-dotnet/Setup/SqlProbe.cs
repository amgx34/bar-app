using System.Security.Cryptography;
using Microsoft.Data.SqlClient;
using Microsoft.Win32;
using RailAgent.Config;
using RailAgent.Services;

namespace RailAgent.Setup;

/// <summary>
/// Everything the wizard needs to find out about the local SQL Server, in the
/// order it needs to find it out: which instances exist, which databases, who we
/// are, and what we are allowed to read.
///
/// Every connection goes through <see cref="SqlReader.BuildConnectionString"/>,
/// so what the wizard proves is exactly what the service will do.
/// </summary>
public static class SqlProbe
{
    private const string InstanceKey = @"SOFTWARE\Microsoft\Microsoft SQL Server";

    /// <summary>
    /// Local instances from the registry, as connection-string server names.
    /// The default instance is <c>(local)</c>; named instances are <c>.\NAME</c>.
    /// </summary>
    public static IReadOnlyList<string> FindInstances()
    {
        var found = new List<string>();

        // 64-bit and 32-bit hives: SQL Express is frequently registered in one only.
        foreach (var view in new[] { RegistryView.Registry64, RegistryView.Registry32 })
        {
            using var hklm = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, view);
            using var key = hklm.OpenSubKey(InstanceKey);
            if (key?.GetValue("InstalledInstances") is not string[] names) continue;

            foreach (var name in names)
            {
                var server = name.Equals("MSSQLSERVER", StringComparison.OrdinalIgnoreCase)
                    ? "(local)"
                    : $".\\{name}";
                if (!found.Contains(server, StringComparer.OrdinalIgnoreCase)) found.Add(server);
            }
        }

        return found;
    }

    /// <summary>
    /// Protocols tried, in order of preference. Shared memory first because it
    /// needs no port and no SQL Browser, which is the whole reason this agent
    /// exists — but it is not always available. A real 2Touch box was found with
    /// Shared Memory disabled in SQL Server Configuration Manager, where only the
    /// unprefixed form connects; hardcoding "lpc:" made setup impossible there.
    /// The empty entry lets the client negotiate.
    /// </summary>
    public static readonly string[] Protocols = ["lpc:", "", "np:"];

    public static string Describe(string? protocol) => protocol switch
    {
        "lpc:" => "shared memory",
        "np:"  => "named pipes",
        null or "" => "client default",
        _      => protocol,
    };

    public static SqlConfig Probe(string server, string database,
                                  string? user = null, string? password = null,
                                  string? protocol = "lpc:", int timeoutSeconds = 15)
        => new()
        {
            Server   = server,
            Database = database,
            User     = user,
            Password = password,
            Protocol = protocol,
            ConnectTimeoutSeconds = timeoutSeconds,
        };

    /// <summary>
    /// Opens <paramref name="database"/> over the first protocol that works,
    /// returning it alongside the connection so everything afterwards uses the
    /// same one. Null when none connect.
    /// </summary>
    public static async Task<(SqlConnection Connection, string? Protocol)?> OpenFirstWorkingAsync(
        string server, string database, string? user, string? password, CancellationToken ct)
    {
        foreach (var protocol in Protocols)
        {
            try
            {
                var cfg = Probe(server, database, user, password, protocol, timeoutSeconds: 5);
                return (await OpenAsync(cfg, ct), protocol);
            }
            catch (Exception) when (!ct.IsCancellationRequested)
            {
                // Try the next one; the caller diagnoses only if all of them fail.
            }
        }
        return null;
    }

    public static async Task<SqlConnection> OpenAsync(SqlConfig cfg, CancellationToken ct)
    {
        var conn = new SqlConnection(SqlReader.BuildConnectionString(cfg));
        await conn.OpenAsync(ct);
        return conn;
    }

    public static async Task<List<string>> ListDatabasesAsync(SqlConnection conn, CancellationToken ct)
    {
        const string sql = """
            SELECT name FROM sys.databases
            WHERE database_id > 4 AND state = 0 AND HAS_DBACCESS(name) = 1
            ORDER BY name
            """;
        var names = new List<string>();
        await using var cmd = new SqlCommand(sql, conn);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct)) names.Add(r.GetString(0));
        return names;
    }

    /// <summary>
    /// Every table and view in the current database with its columns and types,
    /// in one round trip. Views count: 2Touch's reporting surface is largely views.
    /// </summary>
    public static async Task<List<RelationInfo>> EnumerateAsync(SqlConnection conn, CancellationToken ct)
    {
        const string sql = """
            SELECT t.TABLE_SCHEMA, t.TABLE_NAME, c.COLUMN_NAME, c.DATA_TYPE, c.ORDINAL_POSITION
            FROM INFORMATION_SCHEMA.TABLES t
            JOIN INFORMATION_SCHEMA.COLUMNS c
              ON c.TABLE_SCHEMA = t.TABLE_SCHEMA AND c.TABLE_NAME = t.TABLE_NAME
            WHERE t.TABLE_TYPE IN ('BASE TABLE', 'VIEW')
            ORDER BY t.TABLE_SCHEMA, t.TABLE_NAME, c.ORDINAL_POSITION
            """;

        var byRelation = new Dictionary<(string, string), List<ColumnInfo>>();
        var order = new List<(string Schema, string Name)>();

        await using var cmd = new SqlCommand(sql, conn) { CommandTimeout = 60 };
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            var key = (r.GetString(0), r.GetString(1));
            if (!byRelation.TryGetValue(key, out var cols))
            {
                cols = [];
                byRelation[key] = cols;
                order.Add(key);
            }
            cols.Add(new ColumnInfo(r.GetString(2), r.GetString(3)));
        }

        return order.Select(k => new RelationInfo(k.Schema, k.Name, byRelation[(k.Schema, k.Name)])).ToList();
    }

    public static async Task<bool> IsSysadminAsync(SqlConnection conn, CancellationToken ct)
        => Convert.ToInt32(await ScalarAsync(conn, "SELECT ISNULL(IS_SRVROLEMEMBER('sysadmin'), 0)", ct)) == 1;

    /// <summary>
    /// False when the server is Windows-authentication only. Creating a SQL login
    /// there is pointless: it would be created and then refused at login time.
    /// </summary>
    public static async Task<bool> IsMixedModeAsync(SqlConnection conn, CancellationToken ct)
        => Convert.ToInt32(await ScalarAsync(conn, "SELECT SERVERPROPERTY('IsIntegratedSecurityOnly')", ct)) == 0;

    /// <summary>
    /// Grants the machine account read access, so the service can run as
    /// LocalSystem with Integrated Security and no password is stored anywhere.
    /// </summary>
    public static Task GrantSystemReadAsync(SqlConnection conn, string database, CancellationToken ct)
        => GrantReadAsync(conn, database, @"NT AUTHORITY\SYSTEM", loginSql: null, ct);

    /// <summary>Creates (or repairs) the BarAppRead SQL login and grants it db_datareader.</summary>
    public static Task CreateReadLoginAsync(
        SqlConnection conn, string database, string login, string password, CancellationToken ct)
    {
        var loginSql = $"""
            IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = {QuoteLiteral(login)})
                CREATE LOGIN {QuoteIdentifier(login)} WITH PASSWORD = {QuoteLiteral(password)},
                    CHECK_POLICY = OFF, DEFAULT_DATABASE = {QuoteIdentifier(database)};
            ELSE
                ALTER LOGIN {QuoteIdentifier(login)} WITH PASSWORD = {QuoteLiteral(password)};
            """;
        return GrantReadAsync(conn, database, login, loginSql, ct);
    }

    /// <summary>
    /// Server-level login first, then the database user and role membership.
    /// Split across batches with ChangeDatabase rather than an inline USE: the
    /// principal statements are compiled against the current database, and a
    /// single batch that switches mid-way is a well-known way to get bitten.
    /// </summary>
    private static async Task GrantReadAsync(
        SqlConnection conn, string database, string principal, string? loginSql, CancellationToken ct)
    {
        var original = conn.Database;

        await ExecuteAsync(conn, loginSql ?? $"""
            IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = {QuoteLiteral(principal)})
                CREATE LOGIN {QuoteIdentifier(principal)} FROM WINDOWS;
            """, ct);

        try
        {
            conn.ChangeDatabase(database);
            await ExecuteAsync(conn, $"""
                IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = {QuoteLiteral(principal)})
                    CREATE USER {QuoteIdentifier(principal)} FOR LOGIN {QuoteIdentifier(principal)};

                ALTER ROLE db_datareader ADD MEMBER {QuoteIdentifier(principal)};
                """, ct);
        }
        finally
        {
            if (!string.Equals(conn.Database, original, StringComparison.OrdinalIgnoreCase))
                conn.ChangeDatabase(original);
        }
    }

    /// <summary>
    /// 32 characters from A-Z a-z 0-9 _ - . ! — deliberately excludes quotes,
    /// backslashes and semicolons, which would otherwise need escaping in both a
    /// connection string and a JSON file.
    /// </summary>
    public static string GeneratePassword(int length = 32)
    {
        const string alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-.!";
        return RandomNumberGenerator.GetString(alphabet, length);
    }

    /// <summary>The statement a DBA has to run when the wizard is not allowed to.</summary>
    public static string ManualGrantScript(string database, string login)
        => $"""
            USE [master];
            CREATE LOGIN [{login}] WITH PASSWORD = '<choose one>', CHECK_POLICY = OFF;
            USE [{database}];
            CREATE USER [{login}] FOR LOGIN [{login}];
            ALTER ROLE db_datareader ADD MEMBER [{login}];
            """;

    /// <summary>
    /// The exact inverse of <see cref="ManualGrantScript"/>, for uninstall.
    ///
    /// The agent cannot run this itself: it connects as this very login, which
    /// holds db_datareader and nothing more, so dropping it needs a sysadmin.
    /// Printing the script means the credential does not silently outlive the
    /// software that needed it.
    /// </summary>
    public static string ManualRevokeScript(string database, string login)
        => $"""
            USE [{database}];
            DROP USER IF EXISTS [{login}];
            USE [master];
            DROP LOGIN [{login}];
            """;

    private static async Task<object?> ScalarAsync(SqlConnection conn, string sql, CancellationToken ct)
    {
        await using var cmd = new SqlCommand(sql, conn);
        var value = await cmd.ExecuteScalarAsync(ct);
        return value is DBNull ? 0 : value;
    }

    private static async Task ExecuteAsync(SqlConnection conn, string sql, CancellationToken ct)
    {
        await using var cmd = new SqlCommand(sql, conn) { CommandTimeout = 60 };
        await cmd.ExecuteNonQueryAsync(ct);
    }

    /// <summary>[Bracket-quoted], with any embedded ] doubled.</summary>
    public static string QuoteIdentifier(string name) => $"[{name.Replace("]", "]]")}]";

    /// <summary>N'quoted', with any embedded ' doubled.</summary>
    public static string QuoteLiteral(string value) => $"N'{value.Replace("'", "''")}'";
}
