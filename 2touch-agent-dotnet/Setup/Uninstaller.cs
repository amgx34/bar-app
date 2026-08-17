using System.Diagnostics;
using System.Text.Json;
using RailAgent.Config;

namespace RailAgent.Setup;

/// <summary>
/// Removes the agent from a POS box.
///
/// The old <c>--uninstall</c> deleted the Windows service and said so plainly:
/// "Configuration and files were left in place." On a decommissioned or sold-on
/// machine that leaves two live credentials behind —
///
///   • <c>appsettings.local.json</c> holds this bar's agent token, which is the
///     HMAC key for its ingest endpoint, and the generated SQL password.
///   • The <c>BarAppRead</c> SQL login keeps read access to the POS database.
///
/// so uninstalling is a security operation, not a tidiness one. This removes
/// everything it can and prints exact instructions for the one thing it cannot:
/// dropping its own SQL login needs sysadmin, and the agent deliberately does
/// not have it.
/// </summary>
public static class Uninstaller
{
    public sealed record Plan(bool KeepConfig, bool Assumeyes);

    public static int Run(string[] args)
    {
        var keepConfig = args.Contains("--keep-config", StringComparer.OrdinalIgnoreCase);
        var assumeYes  = args.Contains("--yes", StringComparer.OrdinalIgnoreCase)
                      || args.Contains("-y", StringComparer.OrdinalIgnoreCase)
                      || Unattended.Requested(args);

        ConsoleUi.Banner();
        ConsoleUi.Stage(1, "Removing the Rail agent");

        var installDir = SetupWizard.InstallDirectory.TrimEnd('\\');
        var configPath = Path.Combine(installDir, LocalConfigWriter.FileName);

        // Read the config before deleting it — the SQL login name and database
        // are needed for the revoke script printed at the end.
        var (sqlLogin, sqlDatabase) = ReadSqlIdentity(configPath);

        ConsoleUi.Blank();
        ConsoleUi.Info("This will:");
        ConsoleUi.Info($"  • stop and delete the '{ServiceControl.ServiceName}' service");
        if (!keepConfig)
        {
            ConsoleUi.Info($"  • delete {configPath}");
            ConsoleUi.Info("      (contains this bar's agent token and SQL password)");
            ConsoleUi.Info($"  • remove {installDir}");
        }
        else
        {
            ConsoleUi.Info("  • leave configuration in place (--keep-config)");
        }
        if (sqlLogin is not null)
        {
            ConsoleUi.Info($"  • print the SQL to drop the '{sqlLogin}' login (needs a DBA)");
        }
        ConsoleUi.Blank();

        if (!assumeYes && !ConsoleUi.Confirm("Continue?", false))
        {
            ConsoleUi.Info("Nothing was changed.");
            return 1;
        }

        // ── Service ───────────────────────────────────────────────────────────
        ConsoleUi.Blank();
        if (ServiceControl.Exists())
        {
            var message = ServiceControl.Uninstall();
            ConsoleUi.Ok(message);
        }
        else
        {
            ConsoleUi.Info($"Service '{ServiceControl.ServiceName}' was not installed.");
        }

        if (keepConfig)
        {
            ConsoleUi.Blank();
            ConsoleUi.Warn($"Configuration kept at {configPath} — it still contains a live agent token.");
            PrintSqlRevoke(sqlLogin, sqlDatabase);
            return 0;
        }

        // ── Secrets ───────────────────────────────────────────────────────────
        // Overwritten before deletion: on a spinning disk a plain delete leaves
        // the token recoverable, and this file is the ingest HMAC key.
        ConsoleUi.Blank();
        if (File.Exists(configPath))
        {
            if (TryShredFile(configPath, out var error))
                ConsoleUi.Ok($"{LocalConfigWriter.FileName} overwritten and deleted");
            else
                ConsoleUi.Fail($"Could not delete {configPath}: {error}");
        }
        else
        {
            ConsoleUi.Info("No local configuration file found.");
        }

        // ── Files ─────────────────────────────────────────────────────────────
        RemoveInstallDirectory(installDir);

        // ── What we cannot do ─────────────────────────────────────────────────
        PrintSqlRevoke(sqlLogin, sqlDatabase);

        ConsoleUi.Blank();
        ConsoleUi.Ok("Rail agent removed.");
        ConsoleUi.Info("Rail will stop receiving data from this machine. Historical data in Rail is unaffected.");
        ConsoleUi.PauseIfInteractive();
        return 0;
    }

    /// <summary>
    /// Pulls the SQL login and database out of config so the revoke script names
    /// the right objects. Returns nulls when the file is absent or unreadable —
    /// uninstall must still proceed.
    /// </summary>
    private static (string? login, string? database) ReadSqlIdentity(string configPath)
    {
        try
        {
            if (!File.Exists(configPath)) return (null, null);

            using var doc = JsonDocument.Parse(File.ReadAllText(configPath));
            if (!doc.RootElement.TryGetProperty("Agent", out var agent)) return (null, null);
            if (!agent.TryGetProperty("Sql", out var sql)) return (null, null);

            var login = sql.TryGetProperty("User", out var u) ? u.GetString() : null;
            var db    = sql.TryGetProperty("Database", out var d) ? d.GetString() : null;

            // Empty User means Windows auth was used, so there is no login to drop.
            return (string.IsNullOrWhiteSpace(login) ? null : login, db);
        }
        catch
        {
            return (null, null);
        }
    }

