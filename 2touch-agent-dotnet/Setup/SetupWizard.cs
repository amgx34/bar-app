using System.Net.Http;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using RailAgent.Config;
using RailAgent.Models;
using RailAgent.Services;

namespace RailAgent.Setup;

/// <summary>
/// The twelve stages of setup. Copy one file to the POS box, double-click it,
/// answer a few prompts, and leave having watched real data land in Rail.
///
/// Re-running on an already-installed box is supported and is the intended way
/// to fix a bad schema mapping: it stops the service, rewrites config, restarts.
/// </summary>
public sealed class SetupWizard(string[] args)
{
    public const string InstallDirectory = @"C:\rail-agent";
    private const string ReadLogin = "BarAppRead";
    private const int PreviewDays = 7;

    private readonly AgentConfig _cfg = new();
    private string _installDir = InstallDirectory;

    public async Task<int> RunAsync(CancellationToken ct)
    {
        ConsoleUi.Banner();

        try
        {
            if (!Stage1Elevate()) return 0;              // relaunched elevated; this copy is done

            var pairing = Stage2PairingCode();
            if (!await Stage3VerifyPairingAsync(pairing, ct)) return 1;

            var server = Stage4FindSqlServer();
            if (server is null) return 1;

            using var adminConn = await Stage5FindDatabaseAsync(server, ct);
            if (adminConn is null) return 1;

            if (!await Stage6EstablishReadAccessAsync(adminConn, ct)) return 1;

            await using var serviceConn = await OpenAsServiceAsync(ct);
            if (!await Stage7DiscoverSchemaAsync(serviceConn, ct)) return 1;
            if (!await Stage8PreviewAsync(serviceConn, ct)) return 1;

            Stage9WriteConfig();
            if (!Stage10Install()) return 1;
            if (!await Stage11StartAndVerifyAsync(ct)) return 1;

            Stage12Summary();
            ConsoleUi.PauseIfInteractive();
            return 0;
        }
        catch (OperationCanceledException)
        {
            ConsoleUi.Blank();
            ConsoleUi.Warn("Setup cancelled. Nothing was left running.");
            return 1;
        }
        catch (Exception ex)
        {
            // Last resort only: every stage below diagnoses its own failures.
            ConsoleUi.Blank();
            ConsoleUi.Fail($"Setup stopped: {ex.Message}");
            ConsoleUi.PauseIfInteractive();
            return 1;
        }
    }

    // ── 1. Elevate ────────────────────────────────────────────────────────────

    /// <summary>Returns false when an elevated copy was launched and this one should exit.</summary>
    private bool Stage1Elevate()
    {
        ConsoleUi.Stage(1, "Checking permissions");

        if (Elevation.IsAdministrator())
        {
            ConsoleUi.Ok($"Running as Administrator ({Elevation.CurrentUser()})");
            return true;
        }

        ConsoleUi.Info("Setup needs Administrator to register a Windows Service.");
        ConsoleUi.Info("Relaunching — approve the Windows prompt…");

        if (Elevation.TryRelaunchElevated(args, out var error))
            return false;

        ConsoleUi.Diagnose(
            $"Could not relaunch elevated: {error}",
            "Right-click the exe and choose \"Run as administrator\", then try again.");
        ConsoleUi.PauseIfInteractive();
        return false;
    }

    // ── 2. Pairing code ───────────────────────────────────────────────────────

    private PairingInfo Stage2PairingCode()
    {
        ConsoleUi.Stage(2, "Pairing code");
        ConsoleUi.Info("In Rail: Settings → POS Integration → 2TouchPOS → Copy pairing code.");

        while (true)
        {
            var input = ConsoleUi.Ask("Paste the pairing code");
            if (PairingCode.TryDecode(input, out var info, out var error))
            {
                _cfg.Rail.OrgId      = info!.OrgId;
                _cfg.Rail.AuthToken  = info.AgentToken;
                _cfg.Rail.ApiBaseUrl = info.ApiBaseUrl;
                ConsoleUi.Ok($"Code accepted — org {info.OrgId} at {info.ApiBaseUrl}");
                return info;
            }
            ConsoleUi.Fail(error!);
            ConsoleUi.Info("Copy the whole code — it is one line and starts with RAIL1-.");
        }
    }

