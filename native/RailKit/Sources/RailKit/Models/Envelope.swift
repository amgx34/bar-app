import Foundation

/// Arbitrary JSON, for the error envelope's free-form `details`.
public enum JSONValue: Sendable, Equatable, Codable {
    case null, bool(Bool), number(Double), string(String), array([JSONValue]), object([String: JSONValue])

    public init(from decoder: any Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let v = try? c.decode(Bool.self) { self = .bool(v) }
        else if let v = try? c.decode(Double.self) { self = .number(v) }
        else if let v = try? c.decode(String.self) { self = .string(v) }
        else if let v = try? c.decode([JSONValue].self) { self = .array(v) }
        else { self = .object(try c.decode([String: JSONValue].self)) }
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .bool(let v): try c.encode(v)
        case .number(let v): try c.encode(v)
        case .string(let v): try c.encode(v)
        case .array(let v): try c.encode(v)
        case .object(let v): try c.encode(v)
        }
    }
}

public enum ApiErrorCode: Sendable, Equatable, Codable {
    case unauthenticated, forbidden, noMembership, orgRequired, notFound, validationFailed
    case conflict, staleCount, rateLimited, upgradeRequired, `internal`
    case unknown(String)  // a code newer than this build

    static let known: [String: ApiErrorCode] = [
        "unauthenticated": .unauthenticated, "forbidden": .forbidden, "no_membership": .noMembership,
        "org_required": .orgRequired, "not_found": .notFound, "validation_failed": .validationFailed,
        "conflict": .conflict, "stale_count": .staleCount, "rate_limited": .rateLimited,
        "upgrade_required": .upgradeRequired, "internal": .internal,
    ]

    public var rawValue: String {
        if case .unknown(let s) = self { return s }
        return Self.known.first { $0.value == self }!.key
    }

    public init(from decoder: any Decoder) throws {
        let s = try decoder.singleValueContainer().decode(String.self)
        self = Self.known[s] ?? .unknown(s)
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.singleValueContainer()
        try c.encode(rawValue)
    }
}

public struct ApiError: Sendable, Equatable, Codable {
    public let code: ApiErrorCode
    public let message: String
    public let requestId: String?
    public let details: [String: JSONValue]?
}

public struct ErrorBody: Sendable, Equatable, Codable {
    public let error: ApiError
}

public struct Meta: Sendable, Equatable, Codable {
    public let asOf: Date

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        asOf = try WireInstant.decode(c.superDecoder(forKey: .asOf).singleValueContainer())
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        try c.encode(f.string(from: asOf), forKey: .asOf)
    }

    enum CodingKeys: String, CodingKey { case asOf }
}
