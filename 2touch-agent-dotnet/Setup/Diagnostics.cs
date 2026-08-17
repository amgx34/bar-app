using System.Diagnostics;
using System.Net.Sockets;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using RailAgent.Config;
using RailAgent.Services;

namespace RailAgent.Setup;

/// <summary>
/// <c>--diagnose</c>: walks every prerequisite the twelve setup stages depend on
/// and reports each one as pass / warn / fail, with how long it took.
///
/// The rule that shapes this whole file: <b>no step may block indefinitely.</b>
/// The wizard can — stage 5 opens a SqlConnection and, if the native SQL client
/// stalls while unpacking itself, no timeout in the agent applies and the screen
/// sits silent for as long as it takes. Every check here is therefore run under a
/// wall-clock budget enforced by <see cref="Bounded{T}"/>, which reports TIMEOUT
/// and moves on. A diagnostic that can hang is worth nothing on the box where the
/// thing you are diagnosing is a hang.
///
/// Runs unelevated on purpose: checks that need Administrator report WARN and say
/// so, rather than refusing to produce a report at all.
/// </summary>
public static class Diagnostics
{
    private const string Placeholder = "REPLACE_WITH";

    private static readonly TimeSpan Quick   = TimeSpan.FromSeconds(5);
    private static readonly TimeSpan Connect = TimeSpan.FromSeconds(8);
    private static readonly TimeSpan FirstConnect = TimeSpan.FromSeconds(25);  // includes native extraction
    private static readonly TimeSpan Query   = TimeSpan.FromSeconds(20);

    private static TextWriter _out = Console.Out;
    private static int _fails;
    private static int _warns;

    /// <summary>
    /// True when nothing has been configured yet — the org id is still the
    /// placeholder baked into the exe. The SQL failures below are then expected
    /// (they are testing the embedded defaults), and the remedy is to run setup,
    /// not to hand-edit a file that does not exist.
    /// </summary>
    private static bool _unconfigured;

    private static string Remedy
        => _unconfigured
            ? "Setup has not run on this box yet — run it (menu option 1) and this resolves itself."
            : $"Fix it in {LocalConfigWriter.FileName}, or re-run setup.";

    public static async Task<int> RunAsync(CancellationToken ct)
    {
        var transcript = Path.Combine(
            AppContext.BaseDirectory,
            $"rail-diagnose-{DateTime.Now:yyyyMMdd-HHmmss}.txt");

        StreamWriter? file = null;
        try { file = new StreamWriter(transcript) { AutoFlush = true }; }
        catch { /* read-only directory: console only */ }

        _out = file is null ? Console.Out : new TeeWriter(Console.Out, file);
        _fails = 0;
        _warns = 0;
        _unconfigured = false;   // the menu can run this more than once per process

        try
        {
            Title("Rail 2Touch agent — diagnostic");
            Line($"  {DateTime.Now:yyyy-MM-dd HH:mm:ss}  ·  exe {Environment.ProcessPath}");

            Environment_();
            var cfg = ConfigSummary(out var configured);
            await RailAsync(cfg, ct);

            var instances = Instances();
            Services_(instances);

            var nativeOk = await NativeClientAsync(instances, ct);
            var reachable = await ConnectMatrixAsync(cfg, instances, nativeOk, ct);

            if (reachable is not null)
            {
                await IdentityAsync(reachable, ct);
                var database = await DatabasesAsync(reachable, cfg, ct);
                if (database is not null)
                    await SchemaAndFeedsAsync(reachable, database, cfg, ct);
                reachable.Connection.Dispose();
            }
            else
            {
                Skip("SQL checks", "no connection could be established");
            }

            LocalConfig(configured);
            ServiceState();

            Title("Summary");
            if (_fails == 0 && _warns == 0) Ok("Everything checked out.");
            else Line($"  {_fails} failure(s), {_warns} warning(s).");
            if (file is not null) Line($"  Transcript written to {transcript}");

            return _fails == 0 ? 0 : 1;
        }
        finally
        {
            file?.Dispose();
            _out = Console.Out;
        }
    }

    // ── 1. Environment ────────────────────────────────────────────────────────

    private static void Environment_()
    {
        Title("[1/12] Environment");

        Line($"  OS            {System.Runtime.InteropServices.RuntimeInformation.OSDescription}");
        Line($"  Runtime       {System.Runtime.InteropServices.RuntimeInformation.FrameworkDescription}");
        Line($"  Process       {(System.Environment.Is64BitProcess ? "64-bit" : "32-bit")}");
        Line($"  User          {Elevation.CurrentUser()}");

        if (Elevation.IsAdministrator())
            Ok("Running elevated.");
        else
            Warn("Not elevated — service and ACL checks below will be limited.");
    }

    // ── 2. Configuration ──────────────────────────────────────────────────────

    /// <summary>
    /// Where the service's own configuration lives, which is not necessarily next
    /// to whatever is running this. A standalone diagnostic launched off a USB
    /// stick must still read C:\rail-agent\appsettings.local.json, or it reports
    /// "setup has never run" about a box that is working perfectly.
    /// </summary>
    private static string? FindLocalConfig(out IReadOnlyList<string> searched)
    {
        var dirs = new List<string> { AppContext.BaseDirectory.TrimEnd('\\'), SetupWizard.InstallDirectory.TrimEnd('\\') }
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        searched = dirs;

        // The installed copy wins: it is the one the service actually reads.
        for (var i = dirs.Count - 1; i >= 0; i--)
        {
            var candidate = Path.Combine(dirs[i], LocalConfigWriter.FileName);
            if (File.Exists(candidate)) return candidate;
        }
        return null;
    }

