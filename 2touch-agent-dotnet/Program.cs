using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using RailAgent;
using RailAgent.Config;
using RailAgent.Services;

// CLI flags:
//   (no args)     run as a service / foreground loop
//   --test        connect + query only, print samples, DO NOT send to Rail, then exit
//   --once        run exactly one full sync (query + push), then exit
//   --days N      override the lookback window for --test / --once
var isTest = args.Contains("--test");
var isOnce = args.Contains("--once");

int? daysOverride = null;
var daysIdx = Array.IndexOf(args, "--days");
if (daysIdx >= 0 && daysIdx + 1 < args.Length && int.TryParse(args[daysIdx + 1], out var d))
    daysOverride = d;

var builder = Host.CreateApplicationBuilder(args);

// Secrets and per-bar overrides live in appsettings.local.json (gitignored).
builder.Configuration.AddJsonFile("appsettings.local.json", optional: true, reloadOnChange: false);

// When launched by the Windows Service Control Manager this wires up the
// service lifetime + Event Log; when run from a console it's a no-op.
builder.Services.AddWindowsService(options => options.ServiceName = "Rail2TouchSync");

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
