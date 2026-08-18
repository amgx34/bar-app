using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Options;
using RailAgent.Config;
using RailAgent.Models;

namespace RailAgent.Services;

/// <summary>
/// Read-only reader for the local TwoTouch SQL Server. Connects over shared
/// memory (no TCP port, no SQL Server Browser) and runs the three report
/// queries. Table/column names come from config so each bar's schema can differ.
/// </summary>
/// <remarks>
/// Not sealed, and the query methods are virtual, so tests can substitute a
/// reader without a live SQL Server. Nothing in production subclasses it.
/// </remarks>
public class SqlReader(IOptions<AgentConfig> cfg)
{
    private readonly AgentConfig _cfg = cfg.Value;

    /// <summary>
    /// Shared with the setup wizard so what setup proves is exactly what the
    /// service later connects with.
    /// </summary>
    public static string BuildConnectionString(SqlConfig s)
    {
        var dataSource = string.IsNullOrWhiteSpace(s.Protocol) ? s.Server : $"{s.Protocol}{s.Server}";

        var b = new SqlConnectionStringBuilder
        {
            DataSource = dataSource,
            InitialCatalog = s.Database,
            ConnectTimeout = s.ConnectTimeoutSeconds,
            Encrypt = false,                 // local shared memory — TLS is not applicable
            TrustServerCertificate = true,
            ApplicationName = "rail-2touch-agent",
        };

        if (!string.IsNullOrWhiteSpace(s.User))
        {
            b.UserID = s.User;
            b.Password = s.Password ?? string.Empty;
        }
        else
        {
            b.IntegratedSecurity = true;     // Windows auth via the service account
        }

        return b.ConnectionString;
    }

    public virtual async Task<SqlConnection> OpenAsync(CancellationToken ct)
    {
        var conn = new SqlConnection(BuildConnectionString(_cfg.Sql));
        await conn.OpenAsync(ct);
        return conn;
    }

    private static string Cutoff(int lookbackDays)
        => DateTime.Today.AddDays(-Math.Abs(lookbackDays)).ToString("yyyy-MM-dd");

    /// <summary>
    /// Raw-timestamp filter boundary. When a business-day cutoff is active a
    /// row's trading date can be one day earlier than its timestamp, so the raw
    /// window is widened by a day — otherwise the oldest trading day in range
    /// comes back missing its pre-cutoff hours. Re-sending a day is harmless:
    /// ingest upserts on (organization_id, report_date).
    /// </summary>
    private static string RawCutoff(int lookbackDays, int cutoffHour)
        => Cutoff(Math.Abs(lookbackDays) + (cutoffHour > 0 ? 1 : 0));

    /// <summary>
    /// Truncates a timestamp to the trading day it belongs to.
    ///
    /// With a cutoff of 4, a ticket rung at 01:40 on Sunday shifts to 21:40
    /// Saturday and truncates to Saturday — the night it was actually part of.
    /// A cutoff of 0 means the column is already a business date and is passed
    /// through untouched.
    /// </summary>
    public static string BusinessDate(string column, int cutoffHour)
        => cutoffHour > 0
            ? $"CAST(DATEADD(HOUR, -{cutoffHour}, {column}) AS DATE)"
            : $"CAST({column} AS DATE)";

    /// <summary>
    /// The cutoff that may actually be applied to one feed.
    ///
    /// Zero whenever that feed's date column is already a rounded date — see
    /// AgentConfig.DateHasTime. Resolving this per feed rather than once for the
    /// whole agent is the difference between a correct trading day and every
    /// shift being filed one day early.
    /// </summary>
    public static int FeedCutoff(bool dateHasTime, int configuredCutoff)
        => dateHasTime ? configuredCutoff : 0;

    private static string Top(int? n) => n is null ? "" : $"TOP {n} ";

    /// <summary>Placeholder a table expression can use to filter on its own raw date column.</summary>
    public const string CutoffToken = "{cutoff}";

    /// <summary>
    /// A table expression may be a plain name, or a derived table with joins —
    /// FROM accepts both. Where it is a derived table over a large history
    /// table, the outer WHERE filters a CAST and cannot seek, so the expression
    /// may push the same cutoff inside via {cutoff}, against the indexed
    /// datetime column. See Setup/TwoTouchProfile.cs.
    /// </summary>
    private static string Source(string table, int lookbackDays, int cutoffHour)
        => table.Replace(CutoffToken, RawCutoff(lookbackDays, cutoffHour), StringComparison.Ordinal);

    // ── Query text ────────────────────────────────────────────────────────────
    // Public and static so the setup wizard proves a candidate mapping with the
    // EXACT query the service will run, rather than an approximation of it.
    // Identifiers are interpolated, which is safe here because they come from
    // config the wizard fills from INFORMATION_SCHEMA (bracket-quoted) — never
    // from request data.

