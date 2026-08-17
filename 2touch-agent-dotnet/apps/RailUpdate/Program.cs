using System.Text.Json;
using RailAgent.Setup;

// rail-update.exe — upgrades the installed agent in place.
//
//   (double-click)  check, show what is available, ask before installing
//   --check         report only, change nothing. Exit 10 = update available.
//   --yes           install without asking (for a Scheduled Task)
//   --rollback      put the previous version back
//
// A separate executable because Windows locks a running image: the agent
// service cannot overwrite its own binary. See Setup/Updater.cs.

try { Console.OutputEncoding = System.Text.Encoding.UTF8; } catch { /* keep the default */ }

var check = Has("--check");
var assumeYes = Has("--yes") || Has("-y");
var rollback = Has("--rollback");
var interactive = args.Length == 0;

var agentExe = AgentVersion.AgentExePath;

Console.WriteLine();
Console.WriteLine("  Rail — 2TouchPOS agent update");
Console.WriteLine("  " + new string('─', 60));

if (rollback)
{
    if (!Elevation.IsAdministrator())
    {
        ConsoleUi.Fail("Rolling back restarts a Windows Service, which needs Administrator.");
        return 1;
    }

    ConsoleUi.Blank();
    var rolledBack = Updater.Rollback(agentExe, ConsoleUi.Info);
    if (rolledBack) ConsoleUi.Ok("Previous version restored.");
    else ConsoleUi.Fail("Nothing was rolled back.");
    Pause();
    return rolledBack ? 0 : 1;
}

ConsoleUi.Blank();

if (!File.Exists(agentExe))
{
    ConsoleUi.Fail($"No agent found next to this updater ({agentExe}).");
    ConsoleUi.Info("Put rail-update.exe in the same folder as the installed agent and run it again.");
    Pause();
    return 1;
}

// The base URL comes from the agent's own configuration, so an installation
// pointed at a self-hosted Rail checks that Rail for its updates rather than
// the public one.
var apiBaseUrl = ReadApiBaseUrl(AgentVersion.InstallDirectory);

using var http = new HttpClient { Timeout = TimeSpan.FromMinutes(10) };
var result = await Updater.CheckAsync(http, apiBaseUrl, agentExe, CancellationToken.None);

ConsoleUi.Info($"Installed : {result.Installed.ToString(3)}");

if (result.Problem is not null)
{
    ConsoleUi.Warn(result.Problem);
    Pause();
    // Not a failure exit code: "could not reach Rail" is an ordinary outcome on
    // a POS box behind a restrictive firewall, and a Scheduled Task that mailed
    // an alert every night for it would be turned off within a week.
    return 0;
}

if (!result.HasUpdate || result.Manifest is null)
{
    ConsoleUi.Ok("This is the newest version.");
    Pause();
    return 0;
}

ConsoleUi.Info($"Available : {result.Latest?.ToString(3)}");
if (!string.IsNullOrWhiteSpace(result.Manifest.ReleaseNotes))
    ConsoleUi.Info($"Notes     : {result.Manifest.ReleaseNotes}");

if (result.State == Updater.UpdateState.Required)
    ConsoleUi.Warn("This update is marked REQUIRED — the installed version is below the supported minimum.");

// --check is for monitoring: report and exit without touching anything. 10
// rather than 1 so a wrapper can tell "an update exists" from "the check itself
// failed".
if (check) return 10;

if (!Elevation.IsAdministrator())
{
    ConsoleUi.Blank();
    ConsoleUi.Fail("Installing an update stops and starts a Windows Service, which needs Administrator.");
    ConsoleUi.Info("Right-click rail-update.exe and choose \"Run as administrator\".");
    Pause();
    return 1;
}

ConsoleUi.Blank();
if (!assumeYes && !ConsoleUi.Confirm($"Install {result.Latest?.ToString(3)} now?", @default: true))
{
    ConsoleUi.Info("Left unchanged.");
    return 0;
}

ConsoleUi.Blank();
var applied = await Updater.ApplyAsync(
    http, result.Manifest, agentExe, ConsoleUi.Info, CancellationToken.None);

ConsoleUi.Blank();
if (applied.Ok)
{
    ConsoleUi.Ok(applied.Message);
    // The previous version stays as rail-2touch-agent.exe.bak, so a problem
    // noticed tomorrow is one --rollback away.
    ConsoleUi.Info($"Previous version kept as {Path.GetFileName(agentExe)}{Updater.BackupSuffix} — run --rollback to go back.");
}
else
{
    ConsoleUi.Fail(applied.Message);
}

Pause();
return applied.Ok ? 0 : 1;

bool Has(string flag) => args.Contains(flag, StringComparer.OrdinalIgnoreCase);

// A double-clicked window closes the instant it finishes, taking the result
// with it. Only pause when someone is actually there to read it.
void Pause()
{
    if (interactive) ConsoleUi.PauseIfInteractive();
}

// Read straight out of the config files rather than building a host: this exe
// must work on a box where the agent's configuration is broken, which is
// exactly when someone reaches for the updater.
static string ReadApiBaseUrl(string directory)
{
    const string fallback = "https://bar-app-drab.vercel.app";

    // Local overrides the base file, matching the agent's own layering.
    foreach (var file in new[] { "appsettings.local.json", "appsettings.json" })
    {
        try
        {
            var path = Path.Combine(directory, file);
            if (!File.Exists(path)) continue;

            using var doc = JsonDocument.Parse(File.ReadAllText(path));
            if (doc.RootElement.TryGetProperty("Agent", out var agent) &&
                agent.TryGetProperty("Rail", out var rail) &&
                rail.TryGetProperty("ApiBaseUrl", out var url) &&
                url.GetString() is { Length: > 0 } value)
            {
                return value;
            }
        }
        catch
        {
            // Malformed config must not stop an update — the update may well be
            // the thing that fixes it.
        }
    }

    return fallback;
}
