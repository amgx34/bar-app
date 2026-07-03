using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using RailAgent.Config;
using RailAgent.Services;

namespace RailAgent;

/// <summary>
/// Windows Service loop: runs a sync immediately on start, then every
/// Sync.IntervalMinutes. A failed cycle is logged and the loop continues.
/// </summary>
public sealed class Worker(SyncService sync, IOptions<AgentConfig> cfg, ILogger<Worker> log) : BackgroundService
{
    private readonly AgentConfig _cfg = cfg.Value;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var minutes = Math.Max(1, _cfg.Sync.IntervalMinutes);
        log.LogInformation("Rail 2Touch agent started — syncing every {Minutes} min", minutes);

        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(minutes));
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await sync.RunOnceAsync(daysOverride: null, test: false, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Sync cycle failed");
            }

            try
            {
                if (!await timer.WaitForNextTickAsync(stoppingToken)) break;
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }

        log.LogInformation("Rail 2Touch agent stopping");
    }
}
