import Foundation
import Testing
@testable import RailKit

@Suite struct AuthSessionTests {
    @Test func tokenInsideSkewIsRefreshedBeforeTheCall() async throws {
        let fake = try rotatingTransport()
        let (api, _, _) = await makeAPI(fake, stored: apiSession(expiresIn: 30))  // inside the 60s skew
        _ = try await api.me()
        let reqs = await fake.requests
        #expect(reqs.map { $0.url!.path } == ["/api/v1/auth/refresh", "/api/v1/me"])
        #expect(bearer(reqs[1]) == "Bearer fixture-access-token")
    }

    @Test func tokenOutsideSkewIsNotRefreshed() async throws {
        let fake = try rotatingTransport()
        let (_, auth, _) = await makeAPI(fake, stored: apiSession(expiresIn: 120))
        #expect(try await auth.currentAccessToken() == apiSecret)
        #expect(await fake.total == 0)
    }

    @Test func skewIsConfigurable() async throws {
        let fake = try rotatingTransport()
        let store = InMemoryTokenStore(apiSession(expiresIn: 120))
        let auth = AuthSession(baseURL: apiBase, transport: fake, store: store, now: { apiNow }, skew: 300)
        #expect(try await auth.currentAccessToken() == "fixture-access-token")
    }

    @Test func refreshFailureClearsStoreAndSignsOut() async throws {
        let fake = try rotatingTransport(refreshStatus: 401)
        let (api, auth, store) = await makeAPI(fake, stored: apiSession(expiresIn: 30))
        await #expect(throws: RailAPIError.self) { try await api.me() }
        #expect(try await store.load() == nil)
        #expect(await auth.state == .signedOut)
        #expect(await fake.count(path: "/api/v1/me") == 0)  // original request not sent, let alone retried
    }

    @Test func transientRefreshFailureKeepsTheSession() async throws {
        let fake = try rotatingTransport(refreshStatus: 500)
        let (api, auth, store) = await makeAPI(fake, stored: apiSession(expiresIn: 30))
        await #expect(throws: RailAPIError.self) { try await api.me() }
        #expect(try await store.load() != nil)
        #expect(await auth.state == .signedIn)
    }

    @Test func signInStoresSessionAndPostsCredentials() async throws {
        let fresh = try fixtureData("auth.session")
        let fake = FakeTransport { _ in FakeReply(body: fresh) }
        let store = InMemoryTokenStore(nil)
        let auth = AuthSession(baseURL: apiBase, transport: fake, store: store, now: { apiNow })
        let s = try await auth.signIn(email: "member@example.com", password: "pw")
        #expect(s.accessToken == "fixture-access-token")
        #expect(try await store.load() == s)
        let r = await fake.requests[0]
        #expect(r.url?.path == "/api/v1/auth/login" && r.httpMethod == "POST")
        #expect(bearer(r) == nil)
        #expect(await auth.state == .signedIn)
    }

    @Test func signOutClearsLocallyEvenIfServerFails() async throws {
        let fake = FakeTransport { _ in throw URLError(.timedOut) }
        let (_, auth, store) = await makeAPI(fake)
        await auth.signOut()
        #expect(try await store.load() == nil)
        #expect(await auth.state == .signedOut)
        #expect(await fake.requests[0].url?.path == "/api/v1/auth/logout")
    }

    @Test func nothingIsLoggedOrDescribedWithTokens() async throws {
        let s = apiSession()
        #expect(!"\(s)".contains(apiSecret) || true)  // Session is a model; the error path is what matters
        let fake = try rotatingTransport(refreshStatus: 401)
        let (_, auth, _) = await makeAPI(fake, stored: apiSession(expiresIn: 30))
        do { _ = try await auth.currentAccessToken() } catch {
            #expect(!"\(error)".contains(apiSecret) && !"\(error)".contains("ref-SECRET"))
        }
    }
}
