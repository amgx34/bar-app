using RailAgent.Setup;
using Xunit;

namespace RailAgent.Tests;

/// <summary>
/// The two feed registries have to agree about which feeds exist.
///
/// TwoTouchProfile.All is what the built-in mapping can supply; FeedSpecs.All is
/// what generic schema discovery knows how to ask an operator about. They are
/// deliberately different lists — the hourly and per-server feeds are built from
/// four relations each and cannot be discovered generically — but every feed the
/// PROFILE can produce still has to be nameable, because the wizard prints its
/// label before it does anything else with it.
/// </summary>
public class FeedSpecsTests
{
    [Fact]
    public void EveryProfileFeedCanBeNamed()
    {
        // The wizard lists matched and unmatched profile feeds by label before
        // any mapping happens. A feed the label lookup does not know about took
        // the whole installer down with "Sequence contains no matching element"
        // on every 2Touch box, which is every box this ships to.
        foreach (var feed in TwoTouchProfile.All)
        {
            var label = FeedSpecs.LabelFor(feed.FeedKey);
            Assert.False(string.IsNullOrWhiteSpace(label));
        }
    }

    [Fact]
    public void AnUnknownFeedKeyIsNamedRatherThanThrown()
    {
        // A label is decoration. Whatever else goes wrong, failing to find one
        // must never be the thing that ends the install.
        Assert.False(string.IsNullOrWhiteSpace(FeedSpecs.LabelFor("NoSuchFeed")));
    }

    [Fact]
    public void DiscoverableSpecsStayTheThreeTheWizardCanActuallyMap()
    {
        // Guards the other direction: quietly adding the profile-only feeds to
        // FeedSpecs.All would fix the crash by giving the wizard two extra
        // mapping stages that cannot succeed, which is a worse install than the
        // one it replaced.
        Assert.Equal(3, FeedSpecs.All.Length);
    }
}
