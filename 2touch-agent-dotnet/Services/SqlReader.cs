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
public sealed class SqlReader(IOptions<AgentConfig> cfg)
{
    private readonly AgentConfig _cfg = cfg.Value;

    private string BuildConnectionString()
    {
        var s = _cfg.Sql;
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

    public async Task<SqlConnection> OpenAsync(CancellationToken ct)
    {
        var conn = new SqlConnection(BuildConnectionString());
        await conn.OpenAsync(ct);
        return conn;
    }

    private static string Cutoff(int lookbackDays)
        => DateTime.Today.AddDays(-Math.Abs(lookbackDays)).ToString("yyyy-MM-dd");

    private static decimal Dec(object v) => v is null or DBNull ? 0m : Convert.ToDecimal(v);
    private static string DateStr(object v) => Convert.ToDateTime(v).ToString("yyyy-MM-dd");
    private static string Str(object v) => v is null or DBNull ? string.Empty : Convert.ToString(v)?.Trim() ?? string.Empty;

    public async Task<List<ZReportRow>> QueryZReportsAsync(SqlConnection conn, int lookbackDays, CancellationToken ct)
    {
        var t = _cfg.Tables.ZReport;
        var c = _cfg.Columns.ZReport;
        var sql = $"""
            SELECT CAST({c.Date} AS DATE) AS report_date,
                   SUM({c.Sales})    AS total_sales,
                   SUM({c.CcTips})   AS cc_tips,
                   SUM({c.CashTips}) AS cash_tips
            FROM {t}
            WHERE CAST({c.Date} AS DATE) >= '{Cutoff(lookbackDays)}'
            GROUP BY CAST({c.Date} AS DATE)
            ORDER BY report_date DESC
            """;

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

    public async Task<List<EwReportRow>> QueryEwReportsAsync(SqlConnection conn, int lookbackDays, CancellationToken ct)
    {
        var t = _cfg.Tables.EwReport;
        var c = _cfg.Columns.EwReport;
        var sql = $"""
            SELECT CAST({c.Date} AS DATE)     AS shift_date,
                   {c.EmployeeName}           AS employee_name,
                   ISNULL({c.TotalSales}, 0)  AS total_sales,
                   ISNULL({c.TipsPaidOut}, 0) AS tips_paid_out,
                   ISNULL({c.RegularHours}, 0)  AS regular_hours,
                   ISNULL({c.OvertimeHours}, 0) AS overtime_hours
            FROM {t}
            WHERE CAST({c.Date} AS DATE) >= '{Cutoff(lookbackDays)}'
            ORDER BY shift_date DESC, employee_name
            """;

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

    public async Task<List<ItemAuditRow>> QueryItemAuditAsync(SqlConnection conn, int lookbackDays, CancellationToken ct)
    {
        var t = _cfg.Tables.ItemAudit;
        var c = _cfg.Columns.ItemAudit;
        var sql = $"""
            SELECT CAST({c.Date} AS DATE) AS sale_date,
                   {c.ItemName}           AS item_name,
                   {c.Category}           AS category_name,
                   SUM({c.QtySold})       AS qty_sold,
                   SUM({c.NetSales})      AS net_sales
            FROM {t}
            WHERE CAST({c.Date} AS DATE) >= '{Cutoff(lookbackDays)}'
            GROUP BY CAST({c.Date} AS DATE), {c.ItemName}, {c.Category}
            ORDER BY sale_date DESC, net_sales DESC
            """;

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
