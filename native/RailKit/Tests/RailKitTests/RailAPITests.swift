import Foundation
import Testing
@testable import RailKit

let apiBase = URL(string: "https://rail.test")!
let apiNow = ISO8601DateFormatter().date(from: "2026-11-25T12:00:00Z")!
let apiSecret = "tok-SECRET-7f3a"
let apiOrg = "00000000-0000-4000-8000-0000000000a1"

func apiSession(access: String = apiSecret, expiresIn: TimeInterval = 3600) -> Session {
    Session(accessToken: access, refreshToken: "ref-SECRET-9c1d", expiresAt: apiNow.addingTimeInterval(expiresIn),
            user: User(id: "00000000-0000-4000-8000-000000000001", email: "member@example.com"))
}

func bearer(_ r: URLRequest) -> String? { r.value(forHTTPHeaderField: "Authorization") }

func makeAPI(_ transport: FakeTransport, stored: Session? = apiSession(), org: String? = apiOrg)
    async -> (RailAPI, AuthSession, InMemoryTokenStore) {
    let store = InMemoryTokenStore(stored)
    let auth = AuthSession(baseURL: apiBase, transport: transport, store: store, now: { apiNow })
    let api = RailAPI(baseURL: apiBase, transport: transport, auth: auth, activeOrgId: org, requestId: { "req-1" })
    return (api, auth, store)
}

