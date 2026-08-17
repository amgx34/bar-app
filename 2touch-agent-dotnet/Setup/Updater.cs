using System.Diagnostics;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace RailAgent.Setup;

/// <summary>
/// In-place upgrade of the agent service executable.
///
/// This runs on an unattended machine behind a bar, usually with nobody
/// watching, and it replaces the binary that feeds a business its numbers. The
/// design follows from that: every step is reversible, nothing is deleted until
/// the replacement has proven it starts, and any failure leaves the box running
/// the version it was already running.
///
/// It lives in a SEPARATE executable (rail-update.exe) for a reason that is not
/// stylistic — Windows holds a lock on a running image, so a process cannot
/// overwrite itself. The updater must be a different binary from the one being
/// replaced.
/// </summary>
public static class Updater
{
    /// <summary>Suffix for the copy kept so a bad release can be rolled back.</summary>
    public const string BackupSuffix = ".bak";

    public sealed record Manifest(
        [property: JsonPropertyName("version")] string Version,
        [property: JsonPropertyName("sha256")] string Sha256,
        [property: JsonPropertyName("url")] string Url,
        [property: JsonPropertyName("minimumVersion")] string? MinimumVersion,
        [property: JsonPropertyName("releaseNotes")] string? ReleaseNotes,
        [property: JsonPropertyName("fileName")] string? FileName);

    public enum UpdateState
    {
        /// <summary>Nothing published, or the installed build is already current.</summary>
        UpToDate,
        /// <summary>A newer build exists.</summary>
        Available,
        /// <summary>Installed build is below the manifest's minimum — should not be deferred.</summary>
        Required,
    }

    public sealed record CheckResult(
        UpdateState State,
        Version Installed,
        Version? Latest,
        Manifest? Manifest,
        string? Problem)
    {
        public bool HasUpdate => State is UpdateState.Available or UpdateState.Required;
    }

    // ── Checking ─────────────────────────────────────────────────────────────

    /// <summary>
    /// Asks Rail what the newest build is and compares it with what is on disk.
    ///
    /// Never throws: a POS box with no internet, a blocked proxy or a DNS
    /// failure is an ordinary Tuesday, and the caller needs a message rather
    /// than a stack trace.
    /// </summary>
    public static Task<CheckResult> CheckAsync(
        HttpClient http,
        string apiBaseUrl,
        string agentExePath,
        CancellationToken ct)
        => CheckAsync(
            http,
            apiBaseUrl,
            // Falls back to this assembly's own version when the agent is not
            // on disk, so a check run from an unusual location still reports
            // something truthful rather than 0.0.0.
            AgentVersion.ReadFileVersion(agentExePath) ?? AgentVersion.Current,
            ct);

    /// <summary>
    /// Core comparison, with the installed version supplied rather than read.
    ///
    /// Separate overload because the version-ranking rules are the part most
    /// worth testing and the least convenient to set up through the filesystem:
    /// there is no honest way to fake a PE version resource in a unit test.
    /// </summary>
    public static async Task<CheckResult> CheckAsync(
        HttpClient http,
        string apiBaseUrl,
        Version installed,
        CancellationToken ct)
    {
        Manifest? manifest;
        try
        {
            var url = $"{apiBaseUrl.TrimEnd('/')}/api/agent/manifest";
            using var response = await http.GetAsync(url, ct);

            // 204 is Rail saying "no release configured", which is not an error.
            if (response.StatusCode == System.Net.HttpStatusCode.NoContent)
                return new CheckResult(UpdateState.UpToDate, installed, null, null, null);

            if (!response.IsSuccessStatusCode)
                return new CheckResult(UpdateState.UpToDate, installed, null, null,
                    $"Rail returned {(int)response.StatusCode} when asked for the update manifest.");

            var body = await response.Content.ReadAsStringAsync(ct);
            manifest = JsonSerializer.Deserialize<Manifest>(body);
        }
        catch (Exception ex)
        {
            return new CheckResult(UpdateState.UpToDate, installed, null, null,
                $"Could not reach Rail to check for updates: {ex.Message}");
        }

        if (manifest is null || !Version.TryParse(manifest.Version, out var latest))
            return new CheckResult(UpdateState.UpToDate, installed, null, null,
                "Rail published an update manifest this agent could not read.");

        if (latest <= installed)
            return new CheckResult(UpdateState.UpToDate, installed, latest, manifest, null);

        var state = Version.TryParse(manifest.MinimumVersion, out var minimum) && installed < minimum
            ? UpdateState.Required
            : UpdateState.Available;

        return new CheckResult(state, installed, latest, manifest, null);
    }

    // ── Applying ─────────────────────────────────────────────────────────────

    public sealed record ApplyResult(bool Ok, string Message, bool RolledBack = false);

