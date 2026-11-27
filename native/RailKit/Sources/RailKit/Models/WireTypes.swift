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

/// A `WireDecimal` that also has exactly `places` fractional digits, as the Zod contract requires.
private func scaled(_ s: String, _ places: Int) -> WireDecimal? {
    guard let d = WireDecimal(s), d.string.split(separator: ".", omittingEmptySubsequences: false).last!.count == places,
          d.string.contains(".") else { return nil }
    return d
}

private func decodeScaled(_ decoder: any Decoder, _ places: Int) throws -> WireDecimal {
    let c = try decoder.singleValueContainer()
    let s = try c.decode(String.self)
    guard let v = scaled(s, places) else {
        throw DecodingError.dataCorruptedError(in: c, debugDescription: "not a decimal string with exactly \(places) fractional digits")
    }
    return v
}

/// Money: exactly 2 decimal places.
public struct MoneyString: Sendable, Equatable, Hashable, Codable {
    public let value: WireDecimal
    public var string: String { value.string }
    public var decimal: Decimal { value.decimal }
    public init?(_ string: String) { guard let v = scaled(string, 2) else { return nil }; value = v }
    public init(from decoder: any Decoder) throws { value = try decodeScaled(decoder, 2) }
    public func encode(to encoder: any Encoder) throws { try value.encode(to: encoder) }
}

/// Stock quantity: exactly 4 decimal places.
public struct QuantityString: Sendable, Equatable, Hashable, Codable {
    public let value: WireDecimal
    public var string: String { value.string }
    public var decimal: Decimal { value.decimal }
    public init?(_ string: String) { guard let v = scaled(string, 4) else { return nil }; value = v }
    public init(from decoder: any Decoder) throws { value = try decodeScaled(decoder, 4) }
    public func encode(to encoder: any Encoder) throws { try value.encode(to: encoder) }
}

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