/// me() is 200 for the fresh token and 401 for the stale one; refresh returns the session fixture.
func rotatingTransport(refreshStatus: Int = 200) throws -> FakeTransport {
    let me = try fixtureData("me.member"), fresh = try fixtureData("auth.session")
    let unauth = try fixtureData("error.unauthenticated")
    return FakeTransport { req in
        switch req.url!.path {
        case "/api/v1/auth/refresh":
            for _ in 0..<5 { await Task.yield() }
            return refreshStatus == 200 ? FakeReply(body: fresh) : FakeReply(status: refreshStatus, body: refreshStatus == 500 ? Data(#"{"error":{"code":"internal","message":"x","requestId":"r"}}"#.utf8) : unauth)
        default:
            return bearer(req) == "Bearer fixture-access-token" ? FakeReply(body: me) : FakeReply(status: 401, body: unauth)
        }
    }
}

@Suite struct RailAPITests {
    @Test func meDecodesMemberFixtureAndCarriesHeaders() async throws {
        let fake = FakeTransport { _ in FakeReply(body: try fixtureData("me.member")) }
        let (api, _, _) = await makeAPI(fake)
        let me = try await api.me()
        #expect(me.data.user.email == "member@example.com")
        let r = try #require(await fake.requests.first)
        #expect(r.url?.absoluteString == "https://rail.test/api/v1/me")
        #expect(r.httpMethod == "GET")
        #expect(bearer(r) == "Bearer \(apiSecret)")
        #expect(r.value(forHTTPHeaderField: "X-Rail-Org") == apiOrg)
        #expect(r.value(forHTTPHeaderField: "X-Request-Id") == "req-1")
        #expect(r.value(forHTTPHeaderField: "Accept") == "application/json")
    }

    @Test func noOrgHeaderWhenNoneSelected() async throws {
        let fake = FakeTransport { _ in FakeReply(body: try fixtureData("me.member")) }
        let (api, _, _) = await makeAPI(fake, org: nil)
        _ = try await api.me()
        #expect(await fake.requests[0].value(forHTTPHeaderField: "X-Rail-Org") == nil)
    }

    @Test func fourOhOneRefreshesOnceAndRetriesOnce() async throws {
        let fake = try rotatingTransport()
        let (api, _, store) = await makeAPI(fake)
        _ = try await api.me()
        #expect(await fake.count(path: "/api/v1/auth/refresh") == 1)
        #expect(await fake.count(path: "/api/v1/me") == 2)
        #expect(try await store.load()?.accessToken == "fixture-access-token")
    }

    @Test func fourOhOneAfterRefreshSurfacesUnauthenticated() async throws {
        let unauth = try fixtureData("error.unauthenticated"), fresh = try fixtureData("auth.session")
        let fake = FakeTransport { req in
            req.url!.path == "/api/v1/auth/refresh" ? FakeReply(body: fresh) : FakeReply(status: 401, body: unauth)
        }
        let (api, _, _) = await makeAPI(fake)
        await #expect(throws: RailAPIError.self) { try await api.me() }
        do { _ = try await api.me() } catch let e as RailAPIError {
            guard case .unauthenticated = e else { Issue.record("got \(e)"); return }
        }
        #expect(await fake.count(path: "/api/v1/me") <= 4)  // two calls, one retry each: no loop
    }

    @Test func tenConcurrentFourOhOnesCauseOneRefresh() async throws {
        let fake = try rotatingTransport()
        let (api, _, _) = await makeAPI(fake)
        try await withThrowingTaskGroup(of: Void.self) { g in
            for _ in 0..<10 { g.addTask { _ = try await api.me() } }
            try await g.waitForAll()
        }
        #expect(await fake.count(path: "/api/v1/auth/refresh") == 1)
    }

    @Test func rateLimitedSurfacesRetryAfterWithoutRetry() async throws {
        let body = try fixtureData("error.rate-limited")
        let fake = FakeTransport { _ in FakeReply(status: 429, body: body, headers: ["Retry-After": "30"]) }
        let (api, _, _) = await makeAPI(fake)
        do { _ = try await api.me(); Issue.record("should throw") }
        catch let RailAPIError.rateLimited(retryAfter) { #expect(retryAfter == 30) }
        #expect(await fake.total == 1)
    }

    @Test func serverEnvelopeMapsToServerWithRequestId() async throws {
        let body = Data(#"{"error":{"code":"internal","message":"Something went wrong.","requestId":"req-500"}}"#.utf8)
        let fake = FakeTransport { _ in FakeReply(status: 500, body: body) }
        let (api, _, _) = await makeAPI(fake)
        do { _ = try await api.me(); Issue.record("should throw") }
        catch let RailAPIError.server(id) { #expect(id == "req-500") }
    }

    @Test func malformedBodyMapsToDecoding() async throws {
        let fake = FakeTransport { _ in FakeReply(body: Data("not json".utf8)) }
        let (api, _, _) = await makeAPI(fake)
        do { _ = try await api.me(); Issue.record("should throw") }
        catch RailAPIError.decoding {} 
    }

    @Test func transportErrorMapsToTransport() async throws {
        let fake = FakeTransport { _ in throw URLError(.notConnectedToInternet) }
        let (api, _, _) = await makeAPI(fake)
        do { _ = try await api.me(); Issue.record("should throw") }
        catch RailAPIError.transport(let u) { #expect((u as? URLError)?.code == .notConnectedToInternet) }
    }

    @Test func noSessionFailsWithoutTouchingTransport() async throws {
        let fake = FakeTransport { _ in FakeReply() }
        let (api, _, _) = await makeAPI(fake, stored: nil)
        do { _ = try await api.me(); Issue.record("should throw") }
        catch RailAPIError.unauthenticated {}
        #expect(await fake.total == 0)
    }

    @Test func validationAndConflictAndForbiddenAndNotFound() async throws {
        func code(_ status: Int, _ code: String, details: String = "") async -> RailAPIError? {
            let body = Data(#"{"error":{"code":"\#(code)","message":"m","requestId":"r"\#(details)}}"#.utf8)
            let fake = FakeTransport { _ in FakeReply(status: status, body: body) }
            let (api, _, _) = await makeAPI(fake)
            do { _ = try await api.me(); return nil } catch { return error as? RailAPIError }
        }
        guard case .validation(let f)? = await code(422, "validation_failed", details: #","details":{"email":"bad"}"#)
        else { Issue.record("validation"); return }
        #expect(f == ["email": .string("bad")])
        guard case .conflict? = await code(409, "conflict") else { Issue.record("conflict"); return }
        guard case .forbidden? = await code(403, "forbidden") else { Issue.record("forbidden"); return }
        guard case .notFound? = await code(404, "not_found") else { Issue.record("notFound"); return }
    }

    @Test func noDescriptionContainsTheToken() async throws {
        let bodies: [(Int, Data)] = [(500, Data(#"{"error":{"code":"internal","message":"x","requestId":"r"}}"#.utf8)),
                                     (200, Data("garbage".utf8)), (429, try fixtureData("error.rate-limited"))]
        for (status, body) in bodies {
            let fake = FakeTransport { _ in FakeReply(status: status, body: body) }
            let (api, _, _) = await makeAPI(fake)
            do { _ = try await api.me() } catch {
                for s in ["\(error)", String(describing: error), String(reflecting: error), error.localizedDescription] {
                    #expect(!s.contains(apiSecret) && !s.contains("ref-SECRET"))
                }
            }
        }
    }

    @Test func writeHelperGeneratesIdempotencyKeyWhenNoneGiven() async throws {
        let fake = FakeTransport { _ in FakeReply(body: Data(#"{"data":null}"#.utf8)) }
        let (api, _, _) = await makeAPI(fake)
        try await api.post("/api/v1/x", body: Data("{}".utf8))
        try await api.post("/api/v1/x", body: Data("{}".utf8), idempotencyKey: "given-key")
        let reqs = await fake.requests
        #expect(UUID(uuidString: reqs[0].value(forHTTPHeaderField: "Idempotency-Key") ?? "") != nil)
        #expect(reqs[1].value(forHTTPHeaderField: "Idempotency-Key") == "given-key")
        #expect(reqs[0].value(forHTTPHeaderField: "Content-Type") == "application/json")
    }
}