    /// <summary>
    /// Downloads, verifies and installs a build, restarting the service around
    /// the swap and rolling back if the new binary will not run.
    ///
    /// <paramref name="log"/> receives progress; the caller decides whether that
    /// goes to a console or a transcript.
    /// </summary>
    public static async Task<ApplyResult> ApplyAsync(
        HttpClient http,
        Manifest manifest,
        string agentExePath,
        Action<string> log,
        CancellationToken ct)
    {
        var directory = Path.GetDirectoryName(agentExePath);
        if (string.IsNullOrEmpty(directory))
            return new ApplyResult(false, $"Could not resolve the install directory from '{agentExePath}'.");

        // Staged beside the target, not in %TEMP%: the final move has to be on
        // the same volume to be atomic, and a cross-volume move is a copy that
        // can be interrupted halfway through leaving a truncated exe in place.
        var staged = agentExePath + ".new";
        var backup = agentExePath + BackupSuffix;

        try
        {
            // ── 1. Download ──────────────────────────────────────────────────
            log($"Downloading {manifest.Version}…");
            byte[] payload;
            try
            {
                using var response = await http.GetAsync(manifest.Url, ct);
                if (!response.IsSuccessStatusCode)
                    return new ApplyResult(false,
                        $"Download failed: the server returned {(int)response.StatusCode}.");
                payload = await response.Content.ReadAsByteArrayAsync(ct);
            }
            catch (Exception ex)
            {
                return new ApplyResult(false, $"Download failed: {ex.Message}");
            }

            // ── 2. Verify BEFORE anything is touched ─────────────────────────
            //
            // The whole integrity story rests here. A mismatch means the file is
            // not the build Rail published — truncated, corrupted, or swapped —
            // and the only safe response is to stop while the running service is
            // still untouched.
            var actual = Convert.ToHexString(SHA256.HashData(payload)).ToLowerInvariant();
            var expected = manifest.Sha256.Trim().ToLowerInvariant();
            if (!CryptographicOperations.FixedTimeEquals(
                    Convert.FromHexString(actual), Convert.FromHexString(expected)))
            {
                return new ApplyResult(false,
                    "Downloaded file did not match the published checksum, so nothing was changed. " +
                    $"Expected {expected}, got {actual}.");
            }
            log($"Checksum verified ({payload.Length / 1024 / 1024} MB).");

            await File.WriteAllBytesAsync(staged, payload, ct);

            // ── 3. Stop the service ──────────────────────────────────────────
            var wasRunning = ServiceControl.Exists() && ServiceControl.IsRunning();
            if (wasRunning)
            {
                log("Stopping the service…");
                ServiceControl.Stop();
            }

            // ── 4. Swap, keeping the old binary ──────────────────────────────
            if (File.Exists(backup)) File.Delete(backup);
            if (File.Exists(agentExePath)) File.Move(agentExePath, backup);
            File.Move(staged, agentExePath);
            log($"Installed {manifest.Version}.");

            // ── 5. Start, and prove it actually runs ─────────────────────────
            if (!wasRunning)
            {
                return new ApplyResult(true,
                    $"Updated to {manifest.Version}. The service was not running, so it was left stopped.");
            }

            var since = DateTime.Now;
            log("Starting the service…");
            var started = ServiceControl.Start();

            // A service that starts and then immediately faults reports success
            // to sc.exe, so the Event Log is the real check — the same one the
            // setup wizard uses after a fresh install.
            var entryType = ServiceControl.WaitForFirstEntry(
                since, TimeSpan.FromSeconds(45), out var summary);

            var healthy = started.Ok && entryType is not EventLogEntryType.Error;
            if (healthy)
            {
                return new ApplyResult(true,
                    $"Updated to {manifest.Version} and the service is running." +
                    (string.IsNullOrWhiteSpace(summary) ? "" : $" ({summary})"));
            }

            // ── 6. Roll back ─────────────────────────────────────────────────
            log("The new version did not start cleanly — rolling back.");
            var rollback = Rollback(agentExePath, log);
            return new ApplyResult(false,
                $"{manifest.Version} failed to start{(string.IsNullOrWhiteSpace(summary) ? "" : $": {summary}")}. " +
                (rollback
                    ? "The previous version was restored and started."
                    : "ROLLBACK ALSO FAILED — the service is down and needs attention."),
                RolledBack: rollback);
        }
        catch (Exception ex)
        {
            // Anything unexpected during the swap window leaves the box in a
            // state only rollback can resolve, so attempt it before reporting.
            var rollback = Rollback(agentExePath, log);
            return new ApplyResult(false,
                $"Update failed: {ex.Message}. " +
                (rollback ? "The previous version was restored." : "The previous version could NOT be restored."),
                RolledBack: rollback);
        }
        finally
        {
            // A staged file left behind would be silently reused by nothing, but
            // it is a 70MB puzzle for whoever looks in the folder next.
            try { if (File.Exists(staged)) File.Delete(staged); } catch { /* best effort */ }
        }
    }

    /// <summary>
    /// Puts the backup back and restarts. Returns false when there is nothing to
    /// restore, which is itself worth reporting — it means the box is running
    /// whatever the failed attempt left behind.
    /// </summary>
    public static bool Rollback(string agentExePath, Action<string> log)
    {
        var backup = agentExePath + BackupSuffix;
        try
        {
            if (!File.Exists(backup))
            {
                log("No backup was present to roll back to.");
                return false;
            }

            if (ServiceControl.Exists() && ServiceControl.IsRunning()) ServiceControl.Stop();
            if (File.Exists(agentExePath)) File.Delete(agentExePath);
            File.Move(backup, agentExePath);

            if (ServiceControl.Exists()) ServiceControl.Start();
            log("Previous version restored.");
            return true;
        }
        catch (Exception ex)
        {
            log($"Rollback failed: {ex.Message}");
            return false;
        }
    }
}
