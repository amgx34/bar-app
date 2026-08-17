using System.Diagnostics;
using System.Text;

namespace RailAgent.Setup;

/// <summary>
/// Service registration, in-process. This used to be install-service.ps1; two
/// ways to install a service is how the two drift apart, so there is now one.
/// </summary>
public static class ServiceControl
{
    public const string ServiceName = "Rail2TouchSync";
    public const string DisplayName = "Rail 2Touch Sync";
    public const string Description = "Syncs 2TouchPOS SQL data to Rail every few minutes.";

    public sealed record ScResult(int ExitCode, string Output)
    {
        public bool Ok => ExitCode == 0;
    }

    public static bool Exists()
        => Sc("query", ServiceName).Ok;

    /// <summary>
    /// Raw <c>sc query</c> for any service. The diagnostic reports on SQL Server's
    /// own services too, which are not this one.
    /// </summary>
    public static ScResult Query(string serviceName) => Sc("query", serviceName);

    public static bool IsRunning()
        => Sc("query", ServiceName).Output.Contains("RUNNING", StringComparison.Ordinal);

    public static ScResult Stop()
    {
        var result = Sc("stop", ServiceName);
        WaitForState("STOPPED", TimeSpan.FromSeconds(30));
        return result;
    }

    public static ScResult Delete()
    {
        var result = Sc("delete", ServiceName);
        // The SCM keeps a deleted service around until every handle closes.
        for (var i = 0; i < 10 && Exists(); i++) Thread.Sleep(500);
        return result;
    }

    /// <summary>
    /// Registers the service. The content root is pinned in the binpath so
    /// configuration never resolves against whatever directory the SCM happens
    /// to start the process in.
    /// </summary>
    public static ScResult Install(string exePath, string contentRoot)
    {
        // sc.exe wants "key= value" with the space AFTER the equals sign, and the
        // whole binpath as one argument with embedded quotes around each path.
        var binPath = $"\"{exePath}\" --contentRoot \"{contentRoot}\"";

        var create = Sc(
            "create", ServiceName,
            "binPath=", binPath,
            "start=", "auto",
            "obj=", "LocalSystem",
            "DisplayName=", DisplayName);
        if (!create.Ok) return create;

        Sc("description", ServiceName, Description);

        // Restart three times, 60s apart; forget the failure count after a day.
        Sc("failure", ServiceName, "reset=", "86400",
           "actions=", "restart/60000/restart/60000/restart/60000");

        return create;
    }

    public static ScResult Start()
    {
        var result = Sc("start", ServiceName);
        if (result.Ok) WaitForState("RUNNING", TimeSpan.FromSeconds(30));
        return result;
    }

    /// <summary>Stops and removes the service, leaving config and the install directory alone.</summary>
    public static string Uninstall()
    {
        if (!Exists()) return $"Service '{ServiceName}' is not installed.";
        if (IsRunning()) Stop();
        var deleted = Delete();
        return deleted.Ok
            ? $"Service '{ServiceName}' removed. Configuration and files were left in place."
            : $"Could not remove '{ServiceName}': {deleted.Output.Trim()}";
    }

    /// <summary>
    /// The last few Event Log entries for this service — printed inline when the
    /// service refuses to start, so the operator never has to open Event Viewer.
    /// </summary>
    public static IReadOnlyList<string> RecentLogEntries(int count = 5)
    {
        try
        {
            return Entries(DateTime.MinValue)
                .Take(count)
                .Select(e => $"{e.TimeGenerated:HH:mm:ss} [{e.EntryType}] {FirstLines(e.Message, 3)}")
                .ToList();
        }
        catch (Exception ex)
        {
            return [$"(could not read the Event Log: {ex.Message})"];
        }
    }

    /// <summary>
    /// Waits for the service's own first log entry, so a failure that only the
    /// LocalSystem account can hit — the Windows-auth SQL grant, most likely —
    /// is seen during setup instead of days later. Null on timeout.
    /// </summary>
    public static EventLogEntryType? WaitForFirstEntry(DateTime since, TimeSpan timeout, out string summary)
    {
        var deadline = DateTime.UtcNow + timeout;
        summary = "";

        while (DateTime.UtcNow < deadline)
        {
            try
            {
                var entries = Entries(since).ToList();
                var worst = entries
                    .Where(e => e.EntryType is EventLogEntryType.Error or EventLogEntryType.Warning)
                    .FirstOrDefault() ?? entries.FirstOrDefault();

                if (worst is not null)
                {
                    summary = FirstLines(worst.Message, 2);
                    return worst.EntryType;
                }
            }
            catch (Exception ex)
            {
                summary = $"could not read the Event Log: {ex.Message}";
                return null;
            }

            Thread.Sleep(2000);
        }

        return null;
    }

    /// <summary>This service's Application-log entries after <paramref name="since"/>, newest first.</summary>
    private static IEnumerable<EventLogEntry> Entries(DateTime since)
    {
        if (!EventLog.SourceExists(ServiceName)) return [];
        var log = new EventLog("Application");
        return log.Entries
            .Cast<EventLogEntry>()
            .Reverse()
            .Where(e => string.Equals(e.Source, ServiceName, StringComparison.OrdinalIgnoreCase))
            .Where(e => e.TimeGenerated >= since)
            .ToList();
    }

    private static string FirstLines(string message, int n)
        => string.Join(" / ", message.Split('\n', StringSplitOptions.RemoveEmptyEntries)
                                     .Take(n)
                                     .Select(l => l.Trim()));

    private static void WaitForState(string state, TimeSpan timeout)
    {
        var deadline = DateTime.UtcNow + timeout;
        while (DateTime.UtcNow < deadline)
        {
            if (Sc("query", ServiceName).Output.Contains(state, StringComparison.Ordinal)) return;
            Thread.Sleep(500);
        }
    }

    private static ScResult Sc(params string[] args)
    {
        var psi = new ProcessStartInfo("sc.exe")
        {
            RedirectStandardOutput = true,
            RedirectStandardError  = true,
            UseShellExecute        = false,
            CreateNoWindow         = true,
        };
        foreach (var a in args) psi.ArgumentList.Add(a);

        using var p = Process.Start(psi);
        if (p is null) return new ScResult(-1, "could not start sc.exe");

        var output = new StringBuilder();
        output.Append(p.StandardOutput.ReadToEnd());
        output.Append(p.StandardError.ReadToEnd());
        p.WaitForExit();

        return new ScResult(p.ExitCode, output.ToString());
    }
}