    /// <summary>
    /// Rebuilds the same three-layer configuration Program.cs does, but one source
    /// at a time so a layer that cannot be read is reported rather than thrown.
    /// The ACL'd local file is unreadable to a non-elevated operator — who is
    /// exactly the person running this — so loading it must not be fatal.
    /// </summary>
    private static AgentConfig ConfigSummary(out string directory)
    {
        Title("[2/12] Configuration in effect");

        var dir = AppContext.BaseDirectory;
        var localConfig = FindLocalConfig(out var searched);
        directory = localConfig is not null ? Path.GetDirectoryName(localConfig)! : dir;

        var cfg = new AgentConfig();
        var builder = new Microsoft.Extensions.Configuration.ConfigurationBuilder();

        Line($"  Running from  {dir}");
        if (searched.Count > 1)
            Line($"  Also checked  {string.Join(", ", searched.Skip(1))}");

        var embedded = EmbeddedJsonConfigurationSource.TryLoad();
        if (embedded is not null)
        {
            builder.Sources.Add(embedded);
            Line("  Layer 1       embedded appsettings.json     ok");
        }
        else Line("  Layer 1       embedded appsettings.json     MISSING");

        foreach (var name in new[] { "appsettings.json", LocalConfigWriter.FileName })
        {
            var path = name == LocalConfigWriter.FileName
                ? localConfig ?? Path.Combine(dir, name)
                : Path.Combine(dir, name);

            if (!File.Exists(path)) { Line($"  {Pad(name)}not present"); continue; }

            string text;
            try { text = File.ReadAllText(path); }
            catch (UnauthorizedAccessException)
            {
                Line($"  {Pad(name)}UNREADABLE by {Elevation.CurrentUser()}");
                Warn($"{name} exists but this account cannot read it — it is ACL'd to "
                   + "Administrators and SYSTEM. Re-run elevated to diagnose against the real settings.");
                continue;
            }
            catch (Exception ex)
            {
                Line($"  {Pad(name)}ERROR {Short(ex)}");
                Fail($"{name} could not be opened: {Short(ex)}");
                continue;
            }

            // Parsed here rather than left to Build(): otherwise a broken file is
            // reported as a bind failure that never names which file it was.
            try { using var _ = System.Text.Json.JsonDocument.Parse(text); }
            catch (System.Text.Json.JsonException ex)
            {
                Line($"  {Pad(name)}MALFORMED JSON");
                Fail($"{name} is not valid JSON — the service cannot start. {ex.Message}");
                continue;
            }

            Microsoft.Extensions.Configuration.JsonConfigurationExtensions
                .AddJsonFile(builder, path, optional: true, reloadOnChange: false);

            var where = Path.GetDirectoryName(path)!.TrimEnd('\\')
                .Equals(dir.TrimEnd('\\'), StringComparison.OrdinalIgnoreCase)
                ? ""
                : $"  from {Path.GetDirectoryName(path)}";
            Line($"  {Pad(name)}ok ({text.Length:n0} bytes){where}");
        }

        try { builder.Build().GetSection("Agent").Bind(cfg); }
        catch (Exception ex) { Fail($"Configuration could not be bound: {Short(ex)}"); }

        Line($"  Server        {Describe(cfg.Sql.Protocol)}{cfg.Sql.Server}");
        Line($"  Database      {cfg.Sql.Database}");
        Line($"  Auth          {(string.IsNullOrWhiteSpace(cfg.Sql.User) ? "Windows (integrated)" : $"SQL login '{cfg.Sql.User}'")}");
        Line($"  Rail URL      {cfg.Rail.ApiBaseUrl}");
        Line($"  Org id        {Mask(cfg.Rail.OrgId)}");
        Line($"  Agent token   {Mask(cfg.Rail.AuthToken)}");
        Line($"  Lookback      {cfg.Sync.LookbackDays} day(s), every {cfg.Sync.IntervalMinutes} min");

        if (cfg.Rail.OrgId.Contains(Placeholder, StringComparison.Ordinal))
        {
            _unconfigured = true;
            Warn("Org id is still the placeholder — setup has never completed here. "
               + "The SQL checks below test the built-in defaults, so failures there are expected.");
        }
        else
        {
            Ok("Configuration loaded.");
        }

        return cfg;

        static string Describe(string? p) => string.IsNullOrWhiteSpace(p) ? "" : p;
        static string Pad(string name) => $"Layer {(name == "appsettings.json" ? 2 : 3)}       {name,-28}".PadRight(14);
    }

    // ── 3. Rail ───────────────────────────────────────────────────────────────