    // ── 3. Verify pairing ─────────────────────────────────────────────────────

    /// <summary>
    /// An empty payload against the real ingest route. Every write there is
    /// guarded by a length check, so this is a genuine no-op that still proves
    /// the network path, the HMAC key and the org — before anything is installed.
    /// </summary>
    private async Task<bool> Stage3VerifyPairingAsync(PairingInfo pairing, CancellationToken ct)
    {
        ConsoleUi.Stage(3, "Verifying the pairing code with Rail");

        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
        RailClient.IngestResult result;
        try
        {
            result = await RailClient.SendAsync(http, _cfg.Rail, [], [], [], ct);
        }
        catch (Exception ex)
        {
            ConsoleUi.Diagnose(
                $"Could not reach {pairing.ApiBaseUrl}: {ex.Message}",
                "This box needs outbound HTTPS only — no inbound rule, no port forward.",
                "Check the site's firewall or proxy, then re-run setup.");
            return false;
        }

        if (result.Ok)
        {
            ConsoleUi.Ok($"Rail accepted the pairing — {result.Body.Trim()}");
            return true;
        }

        switch (result.StatusCode)
        {
            case 401:
                ConsoleUi.Diagnose(
                    "Rail rejected the token (401).",
                    "The token does not match this org's. Re-copy the pairing code from",
                    "Rail → Settings → POS Integration → 2TouchPOS and run setup again.");
                break;
            case 400:
                ConsoleUi.Diagnose(
                    "Rail rejected the org (400).",
                    $"Org {_cfg.Rail.OrgId} is not a configured 2Touch org.",
                    "Activate 2TouchPOS for this bar in Rail settings first.");
                break;
            default:
                ConsoleUi.Diagnose(
                    $"Rail returned {result.StatusCode}.",
                    result.Body.Trim());
                break;
        }
        return false;
    }

    // ── 4. Find SQL Server ────────────────────────────────────────────────────

    private string? Stage4FindSqlServer()
    {
        ConsoleUi.Stage(4, "Finding SQL Server");

        var instances = SqlProbe.FindInstances();
        if (instances.Count == 0)
        {
            ConsoleUi.Diagnose(
                "No SQL Server instance is registered on this machine.",
                "The agent must run ON the POS box, next to the TwoTouch database.",
                "This is most likely the wrong machine.");
            return null;
        }

        string server;
        if (instances.Count == 1)
        {
            server = instances[0];
        }
        else
        {
            ConsoleUi.Info("More than one instance is installed:");
            server = instances[ConsoleUi.Choose("Which instance holds TwoTouch?", instances)];
        }

        _cfg.Sql.Server = server;
        _cfg.Sql.Protocol = "lpc:";   // shared memory: no TCP port, no SQL Browser
        ConsoleUi.Ok($"Using {server} over shared memory");
        return server;
    }

    // ── 5. Find the database ──────────────────────────────────────────────────

    private async Task<SqlConnection?> Stage5FindDatabaseAsync(string server, CancellationToken ct)
    {
        ConsoleUi.Stage(5, "Finding the TwoTouch database");

        SqlConnection conn;
        try
        {
            // master with the elevated Windows identity: enough to enumerate and,
            // if this account is sysadmin, to grant read access in stage 6.
            conn = await SqlProbe.OpenAsync(SqlProbe.Probe(server, "master"), ct);
        }
        catch (Exception ex)
        {
            ConsoleUi.Diagnose(
                $"Could not connect to {server}: {ex.Message}",
                $"{Elevation.CurrentUser()} may have no SQL login on this instance.",
                "Run setup as an account that can log in to SQL Server.");
            return null;
        }

        List<string> databases;
        try { databases = await SqlProbe.ListDatabasesAsync(conn, ct); }
        catch (Exception ex)
        {
            ConsoleUi.Fail($"Could not list databases: {ex.Message}");
            conn.Dispose();
            return null;
        }

        if (databases.Count == 0)
        {
            ConsoleUi.Diagnose(
                "This instance has no user databases visible to the current account.",
                "Check that TwoTouch lives on this instance.");
            conn.Dispose();
            return null;
        }

        var exact = databases.FindIndex(d => d.Equals("TwoTouch", StringComparison.OrdinalIgnoreCase));
        var chosen = exact >= 0 && databases.Count == 1
            ? databases[exact]
            : databases[ConsoleUi.Choose("Which database?", databases, @default: Math.Max(exact, 0))];

        _cfg.Sql.Database = chosen;
        ConsoleUi.Ok($"Using database {chosen}");
        return conn;
    }

