import SwiftUI
import UserNotifications
import XCTest
@testable import TCMuckensturm

/// Ein Geraet ohne Systemdialog und ohne APNs.
private final class Testgeraet: @unchecked Sendable {
    private let schloss = NSLock()
    private var _status: UNAuthorizationStatus = .notDetermined
    private var _gefragt = 0
    private var _angefordert = 0
    var status: UNAuthorizationStatus {
        get { schloss.withLock { _status } }
        set { schloss.withLock { _status = newValue } }
    }
    var gefragt: Int { schloss.withLock { _gefragt } }
    var angefordert: Int { schloss.withLock { _angefordert } }
    /// Was der Nutzer im Dialog antwortet.
    var erlaubt = true
    /// Was APNs liefert: die Marke, nil = Fehlschlag.
    var marke: Data? = Data([0xAB, 0x01, 0xFF])
    /// APNs meldet sich gar nicht.
    var schweigt = false
    @MainActor weak var zentrale: PushZentrale?

    var geraet: PushGeraet {
        PushGeraet(
            status: { self.status },
            erlaubnisErbitten: {
                self.schloss.withLock { self._gefragt += 1 }
                if self.erlaubt { self.status = .authorized } else { self.status = .denied }
                return self.erlaubt
            },
            markeAnfordern: {
                self.schloss.withLock { self._angefordert += 1 }
                guard !self.schweigt else { return }
                // Wie der App-Delegate: spaeter, auf dem Hauptthread.
                Task { @MainActor in self.zentrale?.markeAngekommen(self.marke) }
            },
            name: { "Testgerät" }
        )
    }
}

/**
 * Der Push-Weg ohne echtes Geraet: Marke an- und abmelden (App/PushAnmeldung.swift,
 * Daten/Pushdaten.swift) ueber die Naht `PushGeraet`.
 */
@MainActor
final class PushAnmeldungTests: XCTestCase {
    private var a: Attrappe!
    private var geraet: Testgeraet!
    private var speicher: UserDefaults!
    private var zentrale: PushZentrale!
    private var daten: Pushdaten!
    private let suite = "tcm-push-tests"

    override func setUp() async throws {
        a = Attrappe()
        a.setze("push_token_aktiv", json: "true")
        geraet = Testgeraet()
        UserDefaults().removePersistentDomain(forName: suite)
        speicher = UserDefaults(suiteName: suite)
        zentrale = PushZentrale(geraet: geraet.geraet, speicher: speicher, frist: .milliseconds(150))
        geraet.zentrale = zentrale
        daten = Pushdaten(client: a.client())
    }

    override func tearDown() async throws {
        UserDefaults().removePersistentDomain(forName: suite)
    }

    private var gespeichert: String? { speicher.string(forKey: PushZentrale.markeSchluessel) }

    func testMarkeAlsHex() {
        XCTAssertEqual(Pushmarke.hex(Data([0x00, 0x0F, 0xAB, 0xFF])), "000fabff")
        XCTAssertEqual(Pushmarke.hex(Data()), "")
    }

    func testErlaubt() {
        XCTAssertTrue(PushZentrale.erlaubt(.authorized))
        XCTAssertTrue(PushZentrale.erlaubt(.provisional))
        XCTAssertTrue(PushZentrale.erlaubt(.ephemeral))
        XCTAssertFalse(PushZentrale.erlaubt(.denied))
        XCTAssertFalse(PushZentrale.erlaubt(.notDetermined))
    }

    // MARK: - Anmelden

    func testAnmelden() async {
        let r = await zentrale.anmelden(daten)
        XCTAssertEqual(r, .erfolg("Benachrichtigungen sind eingeschaltet."))
        XCTAssertEqual(geraet.gefragt, 1)
        XCTAssertEqual(
            a.letzte("register_push_token") as? [String: String],
            ["p_token": "ab01ff", "p_platform": "ios", "p_device_name": "Testgerät", "p_provider": "apns"]
        )
        XCTAssertEqual(gespeichert, "ab01ff")
        let an = await zentrale.istAngemeldet(daten)
        XCTAssertTrue(an)
        XCTAssertEqual(a.letzte("push_token_aktiv") as? [String: String], ["p_token": "ab01ff"])
    }

