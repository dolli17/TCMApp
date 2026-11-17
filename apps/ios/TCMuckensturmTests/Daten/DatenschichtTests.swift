import Supabase
import XCTest
@testable import TCMuckensturm

/**
 * Daten/ gegen aufgezeichnete Serverantworten (Antworten/, vom lokalen Stack):
 * jede Abfrage ruft die richtige RPC mit den richtigen Parametern und liest die
 * Antwort; Fehler der Datenbank, fehlendes Netz und eine abgelaufene Sitzung
 * werden zum Satz fuer die Anzeige. Ohne Netz (Hilfen/Attrappe.swift).
 */
final class DatenschichtTests: XCTestCase {
    private var a: Attrappe!
    private var client: SupabaseClient!

    override func setUp() {
        a = Attrappe()
        client = a.client()
    }

    private func meldung(_ aufruf: () async throws -> some Any) async -> String? {
        do {
            _ = try await aufruf()
            return nil
        } catch {
            XCTAssertTrue(error is Meldung, "Lesende Aufrufe werfen Meldung, nicht \(type(of: error))")
            return (error as? Meldung)?.text
        }
    }

    // MARK: - Jede Aufzeichnung laesst sich lesen

    func testAufzeichnungenDekodieren() throws {
        func lies<T: Decodable>(_ name: String, _: T.Type) throws {
            XCTAssertNoThrow(try JSONDecoder().decode(T.self, from: Beispiel.daten(name)), name)
        }
        try lies("ich", [Ich].self)
        try lies("ich-admin", [Ich].self)
        try lies("mein_zugang", [Zugang].self)
        try lies("mein_profil", [MeinProfil].self)
        try lies("my_charges", [Forderung].self)
        try lies("mein_mandat", [MeinMandat].self)
        try lies("member_attributes", [MerkmalZeile].self)
        try lies("my_bookings", [MeineBuchung].self)
        try lies("open_matches", [OffenesSpiel].self)
        try lies("day_schedule", [TagesBelegung].self)
        try lies("booking_settings", [Buchungseinstellungen].self)
        try lies("booking_types_aktiv", [Buchungsart].self)
        try lies("booking_types_aktiv-blocking", [Buchungsart].self)
        try lies("courts_aktiv", [AktiverPlatz].self)
        try lies("my_booking_quota", [Kontingent].self)
        try lies("member_directory", [Mitglied].self)
        try lies("my_drink_purchases", [EigenesGetraenk].self)
        try lies("drink_menu", [Getraenk].self)
        try lies("my_work_duty", [Arbeitsdienst].self)
        try lies("events_fuer_mitglied", [MitgliedEvent].self)
        try lies("my_notifications", [Benachrichtigung].self)
        try lies("my_onboarding", OnboardingZustand.self)
        try lies("my_onboarding-erwachsen", OnboardingZustand.self)
        try lies("my_onboarding-fertig", OnboardingZustand.self)
        try lies("meine_mannschaft", MeineMannschaft.self)
        try lies("meine_mannschaft_einladungen", [MannschaftEinladung].self)
        try lies("mannschaft_kandidaten", [MannschaftKandidat].self)
        try lies("court_overview", [VerwalteterPlatz].self)
        try lies("series_overview", [Serie].self)
        try lies("preview_series", [SerienTermin].self)
    }

    // MARK: - Startdaten

    func testStartdatenLesen() async throws {
        let d = Startdaten(client: client)
        let name = try await d.meinName()
        XCTAssertEqual(name, MeinName(vorname: "Noah", nachname: "Brandt"))
        let meine = try await d.meineBuchungen()
        XCTAssertEqual(meine.map(\.courtName), ["Platz 3", "Platz 5"])
        XCTAssertEqual(meine[1].players?.count, 4)
        XCTAssertNil(meine[1].players?[3] ?? nil, "Ein freier Platz kommt als null")
        let offen = try await d.offeneSpiele()
        XCTAssertEqual(offen.first?.suchfilter, Suchfilter(von: 10, bis: 15, fuer: "alle"))
        XCTAssertEqual(offen.last?.suchfilter, .offen)

        let plan = try await d.tagesplan("2026-11-17")
        XCTAssertEqual(a.letzte("day_schedule")?["p_date"] as? String, "2026-11-17")
        XCTAssertEqual(plan.count, 5)
        XCTAssertEqual(plan.filter { $0.isOwn == true }.count, 1)
        XCTAssertNotNil(plan.first?.seriesId)

        let e = try await d.buchungseinstellungen()
        XCTAssertEqual(e?.openingTime, "08:00:00")
        XCTAssertEqual(e?.guestFeeCents, 1000)
        let arten = try await d.buchungsarten()
        XCTAssertEqual(arten.map(\.code), ["einzel", "doppel"])
        XCTAssertEqual(a.letzte("booking_types_aktiv")?["p_applies_to"] as? String, "booking")
        let plaetze = try await d.plaetze()
        XCTAssertEqual(plaetze.count, 8)
        let getraenke = try await d.eigeneGetraenke()
        XCTAssertEqual(getraenke.filter { $0.voidedAt != nil }.count, 1)
        let dienst = try await d.arbeitsdienst()
        XCTAssertEqual(dienst, Arbeitsdienst(year: 2026, requiredHours: 8, completedHours: 6, missingHours: 2))
        let events = try await d.veranstaltungen()
        XCTAssertEqual(events.count, 6)
        XCTAssertEqual(events.first?.meineForderungCents, 1250)

        let nachrichten = try await d.benachrichtigungen()
        XCTAssertEqual(a.letzte("my_notifications")?["p_limit"] as? Int, 30)
        XCTAssertEqual(nachrichten.filter { $0.readAt == nil }.count, 2)
        let ungelesen = await d.ungelesen()
        XCTAssertEqual(ungelesen, 2)
        a.setze("mark_notifications_read", json: "2")
        let abgehakt = try await d.markiereGelesen()
        XCTAssertEqual(abgehakt, 2)
    }

