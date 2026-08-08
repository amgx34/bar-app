using RailAgent.Setup;
using Xunit;

namespace RailAgent.Tests;

/// <summary>
/// The scorer only has to put the right relation in the operator's top five —
/// but the failure that matters is proposing a relation whose query cannot run,
/// so the disqualification rules get the most attention here.
/// </summary>
public class SchemaScorerTests
{
    private static RelationInfo Relation(string name, params (string Name, string Type)[] columns)
        => new("dbo", name, columns.Select(c => new ColumnInfo(c.Name, c.Type)).ToList());

    private static RelationInfo GoodZReport(string name) => Relation(name,
        ("BusinessDate", "datetime"),
        ("NetSales", "decimal"),
        ("CreditCardTips", "decimal"),
        ("CashTips", "decimal"));

    [Fact]
    public void RanksTheObviouslyNamedRelationFirst()
    {
        var relations = new[]
        {
            Relation("Widgets", ("Created", "datetime"), ("Amount", "decimal"), ("Fee", "decimal"), ("Rebate", "decimal")),
            GoodZReport("vwZReport"),
            Relation("Ledger", ("PostDate", "datetime"), ("Value", "decimal"), ("Charge", "decimal"), ("Refund", "decimal")),
        };

        var ranked = SchemaScorer.Rank(FeedSpecs.ZReport, relations);

        Assert.Equal("vwZReport", ranked[0].Relation.Name);
    }

    [Fact]
    public void FindsARelationItHasNeverSeenNamed()
    {
        // The point of discovery: unlike names, recognisable columns.
        var relations = new[]
        {
            Relation("tblDayClose",
                ("CloseDate", "datetime"),
                ("NetSales", "money"),
                ("ChargeTips", "money"),
                ("CashTips", "money")),
        };

        var ranked = SchemaScorer.Rank(FeedSpecs.ZReport, relations);

        Assert.Single(ranked);
        Assert.Equal("CloseDate", ranked[0].ColumnFor("Date").Name);
        Assert.Equal("ChargeTips", ranked[0].ColumnFor("CcTips").Name);
    }

    [Fact]
    public void DisqualifiesARelationWhoseDateColumnIsText()
    {
        // An nvarchar date cannot be CAST reliably, so this is not a worse
        // candidate — it is not a candidate.
        var relation = Relation("vwZReport",
            ("BusinessDate", "nvarchar"),
            ("NetSales", "decimal"),
            ("CreditCardTips", "decimal"),
            ("CashTips", "decimal"));

        Assert.Empty(SchemaScorer.Rank(FeedSpecs.ZReport, [relation]));
    }

    [Fact]
    public void DisqualifiesARelationWhoseAmountColumnIsText()
    {
        var relation = Relation("vwZReport",
            ("BusinessDate", "datetime"),
            ("NetSales", "nvarchar"),
            ("CreditCardTips", "nvarchar"),
            ("CashTips", "nvarchar"));

        Assert.Empty(SchemaScorer.Rank(FeedSpecs.ZReport, [relation]));
    }

    [Fact]
    public void DropsARelationWithNoColumnOfTheRequiredKind()
    {
        var relation = Relation("vwZReport",
            ("BusinessDate", "datetime"),
            ("Notes", "nvarchar"));   // nothing numeric at all

        Assert.Empty(SchemaScorer.Rank(FeedSpecs.ZReport, [relation]));
    }

    [Fact]
    public void ARelationMissingATipColumnSurvivesButRanksLower()
    {
        // Type compatibility is the only hard gate, so a relation with one numeric
        // column will happily offer it for all three amounts. That mapping is
        // nonsense, and it ranks below a real match — the operator sees both,
        // and the wizard flags the duplicate before it is accepted.
        var incomplete = Relation("ZSummary",
            ("BusinessDate", "datetime"),
            ("NetSales", "decimal"));

        var ranked = SchemaScorer.Rank(FeedSpecs.ZReport, [incomplete, GoodZReport("vwZReport")]);

        Assert.Equal("vwZReport", ranked[0].Relation.Name);
        Assert.Equal("ZSummary", ranked[1].Relation.Name);
        Assert.True(ranked[0].Score > ranked[1].Score);
    }

    [Fact]
    public void DuplicateColumnAssignmentsAreDetectable()
    {
        var match = SchemaScorer.Score(FeedSpecs.ZReport, Relation("ZSummary",
            ("BusinessDate", "datetime"),
            ("NetSales", "decimal")));

        Assert.NotNull(match);
        Assert.Equal(["NetSales"], match!.DuplicatedColumns());
    }

    [Fact]
    public void NameAffinityBreaksATieBetweenIdenticalRelations()
    {
        // Same columns, so the column scores are equal; only the relation name
        // differs, and only one of them looks like a Z report.
        var neutral  = GoodZReport("Blob");
        var affinity = GoodZReport("DailyClose");

        var ranked = SchemaScorer.Rank(FeedSpecs.ZReport, [neutral, affinity]);

        Assert.Equal("DailyClose", ranked[0].Relation.Name);
        Assert.Equal(SchemaScorer.AffinityBonus, ranked[0].Score - ranked[1].Score);
    }

    [Fact]
    public void ExactSynonymOutranksASubstringKeyword()
    {
        var relation = Relation("Sales",
            ("BusinessDate", "datetime"),
            ("SalesSubtotal", "decimal"),   // keyword hit only
            ("NetSales", "decimal"),        // exact synonym
            ("CreditCardTips", "decimal"),
            ("CashTips", "decimal"));

        var match = SchemaScorer.Score(FeedSpecs.ZReport, relation);

        Assert.NotNull(match);
        Assert.Equal("NetSales", match!.ColumnFor("Sales").Name);
    }