    /// Schon erlaubt: kein zweiter Dialog.
    func testAnmeldenOhneDialog() async {
        geraet.status = .provisional
        let r = await zentrale.anmelden(daten)
        XCTAssertTrue(r.ok)
        XCTAssertEqual(geraet.gefragt, 0)
    }

    func testAnmeldenOhneErlaubnis() async {
        // Im Dialog abgelehnt.
        geraet.erlaubt = false
        var r = await zentrale.anmelden(daten)
        XCTAssertEqual(r, .fehler("Ohne Erlaubnis des Geräts geht es nicht."))
        XCTAssertEqual(geraet.gefragt, 1)
        // Frueher abgelehnt: iOS fragt kein zweites Mal.
        r = await zentrale.anmelden(daten)
        XCTAssertFalse(r.ok)
        XCTAssertEqual(geraet.gefragt, 1)
        XCTAssertEqual(geraet.angefordert, 0)
        XCTAssertTrue(a.anfragen.isEmpty)
        XCTAssertNil(gespeichert)
    }

    func testAnmeldenOhneMarke() async {
        // APNs meldet einen Fehlschlag (Simulator ohne Push, kein Netz).
        geraet.marke = nil
        var r = await zentrale.anmelden(daten)
        XCTAssertEqual(r, .fehler("Das Gerät hat keine Kennung geliefert."))
        // APNs meldet sich gar nicht: nach der Frist dasselbe, kein Haenger.
        geraet.schweigt = true
        r = await zentrale.anmelden(daten)
        XCTAssertEqual(r, .fehler("Das Gerät hat keine Kennung geliefert."))
        XCTAssertTrue(a.anfragen.isEmpty)
        XCTAssertNil(gespeichert)
    }

    /// Lehnt die Datenbank ab, gilt das Geraet nicht als angemeldet.
    func testAnmeldenScheitertInDerDatenbank() async {
        a.setze("register_push_token", .fehler("P0001", "Diese Kennung ist ungültig."))
        var r = await zentrale.anmelden(daten)
        XCTAssertEqual(r, .fehler("Diese Kennung ist ungültig."))
        XCTAssertNil(gespeichert)
        a.setze("register_push_token", .netzfehler(.notConnectedToInternet))
        r = await zentrale.anmelden(daten)
        XCTAssertEqual(r, .fehler(DbFehler.verbindungsfehlerText))
        XCTAssertNil(gespeichert)
        let an = await zentrale.istAngemeldet(daten)
        XCTAssertFalse(an)
    }

    // MARK: - Abmelden

    func testAbmelden() async {
        // Nichts angemeldet: nichts zu tun.
        var r = await zentrale.abmelden(daten)
        XCTAssertEqual(r, .erfolg(""))
        XCTAssertTrue(a.anfragen.isEmpty)

        _ = await zentrale.anmelden(daten)
        r = await zentrale.abmelden(daten)
        XCTAssertEqual(r, .erfolg("Benachrichtigungen sind ausgeschaltet."))
        XCTAssertEqual(a.letzte("remove_push_token") as? [String: String], ["p_token": "ab01ff"])
        XCTAssertNil(gespeichert)
        let an = await zentrale.istAngemeldet(daten)
        XCTAssertFalse(an)
    }

    /// Scheitert das Entfernen, vergisst das Geraet die Marke trotzdem - der Fehler steht im Ergebnis.
    func testAbmeldenMitFehler() async {
        speicher.set("alt", forKey: PushZentrale.markeSchluessel)
        a.setze("remove_push_token", .netzfehler(.timedOut))
        let r = await zentrale.abmelden(daten)
        XCTAssertEqual(r, .fehler(DbFehler.verbindungsfehlerText))
        XCTAssertNil(gespeichert)
    }

    // MARK: - Zustand

