using RailAgent.Config;

namespace RailAgent.Setup;

/// <summary>
/// A hand-written mapping for the real TwoTouch schema, used when the wizard
/// recognises one.
///
/// WHY THIS EXISTS. Generic discovery picks ONE relation per feed and maps its
/// columns. A real TwoTouch database cannot satisfy two of the three feeds that
/// way, because the values are split across tables:
///
///   • Item Audit — dbo.tblSalesHist holds the quantity and the date, but the
///     item and category are INT foreign keys (fkItemID, fkCategory). The names
///     live in tblItem/tblCategory, and the amount lives in tblSalesHistRptCtg,
///     joined on uKeyID. Four relations.
///   • EW Report — dbo.tblTimeClockNew holds the hours, but the employee is
///     reached through tblUserJobs → tblUser, and sales/tips through tblTips.
///     Four relations.
///   • Z Report — sales are per ticket in tblSalesHdrHist; the cash/credit tip
///     split is per payment in tblSalesHistPmnts (lPaymentType 0 = cash,
///     2 = credit, 7 = credit refund). Plus the tblSalesDaily* pair, which hold
///     the business day that has not been Z'd out yet. Four relations.
///
/// So the profile emits a derived table — a full SELECT with its joins — into
/// Tables.X. SqlReader interpolates that straight into FROM, and the column
/// aliases become Columns.X. No new machinery, no views created in the bar's
/// database, and nothing beyond db_datareader.
///
/// Every leg filters on its own indexed datetime column via {cutoff} rather
/// than letting the outer query filter a computed one — tblSalesHist is the
/// largest table on a POS box and this is a 5-minute loop.
/// </summary>
public static class TwoTouchProfile
{
    /// <summary>2Touch payment types, read out of the shipped stored procedures.</summary>
    private const int Cash = 0, CreditPayment = 2, CreditRefund = 7;

    // NOTE ON DATES — these feeds deliberately expose the RAW timestamp
    // (dtmTicketDate, dtmPmntDate, dtmSalesDate) rather than casting it to a
    // date here. 2Touch has no business-date column; it only records when a
    // ticket was rung. Truncating at this level filed everything after midnight
    // under the next calendar day, so a bar open 17:00-03:00 showed sales on
    // days it was closed.
    //
    // SqlReader.BusinessDate() applies Sync.BusinessDayCutoffHour to whatever
    // column is mapped, so the trading-day rule lives in exactly one place.
    // Casting here again would hide the timestamp from it and reintroduce the
    // bug — SqlReaderBusinessDateTests guards against that.

    public sealed record ProfileFeed(
        string FeedKey,
        string Source,
        string[] RequiredRelations,
        string Explanation);

    public static readonly ProfileFeed ZReport = new(
        FeedSpecs.ZReportKey,
        $$"""
        (
            SELECT h.dtmTicketDate          AS BusinessDate,
                   h.fNetAmt                AS NetSales,
                   CAST(0 AS FLOAT)         AS CcTips,
                   CAST(0 AS FLOAT)         AS CashTips,
                   CAST(0 AS FLOAT)         AS CashSales,
                   CAST(0 AS FLOAT)         AS CardSales
            FROM dbo.tblSalesHdrHist h
            WHERE h.dtmTicketDate >= '{cutoff}'
            UNION ALL
            SELECT h.dtmTicketDate, h.fNetAmt, 0, 0, 0, 0
            FROM dbo.tblSalesDailyHdr h
            WHERE h.dtmTicketDate >= '{cutoff}'
            UNION ALL
            SELECT p.dtmPmntDate, 0,
                   CASE WHEN p.lPaymentType IN ({{CreditPayment}}, {{CreditRefund}}) THEN ISNULL(p.fTipAmt, 0) ELSE 0 END,
                   CASE WHEN p.lPaymentType = {{Cash}}                               THEN ISNULL(p.fTipAmt, 0) ELSE 0 END,
                   -- Cash actually kept: tendered less any change handed back.
                   -- fAmount alone is what the customer put on the bar, so a $20
                   -- note against a $12 tab would overstate takings by the $8.
                   CASE WHEN p.lPaymentType = {{Cash}}
                        THEN ISNULL(p.fAmount, 0) - ISNULL(p.fCashPaidBack, 0) ELSE 0 END,
                   CASE WHEN p.lPaymentType IN ({{CreditPayment}}, {{CreditRefund}})
                        THEN ISNULL(p.fAmount, 0) ELSE 0 END
            FROM dbo.tblSalesHistPmnts p
            WHERE p.dtmPmntDate >= '{cutoff}'
            UNION ALL
            SELECT p.dtmPmntDate, 0,
                   CASE WHEN p.lPaymentType IN ({{CreditPayment}}, {{CreditRefund}}) THEN ISNULL(p.fTipAmt, 0) ELSE 0 END,
                   CASE WHEN p.lPaymentType = {{Cash}}                               THEN ISNULL(p.fTipAmt, 0) ELSE 0 END,
                   CASE WHEN p.lPaymentType = {{Cash}}
                        THEN ISNULL(p.fAmount, 0) - ISNULL(p.fCashPaidBack, 0) ELSE 0 END,
                   CASE WHEN p.lPaymentType IN ({{CreditPayment}}, {{CreditRefund}})
                        THEN ISNULL(p.fAmount, 0) ELSE 0 END
            FROM dbo.tblSalesDailyPmnts p
            WHERE p.dtmPmntDate >= '{cutoff}'
        ) AS rail_z
        """,
        ["tblSalesHdrHist", "tblSalesDailyHdr", "tblSalesHistPmnts", "tblSalesDailyPmnts"],
        "net sales per ticket, plus the cash/credit split of both tips and takings per payment");

