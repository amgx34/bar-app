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
