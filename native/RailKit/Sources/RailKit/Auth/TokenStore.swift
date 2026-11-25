import Foundation

/// Where the session lives between launches.
///
/// Contract for the app-target Keychain implementation (not written here: needs Xcode):
/// one generic-password item holding the encoded `Session`; accessible after first unlock, this
/// device only (`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`) so background refresh works;
/// never UserDefaults; `load` returns nil when nothing is stored; `clear` succeeds when already empty.
public protocol TokenStore: Sendable {
    func load() async throws -> Session?
    func save(_ s: Session) async throws
    func clear() async throws
}

public actor InMemoryTokenStore: TokenStore {
    private var session: Session?
    public init(_ session: Session? = nil) { self.session = session }
    public func load() async throws -> Session? { session }
    public func save(_ s: Session) async throws { session = s }
    public func clear() async throws { session = nil }
}