    // ── 6. Establish read access ──────────────────────────────────────────────

    private async Task<bool> Stage6EstablishReadAccessAsync(SqlConnection adminConn, CancellationToken ct)
    {
        ConsoleUi.Stage(6, "Granting read access");

        var isSysadmin = await SqlProbe.IsSysadminAsync(adminConn, ct);

        if (isSysadmin)
        {
            try
            {
                await SqlProbe.GrantSystemReadAsync(adminConn, _cfg.Sql.Database, ct);
                _cfg.Sql.User = "";           // Integrated Security — no password anywhere
                _cfg.Sql.Password = "";
                ConsoleUi.Ok(@"NT AUTHORITY\SYSTEM granted db_datareader — the service will use Windows auth");
                ConsoleUi.Info("No SQL password is stored, and Mixed Mode is not required.");
                return true;
            }
            catch (Exception ex)
            {
                ConsoleUi.Warn($"Windows-auth grant failed: {ex.Message}");
                ConsoleUi.Info("Falling back to a dedicated SQL login.");
            }
        }
        else
        {
            ConsoleUi.Info($"{Elevation.CurrentUser()} is not a SQL sysadmin.");
        }

        return await FallbackToSqlLoginAsync(ct);
    }

    private async Task<bool> FallbackToSqlLoginAsync(CancellationToken ct)
    {
        ConsoleUi.Info($"Creating the {ReadLogin} SQL login needs sa (or another sysadmin).");

        var saUser = ConsoleUi.Ask("SQL admin username", "sa");
        var saPassword = ConsoleUi.AskSecret($"Password for {saUser}");

        SqlConnection sa;
        try
        {
            sa = await SqlProbe.OpenAsync(
                SqlProbe.Probe(_cfg.Sql.Server, "master", saUser, saPassword), ct);
        }
        catch (Exception ex)
        {
            ConsoleUi.Diagnose(
                $"Could not log in as {saUser}: {ex.Message}",
                "If the password is right, the server may be Windows-authentication only.",
                $"A DBA can instead run:{Environment.NewLine}{Indent(SqlProbe.ManualGrantScript(_cfg.Sql.Database, ReadLogin))}");
            return false;
        }

        await using (sa)
        {
            if (!await SqlProbe.IsMixedModeAsync(sa, ct))
            {
                ConsoleUi.Diagnose(
                    "This server is set to Windows Authentication only, so a SQL login cannot be used.",
                    "Enabling Mixed Mode requires restarting SQL Server — which would take the",
                    "POS offline, so setup will not do it. Either enable Mixed Mode during a",
                    "planned restart, or re-run setup as an account that is a SQL sysadmin.");
                return false;
            }

            var password = SqlProbe.GeneratePassword();
            try
            {
                await SqlProbe.CreateReadLoginAsync(sa, _cfg.Sql.Database, ReadLogin, password, ct);
            }
            catch (Exception ex)
            {
                ConsoleUi.Diagnose(
                    $"Could not create {ReadLogin}: {ex.Message}",
                    $"A DBA can run this instead, then re-run setup:{Environment.NewLine}{Indent(SqlProbe.ManualGrantScript(_cfg.Sql.Database, ReadLogin))}");
                return false;
            }

            _cfg.Sql.User = ReadLogin;
            _cfg.Sql.Password = password;
            ConsoleUi.Ok($"{ReadLogin} created with a generated password and granted db_datareader");
            return true;
        }
    }