    public static readonly ProfileFeed EwReport = new(
        FeedSpecs.EwReportKey,
        """
        (
            SELECT ISNULL(tc.dtmReportIn, tc.dtmClockIn)                                    AS ShiftDate,
                   LTRIM(RTRIM(ISNULL(u.szFirstName, '') + ' ' + ISNULL(u.szLastName, ''))) AS EmployeeName,
                   ISNULL(t.fTotalSales, 0)                                                 AS TotalSales,
                   ISNULL(t.fTotalTips, 0)                                                  AS TipsPaidOut,
                   ISNULL(tc.fRegHoursWorked, 0)                                            AS RegularHours,
                   ISNULL(tc.fOverTimeHoursWorked, 0)                                       AS OvertimeHours
            FROM dbo.tblTimeClockNew tc
            JOIN dbo.tblUserJobs uj ON uj.pkID = tc.fkUserJobID
            JOIN dbo.tblUser     u  ON u.pkID  = uj.fkUserID
            LEFT JOIN dbo.tblTips t ON t.fkTimeClockID = tc.pkID
            WHERE ISNULL(tc.blnDeleted, 0) = 0
              AND ISNULL(tc.dtmReportIn, tc.dtmClockIn) >= '{cutoff}'
        ) AS rail_ew
        """,
        ["tblTimeClockNew", "tblUserJobs", "tblUser", "tblTips"],
        "clocked hours joined to the employee, with declared sales and tips");

    public static readonly ProfileFeed ItemAudit = new(
        FeedSpecs.ItemAuditKey,
        """
        (
            SELECT d.dtmSalesDate               AS SaleDate,
                   i.szDescription              AS ItemName,
                   ISNULL(c.szDescription, '')  AS CategoryName,
                   ISNULL(d.fQty, 0)            AS QtySold,
                   ISNULL(r.fNetAmt, 0)         AS NetSales
            FROM dbo.tblSalesHist d
            JOIN dbo.tblSalesHistRptCtg r ON r.uKeyID = d.uKeyID
            JOIN dbo.tblItem            i ON i.pkID   = d.fkItemID
            LEFT JOIN dbo.tblCategory   c ON c.pkID   = i.fkCategory
            WHERE d.dtmSalesDate >= '{cutoff}'
              AND (d.szRefundFlg IS NULL OR d.szRefundFlg = 'S')
            UNION ALL
            SELECT d.dtmSalesDate, i.szDescription, ISNULL(c.szDescription, ''),
                   ISNULL(d.fQty, 0), ISNULL(r.fNetAmt, 0)
            FROM dbo.tblSalesDailyDtl d
            JOIN dbo.tblSalesDailyRptCtg r ON r.uKeyID = d.uKeyID
            JOIN dbo.tblItem             i ON i.pkID   = d.fkItemID
            LEFT JOIN dbo.tblCategory    c ON c.pkID   = i.fkCategory
            WHERE d.dtmSalesDate >= '{cutoff}'
              AND (d.szRefundFlg IS NULL OR d.szRefundFlg = 'S')
        ) AS rail_audit
        """,
        ["tblSalesHist", "tblSalesHistRptCtg", "tblSalesDailyDtl", "tblSalesDailyRptCtg", "tblItem", "tblCategory"],
        "sale lines joined to the item catalogue for names, and to RptCtg for amounts");