    private static async Task RailAsync(AgentConfig cfg, CancellationToken ct)
    {
        Title("[3/12] Rail connectivity");

        if (!Uri.TryCreate(cfg.Rail.ApiBaseUrl, UriKind.Absolute, out var uri))
        {
            Fail($"ApiBaseUrl is not a valid absolute URL: '{cfg.Rail.ApiBaseUrl}'");
            return;
        }

        var dns = await Bounded(async _ =>
            await System.Net.Dns.GetHostAddressesAsync(uri.Host, ct), Quick);
        if (dns.TimedOut) { Fail($"DNS lookup for {uri.Host} timed out."); return; }
        if (dns.Error is not null) { Fail($"DNS lookup for {uri.Host} failed: {Short(dns.Error)}"); return; }
        Ok($"DNS {uri.Host} → {string.Join(", ", dns.Value!.Select(a => a.ToString()))}  ({dns.Elapsed.TotalMilliseconds:n0} ms)");

        var port = uri.Port;
        var tcp = await Bounded(async _ =>
        {
            using var client = new TcpClient();
            await client.ConnectAsync(uri.Host, port, ct);
            return true;
        }, Quick);
        if (tcp.TimedOut) { Fail($"TCP {uri.Host}:{port} timed out — outbound HTTPS may be blocked."); return; }
        if (tcp.Error is not null) { Fail($"TCP {uri.Host}:{port} failed: {Short(tcp.Error)}"); return; }
        Ok($"TCP {uri.Host}:{port} open  ({tcp.Elapsed.TotalMilliseconds:n0} ms)");

        if (cfg.Rail.OrgId.Contains(Placeholder, StringComparison.Ordinal) ||
            cfg.Rail.AuthToken.Contains(Placeholder, StringComparison.Ordinal))
        {
            Skip("signed ingest", "no org id / token configured yet");
            return;
        }

        // The real thing: an empty but correctly signed payload. Proves the token
        // matches this org and the HMAC verifies, and writes nothing.
        var post = await Bounded(async _ =>
        {
            using var http = new HttpClient { Timeout = Quick };
            return await RailClient.SendAsync(http, cfg.Rail, [], [], [], ct);
        }, TimeSpan.FromSeconds(15));

        if (post.TimedOut) { Fail("Signed ingest timed out."); return; }
        if (post.Error is not null) { Fail($"Signed ingest failed: {Short(post.Error)}"); return; }

        var r = post.Value!;
        if (r.Ok) Ok($"Signed ingest accepted (HTTP {r.StatusCode})  ({post.Elapsed.TotalMilliseconds:n0} ms)");
        else if (r.StatusCode == 401) Fail($"HTTP 401 — org id / agent token rejected. {Trim(r.Body)}");
        else Fail($"HTTP {r.StatusCode}: {Trim(r.Body)}");
    }

    // ── 4. SQL Server instances and services ──────────────────────────────────

    private static IReadOnlyList<string> Instances()
    {
        Title("[4/12] SQL Server instances (registry)");

        IReadOnlyList<string> instances;
        try { instances = SqlProbe.FindInstances(); }
        catch (Exception ex) { Fail($"Could not read the registry: {Short(ex)}"); return []; }

        if (instances.Count == 0)
        {
            Fail("No SQL Server instance is registered on this machine — wrong box?");
            return instances;
        }

        foreach (var i in instances) Line($"  {i}");
        Ok($"{instances.Count} instance(s) found.");
        return instances;
    }

    private static void Services_(IReadOnlyList<string> instances)
    {
        Title("[4/12] SQL Server services");

        var names = new List<string>();
        foreach (var i in instances)
            names.Add(i is "(local)" or "." ? "MSSQLSERVER" : $"MSSQL${i.TrimStart('.', '\\')}");
        names.Add("SQLBrowser");

        foreach (var svc in names)
        {
            var q = ServiceControl.Query(svc);
            var state = StateOf(q.Output);
            var label = $"  {svc,-28} {state}";

            if (svc == "SQLBrowser")
                Line($"{label}   (not needed — shared memory does not use it)");
            else if (state == "RUNNING")
                Line($"{label}   ok");
            else
            {
                Line(label);
                Fail($"{svc} is not running — the agent cannot connect to it.");
            }
        }

        static string StateOf(string output)
        {
            foreach (var known in new[] { "RUNNING", "STOPPED", "START_PENDING", "STOP_PENDING", "PAUSED" })
                if (output.Contains(known, StringComparison.Ordinal)) return known;
            return "not installed";
        }
    }

    // ── 5a. The native client — the step with no timeout of its own ───────────

