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
    /// Principals already as privileged as the service itself, so giving them
    /// control over the install directory escalates nothing.
    ///
    /// The one definition of "trusted" — <see cref="ScheduledTask"/> uses it for
    /// its ACL walk too, so the check that guards the task and the ACL we write
    /// cannot drift apart.
    /// </summary>
    public static bool IsTrustedPrincipal(IdentityReference id)
    {
        var sid = id as SecurityIdentifier ?? TryTranslate(id);
        if (sid is null) return false;

        // NT SERVICE\TrustedInstaller owns most of %ProgramFiles% and has no
        // WellKnownSidType of its own.
        const string trustedInstaller =
            "S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464";

        return sid.IsWellKnown(WellKnownSidType.BuiltinAdministratorsSid)
            || sid.IsWellKnown(WellKnownSidType.LocalSystemSid)
            || sid.IsWellKnown(WellKnownSidType.CreatorOwnerSid)
            || sid.Value == trustedInstaller;
    }

    /// <summary>
    /// GetOwner can hand back an NTAccount rather than a SID. A name that will
    /// not translate is not a name we can vouch for, so it stays untrusted.
    /// </summary>
    private static SecurityIdentifier? TryTranslate(IdentityReference id)
    {
        try { return (SecurityIdentifier)id.Translate(typeof(SecurityIdentifier)); }
        catch { return null; }
    }

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

        // An owner keeps implicit WRITE_DAC however the DACL reads, so a
        // directory still owned by a standard user can simply be re-granted to
        // them and every rule below is decoration. This is reachable: C:\ lets
        // any authenticated user create folders, so a standard user can
        // pre-create C:\rail-agent, and File.Copy preserves an existing file's
        // owner — setup would harden a directory the attacker still owns.
        security.SetOwner(new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null));

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

            // The install directory itself must be a real directory. Hardening a
            // junction would apply the ACL to its target instead.
            if ((info.Attributes & FileAttributes.ReparsePoint) != 0)
            {
                error = $"{directory} is a junction or symbolic link, not a real directory. "
                      + "Refusing to change permissions through it.";
                return false;
            }

            // Look before touching anything. A reparse point under the install
            // directory is never something setup created, and an elevated ACL
            // rewrite that followed one would retarget onto whatever it points
            // at. Refuse the whole operation rather than press on: this is the
            // signature of a directory somebody pre-staged.
            var (_, reparsePoints) = WalkForReset(info);
            if (reparsePoints.Count > 0)
            {
                error = $"{directory} contains a junction or symbolic link, which setup never creates: "
                      + string.Join("; ", reparsePoints.Take(3))
                      + ". Nothing was changed — remove it and investigate how it got there.";
                return false;
            }

            info.SetAccessControl(BuildSecureAcl());

            // Children are not covered by the parent's new ACL if they carry
            // explicit rules or a hostile owner of their own — and they can.
            // File.Copy(overwrite: true) writes into an existing file and keeps
            // that file's owner and DACL, so an attacker who pre-created
            // C:\rail-agent\rail-2touch-agent.exe still owns the binary setup
            // just installed. Reset each one to inherit from the directory we
            // have just secured.
            var failures = ResetChildren(info);
            if (failures.Count > 0)
            {
                error = $"{directory} was secured, but {failures.Count} item(s) under it could not be: "
                      + string.Join("; ", failures.Take(3));
                return false;
            }

            return true;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return false;
        }
    }

    /// <summary>
    /// Puts every existing file and subdirectory back under the parent's
    /// inheritance and ownership.
    ///
    /// Deliberately does NOT delete anything it does not recognise. The install
    /// directory legitimately accumulates files this code has no manifest for —
    /// diagnostic reports an operator has not collected yet, and
    /// rail-2touch-agent.exe.bak, which is the only thing a rollback has to
    /// restore. A cleanup that removed "unexpected" files would delete the
    /// recovery path for a bad release.
    /// </summary>
    public static (List<string> touched, List<string> reparsePoints) WalkForReset(DirectoryInfo root)
    {
        var touched = new List<string>();
        var reparsePoints = new List<string>();

        // Hand-rolled rather than SearchOption.AllDirectories, which follows
        // junctions. Walking into one means an elevated process rewriting the
        // owner and DACL of whatever it points at — C:\Windows\System32, given
        // an attacker who had write access here before hardening ran.
        Descend(root, touched, reparsePoints);
        return (touched, reparsePoints);
    }

    private static void Descend(DirectoryInfo dir, List<string> touched, List<string> reparsePoints)
    {
        IEnumerable<FileSystemInfo> entries;
        try
        {
            // AttributesToSkip = 0: the default hides hidden and system files,
            // and a planted file would simply set those attributes to be passed
            // over silently.
            entries = dir.EnumerateFileSystemInfos("*", new EnumerationOptions
            {
                RecurseSubdirectories = false,
                AttributesToSkip = 0,
                IgnoreInaccessible = false,
            });
        }
        catch
        {
            return;
        }

        foreach (var entry in entries)
        {
            if ((entry.Attributes & FileAttributes.ReparsePoint) != 0)
            {
                // Recorded and then left completely alone. Setting an ACL on the
                // link path would follow it to the target just as surely as
                // descending would.
                reparsePoints.Add(entry.FullName);
                continue;
            }

            touched.Add(entry.FullName);

            if (entry is DirectoryInfo child) Descend(child, touched, reparsePoints);
        }
    }

    private static List<string> ResetChildren(DirectoryInfo root)
    {
        var admins = new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null);
        var failures = new List<string>();

        var (touched, _) = WalkForReset(root);

        foreach (var path in touched)
        {
            FileSystemInfo entry = Directory.Exists(path)
                ? new DirectoryInfo(path)
                : new FileInfo(path);

            try
            {
                if (entry is FileInfo file)
                {
                    var acl = new FileSecurity();
                    // false, false = inherit from the parent, and drop the
                    // explicit rules that are there now.
                    acl.SetAccessRuleProtection(false, false);
                    acl.SetOwner(admins);
                    file.SetAccessControl(acl);
                }
                else if (entry is DirectoryInfo dir)
                {
                    var acl = new DirectorySecurity();
                    acl.SetAccessRuleProtection(false, false);
                    acl.SetOwner(admins);
                    dir.SetAccessControl(acl);
                }
            }
            catch (Exception ex)
            {
                failures.Add($"{entry.Name} ({ex.Message})");
            }
        }

        return failures;
    }
}
