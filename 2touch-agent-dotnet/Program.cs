using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Hosting.WindowsServices;
using RailAgent;
using RailAgent.Config;
using RailAgent.Services;
using RailAgent.Setup;

// Mode selection, resolved before the host is built:
//
//   launched by the SCM   run as a Windows Service          (no args are passed)
//   --setup               setup wizard
//   (double-click)        setup wizard
//   --run                 foreground service loop, for debugging
//   --uninstall           stop and delete the service, leave config in place
//   --test                connect + query only, print samples, send nothing
//   --once                one full sync (query + push), then exit
//   --days N              override the lookback window for --test / --once
//
// The SCM check MUST come first: a service launch passes no arguments and must
// never reach the wizard.

var isService = WindowsServiceHelpers.IsWindowsService();

if (!isService)
{
    if (Has("--uninstall"))
    {
        if (!Elevation.IsAdministrator())
        {
            Console.Error.WriteLine("Removing a Windows Service needs Administrator. Re-run from an elevated prompt.");
            return 1;
        }
        Console.WriteLine(ServiceControl.Uninstall());
        return 0;
    }

    if (Has("--setup") || IsDoubleClick())
        return await new SetupWizard(args).RunAsync(CancellationToken.None);
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
