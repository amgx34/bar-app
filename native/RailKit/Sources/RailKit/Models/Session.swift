import Foundation

public struct Session: Sendable, Equatable, Codable {
    public let accessToken: String
    public let refreshToken: String
    public let expiresAt: Date
    public let tokenType: String
    public let user: User

    enum CodingKeys: String, CodingKey { case accessToken, refreshToken, expiresAt, tokenType, user }

    public init(accessToken: String, refreshToken: String, expiresAt: Date, tokenType: String = "bearer", user: User) {
        self.accessToken = accessToken; self.refreshToken = refreshToken
        self.expiresAt = expiresAt; self.tokenType = tokenType; self.user = user
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        accessToken = try c.decode(String.self, forKey: .accessToken)
        refreshToken = try c.decode(String.self, forKey: .refreshToken)
        expiresAt = try WireInstant.decode(c.superDecoder(forKey: .expiresAt).singleValueContainer())
        tokenType = try c.decode(String.self, forKey: .tokenType)
        user = try c.decode(User.self, forKey: .user)
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(accessToken, forKey: .accessToken)
        try c.encode(refreshToken, forKey: .refreshToken)
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        try c.encode(f.string(from: expiresAt), forKey: .expiresAt)
        try c.encode(tokenType, forKey: .tokenType)
        try c.encode(user, forKey: .user)
    }
}

public struct SessionResponse: Sendable, Equatable, Codable {
    public let data: Session
    public let meta: Meta?
}
