using System.Diagnostics;
using System.Reflection;

namespace RailAgent.Setup;

/// <summary>
/// What version this build is, and where it lives on disk.
///
/// Read off the assembly rather than kept in a constant, so the number in
/// RailAgent.csproj is the only place a release is declared. A constant would
/// eventually disagree with the file properties dialog, and the operator
/// standing at the POS box would have no way to tell which was lying.
/// </summary>
public static class AgentVersion
{
    /// <summary>The service executable's filename. Used by the updater and the installer.</summary>
    public const string AgentExeName = "rail-2touch-agent.exe";

    /// <summary>
    /// This build, normalised to Major.Minor.Patch.
    ///
    /// System.Version so callers can compare with &lt; and &gt; — string
    /// comparison would rank "1.10.0" below "1.9.0", which is the classic way an
    /// updater silently stops offering updates after ten releases.
    /// </summary>
    public static Version Current { get; } = ReadCurrent();

    /// <summary>Display form, e.g. "1.2.0".</summary>
    public static string CurrentDisplay => Current.ToString(3);

    private static Version ReadCurrent()
    {
        var asm = Assembly.GetEntryAssembly() ?? typeof(AgentVersion).Assembly;

        // InformationalVersion carries the <Version> from the csproj verbatim.
        // It can also carry a "+<commit sha>" suffix, which System.Version
        // cannot parse — so cut it before parsing rather than falling through to
        // the four-part AssemblyVersion, which drops the patch component.
        var informational = asm
            .GetCustomAttribute<AssemblyInformationalVersionAttribute>()
            ?.InformationalVersion;

        if (!string.IsNullOrWhiteSpace(informational))
        {
            var plus = informational.IndexOf('+');
            var trimmed = plus >= 0 ? informational[..plus] : informational;
            if (Version.TryParse(trimmed, out var parsed)) return Normalise(parsed);
        }

        return Normalise(asm.GetName().Version ?? new Version(0, 0, 0));
    }

    /// <summary>
    /// Forces three components. System.Version treats an unspecified component
    /// as -1, and 1.2.0 compares as GREATER than 1.2 as a result — which would
    /// make a same-version check look like an available update forever.
    /// </summary>
    private static Version Normalise(Version v)
        => new(v.Major, v.Minor, v.Build < 0 ? 0 : v.Build);

    /// <summary>
    /// Directory the running executable sits in.
    ///
    /// AppContext.BaseDirectory, not Environment.CurrentDirectory: the SCM
    /// starts a service in C:\Windows\System32, and a double-clicked exe
    /// inherits whatever directory Explorer felt like.
    /// </summary>
    public static string InstallDirectory => AppContext.BaseDirectory.TrimEnd('\\');

    /// <summary>Full path to the service executable, whether or not it is the running one.</summary>
    public static string AgentExePath => Path.Combine(InstallDirectory, AgentExeName);

    /// <summary>
    /// Version of the agent executable ON DISK, which is not necessarily this
    /// assembly — rail-update.exe is a different binary and needs to report on
    /// the thing it is about to replace. Null when it is missing or unreadable.
    /// </summary>
    public static Version? ReadFileVersion(string exePath)
    {
        try
        {
            if (!File.Exists(exePath)) return null;
            var info = FileVersionInfo.GetVersionInfo(exePath);
            var raw = info.ProductVersion ?? info.FileVersion;
            if (string.IsNullOrWhiteSpace(raw)) return null;

            var plus = raw.IndexOf('+');
            var trimmed = plus >= 0 ? raw[..plus] : raw;
            return Version.TryParse(trimmed, out var parsed) ? Normalise(parsed) : null;
        }
        catch
        {
            // A locked or exotic file must not crash the updater before it has
            // had a chance to report anything useful.
            return null;
        }
    }
}