    /// <summary>
    /// A single-file exe unpacks Microsoft.Data.SqlClient.SNI.dll to
    /// %TEMP%\.net\ the first time it opens a connection. That happens inside
    /// stage 5, before any connection logic runs, so ConnectTimeout does not
    /// govern it — an antivirus scan of the unsigned native library stalls the
    /// wizard with no output and no way out. This isolates that cost: the
    /// extraction state before, one deliberate first connect, the state after.
    /// </summary>
    private static async Task<bool> NativeClientAsync(IReadOnlyList<string> instances, CancellationToken ct)
    {
        Title("[5/12] Native SQL client (Microsoft.Data.SqlClient.SNI)");

        var root = Path.Combine(Path.GetTempPath(), ".net");
        Line($"  Extract root  {root}");
        Line($"  Before        {DescribeSni(root)}");

        if (instances.Count == 0) { Skip("first connect", "no instance to try"); return false; }

        // Deliberately the first connection this process makes. The elapsed time
        // is extraction + load + connect; every later attempt is connect alone.
        var target = new SqlConfig
        {
            Server = instances[0], Database = "master", User = "", Password = "",
            Protocol = "lpc:", ConnectTimeoutSeconds = 5,
        };

        var probe = await Bounded(async token =>
        {
            await using var c = new SqlConnection(SqlReader.BuildConnectionString(target));
            await c.OpenAsync(token);
            return c.ServerVersion;
        }, FirstConnect);

        Line($"  After         {DescribeSni(root)}");

        if (probe.TimedOut)
        {
            Fail($"First connection did not return within {FirstConnect.TotalSeconds:n0}s.");
            Line("                This is the wizard's stage-5 hang. If 'After' still shows no SNI dll,");
            Line("                the exe is stuck unpacking itself — antivirus/EDR is the usual cause.");
            Line($"                Exclude {Environment.ProcessPath} and {root}, or set");
            Line("                DOTNET_BUNDLE_EXTRACT_BASE_DIR to a folder the scanner ignores.");
            return false;
        }

        if (probe.Error is not null)
        {
            // A refused connection still proves the native library loaded.
            Line($"  First connect {probe.Elapsed.TotalMilliseconds:n0} ms → {Short(probe.Error)}");
            Ok("Native client loaded (the connection itself was refused — see below).");
            return true;
        }

        Ok($"Native client loaded and connected in {probe.Elapsed.TotalMilliseconds:n0} ms (SQL {probe.Value}).");
        if (probe.Elapsed > TimeSpan.FromSeconds(10))
            Warn("That took over 10s — an on-access scanner is probably inspecting the extraction.");
        return true;

        static string DescribeSni(string root)
        {
            try
            {
                if (!Directory.Exists(root)) return "no extraction directory yet";
                var dlls = Directory.GetFiles(root, "*SNI*.dll", SearchOption.AllDirectories);
                return dlls.Length == 0
                    ? "directory exists, no SNI dll"
                    : $"{dlls.Length} SNI dll(s), newest {File.GetLastWriteTime(dlls.OrderBy(File.GetLastWriteTime).Last()):HH:mm:ss}";
            }
            catch (Exception ex) { return $"could not inspect: {ex.Message}"; }
        }
    }

    // ── 5b. Which server/protocol combinations actually connect ───────────────

    private sealed record Reachable(string Server, string? Protocol, SqlConnection Connection);

    private static async Task<Reachable?> ConnectMatrixAsync(
        AgentConfig cfg, IReadOnlyList<string> instances, bool nativeOk, CancellationToken ct)
    {
        Title("[5/12] Connection matrix (master)");

        if (!nativeOk && instances.Count > 0)
            Warn("The native client never loaded; the attempts below will likely all time out.");

        Line($"  {"target",-30} {"auth",-14} {"time",8}  result");

        Reachable? first = null;
        var configuredWorks = false;      // configured endpoint AND configured credentials
        var configuredEndpointOk = false; // configured endpoint, Windows auth — isolates a credential fault
        var sharedMemoryWorked = false;   // lpc: anywhere at all

        var candidates = new List<(string Server, string? Protocol)>();
        // The configured combination goes first and is marked: whether *it* works
        // is the question that matters. Another row succeeding does not help the
        // service, which only ever uses what is in config.
        candidates.Add((cfg.Sql.Server, cfg.Sql.Protocol));
        foreach (var i in instances)
            foreach (var p in new string?[] { "lpc:", "", "np:" })
                if (!(i.Equals(cfg.Sql.Server, StringComparison.OrdinalIgnoreCase) && p == cfg.Sql.Protocol))
                    candidates.Add((i, p));

        foreach (var (server, protocol) in candidates)
        {
            var isConfigured = server.Equals(cfg.Sql.Server, StringComparison.OrdinalIgnoreCase)
                            && protocol == cfg.Sql.Protocol;

            // Windows auth, then the configured SQL login where there is one.
            var attempts = new List<(string User, string Password)> { ("", "") };
            if (!string.IsNullOrWhiteSpace(cfg.Sql.User))
                attempts.Add((cfg.Sql.User, cfg.Sql.Password ?? ""));

            foreach (var (user, password) in attempts)
            {
                var usesConfiguredAuth = string.IsNullOrWhiteSpace(cfg.Sql.User)
                    ? string.IsNullOrWhiteSpace(user)
                    : !string.IsNullOrWhiteSpace(user);

                var opened = await TryOneAsync(server, protocol, user, password, isConfigured, ct);
                if (opened is null) continue;

                if (isConfigured && usesConfiguredAuth) configuredWorks = true;
                if (isConfigured && string.IsNullOrWhiteSpace(user)) configuredEndpointOk = true;
                if (protocol == "lpc:") sharedMemoryWorked = true;
                if (first is null) first = opened; else opened.Connection.Dispose();
            }
        }

        // Shared memory is what this agent is built around — no port, no SQL
        // Browser, immune to 2Touch's dynamic port. When it is the only protocol
        // failing, that is a specific, fixable condition and worth naming.
        if (first is not null && first.Protocol != "lpc:" && !sharedMemoryWorked)
        {
            Warn("Shared memory (lpc:) failed on every instance, but "
               + $"{SqlProbe.Describe(first.Protocol)} works. Shared Memory is most likely disabled "
               + "in SQL Server Configuration Manager → SQL Server Network Configuration → "
               + "Protocols. The agent works over the other protocols, so this is not blocking — "
               + "but shared memory is the one that cannot be affected by a dynamic port.");
        }

        if (first is null)
        {
            Fail("No combination of instance, protocol and credentials could connect.");
        }
        else if (!configuredWorks && configuredEndpointOk)
        {
            // The endpoint is right; only the credentials are refused. Saying
            // "fix Sql.Server" here would send the operator after the wrong thing.
            Fail($"{cfg.Sql.Protocol}{cfg.Sql.Server} is reachable, but the configured SQL login "
               + $"'{cfg.Sql.User}' is refused — Windows auth to the same instance works. "
               + (_unconfigured
                    ? Remedy
                    : $"Either correct Sql.User / Sql.Password in {LocalConfigWriter.FileName}, or clear "
                    + "Sql.User to \"\" to use Windows auth (which is what setup prefers)."));
            Line($"  Continuing the checks below as {Elevation.CurrentUser()}.");
        }
        else if (!configuredWorks)
        {
            Fail($"The CONFIGURED target ({cfg.Sql.Protocol}{cfg.Sql.Server}, "
               + $"{(string.IsNullOrWhiteSpace(cfg.Sql.User) ? "Windows auth" : $"login '{cfg.Sql.User}'")}) "
               + $"cannot connect, but {first.Protocol}{first.Server} can. The service uses config, so it will fail. "
               + $"Fix Sql.Server / Sql.Protocol in {LocalConfigWriter.FileName}, or re-run --setup.");
            Line($"  Continuing the checks below on {first.Protocol}{first.Server}.");
        }
        else
        {
            Ok($"Configured target connects; using {first.Protocol}{first.Server} below.");
        }

        return first;
    }

