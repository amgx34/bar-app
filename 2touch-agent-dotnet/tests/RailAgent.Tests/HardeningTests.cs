using System.Security.AccessControl;
using System.Security.Principal;
using RailAgent.Setup;
using Xunit;

namespace RailAgent.Tests;

/// <summary>
/// The install directory holds a binary that runs as a SYSTEM service, so who
/// may write to it is a security boundary, not housekeeping.
///
/// Windows does not give us a safe one by default. Every folder created under
/// C:\ inherits "NT AUTHORITY\Authenticated Users:(OI)(CI)(IO)(M)" from the
/// volume root, which lands as plain Modify on each file inside — so a stock
/// C:\rail-agent lets any authenticated user on the POS box replace the agent
/// and own the machine at the next service start. Setup has to take that away
/// deliberately; nothing about creating the folder does it for us.
/// </summary>
public class HardeningTests
{
    private static readonly SecurityIdentifier Admins =
        new(WellKnownSidType.BuiltinAdministratorsSid, null);
    private static readonly SecurityIdentifier System =
        new(WellKnownSidType.LocalSystemSid, null);
    private static readonly SecurityIdentifier Users =
        new(WellKnownSidType.BuiltinUsersSid, null);
    private static readonly SecurityIdentifier Authenticated =
        new(WellKnownSidType.AuthenticatedUserSid, null);

    private static AuthorizationRuleCollection RulesOf(DirectorySecurity s)
        => s.GetAccessRules(true, true, typeof(SecurityIdentifier));

    private static FileSystemRights RightsFor(DirectorySecurity s, SecurityIdentifier who)
    {
        FileSystemRights total = 0;
        foreach (FileSystemAccessRule r in RulesOf(s))
        {
            if (r.AccessControlType == AccessControlType.Allow &&
                r.IdentityReference.Equals(who))
            {
                total |= r.FileSystemRights;
            }
        }
        return total;
    }

    [Fact]
    public void Inheritance_is_severed()
    {
        // Without this the volume root's Authenticated Users Modify flows
        // straight back in and every other rule here is decoration.
        Assert.True(Hardening.BuildSecureAcl().AreAccessRulesProtected);
    }

    [Fact]
    public void Administrators_keep_full_control()
    {
        Assert.Equal(
            FileSystemRights.FullControl,
            RightsFor(Hardening.BuildSecureAcl(), Admins) & FileSystemRights.FullControl);
    }

    [Fact]
    public void System_keeps_full_control()
    {
        // The service runs as LocalSystem and the updater swaps the binary as
        // SYSTEM. Losing this would break the thing we are protecting.
        Assert.Equal(
            FileSystemRights.FullControl,
            RightsFor(Hardening.BuildSecureAcl(), System) & FileSystemRights.FullControl);
    }

    [Fact]
    public void Users_may_still_run_the_agent()
    {
        var rights = RightsFor(Hardening.BuildSecureAcl(), Users);

        Assert.Equal(
            FileSystemRights.ReadAndExecute,
            rights & FileSystemRights.ReadAndExecute);
    }

    [Fact]
    public void Users_may_not_change_anything()
    {
        var rights = RightsFor(Hardening.BuildSecureAcl(), Users);

        Assert.Equal(default, rights & FileSystemRights.Write);
        Assert.Equal(default, rights & FileSystemRights.Delete);
        Assert.Equal(default, rights & FileSystemRights.TakeOwnership);
    }

    [Fact]
    public void Authenticated_users_are_not_granted_anything()
    {
        // The specific ACE that makes a stock install exploitable.
        Assert.Equal(default, RightsFor(Hardening.BuildSecureAcl(), Authenticated));
    }

    [Fact]
    public void The_acl_we_write_passes_the_check_that_guards_the_task()
    {
        // The two halves have to agree: if hardening produced something
        // FindUnsafePath still rejected, --install-task would refuse forever on
        // a directory it had just fixed itself.
        Assert.False(ScheduledTask.GrantsWriteToNonAdmins(
            RulesOf(Hardening.BuildSecureAcl()), isDirectory: true));
    }
}
