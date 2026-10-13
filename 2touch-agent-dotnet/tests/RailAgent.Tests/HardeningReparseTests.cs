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
}
