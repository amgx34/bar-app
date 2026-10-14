using System.Globalization;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Hosting.WindowsServices;
using RailAgent;
using RailAgent.Config;
using RailAgent.Services;
using RailAgent.Setup;

// This executable is the SERVICE, and now only the service:
//
//   launched by the SCM   run as a Windows Service          (no args are passed)
//   --run                 foreground service loop, for debugging
//   --test                connect + query only, print samples, send nothing
//   --once                one full sync (query + push), then exit
//   --days N              override the lookback window for --test / --once
//   --backfill            pull a fixed historical range and post it in chunks
//     --from YYYY-MM-DD   first night to pull (inclusive)
//     --to   YYYY-MM-DD   first night NOT to pull (exclusive; defaults to today)
//     --feeds hourly,server   REQUIRED — which feeds to pull
//     --chunk-days N      nights per request (default 30)
//   --version             print the version and exit
//
// Setup, diagnostics, updates and removal moved to their own executables:
//
//   rail-setup.exe        the menu, the wizard, --unattended, --diagnose
//   rail-update.exe       check and install a newer agent build
//   rail-uninstall.exe    remove the service, config and credentials
//
// The split is what makes updating possible at all: Windows locks a running
// image, so the binary that replaces this one cannot BE this one. Keeping the
// installer out of the service binary also means an update swaps a file that
// does nothing but sync, rather than one that also contains a wizard.
//
// The SCM check MUST come first: a service launch passes no arguments and must
// never reach any of the interactive paths.

var isService = WindowsServiceHelpers.IsWindowsService();

if (!isService)
{
    // The console defaults to the OEM codepage, which renders ✓/✗ as mojibake.
    // Best-effort: some hosts refuse.
    try { Console.OutputEncoding = System.Text.Encoding.UTF8; } catch { /* keep the default */ }

    if (Has("--version"))
    {
        Console.WriteLine(AgentVersion.CurrentDisplay);
        return 0;
    }

    // These flags used to live here. Rather than silently doing nothing —
    // which on --uninstall would leave an operator believing a decommissioned
    // POS box had been cleaned — each one names the executable that took it
    // over. Existing scripts get an actionable error, not a no-op.
    var moved = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
        ["--setup"]      = "rail-setup.exe --setup",
        ["--menu"]       = "rail-setup.exe",
        ["--unattended"] = "rail-setup.exe --unattended",
        ["--diagnose"]   = "rail-setup.exe --diagnose",
        ["--uninstall"]  = "rail-uninstall.exe",
    };

    foreach (var (flag, replacement) in moved)
    {
        if (!Has(flag)) continue;
        Console.Error.WriteLine($"'{flag}' has moved out of the agent. Run: {replacement}");
        Console.Error.WriteLine("The agent executable is now only the sync service.");
        return 1;
    }

    // A double-click on the service binary is almost always someone looking for
    // the installer. Point at it rather than starting a sync loop in a console
    // window they will close.
    if (IsDoubleClick())
    {
        Console.WriteLine();
        Console.WriteLine($"  Rail 2Touch agent {AgentVersion.CurrentDisplay} — this is the background service.");
        Console.WriteLine();
        Console.WriteLine("  To install or configure it   run rail-setup.exe");
        Console.WriteLine("  To update it                 run rail-update.exe");
        Console.WriteLine("  To remove it                 run rail-uninstall.exe");
        Console.WriteLine();
        // Bounded, never blocking. This binary is the one most likely to be
        // launched by automation with no arguments, and an unbounded wait here
        // would hang that process forever with nobody to press a key.
        ConsoleUi.PauseBounded();
        return 0;
    }
}

var isTest = Has("--test");
var isOnce = Has("--once");
var isBackfill = Has("--backfill");

static string? Arg(string[] a, string flag)
{
    var i = Array.IndexOf(a, flag);
    return i >= 0 && i + 1 < a.Length ? a[i + 1] : null;
}

