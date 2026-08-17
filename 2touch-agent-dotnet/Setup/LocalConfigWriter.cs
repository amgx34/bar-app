using System.Security.AccessControl;
using System.Security.Principal;
using System.Text.Json;
using System.Text.Json.Nodes;
using RailAgent.Config;

namespace RailAgent.Setup;

/// <summary>
/// Writes <c>appsettings.local.json</c> — the only file the wizard leaves behind
/// besides the exe. It is ACL'd to Administrators and SYSTEM because on the
/// fallback path it holds a SQL password.
/// </summary>
public static class LocalConfigWriter
{
    public const string FileName = "appsettings.local.json";

    private static readonly JsonSerializerOptions Pretty = new() { WriteIndented = true };

    /// <summary>
    /// The JSON body. Table and column names arrive already bracket-quoted from
    /// discovery; an empty table name round-trips as an empty string and is read
    /// back as a skipped feed.
    /// </summary>
    public static string Render(AgentConfig cfg)
    {
        var agent = new JsonObject
        {
            ["Sql"] = new JsonObject
            {
                ["Server"]                = cfg.Sql.Server,
                ["Database"]              = cfg.Sql.Database,
                ["User"]                  = cfg.Sql.User ?? "",
                ["Password"]              = cfg.Sql.Password ?? "",
                ["ConnectTimeoutSeconds"] = cfg.Sql.ConnectTimeoutSeconds,
                ["Protocol"]              = cfg.Sql.Protocol ?? "",
            },
            ["Rail"] = new JsonObject
            {
                ["ApiBaseUrl"] = cfg.Rail.ApiBaseUrl,
                ["OrgId"]      = cfg.Rail.OrgId,
                ["AuthToken"]  = cfg.Rail.AuthToken,
            },
            ["Tables"] = new JsonObject
            {
                ["ZReport"]   = cfg.Tables.ZReport ?? "",
                ["EwReport"]  = cfg.Tables.EwReport ?? "",
                ["ItemAudit"] = cfg.Tables.ItemAudit ?? "",
            },
            ["Columns"] = new JsonObject
            {
                ["ZReport"] = new JsonObject
                {
                    ["Date"]     = cfg.Columns.ZReport.Date,
                    ["Sales"]    = cfg.Columns.ZReport.Sales,
                    ["CcTips"]   = cfg.Columns.ZReport.CcTips,
                    ["CashTips"] = cfg.Columns.ZReport.CashTips,
                },
                ["EwReport"] = new JsonObject
                {
                    ["Date"]          = cfg.Columns.EwReport.Date,
                    ["EmployeeName"]  = cfg.Columns.EwReport.EmployeeName,
                    ["TotalSales"]    = cfg.Columns.EwReport.TotalSales,
                    ["TipsPaidOut"]   = cfg.Columns.EwReport.TipsPaidOut,
                    ["RegularHours"]  = cfg.Columns.EwReport.RegularHours,
                    ["OvertimeHours"] = cfg.Columns.EwReport.OvertimeHours,
                },
                ["ItemAudit"] = new JsonObject
                {
                    ["Date"]     = cfg.Columns.ItemAudit.Date,
                    ["ItemName"] = cfg.Columns.ItemAudit.ItemName,
                    ["Category"] = cfg.Columns.ItemAudit.Category,
                    ["QtySold"]  = cfg.Columns.ItemAudit.QtySold,
                    ["NetSales"] = cfg.Columns.ItemAudit.NetSales,
                },
            },
            ["Sync"] = new JsonObject
            {
                ["LookbackDays"]    = cfg.Sync.LookbackDays,
                ["IntervalMinutes"] = cfg.Sync.IntervalMinutes,
                // Resolved, not raw: setup decides this from the mapped column's
                // type, and omitting it here would silently fall back to the
                // default on a schema where no cutoff should be applied at all.
                ["BusinessDayCutoffHour"] = cfg.Sync.ResolvedCutoffHour,
            },
        };

        return new JsonObject { ["Agent"] = agent }.ToJsonString(Pretty) + Environment.NewLine;
    }

    /// <summary>Just the schema half, for the wizard's closing summary.</summary>
    public static string RenderSchema(AgentConfig cfg)
    {
        var full = JsonNode.Parse(Render(cfg))!["Agent"]!.AsObject();
        return new JsonObject
        {
            ["Tables"]  = full["Tables"]!.DeepClone(),
            ["Columns"] = full["Columns"]!.DeepClone(),
        }.ToJsonString(Pretty);
    }

    public static void Write(string directory, AgentConfig cfg)
    {
        Directory.CreateDirectory(directory);
        var path = Path.Combine(directory, FileName);
        File.WriteAllText(path, Render(cfg));
        Protect(path);
    }

    /// <summary>
    /// Replaces inherited permissions with Administrators + SYSTEM full control.
    /// The service runs as LocalSystem, so SYSTEM must keep read access.
    /// </summary>
    public static void Protect(string path)
    {
        var file = new FileInfo(path);
        var acl = new FileSecurity();

        acl.SetAccessRuleProtection(isProtected: true, preserveInheritance: false);

        foreach (var sid in new[] { WellKnownSidType.BuiltinAdministratorsSid, WellKnownSidType.LocalSystemSid })
        {
            acl.AddAccessRule(new FileSystemAccessRule(
                new SecurityIdentifier(sid, null),
                FileSystemRights.FullControl,
                AccessControlType.Allow));
        }

        file.SetAccessControl(acl);
    }
}
