using System.Net;
using System.Security.Cryptography;
using System.Text;
using RailAgent.Setup;
using Xunit;

namespace RailAgent.Tests;

/// <summary>
/// The updater replaces the binary that feeds a bar its numbers, on a machine
/// with nobody watching. These tests cover the decisions that would be
/// expensive to get wrong: which builds count as newer, and what happens when a
/// download cannot be trusted.
/// </summary>
public class UpdaterTests
{
    // ── Version comparison ───────────────────────────────────────────────────

    [Fact]
    public async Task Newer_version_is_offered()
    {
        var result = await CheckWith(Manifest("2.0.0"), installed: "1.0.0");

        Assert.Equal(Updater.UpdateState.Available, result.State);
        Assert.True(result.HasUpdate);
        Assert.Equal(new Version(2, 0, 0), result.Latest);
    }

    [Fact]
    public async Task Same_version_is_not_offered()
    {
        var result = await CheckWith(Manifest("1.4.2"), installed: "1.4.2");

        Assert.Equal(Updater.UpdateState.UpToDate, result.State);
        Assert.False(result.HasUpdate);
    }

    [Fact]
    public async Task Older_published_version_is_not_offered()
    {
        // A rolled-back release must never downgrade a box that already moved on.
        var result = await CheckWith(Manifest("1.0.0"), installed: "1.5.0");

        Assert.Equal(Updater.UpdateState.UpToDate, result.State);
    }

    [Fact]
    public async Task Version_comparison_is_numeric_not_lexicographic()
    {
        // The classic updater bug: as strings, "1.10.0" sorts BELOW "1.9.0", so
        // an updater that compares text quietly stops offering updates after the
        // tenth minor release and nobody notices for months.
        var result = await CheckWith(Manifest("1.10.0"), installed: "1.9.0");

        Assert.Equal(Updater.UpdateState.Available, result.State);
        Assert.True(result.HasUpdate);
    }

    [Fact]
    public async Task Below_minimum_version_is_required_not_merely_available()
    {
        var result = await CheckWith(
            Manifest("2.0.0", minimumVersion: "1.5.0"), installed: "1.0.0");

        Assert.Equal(Updater.UpdateState.Required, result.State);
    }

    [Fact]
    public async Task At_or_above_minimum_version_is_only_available()
    {
        var result = await CheckWith(
            Manifest("2.0.0", minimumVersion: "1.5.0"), installed: "1.5.0");

        Assert.Equal(Updater.UpdateState.Available, result.State);
    }

    // ── Failure modes that must not become update attempts ───────────────────

    [Fact]
    public async Task No_release_configured_reads_as_up_to_date()
    {
        // Rail answers 204 when no release is published. That is not an error,
        // and it must not surface to the operator as one.
        var result = await CheckAsync(new StubHandler(HttpStatusCode.NoContent, ""));

        Assert.Equal(Updater.UpdateState.UpToDate, result.State);
        Assert.Null(result.Problem);
        Assert.False(result.HasUpdate);
    }

    [Fact]
    public async Task Unreachable_server_reports_a_problem_and_offers_nothing()
    {
        var result = await CheckAsync(new ThrowingHandler(new HttpRequestException("no such host")));

        Assert.False(result.HasUpdate);
        Assert.NotNull(result.Problem);
        Assert.Contains("check for updates", result.Problem);
    }

    [Fact]
    public async Task Server_error_reports_a_problem_and_offers_nothing()
    {
        var result = await CheckAsync(new StubHandler(HttpStatusCode.InternalServerError, "boom"));

        Assert.False(result.HasUpdate);
        Assert.NotNull(result.Problem);
        Assert.Contains("500", result.Problem);
    }

    [Fact]
    public async Task Unparseable_manifest_offers_nothing()
    {
        var result = await CheckAsync(new StubHandler(HttpStatusCode.OK, "{\"version\":\"not-a-version\"}"));

        Assert.False(result.HasUpdate);
        Assert.NotNull(result.Problem);
    }

    // ── Integrity ────────────────────────────────────────────────────────────

    [Fact]
    public async Task A_download_that_fails_its_checksum_changes_nothing()
    {
        // The single most important behaviour here. A mismatch means the bytes
        // are not the build Rail published, and the running service must be left
        // exactly as it was — not stopped, not swapped, not backed up over.
        using var dir = new TempDir();
        var agentExe = Path.Combine(dir.Path, "rail-2touch-agent.exe");
        File.WriteAllText(agentExe, "the original agent");

        var payload = Encoding.UTF8.GetBytes("a different build entirely");
        var wrongDigest = new string('a', 64);

        var http = new HttpClient(new StubHandler(HttpStatusCode.OK, payload));
        var log = new List<string>();

        var result = await Updater.ApplyAsync(
            http,
            ManifestRecord("9.9.9", wrongDigest),
            agentExe,
            log.Add,
            CancellationToken.None);

        Assert.False(result.Ok);
        Assert.Contains("checksum", result.Message, StringComparison.OrdinalIgnoreCase);

        // Untouched, and no debris left behind.
        Assert.Equal("the original agent", File.ReadAllText(agentExe));
        Assert.False(File.Exists(agentExe + ".new"));
        Assert.False(File.Exists(agentExe + Updater.BackupSuffix));
    }

