namespace RailAgent.Config;

/// <summary>
/// Strongly-typed agent configuration, bound from the "Agent" section of
/// appsettings.json + appsettings.local.json (secrets live in the .local file).
/// </summary>
public sealed class AgentConfig
{
    public SqlConfig Sql { get; set; } = new();
    public RailConfig Rail { get; set; } = new();
    public TablesConfig Tables { get; set; } = new();
    public ColumnsConfig Columns { get; set; } = new();
    public SyncConfig Sync { get; set; } = new();
}

public sealed class SqlConfig
{
    /// <summary>
    /// Local server reference. Because the agent runs ON the POS box, a local
    /// connection negotiates the shared-memory protocol first — no TCP port and
    /// no SQL Server Browser required.
    ///   Default instance : "(local)" or "."
    ///   Named instance   : ".\\SQLEXPRESS" (escape the backslash in JSON: ".\\SQLEXPRESS")
    /// </summary>
    public string Server { get; set; } = "(local)";

    public string Database { get; set; } = "TwoTouch";

    /// <summary>SQL login. Leave empty/null to use Windows Integrated auth (the service account).</summary>
    public string? User { get; set; } = "BarAppRead";
    public string? Password { get; set; }

    public int ConnectTimeoutSeconds { get; set; } = 15;

    /// <summary>
    /// Optional protocol prefix prepended to Server. "lpc:" forces shared memory,
    /// "np:" named pipes, "tcp:" TCP. Empty lets the client pick (shared memory
    /// first for local connections). Set "lpc:" to be explicit and never touch a port.
    /// </summary>
    public string? Protocol { get; set; } = "lpc:";
}

public sealed class RailConfig
{
    /// <summary>Base URL of the Rail app, no trailing path — e.g. https://bar-app-drab.vercel.app</summary>
    public string ApiBaseUrl { get; set; } = "https://bar-app-drab.vercel.app";

    /// <summary>Routes ingested data to the correct bar. Copy from Rail → Settings → POS Integration → 2TouchPOS.</summary>
    public string OrgId { get; set; } = "REPLACE_WITH_ORG_ID_FROM_RAIL_SETTINGS";

    /// <summary>Per-org agent token used as the HMAC key. Copy from the same Rail settings page.</summary>
    public string AuthToken { get; set; } = "REPLACE_WITH_AGENT_TOKEN_FROM_RAIL_SETTINGS";
}

public sealed class TablesConfig
{
    public string ZReport { get; set; } = "vwZReport";
    public string EwReport { get; set; } = "vwServerSales";
    public string ItemAudit { get; set; } = "vwItemAudit";
}

public sealed class ColumnsConfig
{
    public ZReportColumns ZReport { get; set; } = new();
    public EwReportColumns EwReport { get; set; } = new();
    public ItemAuditColumns ItemAudit { get; set; } = new();
}

public sealed class ZReportColumns
{
    public string Date { get; set; } = "BusinessDate";
    public string Sales { get; set; } = "NetSales";
    public string CcTips { get; set; } = "CreditCardTips";
    public string CashTips { get; set; } = "CashTips";
}

public sealed class EwReportColumns
{
    public string Date { get; set; } = "WorkDate";
    public string EmployeeName { get; set; } = "EmployeeName";
    public string TotalSales { get; set; } = "TotalSales";
    public string TipsPaidOut { get; set; } = "TipsPaidOut";
    public string RegularHours { get; set; } = "RegularHours";
    public string OvertimeHours { get; set; } = "OvertimeHours";
}

public sealed class ItemAuditColumns
{
    public string Date { get; set; } = "SaleDate";
    public string ItemName { get; set; } = "ItemName";
    public string Category { get; set; } = "CategoryName";
    public string QtySold { get; set; } = "QuantitySold";
    public string NetSales { get; set; } = "NetSales";
}

public sealed class SyncConfig
{
    public int LookbackDays { get; set; } = 2;
    public int IntervalMinutes { get; set; } = 5;
}
