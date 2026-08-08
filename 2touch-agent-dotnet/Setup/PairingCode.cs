using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace RailAgent.Setup;

/// <summary>The three things a bar's agent needs, carried in one pasteable string.</summary>
public sealed record PairingInfo(string OrgId, string AgentToken, string ApiBaseUrl);

/// <summary>
/// RAIL1-&lt;base64url({"o":orgId,"t":agentToken,"u":apiBaseUrl})&gt;
///
/// Validation is structural rather than a checksum: a UUID, exactly 64 lowercase
/// hex characters, and an absolute https URL. Any truncated or mangled paste
/// fails at least one of those, which is cheaper than carrying a CRC and gives
/// the operator a diagnosis instead of "invalid code".
/// </summary>
public static class PairingCode
{
    public const string Prefix = "RAIL1-";

    private sealed record Envelope(
        [property: JsonPropertyName("o")] string? O,
        [property: JsonPropertyName("t")] string? T,
        [property: JsonPropertyName("u")] string? U);

    public static string Encode(PairingInfo info)
    {
        var json = JsonSerializer.Serialize(new Envelope(info.OrgId, info.AgentToken, info.ApiBaseUrl));
        return Prefix + ToBase64Url(Encoding.UTF8.GetBytes(json));
    }

    /// <summary>
    /// Parses and validates a pasted code. On failure <paramref name="error"/> names
    /// the field that failed, so stage 2 of the wizard can say "token must be 64 hex
    /// characters, got 61" rather than rejecting the whole paste anonymously.
    /// </summary>
    public static bool TryDecode(string? input, out PairingInfo? info, out string? error)
    {
        info = null;
        error = null;

        var s = input?.Trim();
        if (string.IsNullOrEmpty(s)) { error = "pairing code is empty"; return false; }

        if (!s.StartsWith(Prefix, StringComparison.OrdinalIgnoreCase))
        {
            error = $"pairing code must start with \"{Prefix}\"";
            return false;
        }

        var payload = s[Prefix.Length..];
        if (payload.Length == 0) { error = "pairing code has no payload after the prefix"; return false; }

        byte[] bytes;
        try { bytes = FromBase64Url(payload); }
        catch (FormatException) { error = "pairing code payload is not valid base64url — the paste is probably truncated"; return false; }

        Envelope? env;
        try { env = JsonSerializer.Deserialize<Envelope>(bytes); }
        catch (JsonException) { error = "pairing code payload is not valid JSON — the paste is probably truncated"; return false; }

        if (env is null) { error = "pairing code payload is empty"; return false; }

        if (string.IsNullOrWhiteSpace(env.O) || !Guid.TryParse(env.O, out _))
        {
            error = $"org id must be a UUID, got \"{Ellipsis(env.O)}\"";
            return false;
        }

        var token = env.T ?? string.Empty;
        if (!IsLowerHex64(token))
        {
            error = token.Length == 64
                ? "token must be 64 lowercase hex characters, and this one contains other characters"
                : $"token must be 64 hex characters, got {token.Length}";
            return false;
        }

        if (string.IsNullOrWhiteSpace(env.U)
            || !Uri.TryCreate(env.U, UriKind.Absolute, out var uri)
            || uri.Scheme != Uri.UriSchemeHttps)
        {
            error = $"api url must be an absolute https:// url, got \"{Ellipsis(env.U)}\"";
            return false;
        }

        info = new PairingInfo(env.O!, token, env.U!.TrimEnd('/'));
        return true;
    }

    private static bool IsLowerHex64(string s)
    {
        if (s.Length != 64) return false;
        foreach (var c in s)
            if (c is not (>= '0' and <= '9') and not (>= 'a' and <= 'f')) return false;
        return true;
    }

    private static string Ellipsis(string? s)
        => string.IsNullOrEmpty(s) ? "" : s.Length <= 40 ? s : s[..40] + "…";

    private static string ToBase64Url(byte[] bytes)
        => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static byte[] FromBase64Url(string s)
    {
        var b64 = s.Replace('-', '+').Replace('_', '/');
        return Convert.FromBase64String(b64.PadRight(b64.Length + (4 - b64.Length % 4) % 4, '='));
    }
}