    private static async Task<Reachable?> TryOneAsync(
        string server, string? protocol, string user, string password, bool isConfigured, CancellationToken ct)
    {
        var target = new SqlConfig
        {
            Server = server, Database = "master", User = user, Password = password,
            Protocol = protocol, ConnectTimeoutSeconds = 5,
        };

        var attempt = await Bounded(async token =>
        {
            var c = new SqlConnection(SqlReader.BuildConnectionString(target));
            await c.OpenAsync(token);
            return c;
        }, Connect);

        var label = (isConfigured ? "* " : "  ") + $"{protocol}{server}";
        var auth = string.IsNullOrWhiteSpace(user) ? "windows" : $"sql:{user}";
        var time = $"{attempt.Elapsed.TotalMilliseconds:n0} ms";

        if (attempt.TimedOut)
        {
            // Past its own ConnectTimeout and past ours: blocked somewhere that
            // does not honour either, which is the failure mode worth naming.
            Line($"  {label,-30} {auth,-14} {time,8}  TIMEOUT (exceeded our {Connect.TotalSeconds:n0}s budget)");
            return null;
        }
        if (attempt.Error is not null)
        {
            Line($"  {label,-30} {auth,-14} {time,8}  {Short(attempt.Error)}");
            return null;
        }

        Line($"  {label,-30} {auth,-14} {time,8}  ok");
        return new Reachable(server, protocol, attempt.Value!);
    }

    // ── 6. Identity and permissions ───────────────────────────────────────────

    private static async Task IdentityAsync(Reachable r, CancellationToken ct)
    {
        Title("[6/12] SQL identity and permissions");

        var who = await ScalarAsync(r.Connection, "SELECT SUSER_SNAME()", ct);
        Line($"  Logged in as  {who ?? "?"}");

        var sysadmin = await ScalarAsync(r.Connection, "SELECT ISNULL(IS_SRVROLEMEMBER('sysadmin'),0)", ct);
        var isSysadmin = sysadmin?.ToString() == "1";
        Line($"  sysadmin      {(isSysadmin ? "yes" : "no")}");

        var winOnly = await ScalarAsync(r.Connection, "SELECT SERVERPROPERTY('IsIntegratedSecurityOnly')", ct);
        var isWinOnly = winOnly?.ToString() == "1";
        Line($"  Auth mode     {(isWinOnly ? "Windows only" : "Mixed Mode")}");

        if (isSysadmin)
            Ok("This account can grant the service read access without help.");
        else if (isWinOnly)
            Fail("Not sysadmin and the server is Windows-auth only — setup cannot grant access. "
                    + "Re-run as a SQL sysadmin, or enable Mixed Mode during a planned SQL restart.");
        else
            Warn("Not sysadmin — setup will need sa credentials at stage 6.");
    }

    // ── 7. Databases ──────────────────────────────────────────────────────────

