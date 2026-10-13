using System.Diagnostics;
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

            // A hard link is a second name for the same file, with no reparse
            // point to spot, so an ACL written here lands on whatever was
            // linked. Best-effort by design: fsutil failing is not proof of an
            // attack, and refusing every install on a filesystem it cannot read
            // would trade a narrow risk for a broad outage. The ordering below
            // does not depend on it.
            var linked = FindHardLinks(info);
            if (linked.Count > 0)
            {
                error = $"{directory} contains a hard link, which setup never creates: "
                      + string.Join("; ", linked.Take(3))
                      + ". Nothing was changed — an ACL written there would land on the linked file too.";
                return false;
            }

            // Secure the root FIRST, then descend. Once this ACL is on, only
            // administrators can add, rename or delete entries here, so what the
            // walk sees next cannot be swapped under it. Children still need
            // their own reset: File.Copy(overwrite: true) keeps the target
            // file's owner and DACL, so an attacker who pre-created
            // rail-2touch-agent.exe still owns the binary setup just installed.
            var (_, failures) = SecureTree(info);

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
    /// <summary>
    /// How many names this file has on the volume.
    ///
    /// A hard link is a second name for the same inode, with no reparse point
    /// involved, so rewriting the ACL at one path rewrites it on every other —
    /// including a system file an attacker linked into the install directory
    /// before hardening ran. .NET exposes no link count, so this shells out to
    /// fsutil, the way the rest of this code shells out to sc.exe and schtasks.
    ///
    /// Returns -1 when the count cannot be determined.
    /// </summary>
    public static int CountHardLinks(string path)
    {
        try
        {
            var psi = new ProcessStartInfo("fsutil.exe")
            {
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            };
            psi.ArgumentList.Add("hardlink");
            psi.ArgumentList.Add("list");
            psi.ArgumentList.Add(path);

            using var p = Process.Start(psi);
            if (p is null) return -1;

            var output = p.StandardOutput.ReadToEnd();
            p.WaitForExit(15_000);
            if (p.ExitCode != 0) return -1;

            return output
                .Split('\n')
                .Count(line => !string.IsNullOrWhiteSpace(line));
        }
        catch
        {
            return -1;
        }
    }

    /// <summary>
    /// The order in which a tree would be secured: a directory always before
    /// anything inside it.
    ///
    /// That order is the whole TOCTOU defence. Enumerating a directory a
    /// standard user can still write lets them swap an entry between the look
    /// and the write, so each directory's ACL is applied first — after which
    /// only administrators can change its contents and reading it is safe.
    /// </summary>
    public static List<string> PlanSecureOrder(DirectoryInfo root)
    {
        var order = new List<string> { root.FullName };
        CollectInOrder(root, order);
        return order;
    }

    private static void CollectInOrder(DirectoryInfo dir, List<string> order)
    {
        foreach (var entry in SafeEntries(dir))
        {
            if ((entry.Attributes & FileAttributes.ReparsePoint) != 0) continue;

            order.Add(entry.FullName);
            if (entry is DirectoryInfo child) CollectInOrder(child, order);
        }
    }

    private static IEnumerable<FileSystemInfo> SafeEntries(DirectoryInfo dir)
    {
        try
        {
            // AttributesToSkip = 0: the default hides hidden and system files,
            // and a planted file would simply set those attributes to be passed
            // over silently.
            return dir.EnumerateFileSystemInfos("*", new EnumerationOptions
            {
                RecurseSubdirectories = false,
                AttributesToSkip = 0,
                IgnoreInaccessible = false,
            }).ToList();
        }
        catch
        {
            return [];
        }
    }

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

    /// <summary>
    /// Finds files in the tree that have more than one name on the volume.
    /// </summary>
    private static List<string> FindHardLinks(DirectoryInfo root)
    {
        var found = new List<string>();

        foreach (var path in PlanSecureOrder(root))
        {
            if (Directory.Exists(path)) continue;
            if (CountHardLinks(path) > 1) found.Add(path);
        }

        return found;
    }

    /// <summary>
    /// Applies the secure ACL to a directory and then, only once it is locked,
    /// to everything inside it.
    ///
    /// The order is the point. A directory is secured before it is read, so by
    /// the time its entries are enumerated no non-administrator can swap one of
    /// them for a junction between the look and the write. Reparse points are
    /// skipped outright rather than written to: setting an ACL on a link path
    /// follows it to the target just as surely as descending would.
    /// </summary>
    public static (List<string> attempted, List<string> failures) SecureTree(DirectoryInfo root)
    {
        var attempted = new List<string>();
        var failures = new List<string>();
        SecureTree(root, attempted, failures, isRoot: true);
        return (attempted, failures);
    }

    private static void SecureTree(
        DirectoryInfo dir, List<string> attempted, List<string> failures, bool isRoot)
    {
        // Secure THIS directory before reading it. Leaving this out is not a
        // cosmetic slip: without it the install directory keeps the volume
        // root's inherited Authenticated Users Modify, and since every child is
        // then set to inherit, the whole tree ends up carrying it. Hardening
        // would report success having made the directory no safer.
        attempted.Add(dir.FullName);
        try
        {
            // The root severs inheritance outright. A subdirectory inherits
            // from the parent that has just been secured, which is the same
            // result by a shorter route.
            if (isRoot)
            {
                dir.SetAccessControl(BuildSecureAcl());
            }
            else
            {
                var acl = new DirectorySecurity();
                acl.SetAccessRuleProtection(false, false);
                acl.SetOwner(new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null));
                dir.SetAccessControl(acl);
            }
        }
        catch (Exception ex)
        {
            // Do not descend into a directory we failed to lock: its contents
            // are still swappable, which is the race this ordering exists to
            // close.
            failures.Add($"{dir.FullName} ({ex.Message})");
            return;
        }

        foreach (var entry in SafeEntries(dir))
        {
            if ((entry.Attributes & FileAttributes.ReparsePoint) != 0)
            {
                failures.Add($"{entry.Name} (junction or symbolic link, left untouched)");
                continue;
            }

            if (entry is DirectoryInfo child)
            {
                // Recursing secures the child and only then reads inside it.
                SecureTree(child, attempted, failures, isRoot: false);
                continue;
            }

            attempted.Add(entry.FullName);
            try
            {
                var acl = new FileSecurity();
                // false, false = inherit from the parent we have just secured,
                // and drop the explicit rules that are there now.
                acl.SetAccessRuleProtection(false, false);
                acl.SetOwner(new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null));
                ((FileInfo)entry).SetAccessControl(acl);
            }
            catch (Exception ex)
            {
                failures.Add($"{entry.FullName} ({ex.Message})");
            }
        }
    }
}
