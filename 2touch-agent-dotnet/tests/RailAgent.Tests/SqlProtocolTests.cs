using RailAgent.Services;
using RailAgent.Setup;
using Xunit;

namespace RailAgent.Tests;

/// <summary>
/// A real 2TouchPOS box was found with Shared Memory disabled in SQL Server
/// Configuration Manager. The agent hardcoded "lpc:", so every stage-5 connection
/// failed with "server was not found" and setup could not complete — on a machine
/// whose SQL Server was running and answering perfectly over the default protocol.
///
/// These pin the fallback so that cannot regress into a silent no-connect again.
/// </summary>
public class SqlProtocolTests
{
    [Fact]
    public void SharedMemoryIsStillTriedFirst()
    {
        // The whole design rests on it: no port, no SQL Browser, immune to the
        // dynamic port. It must remain the preference, just not the only option.
        Assert.Equal("lpc:", SqlProbe.Protocols[0]);
    }

    [Fact]
    public void TheClientDefaultIsOneOfTheFallbacks()
    {
        // This is the one that worked on the box in question: no prefix at all.
        Assert.Contains("", SqlProbe.Protocols);
    }

    [Fact]
    public void EveryProtocolIsDistinct()
        => Assert.Equal(SqlProbe.Protocols.Length, SqlProbe.Protocols.Distinct().Count());

    [Theory]
    [InlineData("lpc:", "shared memory")]
    [InlineData("np:", "named pipes")]
    [InlineData("", "client default")]
    [InlineData(null, "client default")]
    public void ProtocolsAreDescribedInWordsForTheOperator(string? protocol, string expected)
        => Assert.Equal(expected, SqlProbe.Describe(protocol));

    [Fact]
    public void ProbeCarriesTheProtocolIntoTheConnectionString()
    {
        // Passing a protocol through must actually change the Data Source, or the
        // fallback would silently keep using whatever the default was.
        var shared = SqlReader.BuildConnectionString(
            SqlProbe.Probe(@".\TWOTOUCH", "TwoTouch", protocol: "lpc:"));
        var plain = SqlReader.BuildConnectionString(
            SqlProbe.Probe(@".\TWOTOUCH", "TwoTouch", protocol: ""));

        Assert.Contains(@"lpc:.\TWOTOUCH", shared, StringComparison.Ordinal);
        Assert.DoesNotContain("lpc:", plain, StringComparison.Ordinal);
        Assert.Contains(@".\TWOTOUCH", plain, StringComparison.Ordinal);
    }

    [Fact]
    public void ProbeStillDefaultsToSharedMemory()
    {
        // Callers that do not care keep the old behaviour.
        var cfg = SqlProbe.Probe("(local)", "master");
        Assert.Equal("lpc:", cfg.Protocol);
    }

    [Fact]
    public void ProbeHonoursAShortTimeoutForFallbackScanning()
    {
        // Trying three protocols at the 15s default would mean a 45s stall before
        // the operator sees anything. The scan uses 5s a piece.
        Assert.Equal(5, SqlProbe.Probe("(local)", "master", timeoutSeconds: 5).ConnectTimeoutSeconds);
        Assert.Equal(15, SqlProbe.Probe("(local)", "master").ConnectTimeoutSeconds);
    }

    [Fact]
    public async Task OpenFirstWorkingReturnsNullWhenNothingAnswers()
    {
        // A server name that cannot resolve on any protocol. Must come back null
        // rather than throwing, so stage 5 can print a diagnosis instead of a trace.
        var result = await SqlProbe.OpenFirstWorkingAsync(
            "rail-no-such-instance-" + Guid.NewGuid().ToString("N"),
            "master", user: "", password: "", CancellationToken.None);

        Assert.Null(result);
    }

    [SkippableFact]
    public async Task OpenFirstWorkingFindsAProtocolOnARealInstance()
    {
        var instances = SqlProbe.FindInstances();
        Skip.If(instances.Count == 0, "No local SQL Server instance is installed.");

        var result = await SqlProbe.OpenFirstWorkingAsync(
            instances[0], "master", user: "", password: "", CancellationToken.None);

        Skip.If(result is null, $"{instances[0]} refused every protocol for this account.");

        await using var conn = result!.Value.Connection;
        Assert.Contains(result.Value.Protocol, SqlProbe.Protocols);
        Assert.Equal(System.Data.ConnectionState.Open, conn.State);
    }
}
