using System.Diagnostics;
using System.Globalization;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;

namespace RailAgent.Setup;

/// <summary>
/// The Scheduled Task that keeps the agent up to date on its own.
///
/// Without this, nothing on a POS box ever asks Rail whether a newer build
/// exists: the service carries no update logic, and rail-update.exe only checks
/// when a person runs it. A bar ran a year behind that way — syncing happily,
/// reporting in every five minutes, and missing the release that fixed its own
/// feed mapping, because the only thing that could have pulled it was a trip to
/// the bar nobody made.
///
/// Registering it is deliberately an explicit act (<c>--install-task</c>, or a
/// fresh install) rather than something the agent does for itself. An unattended
/// binary swap is safe here only because <see cref="Updater.ApplyAsync"/>
/// verifies the checksum before touching anything, keeps the old exe, and rolls
/// back a build that will not start — but it is still a swap, and the operator
/// should be the one who asks for it.
/// </summary>
public static class ScheduledTask
{
    public const string TaskName = "Rail 2Touch agent update";

    /// <summary>
    /// When the update runs. After close, so the service restart around the
    /// swap cannot drop a sync window mid-shift, and well before the Rail cron
    /// that reconciles the night.
    /// </summary>
    public static readonly TimeOnly DefaultTime = new(3, 30);

    public static bool Exists()
        => SchTasks("/Query", "/TN", TaskName).Ok;

    /// <summary>
    /// Registers (or re-registers) the daily update check.
    ///
    /// <paramref name="updaterPath"/> is the installed rail-update.exe. It is
    /// recorded as an absolute path because a Scheduled Task has no meaningful
    /// working directory.
    /// </summary>
    public static ServiceControl.ScResult Install(string updaterPath, TimeOnly? at = null)
    {
        var full = Path.GetFullPath(updaterPath);

        if (!File.Exists(full))
            return new ServiceControl.ScResult(-1, $"{full} does not exist.");

        // The safety check lives here rather than in the callers so that neither
        // the wizard nor --install-task can register an unsafe task by being
        // written slightly differently later.
        var unsafePath = FindUnsafePath(full);
        if (unsafePath is not null)
        {
            return new ServiceControl.ScResult(-1,
                $"'{unsafePath}' can be modified by non-administrators. A task running as SYSTEM " +
                "from there would let any user on this box run code as SYSTEM, so it was not created. " +
                $"Run this from the installed copy in {SetupWizard.InstallDirectory} instead.");
        }

        return SchTasks(BuildInstallArgs(full, at ?? DefaultTime));
    }

    public static ServiceControl.ScResult Remove()
        => SchTasks(BuildRemoveArgs());

    /// <summary>
    /// The exact argument vector for registering the task.
    ///
    /// Separated from the call so it can be tested: this is the part that fails
    /// silently. A task built with a wrong quote or a locale-formatted time
    /// registers cleanly and then never runs, which looks exactly like the
    /// problem it was added to solve.
    /// </summary>
    public static string[] BuildInstallArgs(string updaterPath, TimeOnly at) =>
    [
        "/Create",
        "/TN", TaskName,
        // The whole command is one argument. The path is quoted because the
        // default install directory has a space in it, and --yes is what makes
        // it unattended — without it the task would wait at a confirmation
        // prompt that nobody is there to answer.
        "/TR", $"\"{updaterPath}\" --yes",
        "/SC", "DAILY",
        // schtasks demands HH:mm. Formatted invariantly so a box set to a
        // culture that renders this as "3:30 AM" still registers.
        "/ST", at.ToString("HH\\:mm", CultureInfo.InvariantCulture),
        // Stopping and starting a Windows Service needs more than the logged-on
        // user, and there may be no logged-on user at 3:30am.
        "/RU", "SYSTEM",
        "/RL", "HIGHEST",
        // Setup re-runs on boxes that already have the task. Without /F
        // schtasks prompts, and an unattended install hangs.
        "/F",
    ];

    public static string[] BuildRemoveArgs() => ["/Delete", "/TN", TaskName, "/F"];

    // ── Where the task is allowed to point ───────────────────────────────────

    /// <summary>
    /// Rights that let a principal rewrite the file the task runs.
    /// WriteData replaces its contents, AppendData adds to them; both change
    /// what SYSTEM executes. Read and execute are deliberately absent.
    /// </summary>
    private const FileSystemRights DangerousOnFile =
        FileSystemRights.WriteData
        | FileSystemRights.AppendData
        | FileSystemRights.Delete
        | FileSystemRights.ChangePermissions
        | FileSystemRights.TakeOwnership;

