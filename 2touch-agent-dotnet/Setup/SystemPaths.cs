namespace RailAgent.Setup;

/// <summary>
/// Absolute paths to the Windows tools this code shells out to.
///
/// Not a tidiness helper. <c>CreateProcess</c> resolves a bare name against the
/// calling process's own directory first, and every one of these launches
/// happens elevated from the install directory — which a standard user can write
/// to until hardening has succeeded. Dropping <c>C:\rail-agent\sc.exe</c> and
/// waiting for an operator to run anything at all was therefore a complete local
/// privilege escalation, with the agent's own setup acting as the trigger.
///
/// Anchoring to System32 removes the search entirely: there is nothing to
/// resolve and nothing to plant ahead of.
/// </summary>
public static class SystemPaths
{
    public static string Executable(string fileName)
        => Path.Combine(Environment.SystemDirectory, fileName);
}
