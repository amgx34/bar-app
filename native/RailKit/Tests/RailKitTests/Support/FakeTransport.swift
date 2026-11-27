import Foundation
import Testing
@testable import RailKit

struct FakeReply: Sendable {
    var status: Int = 200
    var body: Data = Data()
    var headers: [String: String] = [:]
}

/// Records every request and answers from a closure. No network.
actor FakeTransport: HTTPTransport {
    typealias Handler = @Sendable (URLRequest) async throws -> FakeReply
    private(set) var requests: [URLRequest] = []
    private let handler: Handler

    init(_ handler: @escaping Handler) { self.handler = handler }

    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        requests.append(request)
        let r = try await handler(request)
        let resp = HTTPURLResponse(url: request.url!, statusCode: r.status, httpVersion: nil, headerFields: r.headers)!
        return (r.body, resp)
    }

    func count(path: String) -> Int { requests.filter { $0.url?.path == path }.count }
    var total: Int { requests.count }
}

func fixtureData(_ name: String) throws -> Data {
    guard let u = Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures") else {
        throw CocoaError(.fileNoSuchFile)
    }
    return try Data(contentsOf: u)
}