    /// <summary>
    /// Rights that let a principal swap out a file inside a directory —
    /// creating one over it, or deleting it and writing a replacement.
    ///
    /// AppendData is deliberately NOT here. On a directory it means
    /// "create subdirectories", which cannot touch an existing file, and it is
    /// exactly what the volume root grants Authenticated Users on every Windows
    /// box ("C:\ NT AUTHORITY\Authenticated Users:(AD)"). Treating it as
    /// dangerous would make the walk below refuse every install on every
    /// machine, which is a check that protects nothing because nobody can use it.
    /// </summary>
    private const FileSystemRights DangerousOnDirectory =
        FileSystemRights.WriteData              // CreateFiles
        | FileSystemRights.Delete
        | FileSystemRights.DeleteSubdirectoriesAndFiles
        | FileSystemRights.ChangePermissions
        | FileSystemRights.TakeOwnership;

    /// <summary>
    /// Whether any principal that is not already an administrator can modify
    /// what lives at this path.
    ///
    /// Only Allow rules count. A Deny can only ever take access away, so
    /// treating one as a grant would refuse a correctly hardened directory —
    /// and the failure mode of this check is an operator who cannot schedule
    /// updates, which is the bug we are here to fix.
    /// </summary>
    public static bool GrantsWriteToNonAdmins(AuthorizationRuleCollection rules, bool isDirectory)
    {
        var dangerous = isDirectory ? DangerousOnDirectory : DangerousOnFile;

        foreach (FileSystemAccessRule rule in rules)
        {
            if (rule.AccessControlType != AccessControlType.Allow) continue;

            // InheritOnly grants nothing on the object carrying the rule; it
            // only reaches children, and every child here is evaluated on its
            // own effective rules. This is not a corner case — it is the shape
            // of the volume root's Authenticated Users ACE, so counting it
            // flagged C:\ for every path on the machine and refused install
            // directories that were already correct.
            if (rule.PropagationFlags.HasFlag(PropagationFlags.InheritOnly)) continue;

            if (Hardening.IsTrustedPrincipal(rule.IdentityReference)) continue;
            if ((rule.FileSystemRights & dangerous) != 0) return true;
        }

        return false;
    }

    /// <summary>
    /// Whether the owner recorded on a security descriptor is a principal we
    /// already trust. An unreadable or absent owner counts as untrusted: this
    /// gate fails closed.
    /// </summary>
    private static bool IsOwnedByTrusted(FileSystemSecurity acl)
    {
        try
        {
            var owner = acl.GetOwner(typeof(SecurityIdentifier));
            return owner is not null && Hardening.IsTrustedPrincipal(owner);
        }
        catch
        {
            return false;
        }
    }

    /// <summary>
    /// Walks the file and every directory above it, returning the first one a
    /// non-administrator can write to, or null when the whole chain is sound.
    ///
    /// The parents matter as much as the file: write access to a containing
    /// directory is enough to rename the real binary aside and drop a
    /// replacement in its place.
    /// </summary>
    public static string? FindUnsafePath(string path)
    {
        try
        {
            var full = Path.GetFullPath(path);

            if (File.Exists(full))
            {
                var acl = new FileInfo(full).GetAccessControl();

                // The owner is as good as a write grant: WRITE_DAC is implicit,
                // so whoever owns this can re-grant themselves Full Control at
                // any time and the DACL above says nothing about it.
                if (!IsOwnedByTrusted(acl)) return full;

                if (GrantsWriteToNonAdmins(
                        acl.GetAccessRules(true, true, typeof(SecurityIdentifier)),
                        isDirectory: false))
                {
                    return full;
                }
            }

            for (var dir = new FileInfo(full).Directory; dir is not null; dir = dir.Parent)
            {
                var acl = dir.GetAccessControl();

                if (!IsOwnedByTrusted(acl)) return dir.FullName;

                if (GrantsWriteToNonAdmins(
                        acl.GetAccessRules(true, true, typeof(SecurityIdentifier)),
                        isDirectory: true))
                {
                    return dir.FullName;
                }
            }

            return null;
        }
        catch (Exception ex)
        {
            // An ACL that cannot be read is not an ACL that has been cleared.
            // Fail closed: refuse to schedule rather than schedule blindly.
            return $"{path} (could not read permissions: {ex.Message})";
        }
    }

    /// <summary>
    /// Runs schtasks.exe. Mirrors <see cref="ServiceControl"/>'s sc.exe wrapper
    /// rather than inventing a second way to shell out.
    /// </summary>
    private static ServiceControl.ScResult SchTasks(params string[] args)
    {
        var psi = new ProcessStartInfo(SystemPaths.Executable("schtasks.exe"))
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        foreach (var a in args) psi.ArgumentList.Add(a);

        try
        {
            using var p = Process.Start(psi);
            if (p is null) return new ServiceControl.ScResult(-1, "could not start schtasks.exe");

            var output = new StringBuilder();
            output.Append(p.StandardOutput.ReadToEnd());
            output.Append(p.StandardError.ReadToEnd());
            p.WaitForExit(30_000);

            return new ServiceControl.ScResult(p.ExitCode, output.ToString());
        }
        catch (Exception ex)
        {
            return new ServiceControl.ScResult(-1, ex.Message);
        }
    }
}