    public static string ZReportSql(string table, ZReportColumns c, int lookbackDays, int cutoffHour, int? top = null) => $"""
        SELECT {Top(top)}{BusinessDate(c.Date, cutoffHour)} AS report_date,
               SUM({c.Sales})    AS total_sales,
               SUM({c.CcTips})   AS cc_tips,
               SUM({c.CashTips}) AS cash_tips
        FROM {Source(table, lookbackDays, cutoffHour)}
        WHERE {BusinessDate(c.Date, cutoffHour)} >= '{Cutoff(lookbackDays)}'
        GROUP BY {BusinessDate(c.Date, cutoffHour)}
        ORDER BY report_date DESC
        """;

    public static string EwReportSql(string table, EwReportColumns c, int lookbackDays, int cutoffHour, int? top = null) => $"""
        SELECT {Top(top)}{BusinessDate(c.Date, cutoffHour)}     AS shift_date,
               {c.EmployeeName}           AS employee_name,
               ISNULL({c.TotalSales}, 0)  AS total_sales,
               ISNULL({c.TipsPaidOut}, 0) AS tips_paid_out,
               ISNULL({c.RegularHours}, 0)  AS regular_hours,
               ISNULL({c.OvertimeHours}, 0) AS overtime_hours
        FROM {Source(table, lookbackDays, cutoffHour)}
        WHERE {BusinessDate(c.Date, cutoffHour)} >= '{Cutoff(lookbackDays)}'
        ORDER BY shift_date DESC, employee_name
        """;

    public static string ItemAuditSql(string table, ItemAuditColumns c, int lookbackDays, int cutoffHour, int? top = null) => $"""
        SELECT {Top(top)}{BusinessDate(c.Date, cutoffHour)} AS sale_date,
               {c.ItemName}           AS item_name,
               {c.Category}           AS category_name,
               SUM({c.QtySold})       AS qty_sold,
               SUM({c.NetSales})      AS net_sales
        FROM {Source(table, lookbackDays, cutoffHour)}
        WHERE {BusinessDate(c.Date, cutoffHour)} >= '{Cutoff(lookbackDays)}'
        GROUP BY {BusinessDate(c.Date, cutoffHour)}, {c.ItemName}, {c.Category}
        ORDER BY sale_date DESC, net_sales DESC
        """;

    private static decimal Dec(object v) => v is null or DBNull ? 0m : Convert.ToDecimal(v);
    private static string DateStr(object v) => Convert.ToDateTime(v).ToString("yyyy-MM-dd");
    private static string Str(object v) => v is null or DBNull ? string.Empty : Convert.ToString(v)?.Trim() ?? string.Empty;

    public virtual async Task<List<ZReportRow>> QueryZReportsAsync(SqlConnection conn, int lookbackDays, CancellationToken ct)
    {
        var sql = ZReportSql(_cfg.Tables.ZReport, _cfg.Columns.ZReport, lookbackDays,
            FeedCutoff(_cfg.Columns.ZReport.DateHasTime, _cfg.Sync.ResolvedCutoffHour));

        var rows = new List<ZReportRow>();
        await using var cmd = new SqlCommand(sql, conn);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            rows.Add(new ZReportRow(
                DateStr(r["report_date"]),
                Dec(r["total_sales"]),
                Dec(r["cc_tips"]),
                Dec(r["cash_tips"])));
        }
        return rows;
    }

    public virtual async Task<List<EwReportRow>> QueryEwReportsAsync(SqlConnection conn, int lookbackDays, CancellationToken ct)
    {
        var sql = EwReportSql(_cfg.Tables.EwReport, _cfg.Columns.EwReport, lookbackDays,
            FeedCutoff(_cfg.Columns.EwReport.DateHasTime, _cfg.Sync.ResolvedCutoffHour));

        var rows = new List<EwReportRow>();
        await using var cmd = new SqlCommand(sql, conn);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            var name = Str(r["employee_name"]);
            if (name.Length == 0) continue;
            rows.Add(new EwReportRow(
                DateStr(r["shift_date"]),
                name,
                Dec(r["total_sales"]),
                Dec(r["tips_paid_out"]),
                Dec(r["regular_hours"]),
                Dec(r["overtime_hours"])));
        }
        return rows;
    }

    public virtual async Task<List<ItemAuditRow>> QueryItemAuditAsync(SqlConnection conn, int lookbackDays, CancellationToken ct)
    {
        var sql = ItemAuditSql(_cfg.Tables.ItemAudit, _cfg.Columns.ItemAudit, lookbackDays,
            FeedCutoff(_cfg.Columns.ItemAudit.DateHasTime, _cfg.Sync.ResolvedCutoffHour));

        var rows = new List<ItemAuditRow>();
        await using var cmd = new SqlCommand(sql, conn);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            var item = Str(r["item_name"]);
            if (item.Length == 0) continue;
            rows.Add(new ItemAuditRow(
                DateStr(r["sale_date"]),
                item,
                Str(r["category_name"]),
                Dec(r["qty_sold"]),
                Dec(r["net_sales"])));
        }
        return rows;
    }
}
