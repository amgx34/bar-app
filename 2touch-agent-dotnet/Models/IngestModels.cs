using System.Text.Json.Serialization;

namespace RailAgent.Models;

// Property names are snake_case ON PURPOSE — they are serialized verbatim and
// must match the JSON contract that POST /api/2touch/ingest expects.

public sealed record ZReportRow(
    string report_date,
    decimal total_sales,
    decimal cc_tips,
    decimal cash_tips,
    // How the night's takings were tendered. Zero when the schema cannot
    // supply the split — Rail treats that as "not reported", not as "no cash".
    decimal cash_sales,
    decimal card_sales);

public sealed record EwReportRow(
    string shift_date,
    string employee_name,
    decimal total_sales,
    decimal tips_paid_out,
    decimal regular_hours,
    decimal overtime_hours);

public sealed record ItemAuditRow(
    string sale_date,
    string item_name,
    string category_name,
    decimal qty_sold,
    decimal net_sales);

public sealed record HourlySalesRow(
    string business_date,
    int hour,
    decimal net_sales,
    int ticket_count,
    decimal tips);

public sealed record ServerSalesRow(
    string business_date,
    string server_name,
    decimal net_sales,
    int ticket_count,
    decimal tips);

public sealed record IngestPayload(
    string org_id,
    string source,
    string pulledAt,
    IReadOnlyList<ZReportRow> zReports,
    IReadOnlyList<EwReportRow> ewReports,
    IReadOnlyList<ItemAuditRow> itemAudit,
    // Nullable and omitted-when-null (not emitted as JSON null): a feed that
    // did not run should say so honestly rather than claim an empty result.
    // The server treats `payload.hourlySales ?? []` the same either way, so
    // this is about what the payload says, not about data safety.
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    IReadOnlyList<HourlySalesRow>? hourlySales = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    IReadOnlyList<ServerSalesRow>? serverSales = null,
    // Feeds that were configured, ran, and threw. Null on a clean cycle rather
    // than an empty array, so "this agent reported no errors" and "this agent
    // is too old to report errors" stay distinguishable server-side.
    //
    // These travel with the DATA because the agent's log does not travel at
    // all: it is the Windows Event Log on a POS box behind a bar. A feed that
    // failed silently for a month looked identical in Rail to one that was
    // working, and the only way to tell them apart was a human running
    // --test on the machine. See SyncService.RunOnceAsync.
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    IReadOnlyList<string>? agentErrors = null);

/// <summary>
/// One cycle's outcome. <paramref name="Ok"/> is false when a CONFIGURED feed
/// failed — a skipped feed is not a failure — which is what gives `--once` a
/// non-zero exit code instead of a tick over an empty push.
/// </summary>
public sealed record SyncResult(
    bool Ok, int ZReports, int EwReports, int ItemAudit, string? Error = null);
