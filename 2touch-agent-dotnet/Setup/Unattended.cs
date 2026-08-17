namespace RailAgent.Setup;

/// <summary>
/// <c>--unattended</c>: the twelve stages with no questions, taking the pairing
/// code from a text file — normally <c>Key.txt</c> on the USB stick the
/// installer arrived on.
///
/// Every prompt the wizard would raise becomes either a rule or a refusal. It
/// never guesses at something an operator would have been asked to confirm: an
/// ambiguous instance, an ambiguous database, or a schema the built-in mapping
/// does not cover all stop with an explanation and a flag to resolve it. A silent
/// wrong choice here writes a service that syncs the wrong bar's data.
/// </summary>
public sealed record Unattended(string Code, string Source, string? Server, string? Database)
{
    public const string Flag = "--unattended";

    /// <summary>File names looked for, in this order, on each searched location.</summary>
    private static readonly string[] KeyFileNames =
        ["Key.txt", "key.txt", "rail-key.txt", "pairing.txt", "rail-pairing.txt"];

    public static bool Requested(string[] args)
        => args.Contains(Flag, StringComparer.OrdinalIgnoreCase);

    /// <summary>
    /// Resolves the pairing code. Explicit <c>--pairing-file</c> wins; otherwise
    /// the exe's own directory, then the root of every removable drive — so
    /// running the exe straight off the stick finds the key sitting beside it.
    /// </summary>
    public static bool TryCreate(string[] args, out Unattended? result, out string? error)
    {
        result = null;
        error = null;

        var server   = ValueOf(args, "--server");
        var database = ValueOf(args, "--database");

        var explicitFile = ValueOf(args, "--pairing-file");
        if (explicitFile is not null)
        {
            if (!File.Exists(explicitFile))
            {
                error = $"--pairing-file {explicitFile} does not exist.";
                return false;
            }
            return TryRead(explicitFile, server, database, out result, out error);
        }

        foreach (var path in CandidatePaths())
        {
            if (!File.Exists(path)) continue;
            if (TryRead(path, server, database, out result, out error)) return true;
            // A file that exists but holds no code is worth reporting rather than
            // skipping: it is almost certainly the one that was meant to be used.
            return false;
        }

        error = "No pairing-code file found. Looked for "
              + string.Join(" / ", KeyFileNames) + " in:" + Environment.NewLine
              + string.Join(Environment.NewLine, SearchedLocations().Select(l => "      " + l))
              + Environment.NewLine + "    Or pass --pairing-file <path>.";
        return false;
    }

    /// <summary>Directories searched, in order. Exposed so the error can list them.</summary>
    public static IReadOnlyList<string> SearchedLocations()
    {
        var places = new List<string> { AppContext.BaseDirectory };

        foreach (var drive in RemovableDrives())
            places.Add(drive);

        return places;
    }

    private static IEnumerable<string> CandidatePaths()
    {
        foreach (var dir in SearchedLocations())
            foreach (var name in KeyFileNames)
                yield return Path.Combine(dir, name);
    }

    private static IEnumerable<string> RemovableDrives()
    {
        DriveInfo[] drives;
        try { drives = DriveInfo.GetDrives(); }
        catch { yield break; }

        foreach (var d in drives)
        {
            bool usable;
            try { usable = d.DriveType == DriveType.Removable && d.IsReady; }
            catch { usable = false; }     // a card reader with no card throws
            if (usable) yield return d.RootDirectory.FullName;
        }
    }

    private static bool TryRead(string path, string? server, string? database,
                                out Unattended? result, out string? error)
    {
        result = null;
        error  = null;
        string text;
        try { text = File.ReadAllText(path); }   // ReadAllText strips a BOM
        catch (Exception ex)
        {
            error = $"Could not read {path}: {ex.Message}";
            return false;
        }

        var code = ExtractCode(text);
        if (code is null)
        {
            error = $"{path} contains no line starting with \"{PairingCode.Prefix}\". "
                  + "Paste the whole pairing code from Rail into that file, on one line.";
            return false;
        }

        // Validated here rather than at stage 2 so a typo in the file is caught
        // before elevation, SQL probing, or anything is installed.
        if (!PairingCode.TryDecode(code, out _, out var decodeError))
        {
            error = $"The code in {path} is not usable: {decodeError}";
            return false;
        }

        result = new Unattended(code, path, server, database);
        return true;
    }

    /// <summary>
    /// The first line that looks like a pairing code. Tolerates a BOM, CRLF,
    /// blank lines, surrounding quotes, and '#' comment lines, because this file
    /// gets made by hand on site.
    /// </summary>
    internal static string? ExtractCode(string text)
    {
        foreach (var raw in text.Split('\n'))
        {
            var line = raw.Trim().Trim('"', '\'').Trim();
            if (line.Length == 0 || line.StartsWith('#')) continue;
            if (line.StartsWith(PairingCode.Prefix, StringComparison.OrdinalIgnoreCase))
                return line;
        }
        return null;
    }

    private static string? ValueOf(string[] args, string flag)
    {
        var i = Array.FindIndex(args, a => string.Equals(a, flag, StringComparison.OrdinalIgnoreCase));
        return i >= 0 && i + 1 < args.Length && !args[i + 1].StartsWith("--", StringComparison.Ordinal)
            ? args[i + 1]
            : null;
    }
}
