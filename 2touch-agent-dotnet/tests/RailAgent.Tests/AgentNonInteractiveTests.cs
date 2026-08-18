using System.Diagnostics;
using System.Reflection;
using RailAgent.Setup;
using Xunit;

namespace RailAgent.Tests;

/// <summary>
/// The agent binary must never wait on input.
///
/// It runs unattended on a POS box, and it is the executable most likely to be
/// started by a Scheduled Task or a monitoring script with no arguments. An
/// unbounded Console.ReadLine() in that path hangs the process forever with
/// nobody present to press a key — the process stays resident, the task never
/// reports, and the box looks fine until somebody checks.
/// </summary>
public class AgentNonInteractiveTests
{
    /// <summary>Every flag the agent still answers, and none may block.</summary>
    public static TheoryData<string> AgentFlags => new()
    {
        "--version", "--setup", "--uninstall", "--diagnose", "--menu",
    };

    [Theory]
    [MemberData(nameof(AgentFlags))]
    public void Flag_paths_exit_without_waiting_for_input(string flag)
    {
        var exe = AgentExePath();
        Skip.If(exe is null, "agent exe not built; run dotnet build first");

        using var p = Process.Start(new ProcessStartInfo(exe!, flag)
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            // NOT redirecting stdin would let a blocking read inherit this test
            // runner's console and hang the whole suite.
            RedirectStandardInput = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        })!;

        var exited = p.WaitForExit(15_000);
        if (!exited) { try { p.Kill(entireProcessTree: true); } catch { } }

        Assert.True(exited, $"'{flag}' did not exit within 15s — something is waiting on input");
    }

    [Fact]
    public void PauseBounded_returns_immediately_when_input_is_redirected()
    {
        // A redirected stdin means a script is driving this, so there is nobody
        // to wait for and the pause must be a no-op rather than a timeout.
        var sw = Stopwatch.StartNew();
        ConsoleUi.PauseBounded(30);
        sw.Stop();

        Assert.True(
            sw.Elapsed < TimeSpan.FromSeconds(5),
            $"PauseBounded blocked for {sw.Elapsed.TotalSeconds:N1}s under redirected input");
    }

    [Fact]
    public void The_agent_no_longer_exposes_the_interactive_setup_flags()
    {
        // Setup, diagnose and uninstall moved to their own executables. If one
        // came back into this binary it would drag its prompts with it.
        var exe = AgentExePath();
        Skip.If(exe is null, "agent exe not built");

        foreach (var flag in new[] { "--setup", "--uninstall", "--diagnose" })
        {
            using var p = Process.Start(new ProcessStartInfo(exe!, flag)
            {
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                RedirectStandardInput = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            })!;

            var stderr = p.StandardError.ReadToEnd();
            p.WaitForExit(15_000);

            Assert.Equal(1, p.ExitCode);
            Assert.Contains("has moved out of the agent", stderr);
        }
    }

    /// <summary>Locates the built agent beside the test assembly's output.</summary>
    private static string? AgentExePath()
    {
        var dir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location)!;
        foreach (var candidate in new[]
        {
            Path.Combine(dir, "rail-2touch-agent.exe"),
            Path.GetFullPath(Path.Combine(dir, "..", "..", "..", "..", "..", "bin", "Debug", "net9.0-windows", "rail-2touch-agent.exe")),
        })
        {
            if (File.Exists(candidate)) return candidate;
        }
        return null;
    }
}
