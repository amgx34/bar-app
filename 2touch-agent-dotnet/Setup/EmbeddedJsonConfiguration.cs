using System.Reflection;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Configuration.Json;

namespace RailAgent.Setup;

/// <summary>
/// Loads the baked-in appsettings.json, so a lone .exe is a complete install and
/// the operator never has to copy a second file.
/// </summary>
/// <remarks>
/// The bytes are cached rather than the stream: ConfigurationManager rebuilds
/// every provider each time a source is added, so a one-shot stream would be
/// exhausted by the second Add and the defaults would silently vanish.
/// </remarks>
public sealed class EmbeddedJsonConfigurationSource(byte[] json) : IConfigurationSource
{
    public const string ResourceName = "RailAgent.appsettings.json";

    public IConfigurationProvider Build(IConfigurationBuilder builder)
        => new JsonStreamConfigurationProvider(new JsonStreamConfigurationSource
        {
            Stream = new MemoryStream(json, writable: false),
        });

    /// <summary>Null when the resource is missing — callers fall back to on-disk config.</summary>
    public static EmbeddedJsonConfigurationSource? TryLoad()
    {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(ResourceName);
        if (stream is null) return null;

        using var buffer = new MemoryStream();
        stream.CopyTo(buffer);
        return new EmbeddedJsonConfigurationSource(buffer.ToArray());
    }
}
