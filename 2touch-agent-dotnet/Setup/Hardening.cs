using System.Security.AccessControl;
using System.Security.Principal;

namespace RailAgent.Setup;

/// <summary>
/// Locks down the install directory.
///
/// The agent binary runs as a LocalSystem service, so whoever may write to it
/// may run code as SYSTEM. Windows does not hand us a safe directory by default
/// and creating one does not make it safe: the volume root carries
///
///     C:\ NT AUTHORITY\Authenticated Users:(OI)(CI)(IO)(M)
///
/// an inherit-only Modify that lands as plain Modify on every file created
/// underneath it. A stock C:\rail-agent therefore lets any authenticated user on
/// the POS box replace rail-2touch-agent.exe and own the machine at the next
/// service start — no scheduled task required, and true of every box installed
/// before this code existed.
///
/// Severing inheritance is the whole point. Adding allow-rules on top of an
/// inherited Modify would change nothing.
/// </summary>
public static class Hardening
{
    /// <summary>
    /// The ACL an install directory should carry: administrators and SYSTEM may
    /// change it, everyone else may run what is in it and nothing more.
    ///
    /// Pure, so the shape can be asserted without touching a real directory —
    /// including the round-trip that it satisfies
    /// <see cref="ScheduledTask.GrantsWriteToNonAdmins"/>, since a hardening
    /// step that still failed that check would leave --install-task refusing a
    /// directory it had just fixed.
    /// </summary>
    public static DirectorySecurity BuildSecureAcl()
    {
        var security = new DirectorySecurity();

        // true  = protect from inheritance
        // false = do NOT copy the inherited rules in first; they are the problem.
        security.SetAccessRuleProtection(true, false);

        const InheritanceFlags toChildren =
            InheritanceFlags.ObjectInherit | InheritanceFlags.ContainerInherit;

        security.AddAccessRule(new FileSystemAccessRule(
            new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null),
            FileSystemRights.FullControl, toChildren, PropagationFlags.None,
            AccessControlType.Allow));

        // The service runs as LocalSystem and the updater swaps the binary as
        // SYSTEM. Taking this away would break what we are protecting.
        security.AddAccessRule(new FileSystemAccessRule(
            new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null),
            FileSystemRights.FullControl, toChildren, PropagationFlags.None,
            AccessControlType.Allow));

        // Read and execute, deliberately: a non-admin must still be able to run
        // rail-diagnose.exe and read a log without being able to alter anything.
        security.AddAccessRule(new FileSystemAccessRule(
            new SecurityIdentifier(WellKnownSidType.BuiltinUsersSid, null),
            FileSystemRights.ReadAndExecute, toChildren, PropagationFlags.None,
            AccessControlType.Allow));

        return security;
    }

    /// <summary>
    /// Applies <see cref="BuildSecureAcl"/> to a directory. Needs Administrator.
    /// </summary>
    public static bool TryHarden(string directory, out string? error)
    {
        error = null;
        try
        {
            var info = new DirectoryInfo(directory);
            if (!info.Exists)
            {
                error = $"{directory} does not exist.";
                return false;
            }

            info.SetAccessControl(BuildSecureAcl());
            return true;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return false;
        }
    }
}
