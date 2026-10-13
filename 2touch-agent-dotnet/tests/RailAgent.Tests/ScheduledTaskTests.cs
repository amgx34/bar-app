using System.Globalization;
using RailAgent.Setup;
using Xunit;

namespace RailAgent.Tests;

/// <summary>
/// The auto-update task runs unattended, as SYSTEM, on a box behind a bar. The
/// part worth testing is the one that cannot be observed from here: the exact
/// argument vector handed to schtasks.exe. A wrong quote or a locale-formatted
/// time produces a task that registers cleanly and then never runs, which is
/// indistinguishable from the problem it was added to solve.
///
/// Precedent: ServiceControl.Install encodes sc.exe's "key= value" quirk, and
/// that quirk is the sort of thing these tests exist to pin.
/// </summary>
public class ScheduledTaskTests
{
    private static string[] Install(string path = @"C:\Rail\rail-update.exe")
        => ScheduledTask.BuildInstallArgs(path, new TimeOnly(3, 30));

    private static string Arg(string[] args, string flag)
    {
        var i = Array.FindIndex(args, a => string.Equals(a, flag, StringComparison.OrdinalIgnoreCase));
        Assert.True(i >= 0 && i + 1 < args.Length, $"expected {flag} with a value in: {string.Join(' ', args)}");
        return args[i + 1];
    }

    // ── What the task actually runs ──────────────────────────────────────────

    [Fact]
    public void Task_runs_the_updater_unattended()
    {
        // Without --yes the task would sit at a confirmation prompt no one can
        // answer, holding the box on its old version forever.
        Assert.Contains("--yes", Arg(Install(), "/TR"));
    }

    [Fact]
    public void Updater_path_is_quoted_so_Program_Files_works()
    {
        // The default install directory has a space in it. Unquoted, schtasks
        // treats "C:\Program" as the program and "Files\..." as an argument.
        var tr = Arg(Install(@"C:\Program Files\Rail\rail-update.exe"), "/TR");

        Assert.Contains("\"C:\\Program Files\\Rail\\rail-update.exe\"", tr);
    }

    [Fact]
    public void Task_runs_as_system()
    {
        // Installing an update stops and starts a Windows Service. Nothing less
        // than SYSTEM can do that with no one logged in.
        Assert.Equal("SYSTEM", Arg(Install(), "/RU"));
    }

    [Fact]
    public void Task_runs_with_highest_privileges()
    {
        Assert.Contains("/RL", Install());
        Assert.Equal("HIGHEST", Arg(Install(), "/RL"));
    }

    // ── When it runs ─────────────────────────────────────────────────────────

    [Fact]
    public void Task_runs_daily()
    {
        Assert.Equal("DAILY", Arg(Install(), "/SC"));
    }

    [Fact]
    public void Start_time_is_24_hour_regardless_of_machine_locale()
    {
        // schtasks /ST demands HH:mm. A box set to a culture that renders
        // 03:30 as "3:30 AM" would be rejected, and the agent would never
        // update again on exactly the machines hardest to get to.
        var original = CultureInfo.CurrentCulture;
        try
        {
            CultureInfo.CurrentCulture = new CultureInfo("en-US");
            var us = Arg(Install(), "/ST");
            CultureInfo.CurrentCulture = new CultureInfo("de-DE");
            var de = Arg(Install(), "/ST");

            Assert.Equal("03:30", us);
            Assert.Equal("03:30", de);
        }
        finally
        {
            CultureInfo.CurrentCulture = original;
        }
    }

    // ── Re-running setup must not fail ───────────────────────────────────────

    [Fact]
    public void Registering_over_an_existing_task_is_forced()
    {
        // The wizard registers this on every install, and setup gets re-run on
        // a box that already has the task. Without /F schtasks prompts, and a
        // non-interactive install hangs.
        Assert.Contains("/F", Install());
    }

    [Fact]
    public void Install_and_remove_name_the_same_task()
    {
        // A mismatch here leaves an orphaned task pointing at a deleted exe
        // after an uninstall.
        Assert.Equal(
            Arg(Install(), "/TN"),
            Arg(ScheduledTask.BuildRemoveArgs(), "/TN"));
    }

    [Fact]
    public void Remove_does_not_prompt()
    {
        Assert.Contains("/F", ScheduledTask.BuildRemoveArgs());
    }

    [Fact]
    public void Remove_deletes_rather_than_creating()
    {
        Assert.Equal("/Delete", ScheduledTask.BuildRemoveArgs()[0]);
    }
}
