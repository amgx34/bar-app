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
    IReadOnlyList<ServerSalesRow>? serverSales = null);

public sealed record SyncResult(bool Ok, int ZReports, int EwReports, int ItemAudit, string? Error = null);
