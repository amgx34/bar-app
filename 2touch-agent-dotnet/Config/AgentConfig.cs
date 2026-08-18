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

    /// <summary>
    /// Whether <see cref="Date"/> carries a time component.
    ///
    /// The trading-day cutoff may only be applied to a column that still holds
    /// the hour something happened. Subtracting hours from a column that has
    /// already been rounded to a date moves EVERY row back a day:
    ///
    ///   CAST(DATEADD(HOUR, -4, '2026-08-16 00:00:00') AS DATE) = 2026-08-15
    ///
    /// Per-feed, not global: the three feeds map to different columns on
    /// different relations and are routinely different types. An earlier version
    /// decided this once from the SALES column and applied the answer to all
    /// three, which filed every shift a day early wherever the labour view
    /// exposed a plain date.
    ///
    /// Defaults to true so an existing installation behaves as it did until
    /// setup is re-run; the wizard sets it from INFORMATION_SCHEMA.
    /// </summary>
    public bool DateHasTime { get; set; } = true;
}

public sealed class EwReportColumns
{
    public string Date { get; set; } = "WorkDate";
    public string EmployeeName { get; set; } = "EmployeeName";
    public string TotalSales { get; set; } = "TotalSales";
    public string TipsPaidOut { get; set; } = "TipsPaidOut";
    public string RegularHours { get; set; } = "RegularHours";
    public string OvertimeHours { get; set; } = "OvertimeHours";

    /// <summary>
    /// Whether <see cref="Date"/> carries a time component.
    ///
    /// The trading-day cutoff may only be applied to a column that still holds
    /// the hour something happened. Subtracting hours from a column that has
    /// already been rounded to a date moves EVERY row back a day:
    ///
    ///   CAST(DATEADD(HOUR, -4, '2026-08-16 00:00:00') AS DATE) = 2026-08-15
    ///
    /// Per-feed, not global: the three feeds map to different columns on
    /// different relations and are routinely different types. An earlier version
    /// decided this once from the SALES column and applied the answer to all
    /// three, which filed every shift a day early wherever the labour view
    /// exposed a plain date.
    ///
    /// Defaults to true so an existing installation behaves as it did until
    /// setup is re-run; the wizard sets it from INFORMATION_SCHEMA.
    /// </summary>
    public bool DateHasTime { get; set; } = true;
}

public sealed class ItemAuditColumns
{
    public string Date { get; set; } = "SaleDate";
    public string ItemName { get; set; } = "ItemName";
    public string Category { get; set; } = "CategoryName";
    public string QtySold { get; set; } = "QuantitySold";
    public string NetSales { get; set; } = "NetSales";

    /// <summary>
    /// Whether <see cref="Date"/> carries a time component.
    ///
    /// The trading-day cutoff may only be applied to a column that still holds
    /// the hour something happened. Subtracting hours from a column that has
    /// already been rounded to a date moves EVERY row back a day:
    ///
    ///   CAST(DATEADD(HOUR, -4, '2026-08-16 00:00:00') AS DATE) = 2026-08-15
    ///
    /// Per-feed, not global: the three feeds map to different columns on
    /// different relations and are routinely different types. An earlier version
    /// decided this once from the SALES column and applied the answer to all
    /// three, which filed every shift a day early wherever the labour view
    /// exposed a plain date.
    ///
    /// Defaults to true so an existing installation behaves as it did until
    /// setup is re-run; the wizard sets it from INFORMATION_SCHEMA.
    /// </summary>
    public bool DateHasTime { get; set; } = true;
}

public sealed class SyncConfig
{
    public int LookbackDays { get; set; } = 2;
    public int IntervalMinutes { get; set; } = 5;

    /// <summary>
    /// Hour that separates one trading day from the next, 0-12. A bar open
    /// 17:00-03:00 trades across two calendar dates; without this, the hours
    /// after midnight are filed under the following day and sales show up on
    /// days the bar was closed.
    ///
    /// The agent subtracts this many hours from each row's timestamp before
    /// truncating it to a date, so everything before the cutoff belongs to the
    /// night that started the evening before. 4 is after last call at nearly
    /// every venue and before any opening time, so no real session straddles it.
    ///
    /// Set to <c>0</c> ONLY when the configured date column already holds a true
    /// business date rather than a raw timestamp — shifting an already-correct
    /// date would move every night back by one day. The setup wizard detects
    /// which kind of column was mapped and sets this accordingly.
    /// </summary>
    public int BusinessDayCutoffHour { get; set; } = DefaultBusinessDayCutoffHour;

    public const int DefaultBusinessDayCutoffHour = 4;

    /// <summary>Clamped accessor — config files are hand-edited in the field.</summary>
    public int ResolvedCutoffHour =>
        BusinessDayCutoffHour is >= 0 and <= 12
            ? BusinessDayCutoffHour
            : DefaultBusinessDayCutoffHour;
}
