using System.Diagnostics;
using RailAgent.Setup;
using Xunit;

namespace RailAgent.Tests;

/// <summary>
/// Every helper this code shells out to runs elevated, from the install
/// directory, which a standard user can write to until hardening has succeeded.
/// CreateProcess searches the calling process's own directory before anything
/// else, so launching "sc.exe" by bare name lets an attacker drop
/// C:\rail-agent\sc.exe and have it run as administrator the moment an operator
/// does anything at all. The name must be anchored to System32.
/// </summary>
public class SystemPathsTests
{
    [Theory]
    [InlineData("sc.exe")]
    [InlineData("schtasks.exe")]
    [InlineData("fsutil.exe")]
    [InlineData("cmd.exe")]
    public void A_system_tool_resolves_under_system32(string name)
    {
        var resolved = SystemPaths.Executable(name);

        Assert.True(Path.IsPathFullyQualified(resolved), $"{resolved} should be absolute");
        Assert.StartsWith(Environment.SystemDirectory, resolved, StringComparison.OrdinalIgnoreCase);
        Assert.EndsWith(name, resolved, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void The_resolved_tool_actually_exists()
    {
        // Guards against anchoring to the wrong directory: a path that is
        // absolute but wrong would fail at run time on a POS box rather than
        // here.
        Assert.True(File.Exists(SystemPaths.Executable("sc.exe")));
    }

    [Fact]
    public void No_production_code_launches_a_bare_executable_name()
    {
        // The rule is only worth having if it is kept. Walks the Setup sources
        // rather than trusting review: a new ProcessStartInfo("x.exe") added
        // later is the same hole reopened.
        var setupDir = FindSetupDirectory();
        Skip.If(setupDir is null, "source tree not available");

        var offenders = Directory
            .EnumerateFiles(setupDir!, "*.cs", SearchOption.AllDirectories)
            .SelectMany(f => File.ReadAllLines(f).Select((line, i) => (f, i, line)))
            .Where(x => x.line.Contains("new ProcessStartInfo(\"", StringComparison.Ordinal))
            .Select(x => $"{Path.GetFileName(x.f)}:{x.i + 1}")
            .ToList();

        Assert.True(offenders.Count == 0,
            "launch system tools through SystemPaths.Executable, not a bare name: "
            + string.Join(", ", offenders));
    }

    private static string? FindSetupDirectory()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            var candidate = Path.Combine(dir.FullName, "Setup");
            if (Directory.Exists(candidate) && File.Exists(Path.Combine(candidate, "Hardening.cs")))
                return candidate;
            dir = dir.Parent;
        }
        return null;
    }
}
