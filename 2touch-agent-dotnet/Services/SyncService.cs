using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using RailAgent.Config;
using RailAgent.Models;

namespace RailAgent.Services;

/// <summary>
/// One sync cycle: open a local read-only connection, run the three queries,
/// and push the results to Rail. In test mode it queries and logs samples but
/// does not send anything.
/// </summary>
public sealed class SyncService(SqlReader sql, RailClient rail, IOptions<AgentConfig> cfg, ILogger<SyncService> log)
{
    private readonly AgentConfig _cfg = cfg.Value;

    /// <summary>A feed is configured when it has a table or view to read from.</summary>
    public static bool Enabled(string? table) => !string.IsNullOrWhiteSpace(table);

    public async Task<SyncResult> RunOnceAsync(int? daysOverride, bool test, CancellationToken ct)
    {
        var days = daysOverride ?? _cfg.Sync.LookbackDays;
        log.LogInformation("Starting sync — lookback {Days} day(s){Mode}", days, test ? " [TEST MODE]" : "");

        List<ZReportRow> z = [];
        List<EwReportRow> ew = [];
        List<ItemAuditRow> audit = [];

        await using var conn = await sql.OpenAsync(ct);
        log.LogInformation("SQL Server connected via {DataSource}", conn.DataSource);

        // An empty Tables.X means this bar has no such feed — setup could not find
        // one, or the operator skipped it. Don't query it; send an empty array,
        // which the ingest route already treats as a no-op for that section.
        if (Enabled(_cfg.Tables.ZReport))
        {
            try { z = await sql.QueryZReportsAsync(conn, days, ct); log.LogInformation("  Z Reports:  {Count} day(s)", z.Count); }
            catch (Exception e) { log.LogWarning("Z Report query failed: {Message}", e.Message); }
        }
        else log.LogInformation("  Z Reports:  not configured — skipped");

        if (Enabled(_cfg.Tables.EwReport))
        {
            try { ew = await sql.QueryEwReportsAsync(conn, days, ct); log.LogInformation("  EW Reports: {Count} row(s)", ew.Count); }
            catch (Exception e) { log.LogWarning("EW Report query failed: {Message}", e.Message); }
        }
        else log.LogInformation("  EW Reports: not configured — skipped");

        if (Enabled(_cfg.Tables.ItemAudit))
        {
            try { audit = await sql.QueryItemAuditAsync(conn, days, ct); log.LogInformation("  Item Audit: {Count} row(s)", audit.Count); }
            catch (Exception e) { log.LogWarning("Item Audit query failed: {Message}", e.Message); }
        }
        else log.LogInformation("  Item Audit: not configured — skipped");

        if (test)
        {
            if (z.Count > 0) log.LogInformation("Z sample:     {Row}", z[0]);
            if (ew.Count > 0) log.LogInformation("EW sample:    {Row}", ew[0]);
            if (audit.Count > 0) log.LogInformation("Audit sample: {Row}", audit[0]);
            log.LogInformation("✓ SQL connection and queries OK (test mode — nothing sent to Rail)");
            return new SyncResult(true, z.Count, ew.Count, audit.Count);
        }

        await rail.PushAsync(z, ew, audit, ct);
        log.LogInformation("✓ Sync complete — Z:{Z} EW:{EW} Audit:{Audit}", z.Count, ew.Count, audit.Count);
        return new SyncResult(true, z.Count, ew.Count, audit.Count);
    }
}