    private static async Task<string?> DatabasesAsync(Reachable r, AgentConfig cfg, CancellationToken ct)
    {
        Title("[7/12] Databases");

        var list = await Bounded(async token =>
            await SqlProbe.ListDatabasesAsync(r.Connection, token), Query);

        if (list.TimedOut) { Fail($"Listing databases did not finish within {Query.TotalSeconds:n0}s."); return null; }
        if (list.Error is not null) { Fail($"Could not list databases: {Short(list.Error)}"); return null; }

        foreach (var d in list.Value!) Line($"  {d}");

        if (list.Value.Count == 0) { Fail("No user databases are visible to this account."); return null; }

        var configured = list.Value.FirstOrDefault(d => d.Equals(cfg.Sql.Database, StringComparison.OrdinalIgnoreCase));
        var twoTouch   = list.Value.FirstOrDefault(d => d.Contains("2touch", StringComparison.OrdinalIgnoreCase)
                                                     || d.Contains("twotouch", StringComparison.OrdinalIgnoreCase));
        var chosen = configured ?? twoTouch;

        // A configured database that is not there is fatal for the service, even
        // though the checks below can carry on against a stand-in. Report the
        // verdict on what is configured, not on what happens to be available.
        if (configured is not null)
        {
            Ok($"Configured database '{cfg.Sql.Database}' is present.");
        }
        else if (twoTouch is not null)
        {
            Fail($"Configured database '{cfg.Sql.Database}' does not exist on this instance. "
               + $"The service will fail every sync. '{twoTouch}' looks like the right one. "
               + Remedy);
            Line($"  Continuing against '{twoTouch}' so the checks below still tell you something.");
        }
        else
        {
            Fail($"Configured database '{cfg.Sql.Database}' does not exist, and nothing here looks like TwoTouch.");
            return null;
        }

        return chosen;
    }

    // ── 8. Schema, profile and the three feed queries ─────────────────────────

    private static async Task SchemaAndFeedsAsync(Reachable reachable, string database, AgentConfig cfg, CancellationToken ct)
    {
        Title($"[8/12] Schema of {database}");

        var opened = await Bounded(async token =>
            await SqlProbe.OpenAsync(
                SqlProbe.Probe(reachable.Server, database, protocol: reachable.Protocol, timeoutSeconds: 5), token), Connect);

        if (opened.TimedOut) { Fail($"Connecting to {database} timed out."); return; }
        if (opened.Error is not null) { Fail($"Could not open {database}: {Short(opened.Error)}"); return; }

        await using var conn = opened.Value!;

        var enumerated = await Bounded(async token => await SqlProbe.EnumerateAsync(conn, token), Query);
        if (enumerated.TimedOut) { Fail($"Enumerating the schema did not finish within {Query.TotalSeconds:n0}s."); return; }
        if (enumerated.Error is not null) { Fail($"Could not enumerate the schema: {Short(enumerated.Error)}"); return; }

        var relations = enumerated.Value!;
        Ok($"{relations.Count} tables and views  ({enumerated.Elapsed.TotalMilliseconds:n0} ms)");

        // Which feeds the built-in mapping recognises.
        var profiled = new AgentConfig { Sql = cfg.Sql, Rail = cfg.Rail, Sync = cfg.Sync };
        var matched = TwoTouchProfile.Match(relations);
        foreach (var feed in TwoTouchProfile.All)
        {
            if (matched.Any(m => m.FeedKey == feed.FeedKey))
            {
                TwoTouchProfile.Apply(feed, profiled);
                Line($"  {feed.FeedKey,-12} built-in mapping matches");
            }
            else
            {
                var missing = TwoTouchProfile.MissingRelations(feed, relations);
                Line($"  {feed.FeedKey,-12} no built-in mapping — missing {string.Join(", ", missing)}");
            }
        }

        if (matched.Count == 0)
            Warn("No feed matched the built-in mapping; setup would fall back to discovery.");
        else if (matched.Count < TwoTouchProfile.All.Length)
            Warn($"{matched.Count} of {TwoTouchProfile.All.Length} feeds matched.");
        else
            Ok("All three feeds matched the built-in mapping.");

        // The queries the SERVICE will run — i.e. what config says, not what the
        // profile would prefer. Substituting the profile here would report green
        // for a hand-edited or disabled feed that is actually broken.
        await FeedQueriesAsync(conn, cfg, "as configured — this is what the service runs", ct);

        // Then, only if setup would write something different, what it would get.
        if (matched.Count > 0 && DiffersFrom(cfg, profiled))
        {
            Line("");
            Line("  The built-in mapping differs from what is configured. Running it too:");
            await FeedQueriesAsync(conn, profiled, "built-in mapping — what --setup would write", ct);
        }

        await SizeAndIndexesAsync(conn, ct);

        static bool DiffersFrom(AgentConfig a, AgentConfig b)
            => a.Tables.ZReport != b.Tables.ZReport
            || a.Tables.EwReport != b.Tables.EwReport
            || a.Tables.ItemAudit != b.Tables.ItemAudit;
    }