    /// <summary>
    /// Opens a connection with the credentials that go into config, so discovery
    /// and preview prove the real connection string rather than assuming it.
    ///
    /// One caveat, closed at stage 11: on the Windows-auth path this is the
    /// elevated operator's identity, while the service will run as LocalSystem.
    /// </summary>
    private async Task<SqlConnection> OpenAsServiceAsync(CancellationToken ct)
        => await SqlProbe.OpenAsync(_cfg.Sql, ct);

    // ── 7. Schema discovery ───────────────────────────────────────────────────

    private async Task<bool> Stage7DiscoverSchemaAsync(SqlConnection conn, CancellationToken ct)
    {
        ConsoleUi.Stage(7, "Discovering the schema");

        var relations = await SqlProbe.EnumerateAsync(conn, ct);
        ConsoleUi.Ok($"{relations.Count} tables and views found in {_cfg.Sql.Database}");

        var mappedByProfile = await TryProfileAsync(relations, conn, ct);

        foreach (var feed in FeedSpecs.All)
        {
            if (mappedByProfile.Contains(feed.Key)) continue;

            ConsoleUi.Blank();
            ConsoleUi.Info($"── {feed.Label} ─────────────────────────────");

            if (!await MapFeedAsync(feed, relations, conn, ct))
                SetFeedSkipped(feed);
        }

        if (SyncService.Enabled(_cfg.Tables.ZReport)
            || SyncService.Enabled(_cfg.Tables.EwReport)
            || SyncService.Enabled(_cfg.Tables.ItemAudit))
            return true;

        ConsoleUi.Blank();
        ConsoleUi.Diagnose(
            "All three feeds were skipped — there would be nothing to sync.",
            "Re-run setup and pick a relation for at least one feed.");
        return false;
    }

    /// <summary>
    /// Offers the built-in TwoTouch mapping for whichever feeds this database
    /// can supply, and returns the feeds it took. Anything it does not cover
    /// falls through to generic discovery.
    ///
    /// This runs first because on a real TwoTouch schema generic discovery
    /// cannot succeed for EW Report or Item Audit — the values it needs are
    /// spread across four relations each. See Setup/TwoTouchProfile.cs.
    /// </summary>
    private async Task<HashSet<string>> TryProfileAsync(
        IReadOnlyList<RelationInfo> relations, SqlConnection conn, CancellationToken ct)
    {
        var taken = new HashSet<string>();
        var available = TwoTouchProfile.Match(relations);
        if (available.Count == 0) return taken;

        ConsoleUi.Blank();
        ConsoleUi.Ok($"This looks like a standard TwoTouch schema — a built-in mapping covers {available.Count} of 3 feeds:");
        foreach (var feed in available)
            ConsoleUi.Info($"  • {FeedLabel(feed.FeedKey)} — {feed.Explanation}");

        foreach (var feed in TwoTouchProfile.All.Except(available))
        {
            var missing = TwoTouchProfile.MissingRelations(feed, relations);
            ConsoleUi.Warn($"{FeedLabel(feed.FeedKey)} is not covered — missing {string.Join(", ", missing)}");
        }

        ConsoleUi.Blank();
        if (!ConsoleUi.Confirm("Use the built-in mapping for those feeds?"))
        {
            ConsoleUi.Info("Falling back to schema discovery for all three feeds.");
            return taken;
        }

        foreach (var feed in available)
        {
            TwoTouchProfile.Apply(feed, _cfg);

            var spec = FeedSpecs.All.Single(f => f.Key == feed.FeedKey);
            var error = await ProveAsync(spec, conn, ct);
            if (error is null)
            {
                ConsoleUi.Ok($"{spec.Label} — built-in mapping runs clean");
                taken.Add(feed.FeedKey);
            }
            else
            {
                ConsoleUi.Fail($"{spec.Label} built-in mapping failed: {error}");
                ConsoleUi.Info("Falling back to schema discovery for this feed.");
                SetFeedSkipped(spec);
            }
        }

        return taken;
    }

