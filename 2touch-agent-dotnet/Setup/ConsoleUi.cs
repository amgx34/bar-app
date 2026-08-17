namespace RailAgent.Setup;

/// <summary>
/// The wizard's whole vocabulary. Kept in one place so every stage looks the
/// same and no raw exception trace ever reaches the operator.
/// </summary>
public static class ConsoleUi
{
    public const int TotalStages = 12;

    public static void Banner()
    {
        Console.WriteLine();
        Console.WriteLine("  Rail — 2TouchPOS agent setup");
        Console.WriteLine("  " + new string('─', 60));
        Console.WriteLine();
    }

    public static void Stage(int n, string title)
    {
        Console.WriteLine();
        Write(ConsoleColor.Cyan, $"[{n}/{TotalStages}] ");
        Console.WriteLine(title);
    }

    public static void Ok(string message)   => Line(ConsoleColor.Green,  "  ✓ ", message);
    public static void Info(string message) => Console.WriteLine($"    {message}");
    public static void Warn(string message) => Line(ConsoleColor.Yellow, "  ! ", message);
    public static void Fail(string message) => Line(ConsoleColor.Red,    "  ✗ ", message);

    /// <summary>A diagnosis: what went wrong, then what to do about it.</summary>
    public static void Diagnose(string problem, params string[] remedy)
    {
        Fail(problem);
        foreach (var line in remedy) Console.WriteLine($"    {line}");
    }

    public static void Blank() => Console.WriteLine();

    /// <summary>
    /// Console.ReadLine returns null forever once stdin is closed — piped input
    /// that ran out, or a window with no keyboard behind it. Treating that as
    /// "empty" makes every prompt either spin forever or silently take its
    /// default, so it is a cancellation instead. Callers already handle that.
    /// </summary>
    private static string ReadLineOrCancel()
        => Console.ReadLine()
           ?? throw new OperationCanceledException("Input ended while setup was waiting for an answer.");

    public static string Ask(string prompt, string? @default = null)
    {
        while (true)
        {
            Console.Write(@default is null ? $"    {prompt}: " : $"    {prompt} [{@default}]: ");
            var line = ReadLineOrCancel().Trim();
            if (!string.IsNullOrEmpty(line)) return line;
            if (@default is not null) return @default;
        }
    }

    public static string AskSecret(string prompt)
    {
        Console.Write($"    {prompt}: ");
        var buf = new System.Text.StringBuilder();
        while (true)
        {
            var key = Console.ReadKey(intercept: true);
            if (key.Key == ConsoleKey.Enter) { Console.WriteLine(); return buf.ToString(); }
            if (key.Key == ConsoleKey.Backspace)
            {
                if (buf.Length > 0) { buf.Length--; Console.Write("\b \b"); }
                continue;
            }
            if (char.IsControl(key.KeyChar)) continue;
            buf.Append(key.KeyChar);
            Console.Write('*');
        }
    }

    public static bool Confirm(string prompt, bool @default = true)
    {
        while (true)
        {
            Console.Write($"    {prompt} [{(@default ? "Y/n" : "y/N")}]: ");
            var line = ReadLineOrCancel().Trim().ToLowerInvariant();
            if (string.IsNullOrEmpty(line)) return @default;
            if (line is "y" or "yes") return true;
            if (line is "n" or "no") return false;
        }
    }

    /// <summary>
    /// Numbered pick from a list. Returns the chosen index, or -1 when
    /// <paramref name="skipLabel"/> is offered and chosen.
    /// </summary>
    public static int Choose(string prompt, IReadOnlyList<string> options, int @default = 0, string? skipLabel = null)
    {
        for (var i = 0; i < options.Count; i++)
            Console.WriteLine($"      {i + 1}. {options[i]}");
        if (skipLabel is not null)
            Console.WriteLine($"      0. {skipLabel}");

        while (true)
        {
            Console.Write($"    {prompt} [{@default + 1}]: ");
            var line = ReadLineOrCancel().Trim();
            if (string.IsNullOrEmpty(line)) return @default;
            if (int.TryParse(line, out var n))
            {
                if (skipLabel is not null && n == 0) return -1;
                if (n >= 1 && n <= options.Count) return n - 1;
            }
        }
    }

    /// <summary>Prints rows as an aligned table. First row is treated as the header.</summary>
    public static void Table(IReadOnlyList<string[]> rows, string indent = "      ")
    {
        if (rows.Count == 0) return;
        var widths = new int[rows[0].Length];
        foreach (var row in rows)
            for (var i = 0; i < widths.Length && i < row.Length; i++)
                widths[i] = Math.Max(widths[i], (row[i] ?? "").Length);

        foreach (var row in rows)
        {
            var cells = new string[widths.Length];
            for (var i = 0; i < widths.Length; i++)
                cells[i] = (i < row.Length ? row[i] ?? "" : "").PadRight(widths[i]);
            Console.WriteLine(indent + string.Join("  ", cells).TrimEnd());
        }
    }

    /// <summary>Keeps a double-clicked console window open long enough to read.</summary>
    public static void PauseIfInteractive()
    {
        if (Console.IsInputRedirected) return;
        Console.WriteLine();
        Console.Write("    Press Enter to close…");
        Console.ReadLine();
    }

    private static void Line(ConsoleColor colour, string marker, string message)
    {
        Write(colour, marker);
        Console.WriteLine(message);
    }

    private static void Write(ConsoleColor colour, string text)
    {
        var prev = Console.ForegroundColor;
        try { Console.ForegroundColor = colour; Console.Write(text); }
        finally { Console.ForegroundColor = prev; }
    }
}