    [Fact]
    public async Task A_failed_download_changes_nothing()
    {
        using var dir = new TempDir();
        var agentExe = Path.Combine(dir.Path, "rail-2touch-agent.exe");
        File.WriteAllText(agentExe, "the original agent");

        var http = new HttpClient(new StubHandler(HttpStatusCode.NotFound, ""));

        var result = await Updater.ApplyAsync(
            http, ManifestRecord("9.9.9", new string('0', 64)), agentExe, _ => { }, CancellationToken.None);

        Assert.False(result.Ok);
        Assert.Equal("the original agent", File.ReadAllText(agentExe));
    }

    // ── Rollback ─────────────────────────────────────────────────────────────

    [Fact]
    public void Rollback_without_a_backup_reports_failure_rather_than_pretending()
    {
        using var dir = new TempDir();
        var agentExe = Path.Combine(dir.Path, "rail-2touch-agent.exe");
        File.WriteAllText(agentExe, "current");

        var log = new List<string>();
        var ok = Updater.Rollback(agentExe, log.Add);

        Assert.False(ok);
        Assert.Contains(log, l => l.Contains("No backup", StringComparison.OrdinalIgnoreCase));
        // The current binary must survive a rollback that had nothing to do.
        Assert.Equal("current", File.ReadAllText(agentExe));
    }

    // ── Version reading ──────────────────────────────────────────────────────

    [Fact]
    public void Missing_executable_has_no_readable_version()
    {
        using var dir = new TempDir();
        Assert.Null(AgentVersion.ReadFileVersion(Path.Combine(dir.Path, "nope.exe")));
    }

    [Fact]
    public void A_non_executable_file_does_not_throw()
    {
        // FileVersionInfo on arbitrary bytes must degrade to null, because the
        // updater calls this before it knows what it is looking at.
        using var dir = new TempDir();
        var junk = Path.Combine(dir.Path, "junk.exe");
        File.WriteAllText(junk, "not a PE file");

        Assert.Null(AgentVersion.ReadFileVersion(junk));
    }

    [Fact]
    public void Current_version_always_has_three_components()
    {
        // Comparisons depend on it: System.Version treats an unspecified
        // component as -1, so 1.2.0 would compare GREATER than 1.2 and every
        // check would report an update that does not exist.
        Assert.True(AgentVersion.Current.Build >= 0);
        Assert.Equal(3, AgentVersion.CurrentDisplay.Split('.').Length);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private static string Manifest(
        string version,
        string? minimumVersion = null,
        string? sha256 = null)
    {
        var min = minimumVersion is null ? "null" : $"\"{minimumVersion}\"";
        var digest = sha256 ?? new string('0', 64);
        return $$"""
        {
          "version": "{{version}}",
          "sha256": "{{digest}}",
          "url": "https://example.test/rail-2touch-agent.exe",
          "minimumVersion": {{min}},
          "releaseNotes": null,
          "fileName": "rail-2touch-agent.exe"
        }
        """;
    }

    /// <summary>Runs the real comparison against a published manifest.</summary>
    private static async Task<Updater.CheckResult> CheckWith(string manifestJson, string installed)
    {
        using var http = new HttpClient(new StubHandler(HttpStatusCode.OK, manifestJson));
        return await Updater.CheckAsync(
            http, "https://rail.test", Version.Parse(installed), CancellationToken.None);
    }

    private static async Task<Updater.CheckResult> CheckAsync(HttpMessageHandler handler)
    {
        using var http = new HttpClient(handler);
        return await Updater.CheckAsync(
            http, "https://rail.test", new Version(1, 0, 0), CancellationToken.None);
    }

    /// <summary>A manifest as the record ApplyAsync consumes.</summary>
    private static Updater.Manifest ManifestRecord(string version, string sha256)
        => new(version, sha256, "https://example.test/rail-2touch-agent.exe", null, null, "rail-2touch-agent.exe");

    private sealed class StubHandler : HttpMessageHandler
    {
        private readonly HttpStatusCode _status;
        private readonly byte[] _body;

        public StubHandler(HttpStatusCode status, string body)
            : this(status, Encoding.UTF8.GetBytes(body)) { }

        public StubHandler(HttpStatusCode status, byte[] body)
        {
            _status = status;
            _body = body;
        }

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken ct)
            => Task.FromResult(new HttpResponseMessage(_status)
            {
                Content = new ByteArrayContent(_body),
            });
    }

    private sealed class ThrowingHandler(Exception ex) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken ct)
            => Task.FromException<HttpResponseMessage>(ex);
    }

    private sealed class TempDir : IDisposable
    {
        public string Path { get; } =
            System.IO.Path.Combine(System.IO.Path.GetTempPath(), "rail-upd-" + Guid.NewGuid().ToString("N")[..8]);

        public TempDir() => Directory.CreateDirectory(Path);

        public void Dispose()
        {
            try { Directory.Delete(Path, recursive: true); } catch { /* best effort */ }
        }
    }
}
