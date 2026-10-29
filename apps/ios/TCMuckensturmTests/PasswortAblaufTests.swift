import XCTest
@testable import TCMuckensturm

/// Passwortregeln und der Ablauf beim Oeffnen eines Links (Rueckfrage bei anderem Konto).
final class PasswortAblaufTests: XCTestCase {
    private let ich = AngemeldetesKonto(nutzerID: "4f1c0b7e-0000-4000-8000-000000000001", email: "ich@beispiel.de")

    private func token(sub: String) -> String {
        let nutzlast = Data(#"{"sub":"\#(sub)"}"#.utf8).base64EncodedString()
            .replacingOccurrences(of: "=", with: "")
        return "kopf.\(nutzlast).signatur"
    }

    // MARK: - Regeln (wie Expo-App und Web)

    func testMindestensAchtZeichen() {
        XCTAssertEqual(PasswortRegeln.pruefen(passwort: "1234567", wiederholung: "1234567"), PasswortTexte.zuKurz)
        XCTAssertEqual(PasswortRegeln.pruefen(passwort: "", wiederholung: ""), PasswortTexte.zuKurz)
        XCTAssertNil(PasswortRegeln.pruefen(passwort: "12345678", wiederholung: "12345678"))
    }

    func testBeideEingabenMuessenGleichSein() {
        XCTAssertEqual(PasswortRegeln.pruefen(passwort: "12345678", wiederholung: "12345679"), PasswortTexte.ungleich)
    }

    /// Erst die Laenge, dann der Vergleich - wie in passwort-setzen.tsx.
    func testLaengeVorVergleich() {
        XCTAssertEqual(PasswortRegeln.pruefen(passwort: "kurz", wiederholung: "anders"), PasswortTexte.zuKurz)
    }

    /// Gezaehlt wie String.length in JavaScript (UTF-16).
    func testZaehltWieJavaScript() {
        XCTAssertNil(PasswortRegeln.pruefen(passwort: "🎾🎾🎾🎾", wiederholung: "🎾🎾🎾🎾"))
    }

    func testTexteWieInDerExpoApp() {
        XCTAssertEqual(PasswortTexte.zuKurz, "Das Passwort braucht mindestens acht Zeichen.")
        XCTAssertEqual(PasswortTexte.ungleich, "Die beiden Eingaben stimmen nicht überein.")
        XCTAssertEqual(PasswortTexte.unterwegs, "Wenn es zu dieser Adresse ein Konto gibt, ist die E-Mail unterwegs.")
        XCTAssertEqual(PasswortTexte.abgelaufen, "Dieser Link ist abgelaufen oder wurde schon benutzt.")
    }

    // MARK: - Beim Oeffnen eines Links

    func testOhneAnmeldungWirdEingeloest() {
        XCTAssertEqual(
            PasswortAblauf.beimOeffnen(.token(tokenHash: "h", typ: .recovery), angemeldet: nil),
            .einloesen(abmelden: false)
        )
        XCTAssertEqual(
            PasswortAblauf.beimOeffnen(.fragment(accessToken: token(sub: "x"), refreshToken: "r"), angemeldet: nil),
            .einloesen(abmelden: false)
        )
    }

    /// Ein token_hash verraet das Konto nicht: angemeldet heisst immer Rueckfrage, nie stilles Abmelden.
    func testTokenBeiAnmeldungFragtErst() {
        XCTAssertEqual(
            PasswortAblauf.beimOeffnen(.token(tokenHash: "h", typ: .invite), angemeldet: ich),
            .rueckfrage(email: "ich@beispiel.de")
        )
    }

    func testFragmentFuerEinAnderesKontoFragtErst() {
        XCTAssertEqual(
            PasswortAblauf.beimOeffnen(
                .fragment(accessToken: token(sub: "99999999-0000-4000-8000-000000000009"), refreshToken: "r"),
                angemeldet: ich
            ),
            .rueckfrage(email: "ich@beispiel.de")
        )
        // Unlesbares Token: wie ein anderes Konto.
        XCTAssertEqual(
            PasswortAblauf.beimOeffnen(.fragment(accessToken: "kaputt", refreshToken: "r"), angemeldet: ich),
            .rueckfrage(email: "ich@beispiel.de")
        )
    }

    func testFragmentFuersEigeneKontoOhneRueckfrage() {
        XCTAssertEqual(
            PasswortAblauf.beimOeffnen(
                .fragment(accessToken: token(sub: "4F1C0B7E-0000-4000-8000-000000000001"), refreshToken: "r"),
                angemeldet: ich
            ),
            .einloesen(abmelden: false)
        )
    }

    func testNachBestaetigungWirdAbgemeldet() {
        XCTAssertEqual(PasswortAblauf.nachBestaetigung, .einloesen(abmelden: true))
    }

    func testUngueltigerLinkMeldetAbgelaufen() {
        XCTAssertEqual(PasswortAblauf.beimOeffnen(.ungueltig, angemeldet: nil), .fehler(PasswortTexte.abgelaufen))
        // Auch angemeldet: kein Rueckgriff auf die bestehende Sitzung.
        XCTAssertEqual(PasswortAblauf.beimOeffnen(.ungueltig, angemeldet: ich), .fehler(PasswortTexte.abgelaufen))
    }

    func testOhneTokenNurMitAnmeldung() {
        XCTAssertEqual(PasswortAblauf.beimOeffnen(.ohne, angemeldet: nil), .fehler(PasswortTexte.ohneToken))
        XCTAssertEqual(PasswortAblauf.beimOeffnen(.ohne, angemeldet: ich), .eigenesKonto)
    }

    func testRueckfrageText() {
        XCTAssertEqual(
            PasswortTexte.rueckfrage(email: "ich@beispiel.de"),
            "Du bist als ich@beispiel.de angemeldet. Mit diesem Link meldest du dich ab und setzt das Passwort für ein anderes Konto. Fortfahren?"
        )
    }

    // MARK: - Fehler beim Einloesen

    func testEinloeseFehler() {
        XCTAssertEqual(
            PasswortAblauf.einloeseFehlerText(AuthFehlerForm(code: "otp_expired", status: 403)),
            PasswortTexte.abgelaufen
        )
        XCTAssertEqual(PasswortAblauf.einloeseFehlerText(nil, zeitUeberschritten: true), PasswortTexte.keinNetz)
        XCTAssertEqual(
            PasswortAblauf.einloeseFehlerText(AuthFehlerForm(nachricht: "offline", ohneAntwort: true)),
            PasswortTexte.keinNetz
        )
        XCTAssertEqual(
            PasswortAblauf.einloeseFehlerText(AuthFehlerForm(status: 503)),
            Anmeldefehler.server
        )
    }
}
