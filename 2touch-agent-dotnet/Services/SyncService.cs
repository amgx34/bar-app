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
    /// <summary>
    /// Sanity-checks the cash/card split against the night's sales, and returns a
    /// sentence to log when it looks wrong — or null when it looks fine.
    ///
    /// The two totals are NOT expected to match. Payments carry sales tax and
    /// tips that net sales does not, so a healthy night lands somewhere above
    /// net sales. The band below is deliberately wide because it is watching for
    /// one specific mistake, not auditing arithmetic:
    ///
    ///   fAmount on a cash payment is what the customer HANDED OVER. A $20 note
    ///   against a $12 tab is a $20 row with $8 in fCashPaidBack. The query
    ///   subtracts the change; if a given schema populates those fields
    ///   differently, cash sales balloon past the takings — and this is what
    ///   says so in the log, instead of quietly inflating the drawer figure
    ///   every night for a bar that trusts it.
    ///
    /// Warns rather than discards. A questionable split is still the bar's data,
    /// and whoever reads the log is better placed to judge it than a threshold
    /// picked here.
    /// </summary>
    public static string? TenderWarning(decimal totalSales, decimal cashSales, decimal cardSales)
    {
        // Nothing reported (an unmapped schema sends 0 + 0), or a genuinely
        // empty day: no split to reconcile.
        var tendered = cashSales + cardSales;
        if (tendered == 0m || totalSales <= 0m) return null;

        var ratio = tendered / totalSales;

        if (ratio > 1.6m)
            return $"cash+card tendered ({tendered:0.00}) is {ratio:0.0}x net sales ({totalSales:0.00}) — "
                 + "check whether cash payments are recorded as tendered rather than net of change";

        if (ratio < 0.8m)
            return $"cash+card tendered ({tendered:0.00}) is well under net sales ({totalSales:0.00}) — "
                 + "some payment types are probably missing from the split";

        return null;
    }

    public static bool Enabled(string? table) => !string.IsNullOrWhiteSpace(table);

    public async Task<SyncResult> RunOnceAsync(int? daysOverride, bool test, CancellationToken ct)
    {
        var days = daysOverride ?? _cfg.Sync.LookbackDays;
        log.LogInformation("Starting sync — lookback {Days} day(s){Mode}", days, test ? " [TEST MODE]" : "");

        List<ZReportRow> z = [];
        List<EwReportRow> ew = [];
        List<ItemAuditRow> audit = [];
        List<HourlySalesRow>? hourly = null;
        List<ServerSalesRow>? server = null;

        await using var conn = await sql.OpenAsync(ct);
        log.LogInformation("SQL Server connected via {DataSource}", conn.DataSource);

        // Said out loud, because the mapping this run uses is not the mapping in
        // the file on disk — an operator comparing the two deserves to know why.
        if (_cfg.ProfileUpgraded)
            log.LogInformation(
                "Z mapping upgraded in memory to the current 2Touch profile (adds the cash/card split). "
                + "Re-run rail-setup.exe on this box to make it permanent.");

        // An empty Tables.X means this bar has no such feed — setup could not find
        // one, or the operator skipped it. Don't query it; send an empty array,
        // which the ingest route already treats as a no-op for that section.
        if (Enabled(_cfg.Tables.ZReport))
        {
            try
            {
                z = await sql.QueryZReportsAsync(conn, days, ct);
                log.LogInformation("  Z Reports:  {Count} day(s)", z.Count);

                foreach (var row in z)
                {
                    var problem = TenderWarning(row.total_sales, row.cash_sales, row.card_sales);
                    if (problem is not null) log.LogWarning("  {Date}: {Problem}", row.report_date, problem);
                }
            }
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

        // Hourly needs an actual clock reading off the raw column: a date-only
        // column has no hour to report. Emitting hour 0 for every ticket would
        // draw a curve showing the whole night landing at midnight — worse than
        // no curve at all, because it looks like real data. So this feed is
        // gated on DateHasTime in addition to the usual Enabled() check.
        if (Enabled(_cfg.Tables.HourlySales) && _cfg.Columns.HourlySales.DateHasTime)
        {
            try { hourly = await sql.QueryHourlySalesAsync(conn, days, ct); log.LogInformation("  Hourly:     {Count} row(s)", hourly.Count); }
            catch (Exception e) { log.LogWarning("Hourly Sales query failed: {Message}", e.Message); }
        }
        else if (Enabled(_cfg.Tables.HourlySales))
            log.LogInformation("  Hourly:     skipped — configured date column has no time component, so it cannot yield an hour");
        else log.LogInformation("  Hourly:     not configured — skipped");

        if (Enabled(_cfg.Tables.ServerSales))
        {
            try { server = await sql.QueryServerSalesAsync(conn, days, ct); log.LogInformation("  Server:     {Count} row(s)", server.Count); }
            catch (Exception e) { log.LogWarning("Server Sales query failed: {Message}", e.Message); }
        }
        else log.LogInformation("  Server:     not configured — skipped");

        if (test)
        {
            if (z.Count > 0) log.LogInformation("Z sample:     {Row}", z[0]);
            if (ew.Count > 0) log.LogInformation("EW sample:    {Row}", ew[0]);
            if (audit.Count > 0) log.LogInformation("Audit sample: {Row}", audit[0]);
            if (hourly is { Count: > 0 }) log.LogInformation("Hourly sample: {Row}", hourly[0]);
            if (server is { Count: > 0 }) log.LogInformation("Server sample: {Row}", server[0]);
            log.LogInformation("✓ SQL connection and queries OK (test mode — nothing sent to Rail)");
            return new SyncResult(true, z.Count, ew.Count, audit.Count);
        }

        await rail.PushAsync(z, ew, audit, ct, hourly, server);
        log.LogInformation("✓ Sync complete — Z:{Z} EW:{EW} Audit:{Audit}", z.Count, ew.Count, audit.Count);
        return new SyncResult(true, z.Count, ew.Count, audit.Count);
    }
}
