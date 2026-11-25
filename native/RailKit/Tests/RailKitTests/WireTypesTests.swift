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

private func dec<T: Decodable>(_ t: T.Type, _ json: String) throws -> T {
    try JSONDecoder().decode(t, from: Data(json.utf8))
}
private let posix = Locale(identifier: "en_US_POSIX")

@Suite struct ScaledTypesTests {
    @Test func moneyNeedsExactlyTwoPlaces() throws {
        #expect(try dec(MoneyString.self, #""12.50""#).string == "12.50")
        for bad in ["12.5", "12.500", "12"] {
            #expect(throws: DecodingError.self) { try dec(MoneyString.self, "\"\(bad)\"") }
            #expect(MoneyString(bad) == nil)
        }
    }

    @Test func quantityNeedsExactlyFourPlaces() throws {
        #expect(try dec(QuantityString.self, #""1.2345""#).string == "1.2345")
        for bad in ["1.234", "1.23456", "1"] {
            #expect(throws: DecodingError.self) { try dec(QuantityString.self, "\"\(bad)\"") }
        }
    }

    @Test func negativeAndLargeKeepEveryDigit() throws {
        let m = try dec(MoneyString.self, #""-0.50""#)
        #expect(m.decimal == Decimal(string: "-0.5", locale: posix))
        let big = "123456789012345678.1234"
        let q = try dec(QuantityString.self, "\"\(big)\"")
        #expect(q.decimal == Decimal(string: big, locale: posix))
    }

    @Test func roundTripsToSameString() throws {
        let m = try dec(MoneyString.self, #""-1234.50""#)
        #expect(String(decoding: try JSONEncoder().encode([m]), as: UTF8.self) == #"["-1234.50"]"#)
        let q = try dec(QuantityString.self, #""0.0100""#)
        #expect(String(decoding: try JSONEncoder().encode([q]), as: UTF8.self) == #"["0.0100"]"#)
    }

    @Test func jsonNumberFails() {
        #expect(throws: DecodingError.self) { try dec(MoneyString.self, "12.50") }
        #expect(throws: DecodingError.self) { try dec(QuantityString.self, "1.2345") }
    }
}
