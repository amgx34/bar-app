using System.Diagnostics;
using RailAgent.Setup;
using Xunit;

namespace RailAgent.Tests;

/// <summary>
/// Hardening walks the install directory as an elevated process and rewrites
/// the owner and DACL of everything it finds. If that walk follows a junction,
/// it rewrites whatever the junction points at.
///
/// That is reachable rather than theoretical: before hardening runs, a standard
/// user has Modify on C:\rail-agent — the whole reason this code exists — so
/// they can plant a junction to C:\Windows\System32 and wait for an
/// administrator to run setup or --install-task. Securing the root first does
/// not help; a junction planted beforehand is still sitting there to be walked.
/// </summary>
public class HardeningReparseTests : IDisposable
{
    private readonly string _root = Path.Combine(
        Path.GetTempPath(), "rail-reparse-" + Guid.NewGuid().ToString("N"));
    private readonly string _target = Path.Combine(
        Path.GetTempPath(), "rail-target-" + Guid.NewGuid().ToString("N"));

    public HardeningReparseTests()
    {
        Directory.CreateDirectory(_root);
        Directory.CreateDirectory(_target);
    }

    public void Dispose()
    {
        // Remove the junction before the tree, or deleting the root would
        // delete the target's contents through it.
        var link = Path.Combine(_root, "link");
        if (Directory.Exists(link)) RunCmd($"rmdir \"{link}\"");
        try { Directory.Delete(_root, recursive: true); } catch { /* best effort */ }
        try { Directory.Delete(_target, recursive: true); } catch { /* best effort */ }
    }