int? daysOverride = null;
var daysIdx = Array.IndexOf(args, "--days");
if (daysIdx >= 0 && daysIdx + 1 < args.Length && int.TryParse(args[daysIdx + 1], out var d))
    daysOverride = d;

var builder = Host.CreateApplicationBuilder(args);

// Configuration layering, lowest priority first:
//   1. embedded appsettings.json  — the exe alone is enough
//   2. on-disk appsettings.json   — optional override, added by the host builder
//   3. appsettings.local.json     — what the setup wizard writes
var embedded = EmbeddedJsonConfigurationSource.TryLoad();
if (embedded is not null) builder.Configuration.Sources.Insert(0, embedded);

builder.Configuration.AddJsonFile("appsettings.local.json", optional: true, reloadOnChange: false);

// When launched by the Windows Service Control Manager this wires up the
// service lifetime + Event Log; when run from a console it's a no-op.
builder.Services.AddWindowsService(options => options.ServiceName = ServiceControl.ServiceName);

builder.Services.Configure<AgentConfig>(builder.Configuration.GetSection("Agent"));

// rail-update.exe can only replace the binary — the schema mapping lives in
// appsettings.local.json, so an upgraded box would keep running the query its
// setup wrote in 2024 and never report anything this build added. Runs after
// binding, and only ever replaces text setup itself generated.
builder.Services.PostConfigure<AgentConfig>(ProfileMigration.Apply);
builder.Services.AddHttpClient("rail", c => c.Timeout = TimeSpan.FromSeconds(60));
builder.Services.AddSingleton<SqlReader>();
builder.Services.AddSingleton<RailClient>();
builder.Services.AddSingleton<SyncService>();

