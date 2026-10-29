import XCTest
@testable import TCMuckensturm

/// Dieselben Faelle wie apps/mobile/src/lib/passwortlink.test.ts, dazu die Adressen der App.
final class PasswortlinkTests: XCTestCase {
    private func link(_ adresse: String) -> LinkInhalt? {
        Passwortlink.auswerten(URL(string: adresse)!)
    }

    // MARK: - linkAuswerten (wie passwortlink.test.ts)

    func testErkenntEinladungUndWiederherstellung() {
        XCTAssertEqual(
            link("https://app.tennisclub-muckensturm.de/passwort-setzen?token_hash=abc&type=invite"),
            .token(tokenHash: "abc", typ: .invite)
        )
        XCTAssertEqual(
            link("https://app.tennisclub-muckensturm.de/passwort-setzen?token_hash=abc&type=recovery"),
            .token(tokenHash: "abc", typ: .recovery)
        )
    }

    func testLehntFremdeOderFehlendeTypenAb() {
        XCTAssertEqual(link("https://app.tennisclub-muckensturm.de/passwort-setzen?token_hash=abc&type=magiclink"), .ungueltig)
        XCTAssertEqual(link("https://app.tennisclub-muckensturm.de/passwort-setzen?token_hash=abc"), .ungueltig)
    }

    func testNimmtBeiDoppeltenParameternDenErsten() {
        XCTAssertEqual(
            link("https://app.tennisclub-muckensturm.de/passwort-setzen?token_hash=a&token_hash=b&type=recovery"),
            .token(tokenHash: "a", typ: .recovery)
        )
    }

    func testMeldetEinenFehlerAusDemLinkAlsUngueltig() {
        XCTAssertEqual(
            link("https://app.tennisclub-muckensturm.de/passwort-setzen?error=access_denied&error_code=otp_expired"),
            .ungueltig
        )
    }

    func testNimmtImUebergangDieSitzungAusDemFragmentAn() {
        XCTAssertEqual(
            link("https://app.tennisclub-muckensturm.de/passwort-setzen#access_token=a%2Eb&refresh_token=r&type=recovery"),
            .fragment(accessToken: "a.b", refreshToken: "r")
        )
    }

    func testLiestDasFragmentAusDemEigenenSchema() {
        XCTAssertEqual(
            link("tcm://passwort-setzen#access_token=a&refresh_token=r"),
            .fragment(accessToken: "a", refreshToken: "r")
        )
    }

    func testTokenHashGehtDemFragmentVor() {
        XCTAssertEqual(
            link("https://app.tennisclub-muckensturm.de/passwort-setzen?token_hash=h&type=invite#access_token=a&refresh_token=r"),
            .token(tokenHash: "h", typ: .invite)
        )
    }

    func testEinFragmentOhneRefreshTokenReichtNicht() {
        XCTAssertEqual(link("tcm://passwort-setzen#access_token=a"), .ohne)
    }

    func testMeldetEinenFehlerImFragmentAlsUngueltig() {
        XCTAssertEqual(link("tcm://passwort-setzen#error=access_denied&error_code=otp_expired"), .ungueltig)
    }

    func testOhneParameterKeinLink() {
        XCTAssertEqual(link("https://app.tennisclub-muckensturm.de/passwort-setzen"), .ohne)
        XCTAssertEqual(Passwortlink.auswerten(abfrage: [:], fragment: [:]), .ohne)
    }

    // MARK: - Welche Adressen die App annimmt

    func testNimmtBeideWebadressenUndAlleSchemataAn() {
        for adresse in [
            "https://app.tennisclub-muckensturm.de/passwort-setzen?token_hash=h&type=recovery",
            "https://dev.tennisclub-muckensturm.de/passwort-setzen?token_hash=h&type=recovery",
            "https://dev.tennisclub-muckensturm.de/passwort-setzen/?token_hash=h&type=recovery",
            "tcm://passwort-setzen?token_hash=h&type=recovery",
            "tcmdev://passwort-setzen?token_hash=h&type=recovery",
            "tcmlokal://passwort-setzen?token_hash=h&type=recovery",
            "tcm:///passwort-setzen?token_hash=h&type=recovery",
        ] {
            XCTAssertEqual(link(adresse), .token(tokenHash: "h", typ: .recovery), adresse)
        }
    }

    func testFremdeAdressenGehenDiePasswortBehandlungNichtsAn() {
        for adresse in [
            "https://boese.example/passwort-setzen?token_hash=h&type=recovery",
            "https://app.tennisclub-muckensturm.de.boese.example/passwort-setzen?token_hash=h&type=recovery",
            "http://app.tennisclub-muckensturm.de/passwort-setzen?token_hash=h&type=recovery",
            "https://app.tennisclub-muckensturm.de/login?token_hash=h&type=recovery",
            "https://app.tennisclub-muckensturm.de/passwort-setzen/mehr",
            "tcm://buchung?token_hash=h&type=recovery",
            "anders://passwort-setzen?token_hash=h&type=recovery",
        ] {
            XCTAssertNil(link(adresse), adresse)
        }
    }

    /// Wie URLSearchParams: "+" ist ein Leerzeichen, %xx wird dekodiert.
    func testParameterDekodierenWieURLSearchParams() {
        XCTAssertEqual(Passwortlink.parameter("a=x+y&b=%2B%26&c&a=zweiter"), ["a": "x y", "b": "+&", "c": ""])
        XCTAssertEqual(Passwortlink.parameter(nil), [:])
    }

    // MARK: - Nutzer-ID aus dem Token

    func testNutzerIDAusDemToken() {
        // {"sub":"4F1C0B7E-0000-4000-8000-000000000001","email":"a@b.de"} base64url, ohne Polsterung
        let nutzlast = Data(#"{"sub":"4F1C0B7E-0000-4000-8000-000000000001","email":"a@b.de"}"#.utf8)
            .base64EncodedString()
            .replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
        XCTAssertEqual(
            Passwortlink.nutzerID(ausToken: "kopf.\(nutzlast).signatur"),
            "4f1c0b7e-0000-4000-8000-000000000001"
        )
        XCTAssertNil(Passwortlink.nutzerID(ausToken: "kein-token"))
        XCTAssertNil(Passwortlink.nutzerID(ausToken: "a.b.c"))
    }

    // MARK: - mitFrist

    func testMitFristReichtDasErgebnisDurch() async throws {
        let wert = try await mitFrist(.seconds(1)) { 1 }
        XCTAssertEqual(wert, 1)
    }

    func testMitFristBrichtNachDerFristAb() async {
        do {
            _ = try await mitFrist(.milliseconds(50)) {
                try await Task.sleep(for: .seconds(30))
                return 1
            }
            XCTFail("Haette abbrechen muessen")
        } catch {
            XCTAssertTrue(error is Zeitueberschreitung)
        }
    }
}
