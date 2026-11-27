import Foundation
import Testing
@testable import RailKit

private func qty(_ s: String) -> QuantityString { QuantityString(s)! }
private let countT0 = Date(timeIntervalSince1970: 1_000_000)

private func obs(_ item: String, _ q: String = "7.0000", user: String = "u1", org: String = "o1",
                 id: UUID = UUID(), note: String? = nil) -> CountObservation {
    CountObservation(id: id, userId: user, orgId: org, itemId: item, quantity: qty(q),
                     note: note, observedAt: countT0, baseAsOf: countT0)
}

/// Counts saves so "state is saved after every change" is checkable.
private final class CountingStore: CountQueueStore, @unchecked Sendable {
    private let lock = NSLock()
    private var _state = CountQueueState()
    private var _saves = 0
    var saves: Int { lock.withLock { _saves } }
    var stored: CountQueueState { lock.withLock { _state } }
    func load() async throws -> CountQueueState { lock.withLock { _state } }
    func save(_ state: CountQueueState) async throws { lock.withLock { _state = state; _saves += 1 } }
}

private struct SeededGenerator: RandomNumberGenerator {
    var s: UInt64
    mutating func next() -> UInt64 { s = s &* 6364136223846793005 &+ 1442695040888963407; return s }
}

@Suite struct CountQueueTests {
    @Test func enqueueIsIdempotentById() async throws {
        let q = CountQueue(store: InMemoryCountQueueStore())
        let o = obs("a")
        try await q.enqueue(o)
        try await q.enqueue(o)
        #expect(await q.pending().count == 1)
    }

    @Test func newerCountOfSameItemReplacesOlderWaiting() async throws {
        let q = CountQueue(store: InMemoryCountQueueStore())
        try await q.enqueue(obs("a", "7.0000"))
        try await q.enqueue(obs("b", "2.0000"))
        try await q.enqueue(obs("a", "6.0000"))
        let p = await q.pending()
        #expect(p.map(\.observation.itemId) == ["b", "a"])
        #expect(p.last?.observation.quantity.string == "6.0000")
    }

    @Test func replacementIsPerUserAndOrg() async throws {
        let q = CountQueue(store: InMemoryCountQueueStore())
        try await q.enqueue(obs("a", user: "u1"))
        try await q.enqueue(obs("a", user: "u2"))
        try await q.enqueue(obs("a", org: "o2"))
        #expect(await q.pending().count == 3)
    }

    @Test func orderIsPreserved() async throws {
        let q = CountQueue(store: InMemoryCountQueueStore())
        for i in ["a", "b", "c"] { try await q.enqueue(obs(i)) }
        #expect(await q.pending().map(\.observation.itemId) == ["a", "b", "c"])
        var sent: [String] = []
        _ = try await q.drain(userId: "u1", orgId: "o1") { sent.append($0.itemId); return .accepted }
        #expect(sent == ["a", "b", "c"])
    }

    @Test func acceptedIsRemoved() async throws {
        let q = CountQueue(store: InMemoryCountQueueStore())
        try await q.enqueue(obs("a"))
        let r = try await q.drain(userId: "u1", orgId: "o1") { _ in .accepted }
        #expect(r.accepted.count == 1)
        #expect(await q.pending().isEmpty)
    }

    @Test func transientFailureStopsAndKeepsRestInOrder() async throws {
        let q = CountQueue(store: InMemoryCountQueueStore())
        for i in ["a", "b", "c"] { try await q.enqueue(obs(i)) }
        var sent: [String] = []
        let r = try await q.drain(userId: "u1", orgId: "o1") {
            sent.append($0.itemId)
            return $0.itemId == "b" ? .retryLater(after: 30) : .accepted
        }
        #expect(sent == ["a", "b"])
        #expect(r.retryAfter == 30)
        #expect(await q.pending().map(\.observation.itemId) == ["b", "c"])
    }

    @Test func permanentRejectionGoesToFailedAndDrainContinues() async throws {
        let q = CountQueue(store: InMemoryCountQueueStore())
        for i in ["a", "b"] { try await q.enqueue(obs(i)) }
        let r = try await q.drain(userId: "u1", orgId: "o1") {
            $0.itemId == "a" ? .rejectedPermanently(reason: "item deleted") : .accepted
        }
        #expect(r.failed.count == 1)
        let failed = await q.failed()
        #expect(failed.map(\.reason) == ["item deleted"])
        #expect(failed[0].observation.itemId == "a")
        #expect(await q.pending().isEmpty)
    }