    private static void PrintSqlRevoke(string? login, string? database)
    {
        if (login is null)
        {
            ConsoleUi.Blank();
            ConsoleUi.Info("No SQL login to remove — the agent used Windows authentication.");
            ConsoleUi.Info(@"If NT AUTHORITY\SYSTEM was granted db_datareader for this, revoke it separately.");
            return;
        }

        ConsoleUi.Blank();
        ConsoleUi.Warn($"The SQL login '{login}' still has read access to the POS database.");
        ConsoleUi.Info("The agent cannot drop it — that needs sysadmin, which it never had.");
        ConsoleUi.Info("Ask a DBA to run:");
        ConsoleUi.Blank();
        foreach (var line in SqlProbe.ManualRevokeScript(database ?? "TwoTouch", login).Split('\n'))
            ConsoleUi.Info("    " + line.TrimEnd());
    }

    // Seams for UninstallerTests. The service and filesystem steps need a real
    // Windows box; these two are pure enough to assert on, and they are the ones
    // carrying the security promise.
    internal static bool ShredForTests(string path, out string? error) => TryShredFile(path, out error);
    internal static (string? login, string? database) ReadSqlIdentityForTests(string path) => ReadSqlIdentity(path);

    /// <summary>Overwrite then delete, so the token is not trivially recoverable.</summary>
    private static bool TryShredFile(string path, out string? error)
    {
        error = null;
        try
        {
            var length = new FileInfo(path).Length;
            if (length > 0)
            {
                using (var fs = new FileStream(path, FileMode.Open, FileAccess.Write, FileShare.None))
                {
                    var zeros = new byte[Math.Min(length, 64 * 1024)];
                    long written = 0;
                    while (written < length)
                    {
                        var chunk = (int)Math.Min(zeros.Length, length - written);
                        fs.Write(zeros, 0, chunk);
                        written += chunk;
                    }
                    fs.Flush(true);
                }
            }
            File.Delete(path);
            return true;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return false;
        }
    }

    /// <summary>
    /// Clears the install directory.
    ///
    /// The running executable normally lives here and Windows will not let a
    /// process delete its own image, so anything locked is left to a detached
    /// command that runs once this process exits.
    /// </summary>
    private static void RemoveInstallDirectory(string installDir)
    {
        if (!Directory.Exists(installDir))
        {
            ConsoleUi.Info($"{installDir} does not exist.");
            return;
        }

        var selfPath = Environment.ProcessPath;
        var runningFromInstallDir =
            selfPath is not null &&
            Path.GetDirectoryName(selfPath)?.TrimEnd('\\')
                .Equals(installDir, StringComparison.OrdinalIgnoreCase) == true;

        var leftBehind = 0;
        foreach (var file in Directory.EnumerateFiles(installDir, "*", SearchOption.AllDirectories))
        {
            if (runningFromInstallDir && string.Equals(file, selfPath, StringComparison.OrdinalIgnoreCase))
                continue;
            try { File.Delete(file); }
            catch { leftBehind++; }
        }

        if (!runningFromInstallDir && leftBehind == 0)
        {
            try
            {
                Directory.Delete(installDir, true);
                ConsoleUi.Ok($"{installDir} removed");
                return;
            }
            catch (Exception ex)
            {
                ConsoleUi.Warn($"Could not remove {installDir}: {ex.Message}");
                return;
            }
        }

        if (runningFromInstallDir)
        {
            ScheduleSelfDelete(installDir);
            ConsoleUi.Ok($"{installDir} will be removed once this window closes");
        }
        else
        {
            ConsoleUi.Warn($"{leftBehind} file(s) in {installDir} were locked and left behind.");
        }
    }

    /// <summary>
    /// Detached cmd that waits for this process to exit, then removes the
    /// directory — the standard way out of "a program cannot delete itself".
    /// </summary>
    private static void ScheduleSelfDelete(string installDir)
    {
        try
        {
            var psi = new ProcessStartInfo("cmd.exe")
            {
                // ping as a portable sleep: timeout.exe fails without a console.
                Arguments = $"/c ping 127.0.0.1 -n 4 > nul & rd /s /q \"{installDir}\"",
                CreateNoWindow = true,
                UseShellExecute = false,
            };
            Process.Start(psi);
        }
        catch (Exception ex)
        {
            ConsoleUi.Warn($"Could not schedule removal of {installDir}: {ex.Message}");
            ConsoleUi.Info("Delete the folder by hand once this window is closed.");
        }
    }
}
