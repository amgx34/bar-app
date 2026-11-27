import Foundation

/// Every failure a caller of the API can see. Descriptions never contain a token: tokens only ever
/// live in request headers, and nothing here formats a request.
public enum RailAPIError: Error, CustomStringConvertible {
    case unauthenticated
    case forbidden
    case notFound
    case validation([String: JSONValue])
    case conflict
    case rateLimited(retryAfter: TimeInterval?)
    case server(requestId: String?)
    case transport(any Error)
    case decoding
    /// A code this build does not map (upgrade_required, org_required, ...), kept with its status.
    case api(ApiError, status: Int)

    public var description: String {
        switch self {
        case .unauthenticated: "unauthenticated"
        case .forbidden: "forbidden"
        case .notFound: "not found"
        case .validation(let f): "validation failed (\(f.keys.sorted().joined(separator: ", ")))"
        case .conflict: "conflict"
        case .rateLimited(let s): "rate limited (retry after \(s.map { "\(Int($0))s" } ?? "unknown"))"
        case .server(let id): "server error (request \(id ?? "unknown"))"
        case .transport(let e): "transport error: \(e)"
        case .decoding: "response could not be decoded"
        case .api(let e, let status): "api error \(e.code.rawValue) (\(status))"
        }
    }

    /// Maps a non-2xx response. Falls back on the status when the body is not the envelope.
    static func from(status: Int, headers: HTTPURLResponse, body: Data) -> RailAPIError {
        let err = try? JSONDecoder().decode(ErrorBody.self, from: body).error
        let retry = headers.value(forHTTPHeaderField: "Retry-After").flatMap(TimeInterval.init)
            ?? { if case .number(let n)? = err?.details?["retryAfterSeconds"] { return n } else { return nil } }()
        switch (err?.code, status) {
        case (.unauthenticated?, _), (_, 401): return .unauthenticated
        case (.forbidden?, _), (.noMembership?, _), (_, 403): return .forbidden
        case (.notFound?, _), (_, 404): return .notFound
        case (.validationFailed?, _), (_, 422): return .validation(err?.details ?? [:])
        case (.conflict?, _), (.staleCount?, _), (_, 409): return .conflict
        case (.rateLimited?, _), (_, 429): return .rateLimited(retryAfter: retry)
        case (.internal?, _), (_, 500...): return .server(requestId: err?.requestId ?? headers.value(forHTTPHeaderField: "X-Request-Id"))
        default: return err.map { .api($0, status: status) } ?? .decoding
        }
    }
}

/// Sends one request and returns the body of a 2xx, or throws the mapped error.
func execute(_ transport: any HTTPTransport, _ request: URLRequest) async throws -> Data {
    let data: Data, response: HTTPURLResponse
    do { (data, response) = try await transport.send(request) }
    catch { throw RailAPIError.transport(error) }
    guard (200..<300).contains(response.statusCode) else {
        throw RailAPIError.from(status: response.statusCode, headers: response, body: data)
    }
    return data
}
