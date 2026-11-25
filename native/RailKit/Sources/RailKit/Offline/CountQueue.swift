import Foundation

// Offline queue for stock-count OBSERVATIONS (architecture doc section 3.5).
// The device queues what a person saw ("I counted 7"), never a computed result: no deltas, no totals,
// no arithmetic on quantities. Quantities are `QuantityString`, kept verbatim. Sending is the caller's job.

/// What a person counted. `id` is the Idempotency-Key. `baseAsOf` is the SERVER's timestamp from the item
/// list the counter was looking at (rule 5: staleness is judged on it, not on the device clock);
/// `observedAt` comes from the injected clock and is kept for the note only.
public struct CountObservation: Sendable, Equatable, Codable, Identifiable {
    public let id: UUID
    public let userId: String
    public let orgId: String
    public let itemId: String
    public let quantity: QuantityString
    public let note: String?
    public let observedAt: Date
    public let baseAsOf: Date

    public init(id: UUID, userId: String, orgId: String, itemId: String, quantity: QuantityString,
                note: String?, observedAt: Date, baseAsOf: Date) {
        self.id = id; self.userId = userId; self.orgId = orgId; self.itemId = itemId
        self.quantity = quantity; self.note = note; self.observedAt = observedAt; self.baseAsOf = baseAsOf
    }
}

public enum CountEntryState: Sendable, Equatable, Codable {
    case waiting
    /// The server answered `stale_count`; a person must choose (apply mine, recount, discard). Never auto-resent.
    case needsDecision(serverQuantity: QuantityString)
}

public struct QueuedCount: Sendable, Equatable, Codable {
    public var observation: CountObservation
    public var state: CountEntryState
}

public struct FailedCount: Sendable, Equatable, Codable {
    public let observation: CountObservation
    public let reason: String
}

public struct CountQueueState: Sendable, Equatable, Codable {
    public var entries: [QueuedCount]
    public var failed: [FailedCount]
    public init(entries: [QueuedCount] = [], failed: [FailedCount] = []) { self.entries = entries; self.failed = failed }
}

/// Persistence contract. `save` must be durable (atomic file write, SwiftData transaction) before it returns:
/// the queue relies on that for crash safety. A disk or SwiftData store is an app concern.
public protocol CountQueueStore: Sendable {
    func load() async throws -> CountQueueState
    func save(_ state: CountQueueState) async throws
}

public actor InMemoryCountQueueStore: CountQueueStore {
    private var state = CountQueueState()
    public init() {}
    public func load() async throws -> CountQueueState { state }
    public func save(_ state: CountQueueState) async throws { self.state = state }
}

public enum SendOutcome: Sendable, Equatable {
    case accepted
    case rejectedPermanently(reason: String)
    case retryLater(after: TimeInterval)
    /// The server's `stale_count` answer, carrying its current figure.
    case conflict(serverQuantity: QuantityString)
}

public struct CountConflict: Sendable, Equatable {
    public let id: UUID
    public let serverQuantity: QuantityString
}

public struct DrainReport: Sendable, Equatable {
    public var accepted: [UUID] = []
    public var failed: [UUID] = []
    public var conflicts: [CountConflict] = []
    /// Set when the drain stopped on a transient failure.
    public var retryAfter: TimeInterval?
}

/// Exponential backoff with jitter: `min(cap, base * 2^attempt)`, reduced by up to `jitter` (0...1) of itself.
/// Jitter comes from the caller's generator, so tests are deterministic.
public struct BackoffPolicy: Sendable, Equatable {
    public let base: TimeInterval
    public let cap: TimeInterval
    public let jitter: TimeInterval

    public init(base: TimeInterval = 2, cap: TimeInterval = 300, jitter: TimeInterval = 0.5) {
        self.base = base; self.cap = cap; self.jitter = min(max(jitter, 0), 1)
    }

    public func delay(attempt: Int, using rng: inout some RandomNumberGenerator) -> TimeInterval {
        let exp = min(cap, base * TimeInterval(sign: .plus, exponent: min(max(attempt, 0), 30), significand: 1))
        guard jitter > 0 else { return exp }
        return exp * (1 - jitter * TimeInterval.random(in: 0..<1, using: &rng))
    }
}

public actor CountQueue {
    private let store: any CountQueueStore
    private var state: CountQueueState?

    public init(store: any CountQueueStore) { self.store = store }

    private func current() async -> CountQueueState {
        if let state { return state }
        let loaded = (try? await store.load()) ?? CountQueueState()
        state = loaded
        return loaded
    }

    private func commit(_ new: CountQueueState) async throws {
        try await store.save(new)  // persist first: memory only moves once the disk has
        state = new
    }

    /// Entries in send order (oldest first), all users and bars.
    public func pending() async -> [QueuedCount] { await current().entries }
    public func failed() async -> [FailedCount] { await current().failed }

    /// Idempotent by `id`. Rule 3 (section 3.5): a newer count of the same item by the same user in the same
    /// bar replaces their older WAITING entry (the only automatic removal); a needs-decision entry is kept.
    public func enqueue(_ o: CountObservation) async throws {
        var s = await current()
        guard !s.entries.contains(where: { $0.observation.id == o.id }) else { return }
        s.entries.removeAll {
            $0.state == .waiting && $0.observation.userId == o.userId
                && $0.observation.orgId == o.orgId && $0.observation.itemId == o.itemId
        }
        s.entries.append(QueuedCount(observation: o, state: .waiting))
        try await commit(s)
    }

    /// The only way an unapplied entry (conflicted or failed) leaves the queue: a person's decision.
    public func discard(id: UUID) async throws {
        var s = await current()
        s.entries.removeAll { $0.observation.id == id }
        s.failed.removeAll { $0.observation.id == id }
        try await commit(s)
    }

    /// Sends this user's waiting entries for this bar, oldest first (rule 2, rule 6). Others are never touched.
    /// State is saved after each answer. A thrown error (including cancellation) propagates with the entry
    /// still queued; if the process dies between the server's answer and the save, the entry is resent with
    /// the same Idempotency-Key, which the server must treat as a repeat.
    public func drain(userId: String, orgId: String,
                      using sender: (CountObservation) async throws -> SendOutcome) async throws -> DrainReport {
        var report = DrainReport()
        let ids = await current().entries
            .filter { $0.state == .waiting && $0.observation.userId == userId && $0.observation.orgId == orgId }
            .map(\.observation.id)
        for id in ids {
            var s = await current()
            guard let i = s.entries.firstIndex(where: { $0.observation.id == id }) else { continue }
            let o = s.entries[i].observation
            switch try await sender(o) {
            case .accepted:
                s.entries.remove(at: i); report.accepted.append(id)
            case .rejectedPermanently(let reason):
                s.entries.remove(at: i); s.failed.append(FailedCount(observation: o, reason: reason)); report.failed.append(id)
            case .conflict(let server):
                s.entries[i].state = .needsDecision(serverQuantity: server)
                report.conflicts.append(CountConflict(id: id, serverQuantity: server))
            case .retryLater(let after):
                report.retryAfter = after
                return report  // order preserved: nothing after this goes out
            }
            try await commit(s)
        }
        return report
    }
}
