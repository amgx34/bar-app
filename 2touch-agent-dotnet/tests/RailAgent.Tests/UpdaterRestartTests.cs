using System.Diagnostics;
using RailAgent.Setup;
using Xunit;

namespace RailAgent.Tests;

/// <summary>
/// What the updater concludes after swapping the binary.
///
/// This ran unattended at 03:30 and reported back to nobody, so "success" has
/// to mean the bar is syncing on the new build — not that sc.exe accepted a
/// start command. The old version inferred health from an exit code and the
/// absence of an Event Log error, and never asked the one question that
/// matters: is it running now?
/// </summary>
public class UpdaterRestartTests
{
    [Fact]
    public void A_service_that_is_running_cleanly_is_healthy()
    {
        var verdict = Updater.JudgeRestart(
            serviceExists: true, wasRunning: true,
            startReported: true, runningNow: true, errorInLog: false);

        Assert.Equal(Updater.RestartVerdict.Healthy, verdict);
    }

    [Fact]
    public void A_start_that_reported_success_but_is_not_running_is_a_failure()
    {
        // The gap this exists to close. sc.exe returns 0 for "the SCM accepted
        // the request", which a service that faults immediately also does.
        var verdict = Updater.JudgeRestart(
            serviceExists: true, wasRunning: true,
            startReported: true, runningNow: false, errorInLog: false);

        Assert.Equal(Updater.RestartVerdict.FailedToStart, verdict);
    }

    [Fact]
    public void An_error_in_the_event_log_is_a_failure_even_if_it_is_running()
    {
        var verdict = Updater.JudgeRestart(
            serviceExists: true, wasRunning: true,
            startReported: true, runningNow: true, errorInLog: true);

        Assert.Equal(Updater.RestartVerdict.FailedToStart, verdict);
    }

    [Fact]
    public void A_service_left_stopped_is_not_reported_as_success()
    {
        // It used to be. A box whose service is not running is a bar that has
        // stopped syncing, which is the outage this release exists to make
        // visible — reporting it as a clean update is the exact opposite.
        var verdict = Updater.JudgeRestart(
            serviceExists: true, wasRunning: false,
            startReported: false, runningNow: false, errorInLog: false);

        Assert.Equal(Updater.RestartVerdict.NotRunning, verdict);
    }

    [Fact]
    public void A_service_that_was_stopped_but_is_running_now_is_healthy()
    {
        // Covers the case that produced this work: IsRunning said no, so the
        // updater never stopped anything, swapped the file under a live process
        // and called it "left stopped". If it is running at the end, say so.
        var verdict = Updater.JudgeRestart(
            serviceExists: true, wasRunning: false,
            startReported: false, runningNow: true, errorInLog: false);

        Assert.Equal(Updater.RestartVerdict.Healthy, verdict);
    }

    [Fact]
    public void With_no_service_installed_there_is_nothing_to_restart()
    {
        var verdict = Updater.JudgeRestart(
            serviceExists: false, wasRunning: false,
            startReported: false, runningNow: false, errorInLog: false);

        Assert.Equal(Updater.RestartVerdict.NoService, verdict);
    }

    [Fact]
    public void Only_a_healthy_verdict_counts_as_a_successful_update()
    {
        Assert.True(Updater.RestartVerdict.Healthy.IsSuccess());
        Assert.False(Updater.RestartVerdict.FailedToStart.IsSuccess());
        Assert.False(Updater.RestartVerdict.NotRunning.IsSuccess());

        // Nothing to run and nothing broken: the file was replaced correctly.
        Assert.True(Updater.RestartVerdict.NoService.IsSuccess());
    }

    [Fact]
    public void Only_a_failed_start_should_roll_back()
    {
        // Rolling back a service someone had deliberately stopped would restore
        // an older binary for no reason.
        Assert.True(Updater.RestartVerdict.FailedToStart.ShouldRollBack());
        Assert.False(Updater.RestartVerdict.NotRunning.ShouldRollBack());
        Assert.False(Updater.RestartVerdict.Healthy.ShouldRollBack());
        Assert.False(Updater.RestartVerdict.NoService.ShouldRollBack());
    }
}
