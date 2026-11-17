import Supabase
import XCTest
@testable import TCMuckensturm

/**
 * Die Weiche (App/Sitzung.swift) gegen die Attrappe: wohin der Start fuehrt,
 * was eine abgelaufene Sitzung tut, An- und Abmelden und der Passwortlink.
 */
@MainActor
final class SitzungTests: XCTestCase {
    private var a: Attrappe!

    override func setUp() async throws {
        a = Attrappe()
        UserDefaults.standard.removeObject(forKey: PushZentrale.markeSchluessel)
    }

    override func tearDown() async throws {
        UserDefaults.standard.removeObject(forKey: PushZentrale.markeSchluessel)
    }

    private func gestartet(_ anmeldung: Attrappe.Anmeldung = .gueltig) async -> Sitzung {
        let s = a.sitzung(anmeldung)
        XCTAssertEqual(s.ziel, .laden)
        s.starten()
        await warte { s.ziel != .laden }
        return s
    }

    private func zugang(_ zugang: Bool, grund: String? = nil, onboarding: Bool = false) {
        let g = grund.map { "\"\($0)\"" } ?? "null"
        a.setze("mein_zugang", json: #"[{"zugang":\#(zugang),"grund":\#(g),"onboarding_offen":\#(onboarding)}]"#)
    }

    // MARK: - Start

    func testOhneSitzungZurAnmeldung() async {
        let s = await gestartet(.keine)
        XCTAssertEqual(s.ziel, .anmelden)
        XCTAssertTrue(a.anfragen.isEmpty, "Ohne Sitzung geht nichts ins Netz")
    }

    func testMitZugangInDieTabs() async {
        let s = await gestartet()
        XCTAssertEqual(s.ziel, .tabs)
        XCTAssertEqual(a.aufrufe("mein_zugang").count, 1)
        XCTAssertEqual(a.aufrufe("mein_zugang").first?.kopf["Authorization"], "Bearer \(Beispiel.sitzung().accessToken)")
    }

    func testOffenesOnboarding() async {
        zugang(true, onboarding: true)
        let s = await gestartet()
        XCTAssertEqual(s.ziel, .onboarding)
        s.onboardingVerlassen()
        XCTAssertEqual(s.ziel, .tabs)
        // Aus den Tabs heraus tut der Aufruf nichts.
        s.onboardingVerlassen()
        XCTAssertEqual(s.ziel, .tabs)
    }

    /// Kein Zugang: der Hinweis bleibt stehen, die Sitzung ist trotzdem weg.
    func testKeinZugangMeldetAb() async {
        zugang(false, grund: "ausgetreten")
        let s = await gestartet()
        XCTAssertEqual(s.ziel, .keinZugang(ZugangsGrund(wert: "ausgetreten")))
        await warte { self.a.speicher.istLeer }
        XCTAssertTrue(a.speicher.istLeer, "Der naechste Start beginnt bei der Anmeldung")
        await warte(hoechstens: 0.3) { false }
        XCTAssertEqual(s.ziel, .keinZugang(ZugangsGrund(wert: "ausgetreten")), "Das Abmelden verdraengt den Hinweis nicht")
        s.zurAnmeldung()
        XCTAssertEqual(s.ziel, .anmelden)
    }

    /// Faellt mein_zugang aus (Netz, Serverfehler), sperrt die App niemanden aus.
    func testZugangNichtLesbar() async {
        a.setze("mein_zugang", .netzfehler(.notConnectedToInternet))
        var s = await gestartet()
        XCTAssertEqual(s.ziel, .tabs)
        a = Attrappe()
        a.setze("mein_zugang", .fehler("P0001", "Kaputt.", status: 500))
        s = await gestartet()
        XCTAssertEqual(s.ziel, .tabs)
        // Keine Zeile: wie Zugang ohne Onboarding.
        a = Attrappe()
        a.setze("mein_zugang", json: "[]")
        s = await gestartet()
        XCTAssertEqual(s.ziel, .tabs)
    }

    // MARK: - Abgelaufene Sitzung

    func testAbgelaufeneSitzungWirdErneuert() async throws {
        let s = await gestartet(.abgelaufen)
        XCTAssertEqual(s.ziel, .tabs)
        let erneuern = try XCTUnwrap(a.anfragen.first { $0.pfad == "/auth/v1/token" })
        XCTAssertEqual(erneuern.abfrage, "grant_type=refresh_token")
        let erste = try XCTUnwrap(a.anfragen.firstIndex { $0.pfad == "/auth/v1/token" })
        let frage = try XCTUnwrap(a.anfragen.firstIndex { $0.rpc == "mein_zugang" })
        XCTAssertLessThan(erste, frage, "Erst erneuern, dann fragen")
    }

    /// Das Refresh-Token gilt nicht mehr (widerrufen, schon benutzt): zurueck zur Anmeldung, Sitzung geloescht.
    func testAbgelaufeneSitzungOhneErneuerung() async {
        // Nachgebaut nach GoTrue; supabase-swift loescht die Sitzung nur bei diesen Codes.
        a.setze("/auth/v1/token", .authFehler("refresh_token_not_found", "Invalid Refresh Token: Refresh Token Not Found", status: 400))
        let s = await gestartet(.abgelaufen)
        let da = await warte { s.ziel == .anmelden }
        XCTAssertTrue(da, "Ziel: \(s.ziel)")
        XCTAssertTrue(a.speicher.istLeer)
        XCTAssertTrue(a.aufrufe("mein_zugang").isEmpty, "Ohne gueltige Sitzung wird nicht gefragt")
    }

    /**
     * Lehnt der Server das Erneuern aus einem anderen Grund ab (Stoerung, 500,
     * oder "validation_failed" bei einem verstuemmelten Token),
     * behaelt supabase-swift die Sitzung. Die Weiche oeffnet dann wie ohne Netz
     * die Tabs; dort scheitern die Abfragen mit ihrem Satz.
     */
    func testErneuerungGestoert() async {
        for antwort in [
            Attrappe.Antwort.authFehler("validation_failed", "Refresh token is not valid", status: 400),
            .authFehler("unexpected_failure", "Database error", status: 500),
        ] {
            a = Attrappe()
            a.setze("/auth/v1/token", antwort)
            let s = await gestartet(.abgelaufen)
            await warte(hoechstens: 0.3) { false }
            XCTAssertEqual(s.ziel, .tabs)
            XCTAssertFalse(a.speicher.istLeer)
            XCTAssertTrue(a.aufrufe("mein_zugang").isEmpty)
        }
    }

    /// Abgelaufen und kein Netz: die Sitzung bleibt, die App oeffnet die Tabs (dort steht dann der Verbindungsfehler).
    func testAbgelaufeneSitzungOhneNetz() async {
        a.netzAus()
        let s = await gestartet(.abgelaufen)
        await warte(hoechstens: 0.5) { false }
        XCTAssertEqual(s.ziel, .tabs)
        XCTAssertFalse(a.speicher.istLeer, "Ohne Netz wird niemand abgemeldet")
    }

    // MARK: - An- und Abmelden

    func testAnmelden() async throws {
        let s = await gestartet(.keine)
        let fehler = await s.anmelden(email: "  noah@example.org ", passwort: "geheim123")
        XCTAssertNil(fehler)
        let da = await warte { s.ziel == .tabs }
        XCTAssertTrue(da, "Ziel: \(s.ziel)")
        let anfrage = try XCTUnwrap(a.anfragen.first { $0.pfad == "/auth/v1/token" })
        XCTAssertEqual(anfrage.abfrage, "grant_type=password")
        XCTAssertEqual(anfrage.text("email"), "noah@example.org")
        XCTAssertEqual(anfrage.text("password"), "geheim123")
        XCTAssertEqual(anfrage.kopf["X-Supabase-Api-Version"], "2024-01-01", "Danach richtet sich die Form der Auth-Fehler")
        XCTAssertFalse(a.speicher.istLeer)
    }

    func testAnmeldenScheitert() async {
        let s = await gestartet(.keine)
        // Aufgezeichnet: falsches Passwort.
        a.setze("/auth/v1/token", .authFehler("invalid_credentials", "Invalid login credentials", status: 400))
        var fehler = await s.anmelden(email: "noah@example.org", passwort: "falsch")
        XCTAssertEqual(fehler, Anmeldefehler.anmeldedatenFalsch)
        a.setze("/auth/v1/token", .netzfehler(.notConnectedToInternet))
        fehler = await s.anmelden(email: "noah@example.org", passwort: "geheim123")
        XCTAssertEqual(fehler, Anmeldefehler.stoerungText(AuthFehlerForm.aus(URLError(.notConnectedToInternet))))
        XCTAssertNotEqual(fehler, Anmeldefehler.anmeldedatenFalsch)
        a.setze("/auth/v1/token", .authFehler("over_request_rate_limit", "Too many requests", status: 429))
        fehler = await s.anmelden(email: "noah@example.org", passwort: "geheim123")
        XCTAssertEqual(fehler, Anmeldefehler.zuVieleVersuche)
        XCTAssertEqual(s.ziel, .anmelden)
        XCTAssertTrue(a.speicher.istLeer)
    }

    /// Abmelden entfernt erst die Push-Marke (solange die Sitzung gilt), dann die Sitzung.
    func testAbmelden() async throws {
        UserDefaults.standard.set("ab01", forKey: PushZentrale.markeSchluessel)
        let s = await gestartet()
        await s.abmelden()
        let da = await warte { s.ziel == .anmelden }
        XCTAssertTrue(da, "Ziel: \(s.ziel)")
        XCTAssertTrue(a.speicher.istLeer)
        XCTAssertEqual(a.letzte("remove_push_token") as? [String: String], ["p_token": "ab01"])
        XCTAssertEqual(a.aufrufe("remove_push_token").first?.kopf["Authorization"], "Bearer \(Beispiel.sitzung().accessToken)")
        XCTAssertNil(UserDefaults.standard.string(forKey: PushZentrale.markeSchluessel))
        let marke = try XCTUnwrap(a.anfragen.firstIndex { $0.rpc == "remove_push_token" })
        let logout = try XCTUnwrap(a.anfragen.firstIndex { $0.pfad == "/auth/v1/logout" })
        XCTAssertLessThan(marke, logout)
    }

    /// Ohne Netz ist man trotzdem abgemeldet.
    func testAbmeldenOhneNetz() async {
        let s = await gestartet()
        a.netzAus()
        await s.abmelden()
        let da = await warte { s.ziel == .anmelden }
        XCTAssertTrue(da, "Ziel: \(s.ziel)")
        XCTAssertTrue(a.speicher.istLeer)
    }

    // MARK: - Passwort

    func testPasswortLinkAnfordern() async throws {
        let s = a.sitzung(.keine)
        var fehler = await s.passwortLinkAnfordern(email: " noah@example.org ")
        XCTAssertNil(fehler)
        let anfrage = try XCTUnwrap(a.anfragen.first { $0.pfad == "/auth/v1/recover" })
        XCTAssertEqual(anfrage.text("email"), "noah@example.org")
        XCTAssertTrue(anfrage.abfrage.contains("redirect_to="), anfrage.abfrage)
        XCTAssertTrue(anfrage.abfrage.contains("passwort-setzen"), anfrage.abfrage)
        // Kein Netz: sonst wartet jemand auf eine Mail, die nie verschickt wurde.
        a.setze("/auth/v1/recover", .netzfehler(.notConnectedToInternet))
        fehler = await s.passwortLinkAnfordern(email: "noah@example.org")
        XCTAssertNotNil(fehler)
        // "Zu viele Versuche" verraet, dass es die Adresse gibt - also keine Meldung.
        a.setze("/auth/v1/recover", .authFehler("over_email_send_rate_limit", "Email rate limit exceeded", status: 429))
        fehler = await s.passwortLinkAnfordern(email: "noah@example.org")
        XCTAssertNil(fehler)
    }

    private let link = URL(string: "tcmlokal://passwort-setzen?token_hash=abc123&type=recovery")!

    func testFremderLink() {
        let s = a.sitzung(.keine)
        XCTAssertFalse(s.linkOeffnen(URL(string: "https://example.org/irgendwas")!))
        XCTAssertNil(s.passwort)
    }

    func testPasswortLinkEinloesen() async throws {
        let s = await gestartet(.keine)
        XCTAssertTrue(s.linkOeffnen(link))
        XCTAssertEqual(s.passwort, .laden)
        await warte { s.passwort != .laden }
        XCTAssertEqual(s.passwort, .bereit(konto: Beispiel.sitzung().user.email))
        let anfrage = try XCTUnwrap(a.anfragen.first { $0.pfad == "/auth/v1/verify" })
        XCTAssertEqual(anfrage.text("token_hash"), "abc123")
        XCTAssertEqual(anfrage.text("type"), "recovery")

        var fehler = await s.passwortSpeichern("neuesPasswort1")
        XCTAssertNil(fehler)
        let speichern = try XCTUnwrap(a.anfragen.last { $0.pfad == "/auth/v1/user" })
        XCTAssertEqual(speichern.methode, "PUT")
        XCTAssertEqual(speichern.text("password"), "neuesPasswort1")
        a.setze("/auth/v1/user", .authFehler("same_password", "New password should be different from the old password.", status: 422))
        fehler = await s.passwortSpeichern("neuesPasswort1")
        XCTAssertNotNil(fehler)
        XCTAssertFalse(fehler?.contains("should be") ?? true, "Kein englischer Rohtext: \(fehler ?? "")")

        s.passwortSchliessen()
        XCTAssertNil(s.passwort)
    }

    func testEinladungslink() async throws {
        let s = await gestartet(.keine)
        XCTAssertTrue(s.linkOeffnen(URL(string: "tcmlokal://passwort-setzen?token_hash=xyz&type=invite")!))
        await warte { s.passwort != .laden }
        let anfrage = try XCTUnwrap(a.anfragen.first { $0.pfad == "/auth/v1/verify" })
        XCTAssertEqual(anfrage.text("type"), "invite")
    }

    /// Aufgezeichnet: ein verbrauchter oder abgelaufener Link.
    func testVerbrauchterLink() async {
        a.setze("/auth/v1/verify", .authFehler("otp_expired", "Email link is invalid or has expired", status: 403))
        let s = await gestartet(.keine)
        s.linkOeffnen(link)
        await warte { s.passwort != .laden }
        guard case let .fehler(text) = s.passwort else { return XCTFail("Zustand: \(String(describing: s.passwort))") }
        XCTAssertFalse(text.isEmpty)
        XCTAssertFalse(text.contains("invalid"), "Kein englischer Rohtext: \(text)")
    }

    func testLinkOhneToken() {
        let s = a.sitzung(.keine)
        XCTAssertTrue(s.linkOeffnen(URL(string: "tcmlokal://passwort-setzen")!))
        guard case .fehler = s.passwort else { return XCTFail("Zustand: \(String(describing: s.passwort))") }
        XCTAssertTrue(a.anfragen.isEmpty)
    }

    /// Angemeldet und ein Link kommt: erst fragen, dann abmelden und einloesen - nie zwei Konten zugleich.
    func testLinkWaehrendAngemeldet() async throws {
        let s = await gestartet()
        XCTAssertTrue(s.linkOeffnen(link))
        XCTAssertEqual(s.passwort, .rueckfrage(email: Beispiel.sitzung().user.email))
        XCTAssertTrue(a.anfragen.filter { $0.pfad == "/auth/v1/verify" }.isEmpty)
        // Abbrechen: alles bleibt.
        s.passwortSchliessen()
        XCTAssertNil(s.passwort)
        XCTAssertFalse(a.speicher.istLeer)

        s.linkOeffnen(link)
        s.linkBestaetigen()
        XCTAssertEqual(s.passwort, .laden)
        await warte { s.passwort != .laden }
        XCTAssertEqual(s.passwort, .bereit(konto: Beispiel.sitzung().user.email))
        let logout = try XCTUnwrap(a.anfragen.firstIndex { $0.pfad == "/auth/v1/logout" })
        let verify = try XCTUnwrap(a.anfragen.firstIndex { $0.pfad == "/auth/v1/verify" })
        XCTAssertLessThan(logout, verify)
    }
}
