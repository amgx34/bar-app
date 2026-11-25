import Foundation

/// A money or quantity figure as it crosses the wire: the canonical decimal string, never a JSON number.
/// The server formats; the client never rounds, so the string is kept verbatim and `decimal` is exact.
public struct WireDecimal: Sendable, Equatable, Hashable, Codable {
    public let string: String

    public init?(_ string: String) {
        // Same shape as lib/api/decimal.ts: optional minus, digits, optional fraction, at most 32 chars.
        guard string.utf8.count <= 32,
              string.wholeMatch(of: /-?[0-9]+(\.[0-9]+)?/) != nil else { return nil }
        self.string = string
    }

    public var decimal: Decimal {
        Decimal(string: string, locale: Locale(identifier: "en_US_POSIX"))!  // safe: init validated the form
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.singleValueContainer()
        let s = try c.decode(String.self)
        guard let v = WireDecimal(s) else {
            throw DecodingError.dataCorruptedError(in: c, debugDescription: "not a canonical decimal string")
        }
        self = v
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.singleValueContainer()
        try c.encode(string)
    }
}

public typealias MoneyString = WireDecimal
public typealias QuantityString = WireDecimal

/// ISO 8601 instants with offset, with or without fractional seconds.
enum WireInstant {
    static func parse(_ s: String) -> Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: s) { return d }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: s)
    }

    static func decode(_ c: any SingleValueDecodingContainer) throws -> Date {
        let s = try c.decode(String.self)
        guard let d = parse(s) else {
            throw DecodingError.dataCorruptedError(in: c, debugDescription: "not an ISO 8601 instant")
        }
        return d
    }
}
