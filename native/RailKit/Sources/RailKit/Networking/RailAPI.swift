import Foundation

/// Thin client over `/api/v1`. Bearer-only; org chosen by `X-Rail-Org`.
public struct RailAPI: Sendable {
    private let baseURL: URL
    private let transport: any HTTPTransport
    private let auth: AuthSession
    private let activeOrgId: String?
    private let requestId: @Sendable () -> String
    private let client: String

    public init(baseURL: URL, transport: any HTTPTransport, auth: AuthSession, activeOrgId: String? = nil,
                client: String = "ios/1.0.0", requestId: @escaping @Sendable () -> String = { UUID().uuidString }) {
        self.baseURL = baseURL; self.transport = transport; self.auth = auth
        self.activeOrgId = activeOrgId; self.client = client; self.requestId = requestId
    }

    public func me() async throws -> MeResponse {
        let data = try await call(method: "GET", path: "/api/v1/me")
        do { return try JSONDecoder().decode(MeResponse.self, from: data) }
        catch { throw RailAPIError.decoding }
    }

    /// Generic write. The contract defines no write endpoint beyond the auth routes yet; this exists
    /// so every future one carries an `Idempotency-Key` (minted here when the caller gives none).
    @discardableResult
    public func post(_ path: String, body: Data, idempotencyKey: String? = nil) async throws -> Data {
        try await call(method: "POST", path: path, body: body, idempotencyKey: idempotencyKey ?? UUID().uuidString)
    }

    private func call(method: String, path: String, body: Data? = nil, idempotencyKey: String? = nil) async throws -> Data {
        let token = try await auth.currentAccessToken()
        do {
            return try await execute(transport, build(method, path, body, idempotencyKey, token))
        } catch RailAPIError.unauthenticated {
            // One refresh, one retry; a second 401 goes to the caller.
            let fresh = try await auth.refreshIfNeeded(afterRejected: token)
            return try await execute(transport, build(method, path, body, idempotencyKey, fresh))
        }
    }

    private func build(_ method: String, _ path: String, _ body: Data?, _ key: String?, _ token: String) -> URLRequest {
        var r = URLRequest(url: baseURL.appendingPathComponent(path))
        r.httpMethod = method
        r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        r.setValue("application/json", forHTTPHeaderField: "Accept")
        r.setValue(requestId(), forHTTPHeaderField: "X-Request-Id")
        r.setValue(client, forHTTPHeaderField: "X-Rail-Client")
        if let activeOrgId { r.setValue(activeOrgId, forHTTPHeaderField: "X-Rail-Org") }
        if let key { r.setValue(key, forHTTPHeaderField: "Idempotency-Key") }
        if let body { r.httpBody = body; r.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        return r
    }
}
