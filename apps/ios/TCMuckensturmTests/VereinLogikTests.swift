import XCTest
@testable import TCMuckensturm

/**
 * Verein: Decoding der Modelle mit Beispiel-JSON, die Texte der Bildschirme
 * (VereinLogik, wortgleich mit getraenke.tsx und veranstaltung/[id].tsx) und
 * der Korb im VereinZustand mit seiner Erinnerung.
 */
final class VereinLogikTests: XCTestCase {
    private func lies<T: Decodable>(_ json: String, als _: T.Type = T.self) throws -> T {
        try JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    private let fest = """
    {"id":"fest","kind":"fest","title":"Saisonabschlussfest","description":null,"location":"Clubhaus",
     "status":"published","starts_at":"2026-11-06T18:00:00+00:00","ends_at":"2026-11-06T22:30:00+00:00",
     "registration_enabled":true,"registration_deadline":"2026-10-30T22:59:00+00:00","max_participants":80,
     "companions_allowed":true,"fee_cents":1800,"work_hours":null,"personen":62,"warteliste":0,
     "mein_status":"registered","meine_begleitpersonen":1,"meine_bemerkung":"vegetarisch",
     "meine_forderung_cents":3600,"meine_forderung_status":"open"}
    """

    private func event(_ aenderung: [String: Any] = [:]) throws -> MitgliedEvent {
        var objekt = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(fest.utf8)) as? [String: Any])
        for (k, v) in aenderung { objekt[k] = v }
        return try JSONDecoder().decode(MitgliedEvent.self, from: JSONSerialization.data(withJSONObject: objekt))
    }

    private let vorher = Zeit.datum("2026-10-20T10:00:00Z")!
    private let nachSchluss = Zeit.datum("2026-11-02T10:00:00Z")!
    private let danach = Zeit.datum("2026-11-08T10:00:00Z")!

    // MARK: - Decoding

    func testEventMitEigenerForderung() throws {
        let e = try event()
        XCTAssertEqual(e.meineForderungCents, 3600)
        XCTAssertEqual(e.meineForderungStatus, "open")
        XCTAssertEqual(e.meineBegleitpersonen, 1)
    }

    func testEventOhneForderungsspalten() throws {
        // Aeltere Server liefern die Spalten nicht; die App bleibt trotzdem lesbar.
        let e: MitgliedEvent = try lies(#"{"id":"x","starts_at":"2026-11-06T18:00:00Z","work_hours":"2.5"}"#)
        XCTAssertNil(e.meineForderungCents)
        XCTAssertEqual(e.workHours, 2.5)
    }

    func testGetraenkekarte() throws {
        let karte: [Getraenk] = try lies("""
        [{"id":"a","name":"Bier","category":"bier","description":"0,5 l","price_cents":250,"sort_order":1},
         {"id":"b","name":"Wasser","category":null,"description":null,"price_cents":null,"sort_order":null}]
        """)
        XCTAssertEqual(karte.map(\.name), ["Bier", "Wasser"])
        XCTAssertEqual(VereinLogik.artikelZeile(karte[0]), "2,50\u{00A0}€ · 0,5 l")
        XCTAssertEqual(VereinLogik.artikelZeile(karte[1]), "0,00\u{00A0}€")
    }

    // MARK: - Getraenke

    func testEntnahme() throws {
        let g: EigenesGetraenk = try lies("""
        {"id":"g","item_name":"Bier","quantity":2,"unit_price_cents":250,"total_cents":500,
         "created_at":"2026-10-29T17:05:00+00:00","voided_at":null,"source":"kiosk"}
        """)
        XCTAssertEqual(VereinLogik.entnahmeTitel(g), "2× Bier")
        XCTAssertEqual(VereinLogik.entnahmeZeile(g), "Do., 29.10., 18:05 · Theke")
        let zurueck: EigenesGetraenk = try lies("""
        {"id":"h","item_name":"Wasser","quantity":1,"created_at":"2026-07-01T08:00:00Z","voided_at":"2026-07-01T08:01:00Z","source":"neu"}
        """)
        XCTAssertEqual(VereinLogik.entnahmeTitel(zurueck), "Wasser")
        XCTAssertEqual(VereinLogik.entnahmeZeile(zurueck), "Mi., 01.07., 10:00 · App · zurückgenommen")
    }

    func testQuelle() {
        XCTAssertEqual(VereinLogik.quelleText("kiosk"), "Theke")
        XCTAssertEqual(VereinLogik.quelleText("bar_duty"), "Thekendienst")
        XCTAssertEqual(VereinLogik.quelleText("app"), "App")
        XCTAssertEqual(VereinLogik.quelleText(nil), "App")
    }

    func testMonatUndLeiste() {
        XCTAssertEqual(VereinLogik.monatKicker(vorher), "Oktober · läuft noch")
        XCTAssertEqual(VereinLogik.entnahmenText(1), "1 Entnahme · wird mit der Monatsabrechnung eingezogen")
        XCTAssertEqual(VereinLogik.entnahmenText(0), "0 Entnahmen · wird mit der Monatsabrechnung eingezogen")
        XCTAssertEqual(VereinLogik.korbZeile(stueck: 1, betrag: 250), "1 Getränk · 2,50\u{00A0}€")
        XCTAssertEqual(VereinLogik.korbZeile(stueck: 3, betrag: 650), "3 Getränke · 6,50\u{00A0}€")
        XCTAssertEqual(VereinLogik.stornoHinweis(15), "Eine Entnahme lässt sich 15 Minuten lang selbst zurücknehmen.")
        XCTAssertEqual(
            VereinLogik.erinnerung(stueck: 2, betrag: 500),
            "2 Getränke (5,00\u{00A0}€) sind noch nicht eingetragen. Gebucht wird erst mit „Eintragen“ – die Auswahl bleibt gemerkt."
        )
    }

    func testCanVoidSelfOhneZeitpunkt() {
        XCTAssertFalse(Getraenke.canVoidSelf(createdAt: nil, voidedAt: nil, fensterMinuten: 15, now: vorher))
        XCTAssertFalse(Getraenke.canVoidSelf(createdAt: "kaputt", voidedAt: nil, fensterMinuten: 15, now: vorher))
    }

    // MARK: - Veranstaltung im Detail

    func testBelegungAnteil() throws {
        XCTAssertEqual(try XCTUnwrap(Veranstaltungen.eventBelegungAnteil(try event())), 0.775, accuracy: 0.0001)
        XCTAssertNil(Veranstaltungen.eventBelegungAnteil(try event(["max_participants": NSNull()])))
        XCTAssertEqual(Veranstaltungen.eventBelegungAnteil(try event(["personen": 90])), 1)
    }

    func testDabeiNurOhneAbsage() throws {
        XCTAssertTrue(VereinLogik.dabei(try event()))
        XCTAssertFalse(VereinLogik.dabei(try event(["status": "cancelled"])))
        XCTAssertFalse(VereinLogik.dabei(try event(["mein_status": "cancelled"])))
        XCTAssertTrue(VereinLogik.dabei(try event(["mein_status": "waitlisted"])))
    }

    func testForderung() {
        XCTAssertEqual(VereinLogik.forderungText(status: "open"), "steht in deinem Konto unter „Offen“")
        XCTAssertEqual(VereinLogik.forderungText(status: "returned"), "steht in deinem Konto unter „Offen“")
        XCTAssertEqual(VereinLogik.forderungText(status: "submitted"), "ist im Einzug")
    }

    func testKnoepfeUndFragen() throws {
        let e = try event()
        XCTAssertEqual(VereinLogik.aenderungKnopf(e, begleitpersonen: 2), "Änderung sichern · 54,00\u{00A0}€")
        XCTAssertEqual(VereinLogik.aenderungKnopf(try event(["mein_status": "waitlisted"]), begleitpersonen: 2), "Änderung sichern")
        XCTAssertEqual(VereinLogik.abmeldenFrage(e, now: vorher), "Wirklich abmelden?")
        XCTAssertEqual(
            VereinLogik.abmeldenFrage(e, now: nachSchluss),
            "Der Anmeldeschluss ist vorbei – die Gebühr bleibt trotzdem fällig. Wirklich abmelden?"
        )
        XCTAssertEqual(VereinLogik.abmeldenFrage(try event(["mein_status": "waitlisted"]), now: nachSchluss), "Wirklich abmelden?")
        XCTAssertEqual(VereinLogik.begleitHinweis(e), "je 18,00\u{00A0}€")
        XCTAssertEqual(VereinLogik.begleitHinweis(try event(["fee_cents": NSNull()])), "Familie, Freunde")
        XCTAssertEqual(
            VereinLogik.preisHinweis(e),
            "Auch für Begleitpersonen. Mit der Anmeldung steht der Betrag in deinem Konto und wird per Lastschrift eingezogen."
        )
        XCTAssertTrue(VereinLogik.wartelisteVorab(begleitpersonen: 2).hasPrefix("Für euch alle ist gerade kein Platz frei"))
        XCTAssertTrue(VereinLogik.wartelisteVorab(begleitpersonen: 0).hasPrefix("Für dich ist gerade kein Platz frei"))
    }

    func testNichtsZuTun() throws {
        XCTAssertEqual(VereinLogik.nichtsZuTun(try event(["status": "cancelled"]), now: vorher), "Diese Veranstaltung ist abgesagt.")
        XCTAssertEqual(VereinLogik.nichtsZuTun(try event(), now: danach), "Diese Veranstaltung ist vorbei.")
        XCTAssertEqual(
            VereinLogik.nichtsZuTun(try event(["registration_enabled": false]), now: vorher),
            "Ohne Anmeldung – komm einfach vorbei."
        )
        XCTAssertEqual(VereinLogik.nichtsZuTun(try event(), now: nachSchluss), "Der Anmeldeschluss ist vorbei.")
        XCTAssertEqual(
            VereinLogik.nichtsZuTun(try event(), now: Zeit.datum("2026-11-06T19:00:00Z")!),
            "Die Veranstaltung läuft schon."
        )
    }

    func testMarken() throws {
        XCTAssertEqual(VereinLogik.marken(try event(), now: vorher).map(\.text), ["Fest"])
        XCTAssertEqual(VereinLogik.marken(try event(), now: danach).map(\.text), ["Fest", "Abgeschlossen"])
        XCTAssertEqual(VereinLogik.marken(try event(["status": "cancelled"]), now: vorher).map(\.text), ["Fest", "Abgesagt"])
    }

    // MARK: - Korb und Erinnerung

    @MainActor
    func testErinnerungNurMitVollemKorb() throws {
        UserDefaults.standard.removeObject(forKey: VereinZustand.reiterSchluessel)
        let z = VereinZustand()
        XCTAssertEqual(z.reiter, .getraenke)
        z.karte = try lies(#"[{"id":"bier","name":"Bier","price_cents":250},{"id":"wasser","name":"Wasser","price_cents":150}]"#)

        z.wechsle(zu: .veranstaltungen)
        XCTAssertNil(z.erinnerung, "leerer Korb: keine Rueckfrage")

        z.wechsle(zu: .getraenke)
        z.korb = ["bier": 2, "wasser": 1, "weg": 3]
        XCTAssertEqual(z.korbSumme.stueck, 3)
        XCTAssertEqual(z.korbSumme.betrag, 650)
        z.wechsle(zu: .veranstaltungen)
        XCTAssertEqual(z.erinnerung, VereinLogik.erinnerung(stueck: 3, betrag: 650))
        XCTAssertEqual(z.korb["bier"], 2, "der Korb bleibt")
        XCTAssertEqual(UserDefaults.standard.string(forKey: VereinZustand.reiterSchluessel), "veranstaltungen")

        z.erinnerung = nil
        z.oeffne(.veranstaltung("e1"))
        XCTAssertEqual(z.pfad, ["e1"])
        XCTAssertNil(z.erinnerung, "schon auf den Veranstaltungen: keine neue Rueckfrage")
        z.oeffne(.getraenke)
        XCTAssertEqual(z.reiter, .getraenke)
        XCTAssertEqual(z.pfad, [])
        UserDefaults.standard.removeObject(forKey: VereinZustand.reiterSchluessel)
    }
}