// Backfill: a fixed historical range, posted one window at a time.
//
// Not --once with a very large --days. That would be one request carrying a
// year of trade, which exceeds both the ingest route's body limit and its
// thirty-second budget — and would arrive as a single all-or-nothing push.
if (isBackfill)
{
    IReadOnlyList<BackfillFeed> feeds;
    DateOnly from;
    try
    {
        feeds = Backfill.ParseFeeds(Arg(args, "--feeds"));

        var fromText = Arg(args, "--from")
            ?? throw new ArgumentException("--from YYYY-MM-DD is required.");
        from = DateOnly.ParseExact(fromText, "yyyy-MM-dd", CultureInfo.InvariantCulture);
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"ERROR: {ex.Message}");
        Console.Error.WriteLine("Example: --backfill --from 2025-10-01 --to 2026-10-13 --feeds hourly,server");
        return 1;
    }

    var toText = Arg(args, "--to");
    var to = toText is null
        ? DateOnly.FromDateTime(DateTime.Today)
        : DateOnly.ParseExact(toText, "yyyy-MM-dd", CultureInfo.InvariantCulture);

    var chunkDays = int.TryParse(Arg(args, "--chunk-days"), out var cd) ? cd : Backfill.DefaultChunkDays;
    var windows = Backfill.Chunks(from, to, chunkDays);

    if (windows.Count == 0)
    {
        Console.Error.WriteLine($"ERROR: {from:yyyy-MM-dd} to {to:yyyy-MM-dd} is an empty range.");
        return 1;
    }

    using var backfillHost = builder.Build();
    var backfillSync = backfillHost.Services.GetRequiredService<SyncService>();
    var backfillCfg = backfillHost.Services
        .GetRequiredService<Microsoft.Extensions.Options.IOptions<AgentConfig>>().Value;

    // Before anything is queried. A feed with no table mapped would return
    // nothing and finish reporting zero rows, which reads as "the POS kept no
    // history" rather than "this box was never told where to look" — and a box
    // still on a pre-1.3 config has exactly no hourly or per-server mapping.
    var unmapped = Backfill.Unconfigured(feeds, f => f switch
    {
        BackfillFeed.Hourly    => backfillCfg.Tables.HourlySales,
        BackfillFeed.Server    => backfillCfg.Tables.ServerSales,
        BackfillFeed.ZReport   => backfillCfg.Tables.ZReport,
        BackfillFeed.EwReport  => backfillCfg.Tables.EwReport,
        BackfillFeed.ItemAudit => backfillCfg.Tables.ItemAudit,
        _ => null,
    });

    if (unmapped.Count > 0)
    {
        Console.Error.WriteLine(
            $"ERROR: no mapping on this box for: {string.Join(", ", unmapped)}.");
        Console.Error.WriteLine("Nothing was pulled. Those feeds have no table or view configured, so a");
        Console.Error.WriteLine("backfill would return zero rows and tell you nothing. Run rail-setup.exe");
        Console.Error.WriteLine("and re-run the wizard to map them, then try again.");
        return 1;
    }

    Console.WriteLine($"Backfilling {from:yyyy-MM-dd} → {to:yyyy-MM-dd} "
                    + $"({windows.Count} window(s) of up to {chunkDays} nights, feeds: {string.Join(", ", feeds)})");
    Console.WriteLine();

    var totalRows = 0;
    var failed = new List<RailAgent.Models.BackfillChunkResult>();

    foreach (var (window, i) in windows.Select((w, i) => (w, i)))
    {
        // Printed before the work, so an operator watching a long run can see
        // which window is in flight rather than a cursor that has not moved
        // for a minute.
        Console.Write($"  [{i + 1}/{windows.Count}] {window.From:yyyy-MM-dd} → {window.To:yyyy-MM-dd} … ");

        var chunk = await backfillSync.BackfillChunkAsync(window, feeds, CancellationToken.None);
        totalRows += chunk.Rows;

        if (chunk.Ok)
        {
            Console.WriteLine($"{chunk.Rows} row(s)");
        }
        else
        {
            // Carries on rather than stopping. One unreadable window out of
            // twelve should not cost the other eleven, and the summary below
            // says exactly which nights still need another pass.
            Console.WriteLine($"FAILED — {string.Join("; ", chunk.Errors)}");
            failed.Add(chunk);
        }
    }

    Console.WriteLine();
    Console.WriteLine($"Done. {totalRows} row(s) sent from {windows.Count - failed.Count}/{windows.Count} window(s).");

    if (failed.Count > 0)
    {
        Console.WriteLine();
        Console.WriteLine("These windows did not land and can be re-run on their own:");
        foreach (var f in failed)
            Console.WriteLine($"  --from {f.Window.From:yyyy-MM-dd} --to {f.Window.To:yyyy-MM-dd}");
    }
    else if (totalRows == 0)
    {
        // Zero rows across every window is almost never what the operator
        // wanted, and it is the one outcome that looks identical to success.
        Console.WriteLine();
        Console.WriteLine("No rows were found anywhere in that range. Either the POS keeps no history");
        Console.WriteLine("that far back, or these feeds are not mapped on this box (check rail-setup.exe → diagnose).");
    }

    return failed.Count == 0 ? 0 : 1;
}

// One-shot modes: run a single cycle and return an exit code (0 ok, 1 failed).
if (isTest || isOnce)
{
    using var oneShot = builder.Build();
    var sync = oneShot.Services.GetRequiredService<SyncService>();
    try
    {
        var result = await sync.RunOnceAsync(daysOverride, test: isTest, CancellationToken.None);
        return result.Ok ? 0 : 1;
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"ERROR: {ex.Message}");
        return 1;
    }
}

// Service / long-running mode.
builder.Services.AddHostedService<Worker>();
using var host = builder.Build();
await host.RunAsync();
return 0;

bool Has(string flag) => args.Contains(flag, StringComparer.OrdinalIgnoreCase);

// No arguments and a real console attached: someone double-clicked the exe in
// Explorer. Piped or redirected input means a script, which gets the old
// no-args behaviour (the service loop) instead of a wizard nobody can answer.
bool IsDoubleClick() => args.Length == 0 && Environment.UserInteractive && !Console.IsInputRedirected;