    @Test func conflictIsSurfacedAndObservationStaysWithoutOverwrite() async throws {
        let q = CountQueue(store: InMemoryCountQueueStore())
        let a = obs("a", "7.0000")
        try await q.enqueue(a)
        try await q.enqueue(obs("b"))
        let r = try await q.drain(userId: "u1", orgId: "o1") {
            $0.itemId == "a" ? .conflict(serverQuantity: qty("4.0000")) : .accepted
        }
        #expect(r.conflicts == [CountConflict(id: a.id, serverQuantity: qty("4.0000"))])
        let p = await q.pending()
        #expect(p.map(\.observation.itemId) == ["a"])
        #expect(p[0].state == .needsDecision(serverQuantity: qty("4.0000")))
        #expect(p[0].observation.quantity.string == "7.0000")
        // A needs-decision entry is not resent, and is not replaced by a newer count.
        var sent = 0
        _ = try await q.drain(userId: "u1", orgId: "o1") { _ in sent += 1; return .accepted }
        #expect(sent == 0)
        try await q.enqueue(obs("a", "3.0000"))
        #expect(await q.pending().count == 2)
        try await q.discard(id: a.id)
        #expect(await q.pending().count == 1)
    }

    @Test func otherUsersAndBarsAreNeverSentOrRemoved() async throws {
        let q = CountQueue(store: InMemoryCountQueueStore())
        try await q.enqueue(obs("a", user: "u2"))
        try await q.enqueue(obs("b", org: "o2"))
        try await q.enqueue(obs("c"))
        var sent: [String] = []
        _ = try await q.drain(userId: "u1", orgId: "o1") { sent.append($0.itemId); return .accepted }
        #expect(sent == ["c"])
        #expect(await q.pending().count == 2)
    }

    @Test func interruptedDrainLosesNothingAndResendsNothingAccepted() async throws {
        let store = InMemoryCountQueueStore()
        let q = CountQueue(store: store)
        for i in ["a", "b", "c"] { try await q.enqueue(obs(i)) }
        await #expect(throws: CancellationError.self) {
            _ = try await q.drain(userId: "u1", orgId: "o1") {
                if $0.itemId == "b" { throw CancellationError() }
                return .accepted
            }
        }
        // A fresh queue over the same store models a relaunch.
        let q2 = CountQueue(store: store)
        #expect(await q2.pending().map(\.observation.itemId) == ["b", "c"])
        var sent: [String] = []
        _ = try await q2.drain(userId: "u1", orgId: "o1") { sent.append($0.itemId); return .accepted }
        #expect(sent == ["b", "c"])
    }

    @Test func savesAfterEveryChange() async throws {
        let store = CountingStore()
        let q = CountQueue(store: store)
        try await q.enqueue(obs("a"))
        try await q.enqueue(obs("b"))
        #expect(store.saves == 2)
        _ = try await q.drain(userId: "u1", orgId: "o1") { _ in
            #expect(store.stored.entries.count >= 1)  // nothing removed before the answer
            return .accepted
        }
        #expect(store.saves == 4)
        #expect(store.stored.entries.isEmpty)
    }

    @Test func quantitiesStayExactThroughTheStore() async throws {
        let q = CountQueue(store: InMemoryCountQueueStore())
        try await q.enqueue(obs("a", "0.3000"))
        #expect(await q.pending()[0].observation.quantity.string == "0.3000")
        let data = try JSONEncoder().encode(CountQueueState(entries: await q.pending()))
        let back = try JSONDecoder().decode(CountQueueState.self, from: data)
        #expect(back.entries[0].observation.quantity.string == "0.3000")
    }
}

@Suite struct BackoffPolicyTests {
    let p = BackoffPolicy(base: 2, cap: 60, jitter: 0.5)

    @Test func growsThenCaps() {
        var g = SeededGenerator(s: 1)
        let noJitter = BackoffPolicy(base: 2, cap: 60, jitter: 0)
        let d = (0..<8).map { noJitter.delay(attempt: $0, using: &g) }
        #expect(d == [2, 4, 8, 16, 32, 60, 60, 60])
        #expect(noJitter.delay(attempt: 10_000, using: &g) == 60)
    }

    @Test func deterministicWithFixedGeneratorAndBounded() {
        var g1 = SeededGenerator(s: 42), g2 = SeededGenerator(s: 42)
        for a in 0..<10 {
            let x = p.delay(attempt: a, using: &g1), y = p.delay(attempt: a, using: &g2)
            #expect(x == y)
            #expect(x <= 60 && x >= 1)
        }
    }
}
