using System.Text;
using RailAgent.Setup;
using Xunit;

namespace RailAgent.Tests;

/// <summary>
/// The pairing code is the whole credential-entry surface, and its structural
/// checks are the only thing standing between a bad paste and a 401 discovered
/// weeks later. Each case here is a paste that really happens.
/// </summary>
public class PairingCodeTests
{
    private const string Org   = "3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
    private const string Token = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    private const string Url   = "https://bar-app-drab.vercel.app";

    private static string ValidCode() => PairingCode.Encode(new PairingInfo(Org, Token, Url));

    [Fact]
    public void RoundTrips()
    {
        Assert.True(PairingCode.TryDecode(ValidCode(), out var info, out var error));
        Assert.Null(error);
        Assert.Equal(Org, info!.OrgId);
        Assert.Equal(Token, info.AgentToken);
        Assert.Equal(Url, info.ApiBaseUrl);
    }

    [Fact]
    public void TolerantOfSurroundingWhitespace()
    {
        Assert.True(PairingCode.TryDecode($"  {ValidCode()}\r\n", out _, out _));
    }

    [Fact]
    public void RejectsTruncatedPayload()
    {
        var truncated = ValidCode()[..^20];
        Assert.False(PairingCode.TryDecode(truncated, out var info, out var error));
        Assert.Null(info);
        Assert.NotNull(error);
    }

    [Fact]
    public void RejectsWrongPrefix()
    {
        var body = ValidCode()[PairingCode.Prefix.Length..];
        Assert.False(PairingCode.TryDecode("RAIL2-" + body, out _, out var error));
        Assert.Contains(PairingCode.Prefix, error);
    }

    [Fact]
    public void RejectsMissingPrefix()
    {
        var body = ValidCode()[PairingCode.Prefix.Length..];
        Assert.False(PairingCode.TryDecode(body, out _, out _));
    }

    [Fact]
    public void RejectsNonUuidOrg()
    {
        var code = Craft("not-a-uuid", Token, Url);
        Assert.False(PairingCode.TryDecode(code, out _, out var error));
        Assert.Contains("org id", error);
    }

    [Fact]
    public void RejectsShortTokenAndSaysHowShort()
    {
        var code = Craft(Org, Token[..63], Url);
        Assert.False(PairingCode.TryDecode(code, out _, out var error));
        Assert.Equal("token must be 64 hex characters, got 63", error);
    }

    [Fact]
    public void RejectsUppercaseToken()
    {
        // randomBytes(32).toString('hex') is lowercase; anything else is not our token.
        var code = Craft(Org, Token.ToUpperInvariant(), Url);
        Assert.False(PairingCode.TryDecode(code, out _, out var error));
        Assert.Contains("lowercase hex", error);
    }

    [Fact]
    public void RejectsNonHttpsUrl()
    {
        var code = Craft(Org, Token, "http://bar-app-drab.vercel.app");
        Assert.False(PairingCode.TryDecode(code, out _, out var error));
        Assert.Contains("https", error);
    }

    [Fact]
    public void RejectsRelativeUrl()
    {
        var code = Craft(Org, Token, "/api/2touch/ingest");
        Assert.False(PairingCode.TryDecode(code, out _, out _));
    }

    [Fact]
    public void RejectsEmptyInput()
    {
        Assert.False(PairingCode.TryDecode("   ", out _, out var error));
        Assert.Contains("empty", error);
    }

    [Fact]
    public void StripsTrailingSlashFromApiUrl()
    {
        Assert.True(PairingCode.TryDecode(Craft(Org, Token, Url + "/"), out var info, out _));
        Assert.Equal(Url, info!.ApiBaseUrl);
    }

    /// <summary>Builds a code from raw parts, bypassing Encode's typed inputs.</summary>
    private static string Craft(string org, string token, string url)
    {
        var json = $$"""{"o":"{{org}}","t":"{{token}}","u":"{{url}}"}""";
        var b64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(json))
            .TrimEnd('=').Replace('+', '-').Replace('/', '_');
        return PairingCode.Prefix + b64;
    }
}