    public static readonly ProfileFeed HourlySales = new(
        FeedSpecs.HourlySalesKey,
        """
        (
            SELECT h.dtmTicketDate    AS BusinessDate,
                   h.fNetAmt          AS NetSales,
                   h.szTicketNo       AS TicketNo,
                   ISNULL(h.fTipAmt, 0) AS Tips
            FROM dbo.tblSalesHdrHist h
            WHERE h.dtmTicketDate >= '{cutoff}'
            UNION ALL
            SELECT h.dtmTicketDate,
                   h.fNetAmt,
                   h.szTicketNo,
                   ISNULL(h.fTipAmt, 0)
            FROM dbo.tblSalesDailyHdr h
            WHERE h.dtmTicketDate >= '{cutoff}'
        ) AS rail_hourly
        """,
        ["tblSalesHdrHist", "tblSalesDailyHdr"],
        "Trade by hour of the night, so the Sales screen can show when the rush lands.");

    public static readonly ProfileFeed ServerSales = new(
        FeedSpecs.ServerSalesKey,
        """
        (
            SELECT h.dtmTicketDate                                                       AS BusinessDate,
                   LTRIM(RTRIM(ISNULL(u.szFirstName, '') + ' ' + ISNULL(u.szLastName, ''))) AS ServerName,
                   h.fNetAmt                                                              AS NetSales,
                   h.szTicketNo                                                           AS TicketNo,
                   ISNULL(h.fTipAmt, 0)                                                   AS Tips
            FROM dbo.tblSalesHdrHist h
            JOIN dbo.tblUser u ON u.pkID = h.fkUserID
            WHERE h.dtmTicketDate >= '{cutoff}'
        ) AS rail_server
        """,
        ["tblSalesHdrHist", "tblUser"],
        "Trade by whoever rang it up.");

    public static readonly ProfileFeed[] All = [ZReport, EwReport, ItemAudit, HourlySales, ServerSales];

    /// <summary>The feeds this database can supply through the built-in mapping.</summary>
    public static IReadOnlyList<ProfileFeed> Match(IEnumerable<RelationInfo> relations)
    {
        var present = relations
            .Select(r => r.Name)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        return All.Where(f => f.RequiredRelations.All(present.Contains)).ToList();
    }

    /// <summary>Names the profile expects but this database does not have.</summary>
    public static IReadOnlyList<string> MissingRelations(ProfileFeed feed, IEnumerable<RelationInfo> relations)
    {
        var present = relations.Select(r => r.Name).ToHashSet(StringComparer.OrdinalIgnoreCase);
        return feed.RequiredRelations.Where(r => !present.Contains(r)).ToList();
    }

    /// <summary>Column aliases each derived table exposes, keyed to the config properties.</summary>
    public static void Apply(ProfileFeed feed, AgentConfig cfg)
    {
        switch (feed.FeedKey)
        {
            case FeedSpecs.ZReportKey:
                cfg.Tables.ZReport = feed.Source;
                cfg.Columns.ZReport = new ZReportColumns
                {
                    Date = "[BusinessDate]", Sales = "[NetSales]", CcTips = "[CcTips]", CashTips = "[CashTips]",
                    CashSales = "[CashSales]", CardSales = "[CardSales]",
                };
                break;

            case FeedSpecs.EwReportKey:
                cfg.Tables.EwReport = feed.Source;
                cfg.Columns.EwReport = new EwReportColumns
                {
                    Date = "[ShiftDate]", EmployeeName = "[EmployeeName]", TotalSales = "[TotalSales]",
                    TipsPaidOut = "[TipsPaidOut]", RegularHours = "[RegularHours]", OvertimeHours = "[OvertimeHours]",
                };
                break;

            case FeedSpecs.ItemAuditKey:
                cfg.Tables.ItemAudit = feed.Source;
                cfg.Columns.ItemAudit = new ItemAuditColumns
                {
                    Date = "[SaleDate]", ItemName = "[ItemName]", Category = "[CategoryName]",
                    QtySold = "[QtySold]", NetSales = "[NetSales]",
                };
                break;

            case FeedSpecs.HourlySalesKey:
                cfg.Tables.HourlySales = feed.Source;
                cfg.Columns.HourlySales = new HourlySalesColumns
                {
                    Date = "[BusinessDate]", Sales = "[NetSales]", Tips = "[Tips]", TicketNo = "[TicketNo]",
                };
                break;

            case FeedSpecs.ServerSalesKey:
                cfg.Tables.ServerSales = feed.Source;
                cfg.Columns.ServerSales = new ServerSalesColumns
                {
                    Date = "[BusinessDate]", ServerName = "[ServerName]", Sales = "[NetSales]",
                    Tips = "[Tips]", TicketNo = "[TicketNo]",
                };
                break;
        }
    }
}