    private static async Task FeedQueriesAsync(SqlConnection conn, AgentConfig probe, string label, CancellationToken ct)
    {
        Title($"[9/12] Feed queries, last 7 days ({label})");

        var reader = new SqlReader(Microsoft.Extensions.Options.Options.Create(probe));

        await OneAsync("ZReport", probe.Tables.ZReport,
            async token => (await reader.QueryZReportsAsync(conn, 7, token)).Count);
        await OneAsync("EwReport", probe.Tables.EwReport,
            async token => (await reader.QueryEwReportsAsync(conn, 7, token)).Count);
        await OneAsync("ItemAudit", probe.Tables.ItemAudit,
            async token => (await reader.QueryItemAuditAsync(conn, 7, token)).Count);

        async Task OneAsync(string name, string table, Func<CancellationToken, Task<int>> run)
        {
            if (string.IsNullOrWhiteSpace(table))
            {
                // An empty Tables entry is the documented way to turn a feed off;
                // the service sends an empty array for it rather than failing.
                Line($"  {name,-12} DISABLED — Tables.{name} is empty, so this feed is never sent");
                Warn($"{name} is switched off in configuration. Clear that entry to re-enable it.");
                return;
            }

            var result = await Bounded(run, Query);
            if (result.TimedOut)
            {
                Line($"  {name,-12} TIMEOUT after {Query.TotalSeconds:n0}s");
                Fail($"{name} did not return within {Query.TotalSeconds:n0}s — see the index check below.");
                return;
            }
            if (result.Error is not null)
            {
                Line($"  {name,-12} ERROR {Short(result.Error)}");
                Fail($"{name} query failed.");
                return;
            }

            Line($"  {name,-12} {result.Value} row(s) in {result.Elapsed.TotalMilliseconds:n0} ms");
            if (result.Value == 0) Warn($"{name} returned no rows for the last 7 days.");
            if (result.Elapsed > TimeSpan.FromSeconds(5))
                Warn($"{name} took {result.Elapsed.TotalSeconds:n1}s — this runs every {probe.Sync.IntervalMinutes} min.");
        }
    }

    /// <summary>
    /// Row counts and index coverage for the tables the profile reads. The
    /// {cutoff} pushdown only avoids a full scan if the raw date column is
    /// indexed; on a box with a year of history that is the difference between
    /// milliseconds and minutes, every five minutes.
    /// </summary>
    private static async Task SizeAndIndexesAsync(SqlConnection conn, CancellationToken ct)
    {
        Title("[10/12] Table sizes and date indexes");

        const string sizeSql = """
            SELECT OBJECT_NAME(p.object_id) AS tbl, SUM(p.rows) AS rows
            FROM sys.partitions p
            WHERE p.index_id IN (0,1)
              AND OBJECT_NAME(p.object_id) IN
                  ('tblSalesHist','tblSalesHistRptCtg','tblSalesHdrHist','tblSalesHistPmnts',
                   'tblSalesDailyDtl','tblSalesDailyRptCtg','tblSalesDailyHdr','tblSalesDailyPmnts',
                   'tblTimeClockNew','tblTips')
            GROUP BY p.object_id ORDER BY SUM(p.rows) DESC
            """;

        const string indexSql = """
            SELECT OBJECT_NAME(i.object_id) AS tbl, c.name AS col, i.name AS ix, ic.key_ordinal
            FROM sys.index_columns ic
            JOIN sys.indexes i ON i.object_id = ic.object_id AND i.index_id = ic.index_id
            JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
            WHERE c.name IN ('dtmSalesDate','dtmTicketDate','dtmPmntDate','dtmReportIn','dtmClockIn')
            ORDER BY tbl, ix, ic.key_ordinal
            """;

        var sizes = await Bounded(token => RowsAsync(conn, sizeSql, token), Query);
        if (sizes.TimedOut || sizes.Error is not null)
        {
            Warn($"Could not measure table sizes: {(sizes.TimedOut ? "timed out" : Short(sizes.Error!))}");
        }
        else
        {
            if (sizes.Value!.Count == 0) Line("  (none of the profile's tables exist here)");
            foreach (var row in sizes.Value) Line($"  {row[0],-24} {row[1],12:n0} rows");
        }

        var indexes = await Bounded(token => RowsAsync(conn, indexSql, token), Query);
        if (indexes.TimedOut || indexes.Error is not null)
        {
            Warn($"Could not read index metadata: {(indexes.TimedOut ? "timed out" : Short(indexes.Error!))}");
            return;
        }

        var indexRows = indexes.Value!;
        var leading = indexRows
            .Where(r => Convert.ToInt32(r[3]) == 1)
            .Select(r => $"{r[0]}.{r[1]}")
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (indexRows.Count == 0)
        {
            Line("  no index covers any of the date columns the profile filters on");
        }
        else
        {
            foreach (var r in indexRows)
                Line($"  {r[0]}.{r[1],-18} in {r[2]} (key {r[3]})");
        }

        var big = sizes.TimedOut || sizes.Error is not null
            ? []
            : sizes.Value!.Where(r => Convert.ToInt64(r[1]) > 100_000).Select(r => (string)r[0]).ToList();

        var unindexed = big.Where(t => !leading.Any(l => l.StartsWith(t + ".", StringComparison.OrdinalIgnoreCase))).ToList();
        if (unindexed.Count > 0)
            Warn($"Large and with no leading date index: {string.Join(", ", unindexed)}. "
                     + "The 5-minute sync will scan these in full.");
        else
            Ok("Date filtering can seek on the tables that matter.");
    }

    // ── 11. Local config file ─────────────────────────────────────────────────

    private static void LocalConfig(string directory)
    {
        Title("[11/12] Local configuration file");

        var path = Path.Combine(directory, LocalConfigWriter.FileName);
        Line($"  Path          {path}");

        if (!File.Exists(path))
        {
            Warn("Not present — setup has never written config here.");
            return;
        }

        try
        {
            var length = new FileInfo(path).Length;
            using (File.OpenRead(path)) { }
            Ok($"Present and readable by this account ({length:n0} bytes).");
        }
        catch (UnauthorizedAccessException)
        {
            Warn("Present but NOT readable by this account — it is ACL'd to Administrators and SYSTEM. "
                     + "Re-run from an elevated prompt.");
        }
        catch (Exception ex) { Fail($"Could not read it: {Short(ex)}"); return; }

        try
        {
            var rules = new FileInfo(path).GetAccessControl()
                .GetAccessRules(true, true, typeof(NTAccount))
                .Cast<FileSystemAccessRule>()
                .Select(r => r.IdentityReference.Value)
                .Distinct()
                .ToList();
            Line($"  Access        {string.Join(", ", rules)}");
        }
        catch (Exception ex) { Line($"  Access        could not read the ACL: {ex.Message}"); }
    }

