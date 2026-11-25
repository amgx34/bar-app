import Foundation

public struct User: Sendable, Equatable, Codable {
    public let id: String
    public let email: String
    public init(id: String, email: String) { self.id = id; self.email = email }
}

public enum Role: Sendable, Equatable, Codable {
    case owner, manager, accountant
    case unknown(String)

    public init(from decoder: any Decoder) throws {
        switch try decoder.singleValueContainer().decode(String.self) {
        case "owner": self = .owner
        case "manager": self = .manager
        case "accountant": self = .accountant
        case let s: self = .unknown(s)
        }
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .owner: try c.encode("owner")
        case .manager: try c.encode("manager")
        case .accountant: try c.encode("accountant")
        case .unknown(let s): try c.encode(s)
        }
    }
}

public enum Destination: Sendable, Equatable, Codable {
    case today, stock, sales, teamPay, books
    case unknown(String)

    public init(from decoder: any Decoder) throws {
        switch try decoder.singleValueContainer().decode(String.self) {
        case "today": self = .today
        case "stock": self = .stock
        case "sales": self = .sales
        case "team-pay": self = .teamPay
        case "books": self = .books
        case let s: self = .unknown(s)
        }
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .today: try c.encode("today")
        case .stock: try c.encode("stock")
        case .sales: try c.encode("sales")
        case .teamPay: try c.encode("team-pay")
        case .books: try c.encode("books")
        case .unknown(let s): try c.encode(s)
        }
    }
}

public struct Membership: Sendable, Equatable, Codable {
    public let orgId: String
    public let orgName: String
    public let role: Role
    public let destinations: [Destination]
}

public enum Staff: Sendable, Equatable, Codable {
    case none
    case pending
    case active(orgId: String, employeeId: String)

    enum CodingKeys: String, CodingKey { case kind, orgId, employeeId }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        switch try c.decode(String.self, forKey: .kind) {
        case "none": self = .none
        case "pending": self = .pending
        case "active":
            self = .active(orgId: try c.decode(String.self, forKey: .orgId),
                           employeeId: try c.decode(String.self, forKey: .employeeId))
        case let k:
            throw DecodingError.dataCorruptedError(forKey: .kind, in: c, debugDescription: "unknown staff kind \(k)")
        }
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .none: try c.encode("none", forKey: .kind)
        case .pending: try c.encode("pending", forKey: .kind)
        case .active(let o, let e):
            try c.encode("active", forKey: .kind)
            try c.encode(o, forKey: .orgId)
            try c.encode(e, forKey: .employeeId)
        }
    }
}

public struct Me: Sendable, Equatable, Codable {
    public let user: User
    public let memberships: [Membership]
    public let activeOrgId: String?
    public let staff: Staff
}

public struct MeResponse: Sendable, Equatable, Codable {
    public let data: Me
    public let meta: Meta?
}
