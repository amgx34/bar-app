import Foundation
import Testing
@testable import RailKit

private func decode(_ json: String) throws -> WireDecimal {
    try JSONDecoder().decode(WireDecimal.self, from: Data(json.utf8))
}

@Suite struct WireTypesTests {
    @Test func decodesExactValue() throws {
        let d = try decode(#""1234.50""#)
        #expect(d.string == "1234.50")
        #expect(d.decimal == Decimal(string: "1234.5", locale: Locale(identifier: "en_US_POSIX")))
    }

    @Test func thirtyCentsStaysExact() throws {
        let d = try decode(#""0.30""#)
        #expect(d.decimal == Decimal(string: "0.3", locale: Locale(identifier: "en_US_POSIX")))
        #expect(d.decimal * 10 == 3)
    }

    @Test func negativeAndLargeKeepEveryDigit() throws {
        #expect(try decode(#""-0.50""#).decimal == Decimal(string: "-0.5", locale: Locale(identifier: "en_US_POSIX")))
        let big = "123456789012345678.1234"
        let d = try decode("\"\(big)\"")
        #expect(d.string == big)
        #expect(d.decimal == Decimal(string: big, locale: Locale(identifier: "en_US_POSIX")))
    }

    @Test func jsonNumberFails() {
        #expect(throws: DecodingError.self) { try decode("1234.5") }
        #expect(throws: DecodingError.self) { try decode("5") }
    }

    @Test(arguments: ["1e3", "+5", "1,000", "", "NaN", " 12.50", "12.", ".5", "1.2.3", "Infinity"])
    func nonCanonicalFails(_ s: String) {
        #expect(throws: DecodingError.self) { try decode("\"\(s)\"") }
    }

    @Test func encodesToSameString() throws {
        let d = try decode(#""1234.50""#)
        let out = try JSONEncoder().encode([d])
        #expect(String(decoding: out, as: UTF8.self) == #"["1234.50"]"#)
    }
}
