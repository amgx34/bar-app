import Foundation

public enum AuthState: Sendable, Equatable { case signedIn, signedOut }

/// Holds the session behind a `TokenStore`. Refreshes are single-flight: refresh tokens rotate, so
/// two parallel refreshes could end the session. Tokens are never logged or printed.
public actor AuthSession {
    private let baseURL: URL
    private let transport: any HTTPTransport
    private let store: any TokenStore
    private let now: @Sendable () -> Date
    private let skew: TimeInterval
    private var inflight: Task<Session, any Error>?
    public private(set) var state: AuthState = .signedIn
    private var watchers: [AsyncStream<AuthState>.Continuation] = []

    public init(baseURL: URL, transport: any HTTPTransport, store: any TokenStore,
                now: @escaping @Sendable () -> Date = { Date() }, skew: TimeInterval = 60) {
        self.baseURL = baseURL; self.transport = transport; self.store = store; self.now = now; self.skew = skew
    }

    /// Emits on every change; the app returns to sign-in on `.signedOut`.
    public func stateUpdates() -> AsyncStream<AuthState> {
        let (stream, c) = AsyncStream.makeStream(of: AuthState.self)
        watchers.append(c)
        return stream
    }

    /// A token valid for at least `skew` more seconds, refreshing first if it is not.
    public func currentAccessToken() async throws -> String {
        guard let s = try await loadStored() else { throw RailAPIError.unauthenticated }
        if s.expiresAt.timeIntervalSince(now()) <= skew { return try await refresh().accessToken }
        return s.accessToken
    }

    /// Call after the server rejected `rejected`. If another caller already replaced that token,
    /// returns the new one without a second refresh.
    public func refreshIfNeeded(afterRejected rejected: String) async throws -> String {
        guard let s = try await loadStored() else { throw RailAPIError.unauthenticated }
        if s.accessToken != rejected { return s.accessToken }
        return try await refresh().accessToken
    }

    public func signIn(email: String, password: String) async throws -> Session {
        let body = try JSONEncoder().encode(["email": email, "password": password])
        let s = try await authCall("/api/v1/auth/login", body: body)
        try await store.save(s)
        publish(.signedIn)
        return s
    }

    /// Best-effort server revoke; the device is signed out regardless.
    public func signOut() async {
        if let s = try? await store.load() {
            var r = request("/api/v1/auth/logout")
            r.setValue("Bearer \(s.accessToken)", forHTTPHeaderField: "Authorization")
            _ = try? await execute(transport, r)
        }
        try? await store.clear()
        publish(.signedOut)
    }

    // MARK: private

    private func loadStored() async throws -> Session? {
        do { return try await store.load() } catch { throw RailAPIError.transport(error) }
    }

    private func refresh() async throws -> Session {
        if let t = inflight { return try await t.value }
        let t = Task { try await self.performRefresh() }
        inflight = t
        defer { inflight = nil }
        return try await t.value
    }

    private func performRefresh() async throws -> Session {
        guard let current = try await loadStored() else { throw RailAPIError.unauthenticated }
        do {
            let body = try JSONEncoder().encode(["refreshToken": current.refreshToken])
            let s = try await authCall("/api/v1/auth/refresh", body: body)
            try await store.save(s)
            return s
        } catch RailAPIError.unauthenticated, RailAPIError.validation, RailAPIError.forbidden {
            // The refresh token is dead (invalid grant): nothing left to retry with.
            try? await store.clear()
            publish(.signedOut)
            throw RailAPIError.unauthenticated
        }
    }

    private func authCall(_ path: String, body: Data) async throws -> Session {
        var r = request(path)
        r.httpBody = body
        let data = try await execute(transport, r)
        do { return try JSONDecoder().decode(SessionResponse.self, from: data).data }
        catch { throw RailAPIError.decoding }
    }

    private func request(_ path: String) -> URLRequest {
        var r = URLRequest(url: baseURL.appendingPathComponent(path))
        r.httpMethod = "POST"
        r.setValue("application/json", forHTTPHeaderField: "Accept")
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.setValue(UUID().uuidString, forHTTPHeaderField: "X-Request-Id")
        return r
    }

    private func publish(_ s: AuthState) {
        state = s
        for w in watchers { w.yield(s) }
    }
}
