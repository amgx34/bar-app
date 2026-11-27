import Foundation
import Testing
@testable import RailKit

private func fixture(_ name: String) throws -> Data {
    let url = try #require(Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures"))
    return try Data(contentsOf: url)
}

private let bar1 = "00000000-0000-4000-8000-0000000000a1"
private let user1 = "00000000-0000-4000-8000-000000000001"

@Suite struct FixtureDecodingTests {
    @Test func meMember() throws {
        let r = try JSONDecoder().decode(MeResponse.self, from: fixture("me.member"))
        #expect(r.data.user == User(id: user1, email: "member@example.com"))
        #expect(r.data.memberships.count == 1)
        #expect(r.data.memberships[0].orgName == "Fixture Bar One")
        #expect(r.data.memberships[0].role == .manager)
        #expect(r.data.memberships[0].destinations == [.today, .stock, .sales, .teamPay, .books])
        #expect(r.data.activeOrgId == bar1)
        #expect(r.data.staff == .none)
        #expect(r.meta?.asOf == Date(timeIntervalSince1970: 1_795_608_000))
    }

    @Test func meStaff() throws {
        let r = try JSONDecoder().decode(MeResponse.self, from: fixture("me.staff"))
        #expect(r.data.memberships.isEmpty)
        #expect(r.data.activeOrgId == nil)
        #expect(r.data.staff == .active(orgId: bar1, employeeId: "00000000-0000-4000-8000-0000000000e1"))
    }

    @Test func meTwoOrgs() throws {
        let r = try JSONDecoder().decode(MeResponse.self, from: fixture("me.two-orgs"))
        #expect(r.data.memberships.map(\.role) == [.owner, .accountant])
        #expect(r.data.memberships[1].destinations == [.today, .stock, .sales, .teamPay, .books])
        #expect(r.data.activeOrgId == nil)
    }

    @Test func session() throws {
        let r = try JSONDecoder().decode(SessionResponse.self, from: fixture("auth.session"))
        #expect(r.data.accessToken == "fixture-access-token")
        #expect(r.data.refreshToken == "fixture-refresh-token")
        #expect(r.data.tokenType == "bearer")
        #expect(r.data.expiresAt == Date(timeIntervalSince1970: 1_795_611_600))
        #expect(r.data.user.email == "member@example.com")
    }

    @Test func errorUnauthenticated() throws {
        let e = try JSONDecoder().decode(ErrorBody.self, from: fixture("error.unauthenticated")).error
        #expect(e.code == .unauthenticated)
        #expect(e.message == "Please sign in again.")
        #expect(e.requestId == "fixture-request-1")
        #expect(e.details == nil)
    }

    @Test func errorRateLimited() throws {
        let e = try JSONDecoder().decode(ErrorBody.self, from: fixture("error.rate-limited")).error
        #expect(e.code == .rateLimited)
        #expect(e.details == ["retryAfterSeconds": .number(30)])
    }

    @Test func unknownsDoNotCrash() throws {
        let j = #"{"error":{"code":"brand_new","message":"m"}}"#
        #expect(try JSONDecoder().decode(ErrorBody.self, from: Data(j.utf8)).error.code == .unknown("brand_new"))
        let m = #"{"orgId":"x","orgName":"n","role":"bouncer","destinations":["today","vault"]}"#
        let ms = try JSONDecoder().decode(Membership.self, from: Data(m.utf8))
        #expect(ms.role == .unknown("bouncer"))
        #expect(ms.destinations == [.today, .unknown("vault")])
    }

    @Test func missingRequiredKeyThrows() {
        let j = #"{"id":"x"}"#
        #expect(throws: DecodingError.self) { try JSONDecoder().decode(User.self, from: Data(j.utf8)) }
    }
}
