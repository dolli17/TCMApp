import Foundation
import Supabase
import XCTest
@testable import TCMuckensturm

/// Dieselben Faelle wie packages/core/src/anmeldefehler.test.ts.
final class AnmeldefehlerTests: XCTestCase {
    private func text(_ form: AuthFehlerForm?) -> String { Anmeldefehler.anmeldeFehlerText(form) }

    func testFalscheDatenBleibenEinSatz() {
        XCTAssertEqual(text(AuthFehlerForm(code: "invalid_credentials", status: 400)), Anmeldefehler.anmeldedatenFalsch)
        XCTAssertEqual(text(nil), Anmeldefehler.anmeldedatenFalsch)
        XCTAssertEqual(text(AuthFehlerForm(code: "user_not_found", status: 400)), Anmeldefehler.anmeldedatenFalsch)
    }

    func testFehlendeVerbindung() {
        XCTAssertEqual(text(AuthFehlerForm(status: 0, ohneAntwort: true)), Anmeldefehler.verbindung)
        // Auch nur am Text erkannt
        XCTAssertEqual(text(AuthFehlerForm(nachricht: "TypeError: fetch failed")), Anmeldefehler.verbindung)
    }

    func testServerfehlerIstKeinFalschesPasswort() {
        XCTAssertEqual(text(AuthFehlerForm(status: 503, ohneAntwort: true)), Anmeldefehler.server)
        XCTAssertEqual(text(AuthFehlerForm(status: 500, nachricht: "boom")), Anmeldefehler.server)
    }

    func testZuVieleVersuche() {
        XCTAssertEqual(text(AuthFehlerForm(code: "over_request_rate_limit", status: 429)), Anmeldefehler.zuVieleVersuche)
        XCTAssertEqual(text(AuthFehlerForm(status: 429)), Anmeldefehler.zuVieleVersuche)
        XCTAssertEqual(text(AuthFehlerForm(code: "over_email_send_rate_limit", status: 400)), Anmeldefehler.zuVieleVersuche)
    }

    func testGesperrtUndNichtBestaetigt() {
        XCTAssertEqual(text(AuthFehlerForm(code: "user_banned", status: 400)), Anmeldefehler.gesperrt)
        XCTAssertEqual(text(AuthFehlerForm(code: "email_not_confirmed", status: 400)), Anmeldefehler.nichtBestaetigt)
    }

    func testTexteWieInCore() {
        XCTAssertEqual(Anmeldefehler.anmeldedatenFalsch, "E-Mail-Adresse oder Passwort stimmt nicht.")
        XCTAssertEqual(
            Anmeldefehler.verbindung,
            "Keine Verbindung zum Server. Bitte prüfe die Internetverbindung und versuche es erneut."
        )
    }

    // MARK: Swift-Fehler -> Form

    func testURLErrorOhneNetz() {
        let form = AuthFehlerForm.aus(URLError(.notConnectedToInternet))
        XCTAssertTrue(form.ohneAntwort)
        XCTAssertEqual(text(form), Anmeldefehler.verbindung)
    }

    func testURLErrorZeitueberschreitung() {
        XCTAssertEqual(text(.aus(URLError(.timedOut))), Anmeldefehler.verbindung)
    }

    func testAuthApiFehlerTraegtCodeUndStatus() throws {
        let antwort = try XCTUnwrap(HTTPURLResponse(
            url: URL(string: "https://beispiel.supabase.co/auth/v1/token")!,
            statusCode: 429, httpVersion: nil, headerFields: nil
        ))
        let fehler = AuthError.api(
            message: "Request rate limit reached",
            errorCode: .overRequestRateLimit,
            underlyingData: Data(),
            underlyingResponse: antwort
        )
        let form = AuthFehlerForm.aus(fehler)
        XCTAssertEqual(form.code, "over_request_rate_limit")
        XCTAssertEqual(form.status, 429)
        XCTAssertEqual(text(form), Anmeldefehler.zuVieleVersuche)
    }

    func testAuthApiFalschesPasswort() throws {
        let antwort = try XCTUnwrap(HTTPURLResponse(
            url: URL(string: "https://beispiel.supabase.co/auth/v1/token")!,
            statusCode: 400, httpVersion: nil, headerFields: nil
        ))
        let fehler = AuthError.api(
            message: "Invalid login credentials",
            errorCode: .invalidCredentials,
            underlyingData: Data(),
            underlyingResponse: antwort
        )
        XCTAssertEqual(text(.aus(fehler)), Anmeldefehler.anmeldedatenFalsch)
    }

    func testUnbekannterFehlerIstFalscheDaten() {
        struct Irgendwas: Error {}
        XCTAssertEqual(text(.aus(Irgendwas())), Anmeldefehler.anmeldedatenFalsch)
    }
}
