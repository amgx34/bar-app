using System.Diagnostics;
using RailAgent.Setup;
using Xunit;

namespace RailAgent.Tests;

/// <summary>
/// <see cref="Diagnostics.Bounded{T}"/> is the one guarantee the whole
/// <c>--diagnose</c> mode rests on: the operator runs it *because* something is
/// hanging, so a check that inherits the hang is worse than useless.
///
/// This cannot be proved through a real SqlConnection — SqlClient's own
/// ConnectTimeout fires first and masks whether our budget works at all.
/// </summary>
public class DiagnosticsTests
{
    [Fact]
    public async Task ReturnsTheValueWhenWorkFinishesInTime()
    {
        var result = await Diagnostics.Bounded(
            async _ => { await Task.Delay(10); return 42; },
            TimeSpan.FromSeconds(5));

        Assert.False(result.TimedOut);
        Assert.Null(result.Error);
        Assert.Equal(42, result.Value);
    }

    [Fact]
    public async Task ReportsTimeoutForWorkThatNeverFinishes()
    {
        var sw = Stopwatch.StartNew();

        var result = await Diagnostics.Bounded<int>(
            _ => new TaskCompletionSource<int>().Task,   // never completes, ignores cancellation
            TimeSpan.FromMilliseconds(300));

        sw.Stop();

        Assert.True(result.TimedOut);
        Assert.Null(result.Error);
        Assert.InRange(sw.ElapsedMilliseconds, 250, 3000);
    }

    [Fact]
    public async Task DoesNotWaitOnWorkIgnoringItsCancellationToken()
    {
        // The real case: blocked inside native code, where cancellation cannot
        // reach. Bounded must abandon it rather than await it.
        var released = new ManualResetEventSlim(false);
        try
        {
            var result = await Diagnostics.Bounded(
                _ => Task.Run(() => { released.Wait(); return 1; }),
                TimeSpan.FromMilliseconds(300));

            Assert.True(result.TimedOut);
        }
        finally { released.Set(); }
    }

    [Fact]
    public async Task CapturesAnException()
    {
        var result = await Diagnostics.Bounded<int>(
            _ => throw new InvalidOperationException("boom"),
            TimeSpan.FromSeconds(5));

        Assert.False(result.TimedOut);
        Assert.IsType<InvalidOperationException>(result.Error);
        Assert.Equal("boom", result.Error!.Message);
    }

    [Fact]
    public async Task CapturesAnAsyncFault()
    {
        var result = await Diagnostics.Bounded<int>(
            async _ => { await Task.Delay(10); throw new TimeoutException("late"); },
            TimeSpan.FromSeconds(5));

        Assert.False(result.TimedOut);
        Assert.IsType<TimeoutException>(result.Error);
    }

    [Fact]
    public async Task AnAbandonedFaultDoesNotResurfaceUnobserved()
    {
        // An orphan that faults after its budget expired must not take the
        // process down when the finalizer observes it.
        var result = await Diagnostics.Bounded<int>(
            async _ => { await Task.Delay(400); throw new InvalidOperationException("late boom"); },
            TimeSpan.FromMilliseconds(100));

        Assert.True(result.TimedOut);

        await Task.Delay(600);
        GC.Collect();
        GC.WaitForPendingFinalizers();
        GC.Collect();
        // Reaching here without an unhandled TaskScheduler exception is the assertion.
    }

    [Fact]
    public async Task CancelsCooperativeWorkOnTimeout()
    {
        var cancelled = new TaskCompletionSource<bool>();

        var result = await Diagnostics.Bounded<int>(
            async token =>
            {
                try { await Task.Delay(Timeout.Infinite, token); }
                catch (OperationCanceledException) { cancelled.TrySetResult(true); throw; }
                return 0;
            },
            TimeSpan.FromMilliseconds(200));

        Assert.True(result.TimedOut);

        // Cancellation is signalled even though the result was already reported.
        var observed = await Task.WhenAny(cancelled.Task, Task.Delay(2000));
        Assert.Same(cancelled.Task, observed);
    }
}