    private static string FeedLabel(string feedKey)
        => FeedSpecs.All.Single(f => f.Key == feedKey).Label;

    /// <summary>Propose, let the operator adjust, then prove with a TOP 5 query.</summary>
    private async Task<bool> MapFeedAsync(
        FeedSpec feed, IReadOnlyList<RelationInfo> relations, SqlConnection conn, CancellationToken ct)
    {
        var candidates = SchemaScorer.Rank(feed, relations);
        if (candidates.Count == 0)
        {
            ConsoleUi.Warn($"No relation in this database can supply {feed.Label} — skipping the feed.");
            return false;
        }

        var labels = candidates
            .Select(c => $"{c.Relation.Quoted,-40} score {c.Score}")
            .ToList();

        var pick = ConsoleUi.Choose(
            $"Which relation holds {feed.Label}?", labels,
            @default: 0, skipLabel: $"This bar has no {feed.Label} — skip it");
        if (pick < 0) { ConsoleUi.Info($"{feed.Label} skipped."); return false; }

        var chosen = candidates[pick];
        var mapping = chosen.Fields.ToDictionary(f => f.Field.Key, f => f.Column);
        var weak = chosen.WeakFields().Select(f => f.Field.Key).ToHashSet();

        while (true)
        {
            ShowMapping(feed, chosen.Relation, mapping, weak);

            if (ConsoleUi.Confirm("Use this mapping?"))
            {
                ApplyMapping(feed, chosen.Relation, mapping);

                var error = await ProveAsync(feed, conn, ct);
                if (error is null)
                {
                    ConsoleUi.Ok($"{feed.Label} → {chosen.Relation.Quoted} (query returned rows without error)");
                    return true;
                }

                ConsoleUi.Fail($"{feed.Label} query failed: {error}");
                ConsoleUi.Info("Adjust the mapping and try again.");
                SetFeedSkipped(feed);
                continue;
            }

            var fieldNames = feed.Fields.Select(f => $"{f.Label} → {mapping[f.Key].Name}").ToList();
            var fieldPick = ConsoleUi.Choose("Change which column?", fieldNames, skipLabel: "Nothing — skip this feed");
            if (fieldPick < 0) { ConsoleUi.Info($"{feed.Label} skipped."); return false; }

            var field = feed.Fields[fieldPick];
            var compatible = chosen.Relation.Columns.Where(c => c.Fits(field.Kind)).ToList();
            var columnLabels = compatible.Select(c => $"{c.Name} ({c.DataType})").ToList();
            var columnPick = ConsoleUi.Choose($"Which column is the {field.Label}?", columnLabels);
            mapping[field.Key] = compatible[columnPick];
            weak.Remove(field.Key);   // the operator chose it, so it is no longer a guess
        }
    }

    private static void ShowMapping(
        FeedSpec feed, RelationInfo relation, Dictionary<string, ColumnInfo> mapping, IReadOnlySet<string> weak)
    {
        ConsoleUi.Blank();
        ConsoleUi.Info($"{feed.Label} from {relation.Quoted}:");
        var rows = new List<string[]> { new[] { "FIELD", "COLUMN", "TYPE", "" } };
        rows.AddRange(feed.Fields.Select(f => new[]
        {
            f.Label, mapping[f.Key].Name, mapping[f.Key].DataType,
            weak.Contains(f.Key) ? "← guess: name gives no clue, check this" : "",
        }));
        ConsoleUi.Table(rows);

        // Only type compatibility is enforced, so a thin relation can end up
        // offering the same column for two amounts — which would double-count.
        var duplicates = mapping.Values
            .GroupBy(c => c.Name, StringComparer.OrdinalIgnoreCase)
            .Where(g => g.Count() > 1)
            .Select(g => g.Key)
            .ToList();
        if (duplicates.Count > 0)
            ConsoleUi.Warn($"{string.Join(", ", duplicates)} is mapped to more than one field — that would double-count. Override it below unless it is really correct.");
    }

