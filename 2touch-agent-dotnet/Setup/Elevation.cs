using System.Diagnostics;
using System.Security.Principal;

namespace RailAgent.Setup;

/// <summary>
/// Registering a service, ACLing a file and creating a SQL login all need
/// Administrator. A double-click from Explorer should produce a UAC prompt,
/// not an access-denied halfway through stage 10.
/// </summary>
public static class Elevation
{
    public static bool IsAdministrator()
    {
        using var identity = WindowsIdentity.GetCurrent();
        return new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator);
    }

    /// <summary>Current Windows account, e.g. <c>BAR-POS\Administrator</c>.</summary>
    public static string CurrentUser()
    {
        using var identity = WindowsIdentity.GetCurrent();
        return identity.Name;
    }

    /// <summary>
    /// Relaunches this executable elevated with the same arguments. Returns true
    /// when the elevated process was started — the caller must then exit, or two
    /// wizards would be running against the same box.
    /// </summary>
    public static bool TryRelaunchElevated(string[] args, out string? error)
    {
        error = null;
        var exe = Environment.ProcessPath;
        if (string.IsNullOrEmpty(exe))
        {
            error = "could not determine this executable's path";
            return false;
        }

        var psi = new ProcessStartInfo(exe)
        {
            UseShellExecute = true,     // required for the runas verb
            Verb            = "runas",
            WorkingDirectory = Environment.CurrentDirectory,
        };
        // --setup is added explicitly: the elevated copy must not fall through to
        // any other mode if the original was launched with no arguments at all.
        psi.ArgumentList.Add("--setup");
        foreach (var a in args)
            if (!string.Equals(a, "--setup", StringComparison.OrdinalIgnoreCase))
                psi.ArgumentList.Add(a);

        try
        {
            Process.Start(psi);
            return true;
        }
        catch (Exception ex)
        {
            // The usual cause is the operator clicking "No" on the UAC prompt.
            error = ex.Message;
            return false;
        }
    }
}