    private static void RunCmd(string command)
    {
        using var p = Process.Start(new ProcessStartInfo("cmd.exe", "/c " + command)
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        })!;
        p.WaitForExit(15_000);
    }

    /// <summary>A junction needs no special privilege, unlike a symbolic link.</summary>
    private void MakeJunction()
        => RunCmd($"mklink /J \"{Path.Combine(_root, "link")}\" \"{_target}\"");

    [Fact]
    public void A_plain_tree_has_no_reparse_points()
    {
        File.WriteAllText(Path.Combine(_root, "rail-update.exe"), "x");
        Directory.CreateDirectory(Path.Combine(_root, "logs"));

        var (touched, reparsePoints) = Hardening.WalkForReset(new DirectoryInfo(_root));

        Assert.Empty(reparsePoints);
        Assert.Contains(touched, p => p.EndsWith("rail-update.exe", StringComparison.OrdinalIgnoreCase));
    }

    [SkippableFact]
    public void A_junction_is_reported()
    {
        File.WriteAllText(Path.Combine(_target, "kernel32.dll"), "pretend system file");
        MakeJunction();
        Skip.If(!Directory.Exists(Path.Combine(_root, "link")), "mklink unavailable");

        var (_, reparsePoints) = Hardening.WalkForReset(new DirectoryInfo(_root));

        Assert.Contains(reparsePoints, p => p.EndsWith("link", StringComparison.OrdinalIgnoreCase));
    }

    [SkippableFact]
    public void The_walk_never_descends_into_a_junction()
    {
        // The actual escalation: anything listed here gets its owner and DACL
        // rewritten by an elevated process.
        File.WriteAllText(Path.Combine(_target, "kernel32.dll"), "pretend system file");
        MakeJunction();
        Skip.If(!Directory.Exists(Path.Combine(_root, "link")), "mklink unavailable");

        var (touched, _) = Hardening.WalkForReset(new DirectoryInfo(_root));

        Assert.DoesNotContain(touched, p => p.EndsWith("kernel32.dll", StringComparison.OrdinalIgnoreCase));
    }

    [SkippableFact]
    public void The_junction_itself_is_never_rewritten()
    {
        MakeJunction();
        Skip.If(!Directory.Exists(Path.Combine(_root, "link")), "mklink unavailable");

        var (touched, _) = Hardening.WalkForReset(new DirectoryInfo(_root));

        // Setting the ACL on the link path would follow it to the target.
        Assert.DoesNotContain(touched, p => p.EndsWith("link", StringComparison.OrdinalIgnoreCase));
    }

    [SkippableFact]
    public void Hardening_refuses_a_directory_containing_a_junction()
    {
        MakeJunction();
        Skip.If(!Directory.Exists(Path.Combine(_root, "link")), "mklink unavailable");

        var ok = Hardening.TryHarden(_root, out var error);

        Assert.False(ok);
        Assert.Contains("junction", error ?? "", StringComparison.OrdinalIgnoreCase);
    }

    // ── Hard links ───────────────────────────────────────────────────────────

    [SkippableFact]
    public void A_hard_link_is_refused()
    {
        // No reparse point is involved: a hard link is a second name for the
        // same inode, so rewriting the ACL at this path rewrites it on whatever
        // system file the attacker linked to. mklink /H needs no privilege.
        var real = Path.Combine(_root, "a.txt");
        File.WriteAllText(real, "x");
        RunCmd($"mklink /H \"{Path.Combine(_root, "b.txt")}\" \"{real}\"");
        Skip.If(!File.Exists(Path.Combine(_root, "b.txt")), "mklink /H unavailable");

        var ok = Hardening.TryHarden(_root, out var error);

        Assert.False(ok);
        Assert.Contains("hard link", error ?? "", StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void An_ordinary_file_has_one_link()
    {
        var solo = Path.Combine(_root, "solo.txt");
        File.WriteAllText(solo, "x");

        Assert.Equal(1, Hardening.CountHardLinks(solo));
    }

    // ── Ordering: a directory is secured before it is read ───────────────────

    [Fact]
    public void A_directory_is_secured_before_anything_inside_it()
    {
        // The TOCTOU fix. Enumerating a directory that is still writable by the
        // attacker lets them swap an entry between the look and the write, so
        // every directory must be locked down before its contents are read.
        var sub = Path.Combine(_root, "sub");
        Directory.CreateDirectory(sub);
        File.WriteAllText(Path.Combine(sub, "deep.txt"), "x");

        var order = Hardening.PlanSecureOrder(new DirectoryInfo(_root));

        var subIndex = order.FindIndex(p => p.EndsWith("sub", StringComparison.OrdinalIgnoreCase));
        var deepIndex = order.FindIndex(p => p.EndsWith("deep.txt", StringComparison.OrdinalIgnoreCase));

        Assert.True(subIndex >= 0 && deepIndex >= 0, "both entries should be secured");
        Assert.True(subIndex < deepIndex, "the subdirectory must be secured before its contents");
    }

    [Fact]
    public void The_root_is_secured_first_of_all()
    {
        File.WriteAllText(Path.Combine(_root, "top.txt"), "x");

        var order = Hardening.PlanSecureOrder(new DirectoryInfo(_root));

        Assert.Equal(_root, order[0], ignoreCase: true);
    }

    // ── The root itself ──────────────────────────────────────────────────────

    [Fact]
    public void The_root_directory_is_secured_not_just_its_contents()
    {
        // Regression guard. A refactor once left SecureTree walking only the
        // entries inside the directory, so the install directory never had its
        // inheritance severed — and because children are set to inherit, every
        // file then picked up the Authenticated Users Modify still flowing down
        // from the volume root. TryHarden reported success while changing
        // nothing that mattered, the precise failure this code exists to stop.
        File.WriteAllText(Path.Combine(_root, "rail-update.exe"), "x");

        var (attempted, _) = Hardening.SecureTree(new DirectoryInfo(_root));

        Assert.NotEmpty(attempted);
        Assert.Equal(_root, attempted[0], ignoreCase: true);
    }

    [Fact]
    public void A_directory_that_could_not_be_secured_is_not_descended_into()
    {
        // The invariant that closes the race. Reading a directory still
        // writable by a standard user lets them swap an entry between the look
        // and the write, so if locking it down fails we must stop there rather
        // than walk on into contents we cannot trust.
        //
        // Holds whichever way the run goes: securing the root needs elevation,
        // so unelevated it fails and nothing inside may be touched, and
        // elevated it succeeds and the contents follow it.
        File.WriteAllText(Path.Combine(_root, "rail-update.exe"), "x");

        var (attempted, failures) = Hardening.SecureTree(new DirectoryInfo(_root));

        Assert.Equal(_root, attempted[0], ignoreCase: true);

        if (failures.Any(f => f.StartsWith(_root, StringComparison.OrdinalIgnoreCase)))
        {
            Assert.Single(attempted);
        }
        else
        {
            Assert.Contains(attempted,
                p => p.EndsWith("rail-update.exe", StringComparison.OrdinalIgnoreCase));
        }
    }
}