    private void ApplyMapping(FeedSpec feed, RelationInfo relation, Dictionary<string, ColumnInfo> mapping)
    {
        // Bracket-quoted: every name here came out of INFORMATION_SCHEMA, and
        // SqlReader interpolates them straight into SQL.
        string Q(string key) => SqlProbe.QuoteIdentifier(mapping[key].Name);

        switch (feed.Key)
        {
            case FeedSpecs.ZReportKey:
                _cfg.Tables.ZReport = relation.Quoted;
                _cfg.Columns.ZReport = new ZReportColumns
                {
                    Date = Q("Date"), Sales = Q("Sales"), CcTips = Q("CcTips"), CashTips = Q("CashTips"),
                };
                break;

            case FeedSpecs.EwReportKey:
                _cfg.Tables.EwReport = relation.Quoted;
                _cfg.Columns.EwReport = new EwReportColumns
                {
                    Date = Q("Date"), EmployeeName = Q("EmployeeName"), TotalSales = Q("TotalSales"),
                    TipsPaidOut = Q("TipsPaidOut"), RegularHours = Q("RegularHours"), OvertimeHours = Q("OvertimeHours"),
                };
                break;

            case FeedSpecs.ItemAuditKey:
                _cfg.Tables.ItemAudit = relation.Quoted;
                _cfg.Columns.ItemAudit = new ItemAuditColumns
                {
                    Date = Q("Date"), ItemName = Q("ItemName"), Category = Q("Category"),
                    QtySold = Q("QtySold"), NetSales = Q("NetSales"),
                };
                break;
        }
    }

    private void SetFeedSkipped(FeedSpec feed)
    {
        switch (feed.Key)
        {
            case FeedSpecs.ZReportKey:   _cfg.Tables.ZReport   = ""; break;
            case FeedSpecs.EwReportKey:  _cfg.Tables.EwReport  = ""; break;
            case FeedSpecs.ItemAuditKey: _cfg.Tables.ItemAudit = ""; break;
        }
    }