    /// Leere Antworten: keine Zeile heisst nil bzw. leere Liste, kein Fehler.
    func testStartdatenOhneZeilen() async throws {
        for rpc in ["ich", "booking_settings", "my_work_duty", "my_bookings"] { a.setze(rpc, json: "[]") }
        let d = Startdaten(client: client)
        let name = try await d.meinName()
        XCTAssertNil(name)
        let e = try await d.buchungseinstellungen()
        XCTAssertNil(e)
        let dienst = try await d.arbeitsdienst()
        XCTAssertNil(dienst)
        let meine = try await d.meineBuchungen()
        XCTAssertEqual(meine, [])
        // Der Zaehler der Glocke: jeder Fehler zaehlt als 0.
        a.setze("my_unread_notification_count", .netzfehler(.timedOut))
        let ungelesen = await d.ungelesen()
        XCTAssertEqual(ungelesen, 0)
    }

    // MARK: - Fehlerfaelle

    func testFehlerDerDatenbankWerdenZumSatz() async {
        let d = Startdaten(client: client)
        // Aufgezeichnet: cancel_booking mit unbekannter Kennung -> 500, P0002 und ein deutscher Satz.
        a.setze("my_bookings", .fehler("P0002", "Diese Buchung gibt es nicht.", status: 500))
        var text = await meldung { try await d.meineBuchungen() }
        XCTAssertEqual(text, "Diese Buchung gibt es nicht.")
        // Ohne Satz entscheidet der Code.
        a.setze("my_bookings", .fehler("42501", "permission denied for function my_bookings", status: 403))
        text = await meldung { try await d.meineBuchungen() }
        XCTAssertEqual(text, "Dafür fehlt dir die Berechtigung.")
        // Constraint-Namen im Text.
        a.setze("my_bookings", .fehler("23P01", #"conflicting key value violates exclusion constraint "bookings_no_overlap""#, status: 409))
        text = await meldung { try await d.meineBuchungen() }
        XCTAssertEqual(text, "Dieser Platz ist zu der Zeit bereits belegt.")
        // Unbekannte RPC (PGRST202, aufgezeichnet): kein englischer Rohtext.
        a.setze("my_bookings", .fehler("PGRST202", "Could not find the function public.my_bookings without parameters in the schema cache", status: 404))
        text = await meldung { try await d.meineBuchungen() }
        XCTAssertEqual(text, DbFehler.allgemeinerFehlerText)
    }

    func testOhneNetz() async {
        let d = Startdaten(client: client)
        for code in [URLError.Code.notConnectedToInternet, .timedOut, .cannotConnectToHost, .networkConnectionLost] {
            a.setze("my_bookings", .netzfehler(code))
            let text = await meldung { try await d.meineBuchungen() }
            XCTAssertEqual(text, DbFehler.verbindungsfehlerText, "\(code)")
        }
        // Schreibend: dieselbe Meldung im Ergebnis statt als Fehler.
        a.netzAus()
        let r = await Platzdaten(client: client).spieleMit("b1")
        XCTAssertEqual(r, PlatzErgebnis(ok: false, meldung: DbFehler.verbindungsfehlerText))
    }

    /// Eine Antwort, die nicht zum Modell passt, wird zum allgemeinen Satz - kein Absturz.
    func testKaputteAntwort() async {
        let d = Startdaten(client: client)
        a.setze("my_bookings", json: #"[{"booking_id":17}]"#)
        var text = await meldung { try await d.meineBuchungen() }
        XCTAssertEqual(text, DbFehler.allgemeinerFehlerText)
        a.setze("my_bookings", json: "<html>Bad Gateway</html>")
        text = await meldung { try await d.meineBuchungen() }
        XCTAssertEqual(text, DbFehler.allgemeinerFehlerText)
        a.setze("my_bookings", .json("<html>Bad Gateway</html>", status: 502))
        text = await meldung { try await d.meineBuchungen() }
        XCTAssertEqual(text, DbFehler.allgemeinerFehlerText)
    }

    /// Die Datenbank weist ein abgelaufenes Token ab (PGRST301 mit 401).
    func testAbgelaufenesTokenBeimLesen() async {
        a.setze("my_bookings", .abgelaufen)
        let text = await meldung { try await Startdaten(client: self.client).meineBuchungen() }
        XCTAssertEqual(text, DbFehler.allgemeinerFehlerText)
    }

    /// Abgelaufene Sitzung, Erneuern klappt: die Abfrage laeuft mit dem neuen Token.
    func testAbgelaufeneSitzungWirdErneuert() async throws {
        let client = a.client(.abgelaufen)
        let meine = try await Startdaten(client: client).meineBuchungen()
        XCTAssertEqual(meine.count, 2)
        let erneuern = try XCTUnwrap(a.anfragen.first { $0.pfad == "/auth/v1/token" })
        XCTAssertEqual(erneuern.abfrage, "grant_type=refresh_token")
        XCTAssertEqual(erneuern.text("refresh_token"), "attrappe-refresh")
        let abfrage = try XCTUnwrap(a.aufrufe("my_bookings").first)
        XCTAssertEqual(abfrage.kopf["Authorization"], "Bearer \(Beispiel.sitzung().accessToken)")
    }

    /// Abgelaufene Sitzung, das Erneuern wird abgewiesen (aufgezeichnet: 400 "Refresh token is not valid").
    func testAbgelaufeneSitzungOhneErneuerung() async {
        a.setze("/auth/v1/token", .authFehler("validation_failed", "Refresh token is not valid", status: 400))
        let client = a.client(.abgelaufen)
        // Die Datenbank weist den Aufruf dann als anonym ab (42501).
        a.setze("my_bookings") { anfrage in
            anfrage.kopf["Authorization"] == "Bearer \(Beispiel.sitzung(abgelaufen: true).accessToken)"
                ? .json("[]") : .fehler("42501", "permission denied for function my_bookings", status: 401)
        }
        let text = await meldung { try await Startdaten(client: client).meineBuchungen() }
        XCTAssertEqual(text, "Dafür fehlt dir die Berechtigung.")
        // supabase-swift schickt die Abfrage ohne Sitzung mit dem oeffentlichen Schluessel - nie mit dem alten Token.
        XCTAssertFalse(a.aufrufe("my_bookings").isEmpty)
    }

    // MARK: - Kontodaten

    func testKontodatenLesen() async throws {
        let d = Kontodaten(client: client)
        let profil = try await d.profil()
        XCTAssertEqual(profil?.firstName, "Noah")
        XCTAssertEqual(profil?.werte["title"], "", "null wird im Formular zum leeren Text")
        XCTAssertEqual(profil?.isTeamCaptain, true)
        let id = try await d.meineId()
        XCTAssertEqual(id, "e2e00000-0000-4000-8000-000000000002")
        let forderungen = try await d.forderungen()
        XCTAssertEqual(forderungen.map(\.amountCents), [1250, 18000, 6000])
        XCTAssertEqual(forderungen.last?.isForOther, true)
        let mandat = try await d.mandat()
        XCTAssertEqual(mandat?.ibanLast4, "0284")
        let merkmale = try await d.merkmale()
        XCTAssertEqual(merkmale.count, 6)
        XCTAssertEqual(merkmale.first { $0.code == "booking_mail" }?.optionValue, "wichtige")
        XCTAssertEqual(a.letzte("member_attributes")?["p_member_id"] as? String, id)
    }

    func testKontodatenOhneZugang() async throws {
        for rpc in ["mein_profil", "ich", "mein_mandat"] { a.setze(rpc, json: "[]") }
        let d = Kontodaten(client: client)
        let profil = try await d.profil()
        XCTAssertNil(profil)
        let mandat = try await d.mandat()
        XCTAssertNil(mandat)
        // Ohne member_id (Kiosk) gibt es keine Merkmale - und keine Abfrage danach.
        let merkmale = try await d.merkmale()
        XCTAssertEqual(merkmale, [])
        XCTAssertTrue(a.aufrufe("member_attributes").isEmpty)
        let r = await d.setzeMerkmal(code: "foto")
        XCTAssertEqual(r, .fehler("Nicht angemeldet."))
        let weg = await d.entferneMerkmal(code: "foto")
        XCTAssertEqual(weg, .fehler("Nicht angemeldet."))
    }

    func testProfilSpeichern() async throws {
        let d = Kontodaten(client: client)
        let geladen = try await d.profil()
        let alt = try XCTUnwrap(geladen).werte
        // Nichts geaendert: keine Anfrage.
        var r = await d.speichereProfil(neu: alt, alt: alt)
        XCTAssertEqual(r, .fehler("Nichts geändert."))
        XCTAssertTrue(a.aufrufe("save_my_profile").isEmpty)
        // Nur die geaenderten Felder gehen hinaus; "" leert.
        var neu = alt
        neu["city"] = "Fellbach"
        neu["mobile"] = ""
        r = await d.speichereProfil(neu: neu, alt: alt)
        XCTAssertEqual(r, .erfolg("Gespeichert."))
        XCTAssertEqual(a.letzte("save_my_profile") as? [String: String], ["p_city": "Fellbach", "p_mobile": ""])
        // Ein Pruefungsfehler bleibt in der App.
        neu["first_name"] = " "
        r = await d.speichereProfil(neu: neu, alt: alt)
        XCTAssertFalse(r.ok)
        XCTAssertEqual(r.feld, "first_name")
        XCTAssertEqual(a.aufrufe("save_my_profile").count, 1)
        // Die Datenbank lehnt ab: ihr Satz steht im Ergebnis.
        a.setze("save_my_profile", .fehler("P0001", "Die Postleitzahl hat fünf Ziffern."))
        neu["first_name"] = "Noah"
        r = await d.speichereProfil(neu: neu, alt: alt)
        XCTAssertEqual(r, .fehler("Die Postleitzahl hat fünf Ziffern."))
    }

    func testNotfallkontaktMerkmaleKuendigung() async {
        let d = Kontodaten(client: client)
        var r = await d.speichereNotfallkontakt([
            "emergency_contact_name": " Erika Mustermann ", "emergency_contact_phone": "0711 123", "emergency_contact_relation": "",
        ])
        XCTAssertEqual(r, .erfolg("Notfallkontakt gespeichert."))
        XCTAssertEqual(
            a.letzte("save_my_notfallkontakt") as? [String: String],
            ["p_name": "Erika Mustermann", "p_phone": "0711 123", "p_relation": ""]
        )
        r = await d.speichereNotfallkontakt(["emergency_contact_name": "", "emergency_contact_phone": "0711 123"])
        XCTAssertFalse(r.ok, "Zur Nummer gehoert ein Name")
        XCTAssertEqual(a.aufrufe("save_my_notfallkontakt").count, 1)

        // Optionale Parameter fehlen, statt null zu sein.
        r = await d.setzeMerkmal(code: "booking_mail", option: "alle")
        XCTAssertEqual(r, .erfolg("Gespeichert."))
        XCTAssertEqual(
            a.letzte("set_member_attribute") as? [String: String],
            ["p_member_id": "e2e00000-0000-4000-8000-000000000002", "p_type_code": "booking_mail", "p_option_value": "alle"]
        )
        r = await d.entferneMerkmal(code: "foto")
        XCTAssertEqual(r, .erfolg("Entfernt."))
        XCTAssertEqual(Set((a.letzte("remove_member_attribute") ?? [:]).keys), ["p_member_id", "p_type_code"])
        a.setze("set_member_attribute", .fehler("42501", "permission denied"))
        r = await d.setzeMerkmal(code: "ehrung", option: "goldene_nadel")
        XCTAssertEqual(r, .fehler("Dafür fehlt dir die Berechtigung."))

        // Kuendigung: true = neuer Antrag, false = es lag schon einer vor.
        a.setze("konto_loeschung_beantragen", json: "true")
        r = await d.beantrageKontoloeschung("  Umzug  ")
        XCTAssertEqual(r, .erfolg(Kontoloeschung.meldung(neu: true)))
        XCTAssertEqual(a.letzte("konto_loeschung_beantragen") as? [String: String], ["p_nachricht": "Umzug"])
        a.setze("konto_loeschung_beantragen", json: "false")
        r = await d.beantrageKontoloeschung("")
        XCTAssertEqual(r, .erfolg(Kontoloeschung.meldung(neu: false)))
        XCTAssertEqual(a.letzte("konto_loeschung_beantragen")?.count, 0, "Ohne Nachricht fehlt der Parameter")
        a.setze("konto_loeschung_beantragen", .netzfehler(.notConnectedToInternet))
        r = await d.beantrageKontoloeschung("")
        XCTAssertEqual(r, .fehler(DbFehler.verbindungsfehlerText))
    }

    // MARK: - Vereinsdaten

    func testGetraenke() async throws {
        let d = Vereinsdaten(client: client)
        let karte = try await d.getraenkekarte()
        XCTAssertEqual(karte.count, 11)
        XCTAssertEqual(karte.first?.priceCents, 150)
        var fenster = await d.stornoFenster()
        XCTAssertEqual(fenster, 15)
        a.setze("drink_void_window_minutes", json: "30")
        fenster = await d.stornoFenster()
        XCTAssertEqual(fenster, 30)
        // Nicht eingestellt, 0 oder Fehler: die Vorgabe.
        for antwort in [Attrappe.Antwort.json("null"), .json("0"), .fehler("P0001", "Kaputt."), .netzfehler(.timedOut)] {
            a.setze("drink_void_window_minutes", antwort)
            fenster = await d.stornoFenster()
            XCTAssertEqual(fenster, Vereinsdaten.stornoFensterVorgabe)
        }

        var r = await d.bucheGetraenk(karte[0].id, menge: 2)
        XCTAssertEqual(r, .erfolg("Gebucht."))
        XCTAssertEqual(a.letzte("record_drink_purchase")?["p_item_id"] as? String, karte[0].id)
        XCTAssertEqual(a.letzte("record_drink_purchase")?["p_quantity"] as? Int, 2)
        r = await d.storniereGetraenk("g1")
        XCTAssertEqual(r, .erfolg("Zurückgenommen."))
        XCTAssertEqual(a.letzte("void_drink_purchase") as? [String: String], ["p_purchase_id": "g1", "p_reason": "Fehlbuchung"])
        a.setze("void_drink_purchase", .fehler("P0001", "Das Zeitfenster zum Zurücknehmen ist vorbei."))
        r = await d.storniereGetraenk("g1")
        XCTAssertEqual(r, .fehler("Das Zeitfenster zum Zurücknehmen ist vorbei."))
    }

    func testVeranstaltungen() async throws {
        let d = Vereinsdaten(client: client)
        let id = "e0000000-0000-4000-8000-000000000003"
        let geladen = try await d.veranstaltung(id)
        let detail = try XCTUnwrap(geladen)
        XCTAssertEqual(detail.event.title, "Weihnachtsfeier")
        XCTAssertEqual(detail.event.meinStatus, "waitlisted")
        XCTAssertEqual(detail.wartePlatz, 2)
        XCTAssertEqual(a.aufrufe("events_fuer_mitglied").last?.abfrage, "id=eq.\(id)")
        // Der Wartelistenplatz ist Beiwerk: faellt er aus, bleibt das Detail.
        a.setze("event_mein_wartelistenplatz", .fehler("P0001", "Kaputt."))
        let ohnePlatz = try await d.veranstaltung(id)
        XCTAssertNotNil(ohnePlatz)
        XCTAssertNil(ohnePlatz?.wartePlatz)
        let fehlt = try await d.veranstaltung("gibtsnicht")
        XCTAssertNil(fehlt)
        a.setze("events_fuer_mitglied", .netzfehler(.notConnectedToInternet))
        let text = await meldung { try await d.veranstaltung(id) }
        XCTAssertEqual(text, DbFehler.verbindungsfehlerText)

        a.setze("event_anmelden", json: #""registered""#)
        var r = await d.meldeAn(id, begleitpersonen: 1, bemerkung: "Salat")
        XCTAssertEqual(r, .erfolg("Du bist angemeldet."))
        XCTAssertEqual(a.letzte("event_anmelden")?["p_companions"] as? Int, 1)
        XCTAssertEqual(a.letzte("event_anmelden")?["p_note"] as? String, "Salat")
        a.setze("event_anmelden", json: #""waitlisted""#)
        r = await d.meldeAn(id, begleitpersonen: 0, bemerkung: "")
        XCTAssertEqual(r, .erfolg("Ausgebucht – du stehst auf der Warteliste."))
        // Aufgezeichnet: unbekannte Veranstaltung -> 500, P0002.
        a.setze("event_anmelden", .fehler("P0002", "Diese Veranstaltung gibt es nicht.", status: 500))
        r = await d.meldeAn("dead", begleitpersonen: 0, bemerkung: "")
        XCTAssertEqual(r, .fehler("Diese Veranstaltung gibt es nicht."))
        a.setze("event_anmeldung_aendern", json: #""waitlisted""#)
        r = await d.aendereAnmeldung(id, begleitpersonen: 2, bemerkung: "")
        XCTAssertEqual(r, .erfolg("Geändert – du stehst weiter auf der Warteliste."))
        a.setze("event_anmeldung_aendern", json: #""registered""#)
        r = await d.aendereAnmeldung(id, begleitpersonen: 2, bemerkung: "")
        XCTAssertEqual(r, .erfolg("Deine Anmeldung ist geändert."))
        r = await d.meldeAb(id)
        XCTAssertEqual(r, .erfolg("Du bist abgemeldet."))
        XCTAssertEqual(a.letzte("event_abmelden") as? [String: String], ["p_event_id": id])
    }

    // MARK: - Platzdaten

    func testPlatzdatenLesen() async throws {
        let d = Platzdaten(client: client)
        let k = try await d.kontingent()
        XCTAssertEqual(k, Kontingent(used: 1, allowed: 3))
        a.setze("my_booking_quota", json: "[]")
        let leer = try await d.kontingent()
        XCTAssertEqual(leer, .leer)
        let sperrarten = try await d.blockungsarten()
        XCTAssertEqual(sperrarten.map(\.code), ["training", "verbandsspiel", "platzpflege"])
        XCTAssertEqual(a.letzte("booking_types_aktiv")?["p_applies_to"] as? String, "blocking")
        let verzeichnis = try await d.verzeichnis()
        XCTAssertEqual(verzeichnis.first?.name, "Christian Bauer")
        let ich = try await d.ich()
        XCTAssertEqual(ich?.platzRechte, false)
        a.setze("ich", json: Beispiel.roh("ich-admin")!)
        let admin = try await d.ich()
        XCTAssertEqual(admin?.platzRechte, true)
    }

    func testBuchen() async {
        let d = Platzdaten(client: client)
        // 18.11.2026 17:00 in Berlin = 16:00 UTC
        let beginn = Zeit.berlinTime(day: "2026-11-18", minutes: 17 * 60)
        var r = await d.bucheplatz(courtId: "c1", beginn: beginn, typ: "einzel", mitspieler: ["m2"], gaeste: [], sucheMitspieler: false,
                                   filter: Suchfilter(von: 10, bis: 15, fuer: "alle"))
        XCTAssertEqual(r, PlatzErgebnis(ok: true, meldung: "Platz gebucht."))
        var p = a.letzte("create_booking") ?? [:]
        XCTAssertEqual(p["p_court_id"] as? String, "c1")
        XCTAssertEqual(Zeit.datum(p["p_starts_at"] as? String ?? ""), beginn)
        XCTAssertEqual(p["p_player_member_ids"] as? [String], ["m2"])
        XCTAssertEqual(p["p_partner_wanted"] as? Bool, false)
        // Ohne Suche zaehlt der Filter nicht: die Parameter fehlen ganz.
        XCTAssertNil(p["p_partner_lk_von"])
        XCTAssertNil(p["p_partner_fuer"])

        r = await d.bucheplatz(courtId: "c1", beginn: beginn, typ: "doppel", mitspieler: [], gaeste: ["Gast"], sucheMitspieler: true,
                               filter: Suchfilter(von: 10, bis: 15, fuer: nil))
        p = a.letzte("create_booking") ?? [:]
        XCTAssertEqual(p["p_partner_wanted"] as? Bool, true)
        XCTAssertEqual(p["p_partner_lk_von"] as? Double, 10)
        XCTAssertEqual(p["p_partner_lk_bis"] as? Double, 15)
        XCTAssertEqual(p["p_guest_names"] as? [String], ["Gast"])

        a.setze("create_booking", .fehler("23P01", #"conflicting key value violates exclusion constraint "bookings_no_overlap""#, status: 409))
        r = await d.bucheplatz(courtId: "c1", beginn: beginn, typ: "einzel", mitspieler: [], gaeste: [], sucheMitspieler: true)
        XCTAssertEqual(r, PlatzErgebnis(ok: false, meldung: "Dieser Platz ist zu der Zeit bereits belegt."))
    }

    func testBuchungAendernUndStornieren() async {
        let d = Platzdaten(client: client)
        var r = await d.aendereMitspieler(bookingId: "b1", mitglieder: ["m2"], gaeste: [" Gast ", "  "])
        XCTAssertTrue(r.ok)
        XCTAssertEqual(a.letzte("update_booking_players")?["p_guest_names"] as? [String], ["Gast"])
        r = await d.storniereBuchung("b1", grund: "  ")
        XCTAssertEqual(r.meldung, "Buchung storniert.")
        XCTAssertEqual(a.letzte("cancel_booking") as? [String: String], ["p_booking_id": "b1"], "Ohne Grund fehlt p_reason")
        r = await d.storniereBuchung("b1", grund: "Regen")
        XCTAssertEqual(a.letzte("cancel_booking") as? [String: String], ["p_booking_id": "b1", "p_reason": "Regen"])
        r = await d.sageSerienterminAb("b1", grund: "Feiertag")
        XCTAssertEqual(r.meldung, "Der Termin ist abgesagt.")
        XCTAssertEqual(a.letzte("cancel_series_occurrence")?["p_reason"] as? String, "Feiertag")
        r = await d.hebeSperreAuf("b9")
        XCTAssertEqual(r.meldung, "Die Sperrung ist aufgehoben.")
        r = await d.spieleMit("b2")
        XCTAssertEqual(r.meldung, "Du bist eingetragen. Viel Spaß!")
        XCTAssertEqual(a.letzte("join_booking") as? [String: String], ["p_booking_id": "b2"])
        r = await d.verlasseBuchung("b2")
        XCTAssertTrue(r.ok)
        XCTAssertEqual(a.aufrufe("leave_booking").count, 1)

        r = await d.sucheMitspieler("b1", gesucht: true, filter: Suchfilter(von: 5, bis: 12, fuer: "damen"))
        XCTAssertEqual(r.meldung, "Die Buchung steht jetzt bei den offenen Spielen.")
        XCTAssertEqual(a.letzte("set_partner_wanted")?["p_wanted"] as? Bool, true)
        XCTAssertEqual(a.letzte("set_partner_wanted")?["p_lk_von"] as? Double, 5)
        r = await d.sucheMitspieler("b1", gesucht: false, filter: Suchfilter(von: 5, bis: 12, fuer: "damen"))
        XCTAssertEqual(r.meldung, "Die Buchung ist nicht mehr ausgeschrieben.")
        XCTAssertNil(a.letzte("set_partner_wanted")?["p_lk_von"], "Beim Abschalten geht kein Filter mit")

        r = await d.setzeUm(bookingId: "b1", platzId: "c2", tag: "2026-11-19", minute: 9 * 60, grund: "")
        XCTAssertEqual(r.meldung, "Die Buchung ist umgesetzt.")
        XCTAssertEqual(Zeit.datum(a.letzte("move_booking")?["p_starts_at"] as? String ?? ""), Zeit.berlinTime(day: "2026-11-19", minutes: 540))
        XCTAssertNil(a.letzte("move_booking")?["p_reason"])

        // Aufgezeichnet: unbekannte Buchung.
        a.setze("cancel_booking", .fehler("P0002", "Diese Buchung gibt es nicht.", status: 500))
        r = await d.storniereBuchung("dead", grund: nil)
        XCTAssertEqual(r, PlatzErgebnis(ok: false, meldung: "Diese Buchung gibt es nicht."))
        a.setze("join_booking", .abgelaufen)
        r = await d.spieleMit("b2")
        XCTAssertEqual(r, PlatzErgebnis(ok: false, meldung: DbFehler.allgemeinerFehlerText))
    }

    /// Sperren ist zweistufig: liegen Buchungen im Weg, kommt ihre Zahl zurueck.
    func testSperren() async {
        let d = Platzdaten(client: client)
        let von = Zeit.berlinTime(day: "2026-11-18", minutes: 600)
        let bis = Zeit.berlinTime(day: "2026-11-18", minutes: 720)
        a.setze("create_blocking", json: #"[{"created_count":1,"displaced_count":0}]"#)
        var r = await d.sperre(platzId: "c1", von: von, bis: bis, typCode: "platzpflege", grund: " Linien ", verdraengen: false)
        XCTAssertEqual(r, PlatzErgebnis(ok: true, meldung: "Gesperrt."))
        XCTAssertEqual(a.letzte("create_blocking")?["p_court_ids"] as? [String], ["c1"])
        XCTAssertEqual(a.letzte("create_blocking")?["p_title"] as? String, "Linien")
        XCTAssertEqual(a.letzte("create_blocking")?["p_force"] as? Bool, false)
        XCTAssertNil(a.letzte("create_blocking")?["p_booking_id"])

        a.setze("create_blocking", .fehler("P0001", "2 Buchungen liegen in diesem Zeitraum. Bestaetige das Verdraengen."))
        r = await d.sperre(platzId: "c1", von: von, bis: bis, typCode: "platzpflege", grund: "", verdraengen: false)
        XCTAssertFalse(r.ok)
        XCTAssertEqual(r.kollisionen, 2)

        a.setze("update_blocking", json: #"[{"created_count":0,"displaced_count":1}]"#)
        r = await d.aendereSperre(bookingId: "b9", platzIds: ["c1", "c2"], von: von, bis: bis, typCode: "training", grund: "", verdraengen: true)
        XCTAssertEqual(r, PlatzErgebnis(ok: true, meldung: PlaetzeLogik.sperreGeaendert(verdraengt: 1)))
        XCTAssertEqual(a.letzte("update_blocking")?["p_booking_id"] as? String, "b9")
        XCTAssertEqual(a.letzte("update_blocking")?["p_force"] as? Bool, true)
        a.setze("update_blocking", .fehler("42501", "permission denied"))
        r = await d.aendereSperre(bookingId: "b9", platzIds: ["c1"], von: von, bis: bis, typCode: "training", grund: "", verdraengen: false)
        XCTAssertEqual(r, PlatzErgebnis(ok: false, meldung: "Dafür fehlt dir die Berechtigung.", kollisionen: nil))
    }

    // MARK: - Mannschaftsdaten

    func testMannschaft() async throws {
        let d = Mannschaftsdaten(client: client)
        let geladen = try await d.mannschaft()
        let m = try XCTUnwrap(geladen)
        XCTAssertEqual(m.name, "Herren 30")
        XCTAssertTrue(m.ichBinMf)
        XCTAssertEqual(m.kader.count, 7)
        XCTAssertEqual(m.offeneEinladungen?.count, 1)
        a.setze("meine_mannschaft", json: "null")
        let ohne = try await d.mannschaft()
        XCTAssertNil(ohne)
        let einladungen = try await d.einladungen()
        XCTAssertEqual(einladungen.first?.teamName, "Herren")
        XCTAssertEqual(einladungen.first?.annehmenMoeglich, true)

        // Leere Suche: ganz ohne Parameter.
        var kandidaten = try await d.kandidaten(suche: "  ")
        XCTAssertEqual(kandidaten.count, 6)
        XCTAssertEqual(a.letzte("mannschaft_kandidaten")?.count, 0)
        kandidaten = try await d.kandidaten(suche: " Bau ")
        XCTAssertEqual(a.letzte("mannschaft_kandidaten") as? [String: String], ["p_suche": "Bau"])

        var r = await d.einladen(kandidaten[0])
        XCTAssertEqual(r, .erfolg(MannschaftLogik.eingeladenMeldung(kandidaten[0])))
        XCTAssertEqual(a.letzte("mannschaft_einladen") as? [String: String], ["p_member_id": kandidaten[0].memberId])
        a.setze("mannschaft_einladen", .fehler("23505", #"duplicate key value violates unique constraint "team_invitations_eine_offene""#, status: 409))
        r = await d.einladen(kandidaten[0])
        XCTAssertEqual(r, .fehler("Dieses Mitglied ist schon eingeladen."))

        r = await d.zurueckziehen(m.offeneEinladungen![0])
        XCTAssertTrue(r.ok)
        XCTAssertEqual(a.letzte("mannschaft_einladung_zurueckziehen") as? [String: String], ["p_invitation_id": m.offeneEinladungen![0].id])

        r = await d.beantworten(einladungen[0], annehmen: true, telefonSichtbar: true)
        XCTAssertTrue(r.ok)
        XCTAssertEqual(a.letzte("mannschaft_einladung_beantworten")?["p_annehmen"] as? Bool, true)
        XCTAssertEqual(a.letzte("mannschaft_einladung_beantworten")?["p_telefon_sichtbar"] as? Bool, true)
        // Wer ablehnt, gibt auch kein Telefon frei.
        r = await d.beantworten(einladungen[0], annehmen: false, telefonSichtbar: true)
        XCTAssertEqual(a.letzte("mannschaft_einladung_beantworten")?["p_telefon_sichtbar"] as? Bool, false)

        r = await d.austragen(m.kader[1])
        XCTAssertEqual(a.letzte("mannschaft_austragen") as? [String: String], ["p_member_id": m.kader[1].memberId])
        // Selbst austreten: mit der eigenen Kennung aus ich().
        r = await d.austreten(team: "Herren 30")
        XCTAssertEqual(r, .erfolg(MannschaftLogik.ausgetretenMeldung("Herren 30")))
        XCTAssertEqual(a.letzte("mannschaft_austragen") as? [String: String], ["p_member_id": "e2e00000-0000-4000-8000-000000000002"])
        a.setze("ich", json: "[]")
        r = await d.austreten(team: "Herren 30")
        XCTAssertEqual(r, .fehler("Nicht angemeldet."))

        r = await d.setzeTelefonSichtbar(true)
        XCTAssertEqual(r, .erfolg(TennisLogik.gespeichert))
        XCTAssertEqual(a.letzte("set_team_phone_visible")?["p_visible"] as? Bool, true)
    }

    // MARK: - Onboardingdaten

    func testOnboardingLesen() async throws {
        let d = Onboardingdaten(client: client)
        let geladen = try await d.laden()
        let z = try XCTUnwrap(geladen)
        XCTAssertTrue(z.minderjaehrig)
        XCTAssertEqual(z.naechsterPflichtschritt, .stammdaten)
        XCTAssertEqual(z.schritte.count, 9)
        XCTAssertEqual(z.dokumente.map(\.code).first, "satzung")
        XCTAssertEqual(z.mandat.glaeubigerId, "DE98ZZZ09999999999")
        XCTAssertTrue(z.mandat.moeglich)
        XCTAssertEqual(z.stammdaten.birthday, "2014-10-01")
        // Kein Mitglied (Kiosk): null.
        a.setze("my_onboarding", json: "null")
        let ohne = try await d.laden()
        XCTAssertNil(ohne)
        a.setze("my_onboarding", .netzfehler(.timedOut))
        let text = await meldung { try await d.laden() }
        XCTAssertEqual(text, DbFehler.verbindungsfehlerText)
    }

    func testOnboardingSpeichern() async {
        let d = Onboardingdaten(client: client)
        let werte = [
            "first_name": " Kian ", "last_name": "Neumitglied", "birthday": "01.10.2014", "gender": "male", "street": "Hauptstr. 1",
            "postcode": "70372", "city": "Stuttgart", "mobile": "0170 1234567", "phone": "", "title": "",
        ]
        var r = await d.speichereStammdaten(werte)
        XCTAssertEqual(r, .erfolg("Deine Daten sind gespeichert."))
        let p = a.letzte("onboarding_save_stammdaten") as? [String: String] ?? [:]
        XCTAssertEqual(p["p_first_name"], "Kian")
        XCTAssertEqual(p["p_birthday"], "2014-10-01")
        XCTAssertEqual(p["p_mobile"], "0170 1234567")
        XCTAssertNil(p["p_phone"], "Leere freiwillige Felder fehlen")
        XCTAssertNil(p["p_title"])
        r = await d.speichereStammdaten(["first_name": ""])
        XCTAssertFalse(r.ok)
        XCTAssertEqual(a.aufrufe("onboarding_save_stammdaten").count, 1)

        r = await d.akzeptiereDokumente([])
        XCTAssertEqual(r, .erfolg(""))
        XCTAssertTrue(a.aufrufe("onboarding_accept_documents").isEmpty)
        r = await d.akzeptiereDokumente(["satzung", "datenschutz"])
        XCTAssertEqual(a.letzte("onboarding_accept_documents")?["p_codes"] as? [String], ["satzung", "datenschutz"])

        r = await d.speichereErziehungsberechtigte(name: "Erika Neumitglied", email: "", telefon: "0711 1", zustimmung: true)
        XCTAssertTrue(r.ok, r.meldung)
        XCTAssertEqual(a.letzte("onboarding_save_guardian")?["p_consent"] as? Bool, true)
        XCTAssertEqual(a.letzte("onboarding_save_guardian")?["p_phone"] as? String, "0711 1")
        XCTAssertNil(a.letzte("onboarding_save_guardian")?["p_email"])

        r = await d.speichereNotfallkontakt(name: "", telefon: "0711 1", verhaeltnis: "")
        XCTAssertEqual(r, .fehler("Zur Notfallnummer gehört auch ein Name.", feld: "name"))
        r = await d.speichereNotfallkontakt(name: "Erika", telefon: "0711 1", verhaeltnis: "")
        XCTAssertEqual(a.letzte("onboarding_save_notfallkontakt") as? [String: String], ["p_name": "Erika", "p_phone": "0711 1"])

        r = await d.erteileMandat(iban: "DE89370400440532013000", kontoinhaber: "", bestaetigt: false)
        XCTAssertFalse(r.ok)
        r = await d.erteileMandat(iban: "DE00123", kontoinhaber: "", bestaetigt: true)
        XCTAssertFalse(r.ok)
        XCTAssertTrue(a.aufrufe("create_my_sepa_mandate").isEmpty)
        r = await d.erteileMandat(iban: "DE89370400440532013000", kontoinhaber: " Erika Neumitglied ", bestaetigt: true)
        XCTAssertEqual(r, .erfolg("Das Mandat ist erteilt."))
        XCTAssertEqual(a.letzte("create_my_sepa_mandate")?["p_holder"] as? String, "Erika Neumitglied")
        XCTAssertEqual(a.letzte("create_my_sepa_mandate")?["p_accept"] as? Bool, true)

        // Tennis: immer alle drei Werte.
        r = await d.speichereTennis(lk: "14,5", nuligaId: "", mannschaftInteresse: true)
        XCTAssertEqual(r, .erfolg(TennisLogik.gespeichert))
        XCTAssertEqual(Set((a.letzte("save_my_tennis") ?? [:]).keys), ["p_tennis_lk", "p_nuliga_id", "p_mannschaft_interesse"])
        r = await d.speichereTennis(lk: "99", nuligaId: "", mannschaftInteresse: false)
        XCTAssertFalse(r.ok)
        XCTAssertEqual(a.aufrufe("save_my_tennis").count, 1)
    }

    /// Fehlt beim Abschluss noch etwas, stehen die Schritte im DETAIL der Datenbankmeldung.
    func testOnboardingAbschliessen() async {
        let d = Onboardingdaten(client: client)
        var e = await d.schliesseAb()
        XCTAssertEqual(e, Abschluss(ergebnis: .erfolg("Dein Konto ist freigeschaltet.")))
        a.setze("complete_onboarding", .fehler("P0001", "Es fehlt noch etwas.", details: "stammdaten, sepa"))
        e = await d.schliesseAb()
        XCTAssertEqual(e, Abschluss(ergebnis: .fehler("Es fehlt noch etwas."), fehlt: [.stammdaten, .sepa]))
        a.setze("complete_onboarding", .netzfehler(.notConnectedToInternet))
        e = await d.schliesseAb()
        XCTAssertEqual(e, Abschluss(ergebnis: .fehler(DbFehler.verbindungsfehlerText)))
    }

    // MARK: - Verwaltungsdaten

    func testVerwaltungLaden() async throws {
        a.setze("ich", json: Beispiel.roh("ich-admin")!)
        let d = Verwaltungsdaten(client: client)
        let stand = try await d.laden()
        XCTAssertEqual(stand.plaetze.count, 9)
        XCTAssertEqual(stand.aktivePlaetze.count, 8)
        XCTAssertEqual(stand.serien.first?.kuenftige, 8)
        XCTAssertEqual(stand.oeffnung, "08:00")
        // Faellt nur der Tagesplan aus, steht die Seite trotzdem.
        a.setze("day_schedule", .fehler("P0001", "Kaputt."))
        let ohnePlan = try await d.laden()
        XCTAssertEqual(ohnePlan.plaetze.count, 9)
        XCTAssertTrue(ohnePlan.zustand.isEmpty)
        // Ohne Plaetze keine Seite.
        a.setze("court_overview", .fehler("42501", "permission denied"))
        let text = await meldung { try await d.laden() }
        XCTAssertEqual(text, "Die Plätze konnten nicht geladen werden. (Dafür fehlt dir die Berechtigung.)")
    }

    func testVerwaltungSperrenUndSerien() async {
        let d = Verwaltungsdaten(client: client)
        let morgen = Beispiel.tag(1)
        let tag = "\(morgen.suffix(2)).\(morgen.dropFirst(5).prefix(2)).\(morgen.prefix(4))"
        a.setze("create_blocking", json: #"[{"created_count":2,"displaced_count":1}]"#)
        var r = await d.sperre(platzIds: ["c1", "c2"], tag: tag, von: "10:00", bis: "12:00", artCode: "platzpflege", grund: " Regen ", verdraengen: true)
        XCTAssertEqual(r, PlatzErgebnis(ok: true, meldung: VerwaltungLogik.gesperrtMeldung(angelegt: 2, verdraengt: 1)))
        XCTAssertEqual(a.letzte("create_blocking")?["p_court_ids"] as? [String], ["c1", "c2"])
        XCTAssertEqual(a.letzte("create_blocking")?["p_title"] as? String, "Regen")
        XCTAssertEqual(Zeit.datum(a.letzte("create_blocking")?["p_von"] as? String ?? ""), Zeit.berlinTime(day: morgen, minutes: 600))
        // Unsinnige Eingabe: bleibt in der App.
        r = await d.sperre(platzIds: ["c1"], tag: tag, von: "25:99", bis: "10:00", artCode: "platzpflege", grund: "", verdraengen: false)
        XCTAssertEqual(r, PlatzErgebnis(ok: false, meldung: VerwaltungLogik.keineZeit))
        XCTAssertEqual(a.aufrufe("create_blocking").count, 1)
        a.setze("create_blocking", .fehler("P0001", "3 Buchungen liegen in diesem Zeitraum. Bestaetige das Verdraengen."))
        r = await d.sperre(platzIds: ["c1"], tag: tag, von: "10:00", bis: "12:00", artCode: "platzpflege", grund: "", verdraengen: false)
        XCTAssertEqual(r.kollisionen, 3)

        let eingabe = SerienEingabe(
            courtId: "c8", bookingTypeCode: "training", weekday: 2, startTime: "18:30", endTime: "20:00", validFrom: tag,
            validTo: tag.replacingOccurrences(of: String(morgen.prefix(4)), with: String(Int(morgen.prefix(4))! + 1)), title: "Jugendtraining"
        )
        switch await d.vorschau(eingabe) {
        case let .success(termine):
            XCTAssertEqual(termine.count, 2)
            XCTAssertEqual(termine.last?.conflictMemberName, "Julia Stein")
            XCTAssertEqual(a.letzte("preview_series")?["p_weekday"] as? Int, 2)
            XCTAssertEqual(a.letzte("preview_series")?["p_valid_from"] as? String, morgen)
        case let .failure(m):
            XCTFail(m.text)
        }
        a.setze("preview_series", .netzfehler(.timedOut))
        if case let .failure(m) = await d.vorschau(eingabe) {
            XCTAssertEqual(m.text, DbFehler.verbindungsfehlerText)
        } else {
            XCTFail("Die Vorschau haette scheitern muessen")
        }

        a.setze("create_series", json: #"[{"created_count":8,"displaced_count":0}]"#)
        r = await d.legeSerieAn(eingabe, verdraengen: false)
        XCTAssertTrue(r.ok, r.meldung)
        XCTAssertEqual(a.letzte("create_series")?["p_title"] as? String, "Jugendtraining")
        a.setze("end_series", json: "4")
        r = await d.beendeSerie("s1")
        XCTAssertTrue(r.ok, r.meldung)
        XCTAssertEqual(a.letzte("end_series") as? [String: String], ["p_series_id": "s1"])
        a.setze("end_series", .fehler("P0002", "Diese Serie gibt es nicht.", status: 500))
        r = await d.beendeSerie("dead")
        XCTAssertEqual(r.meldung, "Diese Serie gibt es nicht.")
    }
}
