using System.Text;
using RailAgent.Setup;
using Xunit;

namespace RailAgent.Tests;

/// <summary>
/// The key file is typed or pasted by hand on site, into Notepad, on a USB
/// stick. Every quirk that produces here — a BOM, CRLF, a stray quote, an
/// explanatory line above the code — has to parse, or the install fails at a
/// customer site for a reason nobody can see by looking at the file.
/// </summary>
public class UnattendedTests
{
    private const string Org = "dc899050-a024-47c1-bb61-d8a4a37ed1ee";
    private const string Token = "0a5833746c60dae4853d5fc4b443d554dca85ea3dc2de5461e0974e873b5dc52";

    private static string Code(string url = "https://bar-app-drab.vercel.app")
        => PairingCode.Encode(new PairingInfo(Org, Token, url));

    // ── Extracting the code from a hand-made file ─────────────────────────────

    [Fact]
    public void ReadsAPlainOneLineFile()
        => Assert.Equal(Code(), Unattended.ExtractCode(Code()));

    [Fact]
    public void ReadsThroughWindowsLineEndings()
        => Assert.Equal(Code(), Unattended.ExtractCode($"\r\n{Code()}\r\n"));

    [Fact]
    public void IgnoresLeadingBlankLinesAndSurroundingWhitespace()
        => Assert.Equal(Code(), Unattended.ExtractCode($"\n\n   {Code()}   \n\n"));

    [Fact]
    public void IgnoresCommentLines()
        => Assert.Equal(Code(), Unattended.ExtractCode($"# Rail pairing code for The Anchor\n# do not share\n{Code()}\n"));

    [Fact]
    public void IgnoresAnExplanatoryLineThatIsNotAComment()
    {
        // Someone will write a label above the code without a '#'.
        var text = $"Pairing code:\n{Code()}\n";
        Assert.Equal(Code(), Unattended.ExtractCode(text));
    }

    [Fact]
    public void StripsSurroundingQuotes()
        => Assert.Equal(Code(), Unattended.ExtractCode($"\"{Code()}\""));

    [Fact]
    public void ReturnsNullWhenThereIsNoCode()
        => Assert.Null(Unattended.ExtractCode("nothing to see here\njust notes\n"));

    [Fact]
    public void ReturnsNullForAnEmptyFile()
        => Assert.Null(Unattended.ExtractCode(""));

    [Fact]
    public void TakesTheFirstCodeWhenThereAreTwo()
    {
        var first = Code();
        var second = PairingCode.Encode(new PairingInfo(Org, Token, "https://other.example.com"));
        Assert.Equal(first, Unattended.ExtractCode($"{first}\n{second}\n"));
    }

    // ── Resolving a file into a plan ──────────────────────────────────────────

    [Fact]
    public void ReadsAFileWithAByteOrderMark()
    {
        var path = Temp(Code(), new UTF8Encoding(encoderShouldEmitUTF8Identifier: true));
        try
        {
            Assert.True(Unattended.TryCreate(["--unattended", "--pairing-file", path], out var plan, out var error), error);
            Assert.Equal(Code(), plan!.Code);
            Assert.Equal(path, plan.Source);
        }
        finally { File.Delete(path); }
    }

    [Fact]
    public void RejectsAFileThatDoesNotExist()
    {
        var missing = Path.Combine(Path.GetTempPath(), $"no-such-key-{Guid.NewGuid():N}.txt");

        Assert.False(Unattended.TryCreate(["--unattended", "--pairing-file", missing], out var plan, out var error));
        Assert.Null(plan);
        Assert.Contains("does not exist", error);
    }

    [Fact]
    public void RejectsAFileWithNoCodeAndSaysWhatItWanted()
    {
        var path = Temp("I forgot to paste it\n");
        try
        {
            Assert.False(Unattended.TryCreate(["--unattended", "--pairing-file", path], out _, out var error));
            Assert.Contains("RAIL1-", error);
        }
        finally { File.Delete(path); }
    }

