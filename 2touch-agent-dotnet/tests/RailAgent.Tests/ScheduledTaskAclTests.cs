using System.Security.AccessControl;
using System.Security.Principal;
using RailAgent.Setup;
using Xunit;

namespace RailAgent.Tests;

/// <summary>
/// The update task runs as SYSTEM, every night, forever. Whatever path it names
/// is therefore a standing grant of SYSTEM code execution to anyone who can
/// write that file — so registering it against a directory a normal user can
/// write to converts one admin's convenience into a permanent local privilege
/// escalation.
///
/// This is not hypothetical for this program: the documented way to fix a box
/// in the field is to run rail-update.exe --install-task on it, and an operator
/// does that from wherever they extracted the download, which is usually their
/// own Downloads folder. The check has to refuse that.
/// </summary>
public class ScheduledTaskAclTests
{
    private static readonly SecurityIdentifier Users =
        new(WellKnownSidType.BuiltinUsersSid, null);
    private static readonly SecurityIdentifier Everyone =
        new(WellKnownSidType.WorldSid, null);
    private static readonly SecurityIdentifier Admins =
        new(WellKnownSidType.BuiltinAdministratorsSid, null);
    private static readonly SecurityIdentifier System =
        new(WellKnownSidType.LocalSystemSid, null);
    private static readonly SecurityIdentifier Authenticated =
        new(WellKnownSidType.AuthenticatedUserSid, null);

    private static AuthorizationRuleCollection Rules(params FileSystemAccessRule[] rules)
    {
        var security = new DirectorySecurity();
        security.SetAccessRuleProtection(true, false);
        foreach (var r in rules) security.AddAccessRule(r);
        return security.GetAccessRules(true, false, typeof(SecurityIdentifier));
    }

    private static FileSystemAccessRule Allow(SecurityIdentifier who, FileSystemRights what)
        => new(who, what, AccessControlType.Allow);

    // ── Must refuse ──────────────────────────────────────────────────────────

    [Fact]
    public void Users_with_modify_is_unsafe()
    {
        Assert.True(ScheduledTask.GrantsWriteToNonAdmins(
            Rules(Allow(Admins, FileSystemRights.FullControl),
                  Allow(Users, FileSystemRights.Modify)), isDirectory: true));
    }

    [Fact]
    public void Everyone_with_full_control_is_unsafe()
    {
        Assert.True(ScheduledTask.GrantsWriteToNonAdmins(
            Rules(Allow(Everyone, FileSystemRights.FullControl)), isDirectory: true));
    }

    [Fact]
    public void Users_able_to_create_files_is_unsafe()
    {
        // Enough to plant a DLL beside the exe, or to replace it after a delete.
        Assert.True(ScheduledTask.GrantsWriteToNonAdmins(
            Rules(Allow(Users, FileSystemRights.CreateFiles)), isDirectory: true));
    }

    [Fact]
    public void Users_able_to_delete_is_unsafe()
    {
        // Delete-then-recreate is the usual way a weak ACL becomes code execution.
        Assert.True(ScheduledTask.GrantsWriteToNonAdmins(
            Rules(Allow(Users, FileSystemRights.Delete)), isDirectory: true));
    }

    [Fact]
    public void Users_able_to_take_ownership_is_unsafe()
    {
        Assert.True(ScheduledTask.GrantsWriteToNonAdmins(
            Rules(Allow(Users, FileSystemRights.TakeOwnership)), isDirectory: true));
    }

    // ── Must allow ───────────────────────────────────────────────────────────

    [Fact]
    public void Admins_and_system_only_is_safe()
    {
        Assert.False(ScheduledTask.GrantsWriteToNonAdmins(
            Rules(Allow(Admins, FileSystemRights.FullControl),
                  Allow(System, FileSystemRights.FullControl)), isDirectory: true));
    }

    [Fact]
    public void Users_with_read_and_execute_is_safe()
    {
        // The normal, correct shape for an install directory: everyone may run
        // the agent, only administrators may change it.
        Assert.False(ScheduledTask.GrantsWriteToNonAdmins(
            Rules(Allow(Admins, FileSystemRights.FullControl),
                  Allow(System, FileSystemRights.FullControl),
                  Allow(Users, FileSystemRights.ReadAndExecute)), isDirectory: true));
    }

    // ── Files and directories are not the same risk ──────────────────────────

    [Fact]
    public void Append_data_on_a_parent_directory_is_not_enough_to_be_unsafe()
    {
        // This is the real C:\ ACE — "NT AUTHORITY\Authenticated Users:(AD)".
        // On a directory AppendData means "create subfolders", which cannot
        // touch an existing file inside it. Counting it would refuse every
        // normal install and make the whole check useless.
        Assert.False(ScheduledTask.GrantsWriteToNonAdmins(
            Rules(Allow(Admins, FileSystemRights.FullControl),
                  Allow(Authenticated, FileSystemRights.AppendData)),
            isDirectory: true));
    }

    [Fact]
    public void Append_data_on_the_file_itself_is_unsafe()
    {
        // On a file AppendData means appending to its contents, which is a
        // write to the binary the task runs.
        Assert.True(ScheduledTask.GrantsWriteToNonAdmins(
            Rules(Allow(Users, FileSystemRights.AppendData)),
            isDirectory: false));
    }

    [Fact]
    public void Deleting_files_inside_a_directory_is_unsafe()
    {
        // Delete-then-recreate is how write access to a directory becomes
        // control of a file inside it.
        Assert.True(ScheduledTask.GrantsWriteToNonAdmins(
            Rules(Allow(Users, FileSystemRights.DeleteSubdirectoriesAndFiles)),
            isDirectory: true));
    }

    [Fact]
    public void An_inherit_only_rule_does_not_apply_to_the_directory_carrying_it()
    {
        // The exact ACE on C:\ — "(OI)(CI)(IO)(M)" for Authenticated Users.
        // InheritOnly means it grants nothing on C:\ itself and only reaches
        // children, which are evaluated on their own effective rules. Counting
        // it made the walk flag C:\ for every path on the machine, so a
        // correctly hardened install directory was still refused.
        var security = new DirectorySecurity();
        security.SetAccessRuleProtection(true, false);
        security.AddAccessRule(Allow(Admins, FileSystemRights.FullControl));
        security.AddAccessRule(new FileSystemAccessRule(
            Authenticated,
            FileSystemRights.Modify,
            InheritanceFlags.ObjectInherit | InheritanceFlags.ContainerInherit,
            PropagationFlags.InheritOnly,
            AccessControlType.Allow));

        Assert.False(ScheduledTask.GrantsWriteToNonAdmins(
            security.GetAccessRules(true, true, typeof(SecurityIdentifier)),
            isDirectory: true));
    }

    [Fact]
    public void A_deny_rule_does_not_make_a_path_unsafe()
    {
        // Deny only ever removes access. Counting it as a grant would refuse a
        // correctly hardened directory.
        var security = new DirectorySecurity();
        security.SetAccessRuleProtection(true, false);
        security.AddAccessRule(Allow(Admins, FileSystemRights.FullControl));
        security.AddAccessRule(new FileSystemAccessRule(
            Users, FileSystemRights.FullControl, AccessControlType.Deny));

        Assert.False(ScheduledTask.GrantsWriteToNonAdmins(
            security.GetAccessRules(true, false, typeof(SecurityIdentifier)), isDirectory: true));
    }
}
