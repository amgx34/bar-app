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
public sealed class SetupWizard(string[] args, Unattended? unattended = null)
{
    public const string InstallDirectory = @"C:\rail-agent";
    private const string ReadLogin = "BarAppRead";
    private const int PreviewDays = 7;

    private readonly AgentConfig _cfg = new();
    private string _installDir = InstallDirectory;

    private bool Auto => unattended is not null;

    /// <summary>"Press Enter to close" is for a person at the keyboard; an
    /// unattended run launched from a script would sit on it forever.</summary>
    private void Pause()
    {
        if (!Auto) ConsoleUi.PauseIfInteractive();
    }

    /// <summary>
    /// Refuses a choice that would otherwise have been a prompt. Unattended setup
    /// must not guess between two instances or two databases — picking wrong
    /// silently points the service at another bar's data.
    /// </summary>
    private void CannotChoose(string what, IEnumerable<string> options, string flag)
        => ConsoleUi.Diagnose(
            $"Unattended setup cannot choose {what}.",
            $"Candidates: {string.Join(", ", options)}",
            $"Re-run with {flag} to name it, or without {Unattended.Flag} to be asked.");

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
            Pause();
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
            Pause();
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
        Pause();
        return false;
    }

    // ── 2. Pairing code ───────────────────────────────────────────────────────

    private PairingInfo Stage2PairingCode()
    {
        ConsoleUi.Stage(2, "Pairing code");

        if (unattended is not null)
        {
            // Already decoded once in Unattended.TryCreate, before elevation.
            PairingCode.TryDecode(unattended.Code, out var fromFile, out _);
            _cfg.Rail.OrgId      = fromFile!.OrgId;
            _cfg.Rail.AuthToken  = fromFile.AgentToken;
            _cfg.Rail.ApiBaseUrl = fromFile.ApiBaseUrl;
            ConsoleUi.Ok($"Read from {unattended.Source}");
            ConsoleUi.Ok($"Org {fromFile.OrgId} at {fromFile.ApiBaseUrl}");
            return fromFile;
        }

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
        if (unattended?.Server is { } named)
        {
            server = named;
            ConsoleUi.Info($"Instance given on the command line: {server}");
        }
        else if (instances.Count == 1)
        {
            server = instances[0];
        }
        else if (Auto)
        {
            CannotChoose("between SQL Server instances", instances, "--server <instance>");
            return null;
        }
        else
        {
            ConsoleUi.Info("More than one instance is installed:");
            server = instances[ConsoleUi.Choose("Which instance holds TwoTouch?", instances)];
        }

        // The protocol is settled in stage 5 by trying them, not asserted here.
        // Shared memory is preferred and usually available, but a real 2Touch box
        // turned up with it disabled, and claiming it before testing produced a
        // connection failure that read like the server was missing.
        _cfg.Sql.Server = server;
        ConsoleUi.Ok($"Using {server}");
        return server;
    }

    // ── 5. Find the database ──────────────────────────────────────────────────

    private async Task<SqlConnection?> Stage5FindDatabaseAsync(string server, CancellationToken ct)
    {
        ConsoleUi.Stage(5, "Finding the TwoTouch database");

        // master with the elevated Windows identity: enough to enumerate and,
        // if this account is sysadmin, to grant read access in stage 6. The
        // protocol is whichever one answers first — see SqlProbe.Protocols.
        var opened = await SqlProbe.OpenFirstWorkingAsync(server, "master", user: "", password: "", ct);
        if (opened is null)
        {
            ConsoleUi.Diagnose(
                $"Could not connect to {server} over any protocol "
                    + $"({string.Join(", ", SqlProbe.Protocols.Select(SqlProbe.Describe))}).",
                $"{Elevation.CurrentUser()} may have no SQL login on this instance,",
                "or the SQL Server service for it may not be running.",
                "Run rail-diagnose.exe for the full picture.");
            return null;
        }

        var (conn, protocol) = opened.Value;
        _cfg.Sql.Protocol = protocol;
        ConsoleUi.Ok($"Connected over {SqlProbe.Describe(protocol)}");

        if (protocol != "lpc:")
            ConsoleUi.Info("Shared memory was unavailable, so the agent will use "
                         + $"{SqlProbe.Describe(protocol)} instead. This still works, but it is worth "
                         + "enabling Shared Memory in SQL Server Configuration Manager when convenient.");

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

        string chosen;
        if (unattended?.Database is { } namedDb)
        {
            var found = databases.FirstOrDefault(d => d.Equals(namedDb, StringComparison.OrdinalIgnoreCase));
            if (found is null)
            {
                ConsoleUi.Diagnose(
                    $"--database {namedDb} is not on this instance.",
                    $"Visible: {string.Join(", ", databases)}");
                conn.Dispose();
                return null;
            }
            chosen = found;
        }
        else if (exact >= 0)
        {
            chosen = databases[exact];       // an exact "TwoTouch" needs no asking
        }
        else if (Auto)
        {
            // No exact match: accept a single obvious candidate, refuse a guess.
            var looksRight = databases
                .Where(d => d.Contains("2touch", StringComparison.OrdinalIgnoreCase)
                         || d.Contains("twotouch", StringComparison.OrdinalIgnoreCase))
                .ToList();

            if (looksRight.Count != 1)
            {
                CannotChoose("which database holds the POS data",
                             looksRight.Count == 0 ? databases : looksRight,
                             "--database <name>");
                conn.Dispose();
                return null;
            }
            chosen = looksRight[0];
        }
        else
        {
            chosen = databases[ConsoleUi.Choose("Which database?", databases, @default: Math.Max(exact, 0))];
        }

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
        if (Auto)
        {
            // The only unattended path is Windows auth, which stores no password.
            // Asking for sa is exactly what unattended cannot do.
            ConsoleUi.Diagnose(
                "Unattended setup cannot grant read access on this instance.",
                $"{Elevation.CurrentUser()} is not a SQL sysadmin, so the Windows-auth grant failed,",
                "and creating the BarAppRead login needs an sa password nobody can type here.",
                $"Either run setup as a SQL sysadmin, or run it without {Unattended.Flag} to be prompted,",
                $"or have a DBA run:{Environment.NewLine}{Indent(SqlProbe.ManualGrantScript(_cfg.Sql.Database, ReadLogin))}");
            return false;
        }

        ConsoleUi.Info($"Creating the {ReadLogin} SQL login needs sa (or another sysadmin).");

        var saUser = ConsoleUi.Ask("SQL admin username", "sa");
        var saPassword = ConsoleUi.AskSecret($"Password for {saUser}");

        SqlConnection sa;
        try
        {
            sa = await SqlProbe.OpenAsync(
                SqlProbe.Probe(_cfg.Sql.Server, "master", saUser, saPassword, _cfg.Sql.Protocol), ct);
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

            if (Auto)
            {
                // Discovery is a conversation — propose, adjust, confirm. There is
                // no honest unattended version of it, so the feed is left off and
                // named, rather than mapped by guesswork.
                ConsoleUi.Warn($"{feed.Label} is not covered by the built-in mapping — skipped (unattended).");
                ConsoleUi.Info($"Re-run without {Unattended.Flag} to map it by hand.");
                SetFeedSkipped(feed);
                continue;
            }

            if (!await MapFeedAsync(feed, relations, conn, ct))
                SetFeedSkipped(feed);
        }

        if (SyncService.Enabled(_cfg.Tables.ZReport)
            || SyncService.Enabled(_cfg.Tables.EwReport)
            || SyncService.Enabled(_cfg.Tables.ItemAudit))
        {
            // Before stage 8, so the preview shows the dates the service will
            // actually produce rather than raw calendar days.
            ResolveBusinessDayCutoff();
            return true;
        }

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
        if (Auto)
        {
            ConsoleUi.Info("Using the built-in mapping (unattended).");
        }
        else if (!ConsoleUi.Confirm("Use the built-in mapping for those feeds?"))
        {
            ConsoleUi.Info("Falling back to schema discovery for all three feeds.");
            return taken;
        }

        foreach (var feed in available)
        {
            TwoTouchProfile.Apply(feed, _cfg);

            // The built-in feeds expose the raw ticket timestamp on purpose —
            // 2Touch has no business-date column. See TwoTouchProfile's date note.
            // All three carry a time, so all three may take the cutoff.
            if (feed.FeedKey == FeedSpecs.ZReportKey)       { _zDateType = "datetime";  _cfg.Columns.ZReport.DateHasTime   = true; }
            else if (feed.FeedKey == FeedSpecs.EwReportKey) { _ewDateType = "datetime"; _cfg.Columns.EwReport.DateHasTime  = true; }
            else if (feed.FeedKey == FeedSpecs.ItemAuditKey){ _iaDateType = "datetime"; _cfg.Columns.ItemAudit.DateHasTime = true; }

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

    /// <summary>
    /// SQL type of the mapped Z-report date column, recorded during mapping.
    /// Null when the Z-report feed was skipped.
    /// </summary>
    private string? _zDateType;
    private string? _ewDateType;
    private string? _iaDateType;

    /// <summary>
    /// Settles which hour separates one trading day from the next.
    ///
    /// A bar open 17:00-03:00 trades over two calendar dates. Without this the
    /// hours after midnight are filed under the next day, and sales appear on
    /// days the venue was closed — so this is asked explicitly rather than left
    /// to a default nobody sees.
    /// </summary>
    private void ResolveBusinessDayCutoff()
    {
        ConsoleUi.Blank();
        ConsoleUi.Info("── Trading day ─────────────────────────────");

        if (_zDateType is null)
        {
            ConsoleUi.Info("No sales feed mapped — leaving the trading-day cutoff at its default.");
            return;
        }

        if (!SqlTypes.CarriesTime(_zDateType))
        {
            // Shifting an already-rounded date would move every night back a day.
            _cfg.Sync.BusinessDayCutoffHour = 0;
            ConsoleUi.Ok($"The sales date column is '{_zDateType}' — it already holds a trading date, so no cutoff is applied.");
            return;
        }

        var hour = SyncConfig.DefaultBusinessDayCutoffHour;
        ConsoleUi.Info($"The sales date column is '{_zDateType}', so it records when each ticket was rung.");
        ConsoleUi.Info($"Sales before {hour}:00 will be counted as part of the previous night.");

        if (!Auto)
        {
            ConsoleUi.Info("Change this only if the bar regularly trades past 4am.");
            var answer = ConsoleUi.Ask("Hour that starts a new trading day (0-12)", hour.ToString());
            if (int.TryParse(answer, out var parsed) && parsed is >= 0 and <= 12)
            {
                hour = parsed;
            }
            else if (!string.IsNullOrWhiteSpace(answer) && answer != hour.ToString())
            {
                ConsoleUi.Warn($"'{answer}' is not an hour between 0 and 12 — keeping {hour}.");
            }
        }

        _cfg.Sync.BusinessDayCutoffHour = hour;
        ConsoleUi.Ok(hour == 0
            ? "No trading-day cutoff — calendar dates will be used as-is."
            : $"Trading day starts at {hour:00}:00.");

        ReportPerFeedCutoff(hour);
    }

    /// <summary>
    /// Says which feeds the cutoff will actually reach.
    ///
    /// The cutoff is one number but it is applied per feed, and only to feeds
    /// whose date column still carries a time. A feed mapped to a plain `date`
    /// is passed through untouched — subtracting hours from a column that is
    /// already midnight would move every one of its rows back a day. Labour is
    /// called out by name because that failure pays people for the wrong shift.
    /// </summary>
    private void ReportPerFeedCutoff(int hour)
    {
        if (hour == 0) return;

        (string Label, string? Type, bool HasTime)[] feeds =
        [
            ("Sales",      _zDateType,  _cfg.Columns.ZReport.DateHasTime),
            ("Labour",     _ewDateType, _cfg.Columns.EwReport.DateHasTime),
            ("Item audit", _iaDateType, _cfg.Columns.ItemAudit.DateHasTime),
        ];

        foreach (var (label, type, hasTime) in feeds)
        {
            if (type is null) continue;

            if (hasTime)
                ConsoleUi.Info($"  {label,-11} '{type}' — cutoff applied");
            else
                ConsoleUi.Warn($"  {label,-11} '{type}' already holds a rounded date — cutoff NOT applied to it");
        }
    }

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
                // Drives the business-day cutoff: a datetime still holds the hour
                // the ticket was rung, a plain date has already been rounded.
                _zDateType = mapping["Date"].DataType;
                _cfg.Columns.ZReport.DateHasTime = SqlTypes.CarriesTime(_zDateType);
                break;

            case FeedSpecs.EwReportKey:
                _cfg.Tables.EwReport = relation.Quoted;
                _cfg.Columns.EwReport = new EwReportColumns
                {
                    Date = Q("Date"), EmployeeName = Q("EmployeeName"), TotalSales = Q("TotalSales"),
                    TipsPaidOut = Q("TipsPaidOut"), RegularHours = Q("RegularHours"), OvertimeHours = Q("OvertimeHours"),
                };
                // Recorded separately from the sales column. These are different
                // columns on different relations and are routinely different
                // types; assuming they match is what filed every shift a day early.
                _ewDateType = mapping["Date"].DataType;
                _cfg.Columns.EwReport.DateHasTime = SqlTypes.CarriesTime(_ewDateType);
                break;

            case FeedSpecs.ItemAuditKey:
                _cfg.Tables.ItemAudit = relation.Quoted;
                _cfg.Columns.ItemAudit = new ItemAuditColumns
                {
                    Date = Q("Date"), ItemName = Q("ItemName"), Category = Q("Category"),
                    QtySold = Q("QtySold"), NetSales = Q("NetSales"),
                };
                _iaDateType = mapping["Date"].DataType;
                _cfg.Columns.ItemAudit.DateHasTime = SqlTypes.CarriesTime(_iaDateType);
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

    // Preview must run the EXACT query the service will, cutoff included —
    // otherwise setup shows dates the running agent would never produce.
    private string FeedSql(FeedSpec feed, int days, int? top) => feed.Key switch
    {
        FeedSpecs.ZReportKey   => SqlReader.ZReportSql(_cfg.Tables.ZReport, _cfg.Columns.ZReport, days, _cfg.Sync.ResolvedCutoffHour, top),
        FeedSpecs.EwReportKey  => SqlReader.EwReportSql(_cfg.Tables.EwReport, _cfg.Columns.EwReport, days, _cfg.Sync.ResolvedCutoffHour, top),
        _                      => SqlReader.ItemAuditSql(_cfg.Tables.ItemAudit, _cfg.Columns.ItemAudit, days, _cfg.Sync.ResolvedCutoffHour, top),
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

            if (Auto)
            {
                // The mapping already proved itself at stage 7, so an empty window
                // is more likely a quiet week than a broken mapping. Install, but
                // make sure the warning is in the log the installer leaves behind.
                ConsoleUi.Warn("Installing anyway (unattended). Confirm data appears in Rail before leaving.");
            }
            else if (!ConsoleUi.Confirm("Install anyway?", @default: false))
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

        var target = Path.Combine(_installDir, AgentVersion.AgentExeName);

        // The SOURCE is the agent binary sitting beside this installer — not the
        // running process. rail-setup.exe is its own executable now, and copying
        // Environment.ProcessPath here would register the installer as the
        // service: it would start, find no Worker, and the bar would silently
        // stop syncing.
        var source = ResolveAgentSource();
        if (source is null)
        {
            ConsoleUi.Diagnose(
                $"{AgentVersion.AgentExeName} is not in this folder.",
                "Setup installs the agent that ships beside it. Extract the whole download",
                "to one folder and run rail-setup.exe from there.");
            return false;
        }

        if (ServiceControl.Exists())
        {
            ConsoleUi.Info($"'{ServiceControl.ServiceName}' is already installed — replacing it.");
            ServiceControl.Stop();
            ServiceControl.Delete();
        }

        if (!string.Equals(Path.GetFullPath(source), Path.GetFullPath(target), StringComparison.OrdinalIgnoreCase))
        {
            try { File.Copy(source, target, overwrite: true); }
            catch (Exception ex)
            {
                ConsoleUi.Diagnose(
                    $"Could not copy the agent to {target}: {ex.Message}",
                    "If a previous service is still shutting down, wait a moment and re-run setup.");
                return false;
            }
        }
        ConsoleUi.Ok($"Agent installed at {target}");

        // The updater and uninstaller go in beside it. Without this they would
        // live only in the download folder, which is the first thing anyone
        // clears out — and rail-update.exe has to sit next to the binary it
        // replaces to find it.
        CopyCompanion("rail-update.exe");
        CopyCompanion("rail-uninstall.exe");

        var result = ServiceControl.Install(target, _installDir);
        if (!result.Ok)
        {
            ConsoleUi.Diagnose($"Service registration failed: {result.Output.Trim()}");
            return false;
        }

        ConsoleUi.Ok($"Service '{ServiceControl.ServiceName}' registered (automatic start, restarts on crash)");
        return true;
    }

    /// <summary>
    /// Finds the agent executable to install.
    ///
    /// Beside the installer normally. Falling back to the running process keeps
    /// a one-file install working — an older combined build, or someone who
    /// renamed the agent to rail-setup.exe — rather than refusing outright.
    /// </summary>
    private static string? ResolveAgentSource()
    {
        var beside = Path.Combine(
            Path.GetDirectoryName(Environment.ProcessPath!) ?? AgentVersion.InstallDirectory,
            AgentVersion.AgentExeName);

        if (File.Exists(beside)) return beside;

        // Is the running process itself the agent? It is when this assembly
        // carries the Worker, which only the agent build does.
        var running = Environment.ProcessPath!;
        return string.Equals(
            Path.GetFileName(running), AgentVersion.AgentExeName, StringComparison.OrdinalIgnoreCase)
            ? running
            : null;
    }

    /// <summary>
    /// Copies a sibling tool into the install directory. Best-effort and
    /// non-fatal: a missing updater is worth a warning, but it must not fail an
    /// otherwise-good install of the thing that actually syncs data.
    /// </summary>
    private void CopyCompanion(string fileName)
    {
        try
        {
            var source = Path.Combine(
                Path.GetDirectoryName(Environment.ProcessPath!) ?? "", fileName);
            if (!File.Exists(source)) return;

            var target = Path.Combine(_installDir, fileName);
            if (string.Equals(Path.GetFullPath(source), Path.GetFullPath(target), StringComparison.OrdinalIgnoreCase))
                return;

            File.Copy(source, target, overwrite: true);
            ConsoleUi.Ok($"{fileName} installed alongside the agent");
        }
        catch (Exception ex)
        {
            ConsoleUi.Warn($"Could not copy {fileName}: {ex.Message}");
        }
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
            ["Agent version",     AgentVersion.ReadFileVersion(Path.Combine(_installDir, AgentVersion.AgentExeName))?.ToString(3) ?? "unknown"],
            ["Update",            $@"{_installDir}\rail-update.exe"],
            ["Uninstall",         $@"{_installDir}\rail-uninstall.exe"],
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
