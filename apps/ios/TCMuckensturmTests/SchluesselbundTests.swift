import Security
import XCTest
@testable import TCMuckensturm

/// Gegen den echten Schluesselbund des Simulators, mit eigenem Test-Dienst.
final class SchluesselbundTests: XCTestCase {
    private let speicher = Schluesselbund(service: "de.tcmuckensturm.app.tests.\(UUID().uuidString)")
    private let key = "supabase.auth.token"

    override func tearDownWithError() throws {
        try speicher.alleEntfernen()
    }

    func testLeerGibtNil() throws {
        XCTAssertNil(try speicher.retrieve(key: key))
    }

    func testSpeichertUndLiest() throws {
        let wert = Data("sitzung".utf8)
        try speicher.store(key: key, value: wert)
        XCTAssertEqual(try speicher.retrieve(key: key), wert)
    }

    func testUeberschreibt() throws {
        try speicher.store(key: key, value: Data("alt".utf8))
        try speicher.store(key: key, value: Data("neu".utf8))
        XCTAssertEqual(try speicher.retrieve(key: key), Data("neu".utf8))
    }

    /// Anders als expo-secure-store keine Grenze von 2 KB - eine Sitzung mit Umlauten passt am Stueck.
    func testLangeSitzungMitUmlautenAmStueck() throws {
        let wert = Data(("{\"access_token\":\"" + String(repeating: "x", count: 8000) + "\",\"name\":\"Jürgen Müßig\"}").utf8)
        try speicher.store(key: key, value: wert)
        XCTAssertEqual(try speicher.retrieve(key: key), wert)
    }

    func testEntferntUndEntfernenOhneEintragIstKeinFehler() throws {
        try speicher.store(key: key, value: Data("x".utf8))
        try speicher.remove(key: key)
        XCTAssertNil(try speicher.retrieve(key: key))
        XCTAssertNoThrow(try speicher.remove(key: key))
    }

    func testSchluesselSindGetrennt() throws {
        try speicher.store(key: "a", value: Data("1".utf8))
        try speicher.store(key: "b", value: Data("2".utf8))
        try speicher.remove(key: "a")
        XCTAssertEqual(try speicher.retrieve(key: "b"), Data("2".utf8))
    }

    func testDiensteSindGetrennt() throws {
        let anderer = Schluesselbund(service: speicher.service + ".anderer")
        defer { try? anderer.alleEntfernen() }
        try speicher.store(key: key, value: Data("x".utf8))
        XCTAssertNil(try anderer.retrieve(key: key))
    }

    func testZugriffsklasseNachDemErstenEntsperren() throws {
        try speicher.store(key: key, value: Data("x".utf8))
        let abfrage: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: speicher.service,
            kSecAttrAccount as String: key,
            kSecReturnAttributes as String: true,
        ]
        var ergebnis: CFTypeRef?
        XCTAssertEqual(SecItemCopyMatching(abfrage as CFDictionary, &ergebnis), errSecSuccess)
        let attribute = try XCTUnwrap(ergebnis as? [String: Any])
        XCTAssertEqual(attribute[kSecAttrAccessible as String] as? String, kSecAttrAccessibleAfterFirstUnlock as String)
    }

    /// Mit der App Group als Access Group, wie in der App (Entitlement application-groups).
    func testMitAppGroup() throws {
        let gruppe = try XCTUnwrap(try Umgebung.ausBundle(Bundle(for: Sitzung.self)).appGroup)
        let mitGruppe = Schluesselbund(service: speicher.service + ".gruppe", accessGroup: gruppe)
        defer { try? mitGruppe.alleEntfernen() }
        try mitGruppe.store(key: key, value: Data("x".utf8))
        XCTAssertEqual(try mitGruppe.retrieve(key: key), Data("x".utf8))
    }
}
