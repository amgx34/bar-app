using System.Diagnostics;
using RailAgent.Setup;

// rail-diagnose.exe — the checks, on their own, with nothing to answer.
//
// The setup exe can do this too (`rail-setup.exe --diagnose`, or option 3 of
// its menu), but both need someone to type a flag or pick a line. This one is
// for handing to whoever is standing at the POS box: double-click, wait, read.
//
// It asks nothing, changes nothing, and installs nothing. The only things it
// writes are the report and — because a double-clicked console window vanishes
// the moment it finishes — a request to the shell to open that report.

try { Console.OutputEncoding = System.Text.Encoding.UTF8; } catch { /* keep the default */ }

var before = TranscriptsIn(AppContext.BaseDirectory);

var exitCode = await Diagnostics.RunAsync(CancellationToken.None);

// Whichever file appeared is the one this run wrote. Reading the directory
// beats re-deriving the timestamped name and getting it subtly wrong.
var report = TranscriptsIn(AppContext.BaseDirectory).Except(before).FirstOrDefault();

if (report is not null)
{
    Console.WriteLine();
    Console.WriteLine($"  Report written to {report}");
    Console.WriteLine("  Opening it now — send that file if you need help.");
    Open(report);
}
else
{
    // A read-only or full location: the console output above is all there is,
    // and this window is about to close, so say so rather than pretending.
    Console.WriteLine();
    Console.WriteLine($"  Could not write a report file into {AppContext.BaseDirectory}");
    Console.WriteLine("  Copy this exe somewhere writable (the desktop) and run it again.");
}

return exitCode;

static string[] TranscriptsIn(string directory)
{
    try { return Directory.GetFiles(directory, "rail-diagnose-*.txt"); }
    catch { return []; }
}

static void Open(string path)
{
    try
    {
        Process.Start(new ProcessStartInfo(path) { UseShellExecute = true });
    }
    catch (Exception ex)
    {
        // No file association, or a locked-down shell. The file is still there.
        Console.WriteLine($"  (could not open it automatically: {ex.Message})");
    }
}
