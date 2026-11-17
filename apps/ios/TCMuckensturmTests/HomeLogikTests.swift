import XCTest
@testable import TCMuckensturm

/// Texte und Auswahl von Home, Glocke und Neuigkeiten (HomeLogik) - wie home.tsx und Glocke.tsx.
final class HomeLogikTests: XCTestCase {
    private let jetzt = Zeit.datum("2026-09-28T12:00:00Z")!

    private func buchung(players: [String?]?, owner: String? = "Max", bucher: Bool? = nil) throws -> MeineBuchung {
        let json: [String: Any?] = [
            "booking_id": "b1", "starts_at": "2026-09-28T15:00:00Z", "ends_at": "2026-09-28T16:00:00Z",
            "court_name": "Platz 3", "owner_name": owner, "bin_bucher": bucher, "players": players,
        ]
        let daten = try JSONSerialization.data(withJSONObject: json.mapValues { $0 ?? NSNull() })
        return try JSONDecoder().decode(MeineBuchung.self, from: daten)
    }

    func testTitel() {
        XCTAssertEqual(HomeLogik.titel(vorname: "Max"), "Hallo, Max")
        XCTAssertEqual(HomeLogik.titel(vorname: ""), "Hallo")
        XCTAssertEqual(HomeLogik.titel(vorname: nil), "Hallo")
    }

    func testTerminkarte() throws {
        XCTAssertEqual(HomeLogik.mitText(try buchung(players: ["Max", "Erika", "Jonas"])), "mit Erika, Jonas")
        XCTAssertEqual(HomeLogik.mitText(try buchung(players: ["Max"], bucher: true)), "Du hast gebucht")
        XCTAssertEqual(HomeLogik.mitText(try buchung(players: [], bucher: false)), "von Max")
        let t = try buchung(players: nil)
        XCTAssertEqual(HomeLogik.zeitSpanne(t), "17:00 – 18:00")
        XCTAssertEqual(HomeLogik.terminLabel(t, jetzt: jetzt), "Dein Termin: Heute · in 3 Stunden, 17:00 – 18:00, Platz 3 · von Max")
        // Kicker links, gelber Marker rechts
        XCTAssertEqual(HomeLogik.terminKicker(t, jetzt: jetzt).tag, "Heute")
        XCTAssertEqual(HomeLogik.terminKicker(t, jetzt: jetzt).wann, "in 3 Stunden")
        XCTAssertEqual(HomeLogik.terminOrt(try buchung(players: ["Max", "Erika"])), "Platz 3 · mit Erika")
        XCTAssertNil(HomeLogik.weitereTermine(0))
        XCTAssertEqual(HomeLogik.weitereTermine(1), "und 1 weiterer Termin")
        XCTAssertEqual(HomeLogik.weitereTermine(3), "und 3 weitere Termine")
        XCTAssertEqual(HomeLogik.eigeneBuchungen([try buchung(players: nil, bucher: true), try buchung(players: nil)]), ["b1"])
    }

    func testJetztFrei() throws {
        let belegung = try JSONDecoder().decode([TagesBelegung].self, from: Data("""
        [{"booking_id":"x","court_id":"c1","starts_at":"2026-09-28T14:00:00Z","ends_at":"2026-09-28T15:00:00Z","kind":"booking"}]
        """.utf8))
        let plaetze = try JSONDecoder().decode([AktiverPlatz].self, from: Data(#"[{"id":"c1","name":"Platz 1"},{"id":"c2","name":"Platz 2"}]"#.utf8))
        let einstellungen = try JSONDecoder().decode(Buchungseinstellungen.self, from: Data(
            #"{"opening_time":"08:00:00","closing_time":"21:00:00","slot_minutes":30,"lead_days":7}"#.utf8
        ))
        let d = FreiDaten(heute: "2026-09-28", plaetze: plaetze, belegung: belegung, einstellungen: einstellungen, dauer: 60)
        let karten = HomeLogik.jetztFreiKarten(d, jetzt: jetzt)
        // 14:00 Berlin: Platz 2 frei bis Schluss, Platz 1 bis 16:00 (Belegung 16-17 Uhr)
        XCTAssertEqual(karten.map(\.name), ["Platz 2", "Platz 1"])
        XCTAssertEqual(karten.map(\.bis), ["21:00", "16:00"])
        XCTAssertEqual(HomeLogik.freiZaehler(karten.count), "2 Plätze")
        XCTAssertEqual(HomeLogik.freiZaehler(1), "1 Platz")
    }

    func testGlockeUndNachrichten() throws {
        XCTAssertEqual(HomeLogik.glockenZahl(3), "3")
        XCTAssertEqual(HomeLogik.glockenZahl(12), "9+")
        XCTAssertEqual(HomeLogik.glockenLabel(0), "Benachrichtigungen")
        XCTAssertEqual(HomeLogik.glockenLabel(2), "Benachrichtigungen, 2 ungelesen")

        let liste = try JSONDecoder().decode([Benachrichtigung].self, from: Data("""
        [{"id":"n1","title":"Storniert","body":"Platz 1 um 17 Uhr","created_at":"2026-09-28T11:55:00Z","read_at":null}]
        """.utf8))
        XCTAssertEqual(HomeLogik.nachrichtLabel(liste[0], neu: true, jetzt: jetzt), "Neu: Storniert. Platz 1 um 17 Uhr. vor 5 Min.")
        XCTAssertTrue(HomeLogik.zeigeAlleGelesen(liste, alleGesehen: false))
        XCTAssertFalse(HomeLogik.zeigeAlleGelesen(liste, alleGesehen: true))
        XCTAssertFalse(HomeLogik.zeigeAlleGelesen(nil, alleGesehen: false))
    }

    func testInitialenUndJsZahl() {
        XCTAssertEqual(HomeLogik.initialen(MeinName(vorname: "max", nachname: "muster")), "MM")
        XCTAssertEqual(HomeLogik.initialen(nil), "")
        XCTAssertEqual(HomeLogik.jsZahl(3), "3")
        XCTAssertEqual(HomeLogik.jsZahl(2.5), "2,5")
    }
}