    func testIstAngemeldet() async {
        var an = await zentrale.istAngemeldet(daten)
        XCTAssertFalse(an, "Ohne gespeicherte Marke")
        XCTAssertTrue(a.anfragen.isEmpty)

        speicher.set("ab01ff", forKey: PushZentrale.markeSchluessel)
        geraet.status = .denied
        an = await zentrale.istAngemeldet(daten)
        XCTAssertFalse(an, "In den Einstellungen abgeschaltet")
        XCTAssertTrue(a.anfragen.isEmpty)

        geraet.status = .authorized
        an = await zentrale.istAngemeldet(daten)
        XCTAssertTrue(an)
        // Stillgelegt oder fremd.
        a.setze("push_token_aktiv", json: "false")
        an = await zentrale.istAngemeldet(daten)
        XCTAssertFalse(an)
        a.setze("push_token_aktiv", json: "null")
        an = await zentrale.istAngemeldet(daten)
        XCTAssertFalse(an)
        a.setze("push_token_aktiv", .netzfehler(.notConnectedToInternet))
        an = await zentrale.istAngemeldet(daten)
        XCTAssertFalse(an)
    }

    // MARK: - Auffrischen

    func testAuffrischenOhneAnmeldung() async {
        geraet.status = .authorized
        await zentrale.auffrischen(daten)
        XCTAssertEqual(geraet.angefordert, 0, "War Push nie an, wird APNs nicht gefragt")
        XCTAssertTrue(a.anfragen.isEmpty)
    }

    func testAuffrischenGleicheMarke() async {
        geraet.status = .authorized
        speicher.set("ab01ff", forKey: PushZentrale.markeSchluessel)
        await zentrale.auffrischen(daten)
        XCTAssertEqual(geraet.angefordert, 1)
        XCTAssertTrue(a.anfragen.isEmpty)
        // Erlaubnis entzogen: gar nicht erst fragen.
        geraet.status = .denied
        await zentrale.auffrischen(daten)
        XCTAssertEqual(geraet.angefordert, 1)
    }

    /// APNs hat eine neue Marke vergeben: neue anmelden, alte entfernen.
    func testAuffrischenNeueMarke() async {
        geraet.status = .authorized
        speicher.set("alt", forKey: PushZentrale.markeSchluessel)
        await zentrale.auffrischen(daten)
        XCTAssertEqual(a.letzte("register_push_token")?["p_token"] as? String, "ab01ff")
        XCTAssertEqual(a.letzte("remove_push_token") as? [String: String], ["p_token": "alt"])
        XCTAssertEqual(a.rpcs, ["register_push_token", "remove_push_token"])
        XCTAssertEqual(gespeichert, "ab01ff")
    }

    func testAuffrischenScheitert() async {
        geraet.status = .authorized
        speicher.set("alt", forKey: PushZentrale.markeSchluessel)
        a.setze("register_push_token", .netzfehler(.timedOut))
        await zentrale.auffrischen(daten)
        XCTAssertEqual(gespeichert, "alt", "Die alte Marke bleibt, bis die neue angemeldet ist")
        XCTAssertTrue(a.aufrufe("remove_push_token").isEmpty)
    }

    // MARK: - Tippen auf eine Nachricht

    func testGeoeffnet() {
        XCTAssertNil(zentrale.offenesZiel)
        zentrale.geoeffnet([:])
        XCTAssertNil(zentrale.offenesZiel, "Ohne Ziel oeffnet sich nur die App")
        zentrale.geoeffnet(["ziel": "https://boese.example"])
        XCTAssertNil(zentrale.offenesZiel)
        zentrale.geoeffnet(["kind": "booking_joined", "ziel": "/plaetze/spiele"])
        XCTAssertEqual(zentrale.offenesZiel, .plaetze(.spiele(offeneZuerst: false)))
        zentrale.geoeffnet(["kind": "event_published", "event_id": "e0000000-0000-4000-8000-000000000001"])
        XCTAssertEqual(zentrale.offenesZiel, .veranstaltung(id: "e0000000-0000-4000-8000-000000000001"))
        zentrale.geoeffnet(["kind": "irgendwas"])
        XCTAssertEqual(zentrale.offenesZiel, .nachrichten)
        // Eine Nachricht ohne Ziel verdraengt das wartende nicht.
        zentrale.geoeffnet([:])
        XCTAssertEqual(zentrale.offenesZiel, .nachrichten)
    }

