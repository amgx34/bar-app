using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using RailAgent.Config;
using RailAgent.Models;

namespace RailAgent.Services;

/// <summary>
/// Pushes report data to POST /api/2touch/ingest, authenticated with a
/// per-org HMAC-SHA256 signature over the EXACT bytes of the request body.
/// </summary>
/// <remarks>
/// Not sealed, and <see cref="PushAsync"/> is virtual, so tests can observe what
/// a sync would send without a network. Nothing in production subclasses it.
/// </remarks>
public class RailClient(IHttpClientFactory factory, IOptions<AgentConfig> cfg, ILogger<RailClient> log)
{
    private readonly RailConfig _rail = cfg.Value.Rail;

    // Serializer intentionally left at defaults: property names are emitted
    // verbatim (already snake_case) and the output is compact. We sign whatever
    // bytes this produces, and the server verifies against the raw bytes it
    // receives — so serializer-specific formatting never affects the signature.
    private static readonly JsonSerializerOptions JsonOpts = new(JsonSerializerDefaults.General);

    public virtual async Task<string> PushAsync(
        IReadOnlyList<ZReportRow> zReports,
        IReadOnlyList<EwReportRow> ewReports,
        IReadOnlyList<ItemAuditRow> itemAudit,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(_rail.OrgId) || _rail.OrgId.StartsWith("REPLACE", StringComparison.Ordinal))
            throw new InvalidOperationException("Rail.OrgId is not configured — run the setup wizard (double-click the exe) or paste a pairing code from Rail → Settings → POS Integration → 2TouchPOS.");
        if (string.IsNullOrWhiteSpace(_rail.AuthToken) || _rail.AuthToken.StartsWith("REPLACE", StringComparison.Ordinal))
            throw new InvalidOperationException("Rail.AuthToken is not configured — run the setup wizard (double-click the exe) to pair this box.");

        var http = factory.CreateClient("rail");
        var result = await SendAsync(http, _rail, zReports, ewReports, itemAudit, ct);

        if (!result.Ok)
            throw new HttpRequestException($"Rail ingest → {result.StatusCode}: {result.Body}");

        log.LogInformation("Rail ingest OK: {Response}", result.Body);
        return result.Body;
    }

    public sealed record IngestResult(bool Ok, int StatusCode, string Body);

    /// <summary>
    /// The signing and POST, with the org credentials passed in rather than bound
    /// from config. The setup wizard verifies a pairing code with this before any
    /// config file exists — an empty payload is a genuine no-op server-side
    /// (every write is guarded by a length check) that still exercises HMAC
    /// verification and org resolution.
    /// </summary>
    public static async Task<IngestResult> SendAsync(
        HttpClient http,
        RailConfig rail,
        IReadOnlyList<ZReportRow> zReports,
        IReadOnlyList<EwReportRow> ewReports,
        IReadOnlyList<ItemAuditRow> itemAudit,
        CancellationToken ct)
    {
        var payload = new IngestPayload(
            org_id: rail.OrgId,
            source: "2touch-dotnet-agent",
            pulledAt: DateTime.UtcNow.ToString("o"),
            zReports: zReports,
            ewReports: ewReports,
            itemAudit: itemAudit);

        var body = JsonSerializer.Serialize(payload, JsonOpts);
        var signature = Sign(body, rail.AuthToken);

        var url = $"{rail.ApiBaseUrl.TrimEnd('/')}/api/2touch/ingest";
        using var content = new StringContent(body, Encoding.UTF8, "application/json");
        using var request = new HttpRequestMessage(HttpMethod.Post, url) { Content = content };
        request.Headers.TryAddWithoutValidation("X-Rail-Signature", signature);
        request.Headers.TryAddWithoutValidation("X-Rail-Agent", "rail-2touch-agent/2.0-dotnet");

        using var response = await http.SendAsync(request, ct);
        var text = await response.Content.ReadAsStringAsync(ct);

        return new IngestResult(response.IsSuccessStatusCode, (int)response.StatusCode, text);
    }

    /// <summary>Lowercase hex HMAC-SHA256 of the UTF-8 body bytes, keyed by the org token.</summary>
    private static string Sign(string body, string secret)
    {
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(body));
        return Convert.ToHexString(hash).ToLowerInvariant();
    }
}