    [Fact]
    public void MatchesRegardlessOfSeparatorsAndCase()
    {
        var relation = Relation("vwZReport",
            ("business_date", "datetime"),
            ("net_sales", "decimal"),
            ("CREDIT_CARD_TIPS", "decimal"),
            ("cash_tips", "decimal"));

        var match = SchemaScorer.Score(FeedSpecs.ZReport, relation);

        Assert.NotNull(match);
        Assert.Equal("net_sales", match!.ColumnFor("Sales").Name);
        Assert.Equal("CREDIT_CARD_TIPS", match.ColumnFor("CcTips").Name);
    }

    [Theory]
    [InlineData("fTotalSales", "totalsales")]
    [InlineData("dtmClaimDate", "claimdate")]
    [InlineData("szDescription", "description")]
    [InlineData("blnUseGross", "usegross")]
    [InlineData("lPaymentType", "paymenttype")]
    [InlineData("iGuestCnt", "guestcnt")]
    [InlineData("uKeyID", "keyid")]
    [InlineData("fkItemID", "itemid")]
    [InlineData("item", "item")]          // no prefix to take: lower-case remainder
    [InlineData("iced", "iced")]          // "i" is not a prefix here, for the same reason
    public void HungarianPrefixesAreDropped(string column, string expected)
        => Assert.Equal(expected, SchemaNames.Normalize(SchemaNames.StripPrefix(column)));

    [Fact]
    public void RealTwoTouchColumnNamesReachTheirSynonyms()
    {
        // Every name here is copied from a production TwoTouch database. With
        // the prefix attached and the words in this order, none of them matched.
        var relation = Relation("tblTips",
            ("dtmClaimDate", "datetime"),
            ("fTotalSales", "float"),
            ("fTipsCC", "float"),
            ("fTipsCash", "float"));

        var match = SchemaScorer.Score(FeedSpecs.ZReport, relation);

        Assert.NotNull(match);
        Assert.Equal("dtmClaimDate", match!.ColumnFor("Date").Name);
        Assert.Equal("fTotalSales", match.ColumnFor("Sales").Name);
        Assert.Equal("fTipsCC", match.ColumnFor("CcTips").Name);     // via word-order-free match
        Assert.Equal("fTipsCash", match.ColumnFor("CashTips").Name); // via word-order-free match
        Assert.Empty(match.WeakFields());
    }

    [Fact]
    public void GenericDiscoveryCannotSupplyItemAuditFromTheRealSchema()
    {
        // dbo.tblSalesHist is where the sale lines are, but the item and
        // category are INT foreign keys — the names live in tblItem and
        // tblCategory. No amount of scoring can conjure a text column that is
        // not there, which is why TwoTouchProfile exists.
        var salesHist = Relation("tblSalesHist",
            ("dtmSalesDate", "smalldatetime"),
            ("fkItemID", "int"),
            ("fQty", "float"),
            ("lTicketSort", "int"),
            ("szRefundFlg", "nvarchar"),
            ("szPLU", "nvarchar"));

        var match = SchemaScorer.Score(FeedSpecs.ItemAudit, salesHist);

        // It survives only because szRefundFlg/szPLU are text — and both are
        // flagged weak, because nothing about their names says "item".
        Assert.NotNull(match);
        Assert.Contains(match!.WeakFields(), f => f.Field.Key == "ItemName");
        Assert.Contains(match.WeakFields(), f => f.Field.Key == "Category");
    }

    [Fact]
    public void GenericDiscoveryCannotSupplyEwReportFromTheRealSchema()
    {
        // dbo.tblTimeClockNew has the hours, but the employee is two joins away
        // through tblUserJobs → tblUser, and it holds no text column at all.
        var timeClock = Relation("tblTimeClockNew",
            ("dtmReportIn", "datetime"),
            ("dtmReportOut", "datetime"),
            ("fkUserJobID", "int"),
            ("fRegHoursWorked", "float"),
            ("fOverTimeHoursWorked", "float"),
            ("fPayRate", "float"));

        // EmployeeName is a Text field and there is no text column: dropped.
        Assert.Empty(SchemaScorer.Rank(FeedSpecs.EwReport, [timeClock]));
    }

    [Fact]
    public void ReturnsAtMostTheRequestedNumberOfCandidates()
    {
        var relations = Enumerable.Range(0, 12).Select(i => GoodZReport($"Report{i}")).ToArray();

        Assert.Equal(5, SchemaScorer.Rank(FeedSpecs.ZReport, relations).Count);
        Assert.Equal(3, SchemaScorer.Rank(FeedSpecs.ZReport, relations, take: 3).Count);
    }

    [Fact]
    public void EveryFeedCanBeSatisfiedByItsUnlikeNamedEquivalent()
    {
        // Mirrors testdata/04-create-unlike-schema.sql — proving the scorer works
        // on names it was not written against is the whole exercise.
        var ew = Relation("EmpWorkSummary",
            ("ShiftDate", "datetime"),
            ("StaffName", "nvarchar"),
            ("ServerSales", "money"),
            ("TipsPaid", "money"),
            ("HoursWorked", "decimal"),
            ("OvertimeHrs", "decimal"));

        var audit = Relation("ItemSalesAudit",
            ("TranDate", "datetime"),
            ("MenuItemName", "nvarchar"),
            ("MajorGroup", "nvarchar"),
            ("UnitsSold", "decimal"),
            ("ExtendedPrice", "money"));

        Assert.Single(SchemaScorer.Rank(FeedSpecs.EwReport, [ew]));
        Assert.Single(SchemaScorer.Rank(FeedSpecs.ItemAudit, [audit]));
    }
}