    /// Die Nutzdaten, wie APNs sie liefert: Texte neben `aps`.
    func testNutzdaten() {
        let userInfo: [AnyHashable: Any] = [
            "aps": ["alert": ["title": "Jemand spielt mit"]], "kind": "booking_joined", "ziel": "/plaetze/spiele", "zahl": 3,
        ]
        let texte = PushZiel.texte(userInfo)
        XCTAssertEqual(texte, ["kind": "booking_joined", "ziel": "/plaetze/spiele"])
        zentrale.geoeffnet(texte)
        XCTAssertEqual(zentrale.offenesZiel, .plaetze(.spiele(offeneZuerst: false)))
    }

    /// Der App-Delegate haengt sich an die Mitteilungszentrale und reicht die Marke weiter.
    func testAppDelegate() {
        let zentrale = UNUserNotificationCenter.current()
        let vorher = zentrale.delegate
        defer { zentrale.delegate = vorher }
        let delegate = PushAppDelegate()
        XCTAssertTrue(delegate.application(UIApplication.shared, didFinishLaunchingWithOptions: nil))
        XCTAssertTrue(zentrale.delegate === delegate)
        // Niemand wartet: beide Wege duerfen dann nichts tun.
        delegate.application(UIApplication.shared, didRegisterForRemoteNotificationsWithDeviceToken: Data([1, 2]))
        delegate.application(UIApplication.shared, didFailToRegisterForRemoteNotificationsWithError: URLError(.unknown))
    }
}

/// Navigation aus einer Mitteilung: das wartende Ziel oeffnet sich, sobald die Tabs stehen (App/PushNavigation.swift).
final class PushNavigationTests: BildschirmTestfall {
    override func setUp() async throws {
        try await super.setUp()
        await MainActor.run { PushZentrale.shared.offenesZiel = nil }
    }

    override func tearDown() async throws {
        await MainActor.run { PushZentrale.shared.offenesZiel = nil }
        try await super.tearDown()
    }

    private func oeffne(_ daten: [String: String], kaltstart: Bool = false, erwartet: [String], datei: StaticString = #filePath, zeile: UInt = #line) async {
        let a = Attrappe()
        // Kaltstart: das Tippen kam, bevor die Tabs stehen.
        if kaltstart { PushZentrale.shared.geoeffnet(daten) }
        buehne.zeige(HauptTabs().environment(a.sitzung()))
        _ = await buehne.warteAuf(["Hallo, Noah"])
        if !kaltstart { PushZentrale.shared.geoeffnet(daten) }
        let fehlt = await buehne.warteAuf(erwartet)
        XCTAssertEqual(fehlt, [], "in \(buehne.texte())", file: datei, line: zeile)
        XCTAssertNil(PushZentrale.shared.offenesZiel, "Jedes Ziel wird nur einmal geoeffnet", file: datei, line: zeile)
        haengeAn(buehne.bild(), name: "push-\(daten["ziel"] ?? daten["kind"] ?? "")".replacingOccurrences(of: "/", with: "-"))
    }

    func testNachrichten() async {
        await oeffne(["kind": "booking_cancelled"], erwartet: ["Neuigkeiten", "Jemand spielt mit", "Schließen"])
    }

    func testNachrichtenBeimKaltstart() async {
        await oeffne(["ziel": "/nachrichten"], kaltstart: true, erwartet: ["Neuigkeiten", "Jemand spielt mit"])
    }

    func testVeranstaltung() async {
        await oeffne(["kind": "event_published", "event_id": "e0000000-0000-4000-8000-000000000001"], erwartet: ["Sommerfest", "Clubhaus"])
    }

    func testSpiele() async {
        await oeffne(["ziel": "/plaetze/spiele?zeige=offen"], erwartet: ["Meine & offene Spiele", "Mitspielen"])
    }

    func testBelegung() async {
        await oeffne(["ziel": "/plaetze"], kaltstart: true, erwartet: ["Belegung nach Plätzen und Uhrzeit"])
    }

    func testMannschaft() async {
        await oeffne(["kind": "team_invited", "ziel": "/nachrichten"], erwartet: ["Kader Herren 30"])
    }

    func testKonto() async {
        await oeffne(["ziel": "/konto"], erwartet: ["Abrechnung"])
    }
}