    [Fact]
    public void RejectsATruncatedCodeBeforeAnythingIsInstalled()
    {
        // The point of validating in TryCreate: this must fail at the prompt,
        // not after a UAC elevation and a SQL probe.
        var truncated = Code()[..^12];
        var path = Temp(truncated);
        try
        {
            Assert.False(Unattended.TryCreate(["--unattended", "--pairing-file", path], out _, out var error));
            Assert.Contains("not usable", error);
        }
        finally { File.Delete(path); }
    }

    [Fact]
    public void CarriesServerAndDatabaseOverrides()
    {
        var path = Temp(Code());
        try
        {
            Assert.True(Unattended.TryCreate(
                ["--unattended", "--pairing-file", path, "--server", @".\SQLEXPRESS", "--database", "TwoTouchProd"],
                out var plan, out var error), error);

            Assert.Equal(@".\SQLEXPRESS", plan!.Server);
            Assert.Equal("TwoTouchProd", plan.Database);
        }
        finally { File.Delete(path); }
    }

    [Fact]
    public void LeavesOverridesNullWhenNotGiven()
    {
        var path = Temp(Code());
        try
        {
            Assert.True(Unattended.TryCreate(["--unattended", "--pairing-file", path], out var plan, out _));
            Assert.Null(plan!.Server);
            Assert.Null(plan.Database);
        }
        finally { File.Delete(path); }
    }

    [Fact]
    public void AFlagFollowedByAnotherFlagIsNotTreatedAsAValue()
    {
        var path = Temp(Code());
        try
        {
            // "--server --database X" must not set Server to "--database".
            Assert.True(Unattended.TryCreate(
                ["--unattended", "--pairing-file", path, "--server", "--database", "TwoTouchProd"],
                out var plan, out _));

            Assert.Null(plan!.Server);
            Assert.Equal("TwoTouchProd", plan.Database);
        }
        finally { File.Delete(path); }
    }

    [Fact]
    public void IsOnlyRequestedWhenTheFlagIsPresent()
    {
        Assert.True(Unattended.Requested(["--unattended"]));
        Assert.True(Unattended.Requested(["--UNATTENDED"]));
        Assert.False(Unattended.Requested(["--setup"]));
        Assert.False(Unattended.Requested([]));
    }

    [Fact]
    public void SurvivesTheElevationRelaunch()
    {
        // Elevation.TryRelaunchElevated prepends "--setup" to the forwarded args.
        // Program.cs tests for unattended first, so the elevated copy must still
        // be unattended — otherwise a one-click install turns into a wizard
        // sitting at a prompt in a window nobody is watching.
        Assert.True(Unattended.Requested(["--setup", "--unattended", "--pairing-file", @"D:\Key.txt"]));
    }

    [Fact]
    public void SearchesTheExeDirectoryFirst()
        => Assert.Equal(AppContext.BaseDirectory, Unattended.SearchedLocations()[0]);

    // ── The loopback exception ────────────────────────────────────────────────

    [Fact]
    public void AcceptsHttpToLoopbackSoTheMockServerCanBeUsed()
    {
        Assert.True(PairingCode.TryDecode(Code("http://localhost:3999"), out var info, out var error), error);
        Assert.Equal("http://localhost:3999", info!.ApiBaseUrl);

        Assert.True(PairingCode.TryDecode(Code("http://127.0.0.1:3999"), out _, out _));
    }

    [Fact]
    public void StillRejectsPlainHttpToAnywhereElse()
    {
        Assert.False(PairingCode.TryDecode(Code("http://bar-app-drab.vercel.app"), out _, out var error));
        Assert.Contains("https", error);

        // A hostname that merely looks local is not loopback.
        Assert.False(PairingCode.TryDecode(Code("http://192.168.1.50:3000"), out _, out _));
    }

    private static string Temp(string content, Encoding? encoding = null)
    {
        var path = Path.Combine(Path.GetTempPath(), $"rail-key-{Guid.NewGuid():N}.txt");
        File.WriteAllText(path, content, encoding ?? new UTF8Encoding(false));
        return path;
    }
}
