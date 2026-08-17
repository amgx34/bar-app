namespace RailAgent.Setup;

/// <summary>
/// What a double-click lands on. It used to start the twelve-stage wizard
/// immediately, which meant the only way to reach the diagnostic was a command
/// line — no use to someone standing at a POS box with a mouse and a problem.
///
/// Nothing here runs on its own: the menu draws the current state and waits.
/// Every entry is still reachable as a flag, so scripted installs are unchanged.
/// </summary>
public static class StartMenu
{
    public static async Task<int> RunAsync(string[] args, CancellationToken ct)
    {
        try { return await LoopAsync(args, ct); }
        catch (OperationCanceledException)
        {
            // stdin closed with the menu open. Exiting is the only safe reading:
            // falling through to the highlighted default would start an install
            // nobody asked for, over and over.
            ConsoleUi.Blank();
            ConsoleUi.Info("Input ended — closing without doing anything.");
            return 0;
        }
    }

    private static async Task<int> LoopAsync(string[] args, CancellationToken ct)
    {
        var last = 0;

        while (true)
        {
            ConsoleUi.Banner();
            Status();

            ConsoleUi.Blank();
            var choice = ConsoleUi.Choose("What would you like to do?",
            [
                "Install or re-run setup   (needs Administrator)",
                "Check for updates         (needs Administrator to install)",
                "Run diagnostics           (changes nothing, writes a report)",
                "Remove the service        (needs Administrator, keeps config)",
                "Remove everything         (service, config, and credentials)",
                "Exit",
            ], @default: 0);

            switch (choice)
            {
                case 0:
                    // The wizard pauses on its own way out, so this one does not.
                    last = await new SetupWizard(args).RunAsync(ct);
                    break;

                case 1:
                    last = CheckForUpdates();
                    ConsoleUi.PauseIfInteractive();
                    break;

                case 2:
                    last = await Diagnostics.RunAsync(ct);
                    ConsoleUi.Blank();
                    ConsoleUi.Info(last == 0
                        ? "No failures. The report above was also written to a .txt file next to this exe."
                        : "Something failed. Send the .txt file written next to this exe.");
                    ConsoleUi.PauseIfInteractive();
                    break;

                case 3:
                    last = Uninstall();
                    ConsoleUi.PauseIfInteractive();
                    break;

                case 4:
                    // The full removal, including the agent token and the SQL
                    // login — the two things that must not outlive the install
                    // on a decommissioned POS box.
                    if (!Elevation.IsAdministrator())
                    {
                        ConsoleUi.Blank();
                        ConsoleUi.Fail("Removing the agent needs Administrator.");
                        ConsoleUi.Info("Right-click the exe and choose \"Run as administrator\", then try again.");
                        ConsoleUi.PauseIfInteractive();
                        last = 1;
                        break;
                    }
                    last = Uninstaller.Run(args);
                    break;

                default:
                    return last;
            }
        }
    }

    /// <summary>
    /// The three facts that decide which entry is the right one. Cheap enough to
    /// redraw every time round the loop, so it reflects what just happened.
    /// </summary>
    private static void Status()
    {
        ConsoleUi.Blank();

        var elevated = Elevation.IsAdministrator();
        ConsoleUi.Info($"Account    {Elevation.CurrentUser()}{(elevated ? " (Administrator)" : "")}");

        var configPath = Path.Combine(SetupWizard.InstallDirectory, LocalConfigWriter.FileName);
        ConsoleUi.Info($"Config     {(File.Exists(configPath) ? configPath : "not installed yet")}");

        if (!ServiceControl.Exists())
            ConsoleUi.Info($"Service    not installed");
        else if (ServiceControl.IsRunning())
            ConsoleUi.Info($"Service    {ServiceControl.ServiceName} — running");
        else
            ConsoleUi.Info($"Service    {ServiceControl.ServiceName} — installed but STOPPED");

        if (!elevated)
        {
            ConsoleUi.Blank();
            ConsoleUi.Info("Not running as Administrator — setup will ask for it, diagnostics does not need it.");
        }
    }

    /// <summary>
    /// Hands off to rail-update.exe.
    ///
    /// Launched rather than called in-process, because the updater has to be
    /// able to replace the agent binary — and a menu hosted INSIDE the thing
    /// being replaced cannot do that. Keeping the hand-off explicit is also what
    /// makes the separation honest: this menu never touches the binary itself.
    /// </summary>
    private static int CheckForUpdates()
    {
        ConsoleUi.Blank();

        var updater = Path.Combine(AgentVersion.InstallDirectory, "rail-update.exe");
        if (!File.Exists(updater))
        {
            ConsoleUi.Fail("rail-update.exe is not in this folder.");
            ConsoleUi.Info("Download it alongside the agent and run it from here.");
            return 1;
        }

        ConsoleUi.Info($"Installed version: {AgentVersion.ReadFileVersion(AgentVersion.AgentExePath)?.ToString(3) ?? "unknown"}");
        ConsoleUi.Info("Starting rail-update.exe…");
        ConsoleUi.Blank();

        try
        {
            // UseShellExecute so the updater can raise its own UAC prompt when
            // it needs elevation, instead of failing because this menu was not
            // started elevated.
            using var process = System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(updater)
            {
                UseShellExecute = true,
                WorkingDirectory = AgentVersion.InstallDirectory,
            });

            if (process is null)
            {
                ConsoleUi.Fail("Could not start rail-update.exe.");
                return 1;
            }

            process.WaitForExit();
            return process.ExitCode;
        }
        catch (Exception ex)
        {
            ConsoleUi.Fail($"Could not start rail-update.exe: {ex.Message}");
            return 1;
        }
    }

    private static int Uninstall()
    {
        ConsoleUi.Blank();

        if (!Elevation.IsAdministrator())
        {
            ConsoleUi.Fail("Removing a Windows Service needs Administrator.");
            ConsoleUi.Info("Right-click the exe and choose \"Run as administrator\", then try again.");
            return 1;
        }

        if (!ServiceControl.Exists())
        {
            ConsoleUi.Info($"'{ServiceControl.ServiceName}' is not installed — nothing to remove.");
            return 0;
        }

        if (!ConsoleUi.Confirm($"Remove '{ServiceControl.ServiceName}'? Data already in Rail is untouched.", @default: false))
        {
            ConsoleUi.Info("Left alone.");
            return 0;
        }

        ConsoleUi.Info(ServiceControl.Uninstall());
        return 0;
    }
}
