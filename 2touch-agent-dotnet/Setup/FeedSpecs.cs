namespace RailAgent.Setup;

/// <summary>
/// What each feed needs, and what those columns tend to be called. Field keys
/// mirror the properties of <c>Config.ZReportColumns</c> / <c>EwReportColumns</c> /
/// <c>ItemAuditColumns</c>, which is how a confirmed mapping becomes config.
///
/// The synonym lists are generic heuristics. No live TwoTouch box was available
/// when these were written, so stage 12 of the wizard prints the confirmed
/// mapping as JSON — real findings belong back here as seed synonyms.
/// </summary>
public static class FeedSpecs
{
    public const string ZReportKey   = "ZReport";
    public const string EwReportKey  = "EwReport";
    public const string ItemAuditKey = "ItemAudit";

    private static readonly string[] DateSynonyms =
        ["businessdate", "reportdate", "saledate", "workdate", "shiftdate", "closedate", "date", "trandate", "transactiondate", "daydate", "postdate"];

    private static readonly string[] DateKeywords = ["date", "day", "business"];

    public static readonly FeedSpec ZReport = new(
        ZReportKey,
        "Z Report",
        NameAffinity: ["z", "report", "daily", "close"],
        Fields:
        [
            new FieldSpec("Date", "date", ColumnKind.Date, DateSynonyms, DateKeywords),
            new FieldSpec("Sales", "net sales", ColumnKind.Numeric,
                ["netsales", "totalsales", "sales", "grosssales", "salestotal", "netsalestotal", "nettotal"],
                ["netsale", "sale", "revenue", "total"]),
            new FieldSpec("CcTips", "credit-card tips", ColumnKind.Numeric,
                ["creditcardtips", "cctips", "chargetips", "credittips", "cardtips", "ccgratuity"],
                ["cctip", "credittip", "cardtip", "chargetip"]),
            new FieldSpec("CashTips", "cash tips", ColumnKind.Numeric,
                ["cashtips", "cashgratuity", "cashtip", "declaredcashtips", "declaredtips"],
                ["cashtip", "declaredtip"]),
        ]);

    public static readonly FeedSpec EwReport = new(
        EwReportKey,
        "EW Report",
        NameAffinity: ["employee", "server", "shift", "work", "labor", "labour", "emp"],
        Fields:
        [
            new FieldSpec("Date", "date", ColumnKind.Date, DateSynonyms, DateKeywords),
            new FieldSpec("EmployeeName", "employee name", ColumnKind.Text,
                ["employeename", "servername", "empname", "staffname", "name", "fullname", "displayname", "username"],
                ["employee", "server", "staff", "name"]),
            new FieldSpec("TotalSales", "total sales", ColumnKind.Numeric,
                ["totalsales", "netsales", "sales", "grosssales", "salestotal", "serversales"],
                ["sale", "revenue"]),
            new FieldSpec("TipsPaidOut", "tips paid out", ColumnKind.Numeric,
                ["tipspaidout", "tipspaid", "tipsout", "paidouttips", "tipouts", "tips", "gratuity"],
                ["tip", "gratuity", "paidout"]),
            new FieldSpec("RegularHours", "regular hours", ColumnKind.Numeric,
                ["regularhours", "reghours", "hours", "hoursworked", "workedhours", "straighthours"],
                ["reghour", "regularhour", "hour"]),
            new FieldSpec("OvertimeHours", "overtime hours", ColumnKind.Numeric,
                ["overtimehours", "othours", "overtime", "otthours", "overtimehrs"],
                ["overtime", "othour"]),
        ]);

    public static readonly FeedSpec ItemAudit = new(
        ItemAuditKey,
        "Item Audit",
        NameAffinity: ["item", "product", "menu", "audit", "inventory"],
        Fields:
        [
            new FieldSpec("Date", "date", ColumnKind.Date, DateSynonyms, DateKeywords),
            new FieldSpec("ItemName", "item name", ColumnKind.Text,
                ["itemname", "productname", "menuitem", "menuitemname", "description", "itemdescription", "item", "name"],
                ["item", "product", "menu", "descr"]),
            new FieldSpec("Category", "category", ColumnKind.Text,
                ["categoryname", "category", "groupname", "itemgroup", "department", "deptname", "class", "majorgroup"],
                ["categ", "group", "dept", "class"]),
            new FieldSpec("QtySold", "quantity sold", ColumnKind.Numeric,
                ["quantitysold", "qtysold", "quantity", "qty", "unitssold", "soldqty", "count"],
                ["qty", "quantity", "units", "sold"]),
            new FieldSpec("NetSales", "net sales", ColumnKind.Numeric,
                ["netsales", "totalsales", "extendedprice", "sales", "amount", "salesamount", "extprice"],
                ["netsale", "sale", "amount", "price", "revenue"]),
        ]);

    public static readonly FeedSpec[] All = [ZReport, EwReport, ItemAudit];
}