    /// <summary>Runs the feed's real query with TOP 5. Returns the server error, or null.</summary>
    private async Task<string?> ProveAsync(FeedSpec feed, SqlConnection conn, CancellationToken ct)
    {
        var sql = FeedSql(feed, PreviewDays, top: 5);
        try
        {
            await using var cmd = new SqlCommand(sql, conn) { CommandTimeout = 60 };
            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct)) { }
            return null;
        }
        catch (SqlException ex)
        {
            ConsoleUi.Blank();
            ConsoleUi.Info(Indent(sql));
            return ex.Message;
        }
    }

    private string FeedSql(FeedSpec feed, int days, int? top) => feed.Key switch
    {
        FeedSpecs.ZReportKey   => SqlReader.ZReportSql(_cfg.Tables.ZReport, _cfg.Columns.ZReport, days, top),
        FeedSpecs.EwReportKey  => SqlReader.EwReportSql(_cfg.Tables.EwReport, _cfg.Columns.EwReport, days, top),
        _                      => SqlReader.ItemAuditSql(_cfg.Tables.ItemAudit, _cfg.Columns.ItemAudit, days, top),
    };

    // ── 8. Preview ────────────────────────────────────────────────────────────

    private async Task<bool> Stage8PreviewAsync(SqlConnection conn, CancellationToken ct)
    {
        ConsoleUi.Stage(8, $"Previewing the last {PreviewDays} days (nothing is sent to Rail yet)");

        var reader = new SqlReader(Options.Create(_cfg));
        var total = 0;

        if (SyncService.Enabled(_cfg.Tables.ZReport))
        {
            var rows = await reader.QueryZReportsAsync(conn, PreviewDays, ct);
            total += rows.Count;
            ConsoleUi.Ok($"Z Reports:  {rows.Count} day(s)");
            foreach (var r in rows.Take(3)) ConsoleUi.Info($"  {r.report_date}  sales {r.total_sales:N2}  cc tips {r.cc_tips:N2}  cash tips {r.cash_tips:N2}");
        }

        if (SyncService.Enabled(_cfg.Tables.EwReport))
        {
            var rows = await reader.QueryEwReportsAsync(conn, PreviewDays, ct);
            total += rows.Count;
            ConsoleUi.Ok($"EW Reports: {rows.Count} row(s)");
            foreach (var r in rows.Take(3)) ConsoleUi.Info($"  {r.shift_date}  {r.employee_name}  sales {r.total_sales:N2}  hrs {r.regular_hours:N2}+{r.overtime_hours:N2}");
        }

        if (SyncService.Enabled(_cfg.Tables.ItemAudit))
        {
            var rows = await reader.QueryItemAuditAsync(conn, PreviewDays, ct);
            total += rows.Count;
            ConsoleUi.Ok($"Item Audit: {rows.Count} row(s)");
            foreach (var r in rows.Take(3)) ConsoleUi.Info($"  {r.sale_date}  {r.item_name} ({r.category_name})  qty {r.qty_sold:N2}  {r.net_sales:N2}");
        }

        if (total == 0)
        {
            ConsoleUi.Warn($"The queries ran but returned no rows in the last {PreviewDays} days.");
            if (!ConsoleUi.Confirm("Install anyway?", @default: false))
            {
                ConsoleUi.Info("Stopped. Re-run setup once the mapping points at the right relations.");
                return false;
            }
        }

        return true;
    }

    // ── 9. Write config ───────────────────────────────────────────────────────

    private void Stage9WriteConfig()
    {
        ConsoleUi.Stage(9, "Writing configuration");

        _installDir = InstallDirectory.TrimEnd('\\');
        LocalConfigWriter.Write(_installDir, _cfg);

        ConsoleUi.Ok($"{Path.Combine(_installDir, LocalConfigWriter.FileName)} written");
        ConsoleUi.Info("Readable by Administrators and SYSTEM only.");
    }

    // ── 10. Install ───────────────────────────────────────────────────────────

    private bool Stage10Install()
    {
        ConsoleUi.Stage(10, "Installing the Windows Service");

        var target = Path.Combine(_installDir, "rail-2touch-agent.exe");
        var running = Environment.ProcessPath!;

        if (ServiceControl.Exists())
        {
            ConsoleUi.Info($"'{ServiceControl.ServiceName}' is already installed — replacing it.");
            ServiceControl.Stop();
            ServiceControl.Delete();
        }

        if (!string.Equals(Path.GetFullPath(running), Path.GetFullPath(target), StringComparison.OrdinalIgnoreCase))
        {
            try { File.Copy(running, target, overwrite: true); }
            catch (Exception ex)
            {
                ConsoleUi.Diagnose(
                    $"Could not copy the agent to {target}: {ex.Message}",
                    "If a previous service is still shutting down, wait a moment and re-run setup.");
                return false;
            }
        }
        ConsoleUi.Ok($"Agent installed at {target}");

        var result = ServiceControl.Install(target, _installDir);
        if (!result.Ok)
        {
            ConsoleUi.Diagnose($"Service registration failed: {result.Output.Trim()}");
            return false;
        }

        ConsoleUi.Ok($"Service '{ServiceControl.ServiceName}' registered (automatic start, restarts on crash)");
        return true;
    }

    // ── 11. Start and verify ──────────────────────────────────────────────────

    private async Task<bool> Stage11StartAndVerifyAsync(CancellationToken ct)
    {
        ConsoleUi.Stage(11, "Starting the service and sending real data");

        var startedAt = DateTime.Now;
        var started = ServiceControl.Start();
        if (!started.Ok || !ServiceControl.IsRunning())
        {
            ConsoleUi.Fail($"The service did not start: {started.Output.Trim()}");
            var entries = ServiceControl.RecentLogEntries();
            if (entries.Count > 0)
            {
                ConsoleUi.Info($"Last {entries.Count} Event Log entries for {ServiceControl.ServiceName}:");
                foreach (var e in entries) ConsoleUi.Info($"  {e}");
            }
            return false;
        }
        ConsoleUi.Ok($"Service '{ServiceControl.ServiceName}' is running");

        // One real sync in-process, so the operator leaves having seen Rail's own
        // response rather than having seen a service reach "Running".
        var sync = BuildSyncService();
        SyncResult result;
        try
        {
            result = await sync.RunOnceAsync(PreviewDays, test: false, ct);
        }
        catch (Exception ex)
        {
            ConsoleUi.Fail($"The verification sync failed: {ex.Message}");
            return false;
        }

        ConsoleUi.Ok($"Rail accepted the data — Z:{result.ZReports} EW:{result.EwReports} Audit:{result.ItemAudit}");

        VerifyServiceOwnCycle(startedAt);
        return true;
    }

    /// <summary>
    /// The sync above ran as the elevated operator. On the Windows-auth path the
    /// service runs as LocalSystem instead, so its SQL access is a different
    /// question — wait for its own first cycle rather than assume.
    /// </summary>
    private static void VerifyServiceOwnCycle(DateTime startedAt)
    {
        ConsoleUi.Info("Waiting for the service's own first sync…");

        var entryType = ServiceControl.WaitForFirstEntry(startedAt, TimeSpan.FromSeconds(45), out var summary);

        switch (entryType)
        {
            case null:
                ConsoleUi.Warn("The service logged nothing within 45s. It is running and will retry;");
                ConsoleUi.Info($"check Event Viewer → Application → {ServiceControl.ServiceName} if data stops arriving.");
                break;
            case System.Diagnostics.EventLogEntryType.Error:
            case System.Diagnostics.EventLogEntryType.Warning:
                ConsoleUi.Warn($"The service logged a problem on its own first run: {summary}");
                ConsoleUi.Info("The sync above succeeded as your account, so this is most likely the");
                ConsoleUi.Info(@"service's LocalSystem identity lacking SQL read access. Re-run setup as");
                ConsoleUi.Info("a SQL sysadmin, or configure a SQL login instead of Windows auth.");
                break;
            default:
                ConsoleUi.Ok($"The service ran its own sync as LocalSystem: {summary}");
                break;
        }
    }

    private SyncService BuildSyncService()
    {
        var options = Options.Create(_cfg);
        var reader = new SqlReader(options);
        var rail = new RailClient(new SingleClientFactory(), options, NullLogger<RailClient>.Instance);
        return new SyncService(reader, rail, options, NullLogger<SyncService>.Instance);
    }

    /// <summary>Minimal IHttpClientFactory — the wizard makes a handful of calls and exits.</summary>
    private sealed class SingleClientFactory : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new() { Timeout = TimeSpan.FromSeconds(60) };
    }

    // ── 12. Summary ───────────────────────────────────────────────────────────

    private void Stage12Summary()
    {
        ConsoleUi.Stage(12, "Done");
        ConsoleUi.Blank();
        ConsoleUi.Table(
        [
            ["Install directory", _installDir],
            ["Service name",      ServiceControl.ServiceName],
            ["Event Log source",  $"Application → {ServiceControl.ServiceName}"],
            ["Sync interval",     $"every {_cfg.Sync.IntervalMinutes} min, {_cfg.Sync.LookbackDays}-day lookback"],
            ["Uninstall",         $@"{_installDir}\rail-2touch-agent.exe --uninstall"],
        ], indent: "    ");

        ConsoleUi.Blank();
        ConsoleUi.Info("Confirmed schema mapping — paste this into the Rail repo issue for this bar:");
        ConsoleUi.Blank();
        Console.WriteLine(Indent(LocalConfigWriter.RenderSchema(_cfg)));
    }

    private static string Indent(string text)
        => string.Join(Environment.NewLine,
            text.Split('\n').Select(l => "      " + l.TrimEnd('\r')));
}
