import Supabase
import XCTest
@testable import TCMuckensturm

/**
 * Decoding der Home-Modelle mit Beispiel-JSON, wie PostgREST es liefert
 * (Zeitpunkte mit "+00:00", numeric als Zahl oder Text, fehlende und
 * null-Spalten), und die Uebersetzung der Fehler.
 */
final class StartdatenTests: XCTestCase {
    private func lies<T: Decodable>(_ json: String, als _: T.Type = T.self) throws -> T {
        try JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    func testMeineBuchung() throws {
        let b: [MeineBuchung] = try lies("""
        [{"booking_id":"b1","starts_at":"2026-10-29T15:00:00+00:00","ends_at":"2026-10-29T16:00:00+00:00",
          "court_name":"Platz 1","kind":"booking","type_code":"einzel","type_name":"Einzel","title":null,
          "owner_name":"Max Muster","bin_bucher":true,"players":["Max Muster",null,"Erika"]},
         {"booking_id":"b2","starts_at":"2026-10-30T15:00:00+00:00","ends_at":"2026-10-30T16:00:00+00:00"}]
        """)
        XCTAssertEqual(b.count, 2)
        XCTAssertEqual(b[0].courtName, "Platz 1")
        XCTAssertEqual(HomeLogik.mitText(b[0]), "mit Erika")
        XCTAssertNil(b[1].players)
        XCTAssertNil(b[1].binBucher)
        XCTAssertEqual(Zeit.minutesOf(b[0].startsAt), 16 * 60)
    }

    func testOffenesSpielUndBelegung() throws {
        let o: [OffenesSpiel] = try lies("""
        [{"booking_id":"o1","starts_at":"2026-10-29T15:00:00+00:00","ends_at":"2026-10-29T16:30:00+00:00",
          "court_name":"Platz 2","type_name":"Doppel","owner_name":"Erika","frei":2,"bin_dabei":false,"players":["Erika"]}]
        """)
        XCTAssertEqual(HomeLogik.offenesSpielTitel(o[0]), "Doppel · sucht 2")
        XCTAssertEqual(HomeLogik.offenesSpielZeile(o[0]), "Platz 2 · Erika")

        let t: [TagesBelegung] = try lies("""
        [{"booking_id":"t1","court_id":"c1","starts_at":"2026-10-29T15:00:00+00:00","ends_at":"2026-10-29T16:00:00+00:00",
          "kind":"blocking","series_id":"s1","is_own":false,"partner_wanted":false,"frei":0,
          "players":[],"player_member_ids":[],"guest_names":null}]
        """)
        XCTAssertEqual(Startseite.occupancyKind(t[0]), .serie)
    }

    func testEinstellungenArtenPlaetze() throws {
        let e: [Buchungseinstellungen] = try lies("""
        [{"opening_time":"08:00:00","closing_time":"21:00:00","slot_minutes":30,"lead_days":7,
          "max_open_bookings":2,"display_minutes":15,"guest_fee_cents":500}]
        """)
        XCTAssertEqual(Zeit.timeToMinutes(e[0].openingTime ?? ""), 480)
        // booking_types_aktiv
        let a: [Buchungsart] = try lies("""
        [{"code":"einzel","name":"Einzel","duration_minutes":60,"requires_partner":false,"min_players":2,
          "max_players":2,"sort_order":1},{"code":"neu"}]
        """)
        XCTAssertEqual(a.first?.durationMinutes, 60)
        XCTAssertEqual(a.first?.sortOrder, 1)
        XCTAssertNil(a[1].durationMinutes)
        // courts_aktiv
        let p: [AktiverPlatz] = try lies(#"[{"id":"c1","name":"Platz 1","short_name":"P1","position":1},{"id":"c2"}]"#)
        XCTAssertEqual(p.first?.shortName, "P1")
        XCTAssertEqual(p.first?.position, 1)
        XCTAssertNil(p[1].name)
    }

    func testBenachrichtigungGetraenkDienstName() throws {
        let n: [Benachrichtigung] = try lies("""
        [{"id":"n1","kind":"booking_cancelled","title":"Storniert","body":"Platz 1","created_at":"2026-10-29T10:00:00.123456+00:00",
          "read_at":null,"event_id":null}]
        """)
        XCTAssertNil(n[0].readAt)
        XCTAssertNotNil(Zeit.datum(n[0].createdAt))

        let g: [EigenesGetraenk] = try lies("""
        [{"id":"g1","item_name":"Wasser","quantity":2,"unit_price_cents":150,"total_cents":300,
          "created_at":"2026-10-28T18:00:00+00:00","voided_at":null,"source":"app"},
         {"id":"g2","total_cents":250,"voided_at":"2026-10-28T18:05:00+00:00"}]
        """)
        XCTAssertEqual(Startseite.sumOpenDrinks(g), 300)

        let zahl: [Arbeitsdienst] = try lies(#"[{"year":2026,"required_hours":10,"completed_hours":"2.5","missing_hours":7.5}]"#)
        XCTAssertEqual(zahl.first?.completedHours, 2.5)
        XCTAssertEqual(zahl.first?.requiredHours, 10)

    }

    func testIch() throws {
        let ich: [Ich] = try lies("""
        [{"member_id":"m1","first_name":"Max","last_name":null,"roles":["vorstand"],"admin":true,
          "platz_rechte":true,"kiosk":false,"zugang":true,"grund":null,"onboarding_offen":false}]
        """)
        XCTAssertEqual(ich.first?.name, MeinName(vorname: "Max", nachname: ""))
        XCTAssertEqual(ich.first?.roles, ["vorstand"])

        // Ohne Zugang oder Kiosk: member_id und Name null
        let ohne: [Ich] = try lies("""
        [{"member_id":null,"first_name":null,"last_name":null,"roles":[],"admin":false,"platz_rechte":false,
          "kiosk":true,"zugang":true,"grund":null,"onboarding_offen":false}]
        """)
        XCTAssertNil(ohne.first?.name)
        // Neue oder fehlende Spalten brechen nichts
        let knapp: [Ich] = try lies(#"[{"member_id":"m2","first_name":"Erika","neu":1}]"#)
        XCTAssertEqual(knapp.first?.name, MeinName(vorname: "Erika", nachname: ""))
    }

    func testVeranstaltungMitNull() throws {
        let e: [MitgliedEvent] = try lies("""
        [{"id":"e1","kind":"fest","status":"published","title":"Saisonabschluss","description":null,"location":"Clubhaus",
          "starts_at":"2026-11-06T18:00:00+00:00","ends_at":null,"registration_enabled":true,"registration_deadline":null,
          "max_participants":null,"companions_allowed":true,"fee_cents":null,"work_hours":null,"personen":3,"warteliste":0,
          "mein_status":null,"meine_begleitpersonen":null,"meine_bemerkung":null}]
        """)
        XCTAssertNil(e[0].endsAt)
        XCTAssertNil(e[0].workHours)
        XCTAssertEqual(Veranstaltungen.eventKartenZeit(e[0]), "Fr 19 Uhr · Clubhaus")
    }

    func testFehlerGehenDurchTranslateDbError() {
        let rpc = PostgrestError(code: "P0001", message: "Dieser Platz ist zu der Zeit bereits belegt.")
        XCTAssertEqual(Meldung.aus(rpc).text, "Dieser Platz ist zu der Zeit bereits belegt.")
        let constraint = PostgrestError(code: "23505", message: "duplicate key value violates unique constraint \"members_email_key\"")
        XCTAssertEqual(Meldung.aus(constraint).text, "Diese E-Mail-Adresse wird bereits verwendet.")
        XCTAssertEqual(Meldung.aus(URLError(.notConnectedToInternet)).text, DbFehler.verbindungsfehlerText)
        let decodierfehler = DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "The data is broken."))
        XCTAssertEqual(Meldung.aus(decodierfehler).text, DbFehler.allgemeinerFehlerText)
    }
}