    // ── 12. The service ───────────────────────────────────────────────────────

    private static void ServiceState()
    {
        Title("[12/12] Windows Service");

        if (!ServiceControl.Exists())
        {
            Warn($"'{ServiceControl.ServiceName}' is not installed — setup has not reached stage 10.");
            return;
        }

        var running = ServiceControl.IsRunning();
        Line($"  {ServiceControl.ServiceName,-28} {(running ? "RUNNING" : "not running")}");

        if (running) Ok("Service is installed and running.");
        else Fail("Service is installed but not running.");

        var entries = ServiceControl.RecentLogEntries();
        if (entries.Count == 0) { Line("  (no Event Log entries yet)"); return; }
        Line("  Recent Event Log:");
        foreach (var e in entries) Line($"    {e}");
    }

    // ── Plumbing ──────────────────────────────────────────────────────────────

    internal readonly record struct Outcome<T>(bool TimedOut, T? Value, Exception? Error, TimeSpan Elapsed);

    /// <summary>
    /// Runs <paramref name="work"/> under a hard wall-clock budget. A step that
    /// overruns is abandoned rather than waited on: it may be blocked inside
    /// native code where cancellation cannot reach, which is precisely the case
    /// this diagnostic exists to report. The orphan's exception is observed so it
    /// cannot resurface as an unhandled task exception later.
    /// </summary>
    internal static async Task<Outcome<T>> Bounded<T>(Func<CancellationToken, Task<T>> work, TimeSpan budget)
    {
        using var cts = new CancellationTokenSource();
        var sw = Stopwatch.StartNew();

        Task<T> task;
        try { task = work(cts.Token); }
        catch (Exception ex) { return new Outcome<T>(false, default, ex, sw.Elapsed); }

        var finished = await Task.WhenAny(task, Task.Delay(budget));
        sw.Stop();

        if (finished != task)
        {
            cts.Cancel();
            _ = task.ContinueWith(t => _ = t.Exception, TaskScheduler.Default);
            return new Outcome<T>(true, default, null, sw.Elapsed);
        }

        try { return new Outcome<T>(false, await task, null, sw.Elapsed); }
        catch (Exception ex) { return new Outcome<T>(false, default, ex, sw.Elapsed); }
    }

    private static async Task<List<object[]>> RowsAsync(SqlConnection conn, string sql, CancellationToken ct)
    {
        var rows = new List<object[]>();
        await using var cmd = new SqlCommand(sql, conn) { CommandTimeout = 15 };
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            var values = new object[r.FieldCount];
            r.GetValues(values);
            rows.Add(values);
        }
        return rows;
    }

    private static async Task<object?> ScalarAsync(SqlConnection conn, string sql, CancellationToken ct)
    {
        try
        {
            await using var cmd = new SqlCommand(sql, conn) { CommandTimeout = 10 };
            return await cmd.ExecuteScalarAsync(ct);
        }
        catch { return null; }
    }

    private static void Title(string s) { _out.WriteLine(); _out.WriteLine(s); _out.WriteLine(new string('─', Math.Min(s.Length, 70))); }
    private static void Line(string s) => _out.WriteLine(s);
    private static void Ok(string s)   => _out.WriteLine($"  [ok]   {s}");
    private static void Warn(string s) { _warns++; _out.WriteLine($"  [WARN] {s}"); }
    private static void Fail(string s) { _fails++; _out.WriteLine($"  [FAIL] {s}"); }
    private static void Skip(string what, string why) => _out.WriteLine($"  [--]   {what} skipped: {why}");

    private static string Short(Exception ex)
    {
        var message = ex is AggregateException a ? a.GetBaseException().Message : ex.Message;
        var firstLine = message.Split('\n')[0].Trim();
        return firstLine.Length > 140 ? firstLine[..140] + "…" : firstLine;
    }

    private static string Trim(string s)
    {
        var t = s.Replace('\n', ' ').Replace('\r', ' ').Trim();
        return t.Length > 160 ? t[..160] + "…" : t;
    }

    private static string Mask(string s)
        => s.Contains(Placeholder, StringComparison.Ordinal) ? $"(placeholder) {s}"
         : s.Length <= 8 ? s
         : $"{s[..4]}…{s[^4..]} ({s.Length} chars)";

    /// <summary>Console and transcript at once, so the operator can send the file.</summary>
    private sealed class TeeWriter(TextWriter a, TextWriter b) : TextWriter
    {
        public override Encoding Encoding => a.Encoding;
        public override void Write(char value) { a.Write(value); b.Write(value); }
        public override void Write(string? value) { a.Write(value); b.Write(value); }
        public override void WriteLine(string? value) { a.WriteLine(value); b.WriteLine(value); }
        public override void Flush() { a.Flush(); b.Flush(); }
    }
}
