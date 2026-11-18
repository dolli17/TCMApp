import SwiftUI
import XCTest
@testable import TCMuckensturm

/// Plaetze: Belegung, Spiele und das Buchungsblatt in seinen Formen (PlaetzeBildschirmfotoTest in apps/android).
final class PlaetzeBildschirmTests: BildschirmTestfall {
    private func plaetze(_ a: Attrappe, _ sicht: PlaetzeSicht = .belegung, offeneZuerst: Bool = false) -> some View {
        let zustand = PlaetzeZustand()
        zustand.sicht = sicht
        zustand.offeneZuerst = offeneZuerst
        return PlaetzeBildschirm().environment(zustand).environment(a.sitzung())
    }

    // MARK: - Belegung

    func testBelegung() async {
        let a = Attrappe()
        await pruefe("plaetze-raster", erwartet: ["Plätze", "Belegung", "Meine & offene Spiele", "Platz 1", "Platz 8", "Jugendtraining", "Linien erneuern", "Kontingent: 1 von 3"]) {
            plaetze(a)
        }
        XCTAssertEqual(
            Set(a.rpcs),
            // Die Glocke steht nur auf Home: ohne my_unread_notification_count.
            ["courts_aktiv", "day_schedule", "my_booking_quota", "booking_settings", "booking_types_aktiv", "member_directory", "ich"]
        )
        XCTAssertEqual(a.letzte("member_directory")?["p_query"] as? String, "")
        XCTAssertEqual(Set(a.aufrufe("booking_types_aktiv").compactMap { $0.text("p_applies_to") }), ["booking", "blocking"])
    }

    func testBelegungLeer() async {
        let a = Attrappe()
        a.setze("day_schedule", json: "[]")
        await pruefe("plaetze-raster-leer", schemata: [.hell], erwartet: ["Plätze", "Platz 1"], nicht: ["Jugendtraining"]) { plaetze(a) }
    }

    func testBelegungFehler() async {
        let a = Attrappe()
        a.setze("day_schedule", .fehler("P0001", "Der Plan ist gerade nicht lesbar."))
        await pruefe("plaetze-raster-fehler", schemata: [.dunkel], erwartet: ["Plätze", "Der Plan ist gerade nicht lesbar.", "Erneut versuchen"]) {
            plaetze(a)
        }
    }

    func testBelegungLaedt() async {
        let a = Attrappe()
        a.allesHaengt()
        await pruefe("plaetze-raster-laedt", schemata: [.hell], erwartet: ["Plätze"], nicht: ["Platz 1", "Erneut versuchen"]) { plaetze(a) }
    }

    func testBelegungGrosseSchrift() async {
        let a = Attrappe()
        await pruefe("plaetze-schrift-gross", schemata: [.hell], schrift: .accessibility2, erwartet: ["Plätze", "Platz 1"]) { plaetze(a) }
    }

    // MARK: - Spiele

    func testSpiele() async {
        let a = Attrappe()
        await pruefe("plaetze-spiele", erwartet: ["Plätze", "Platz 3", "Platz 5", "Julia Stein", "Mitspielen"]) { plaetze(a, .spiele) }
        XCTAssertEqual(Set(a.rpcs), ["ich", "my_bookings", "open_matches"])
    }

    func testSpieleOffeneZuerst() async {
        let a = Attrappe()
        await pruefe("plaetze-spiele-offen", schemata: [.hell], erwartet: ["Julia Stein"]) { plaetze(a, .spiele, offeneZuerst: true) }
    }

    func testSpieleLeer() async {
        let a = Attrappe()
        a.setze("my_bookings", json: "[]")
        a.setze("open_matches", json: "[]")
        await pruefe("plaetze-spiele-leer", schemata: [.hell], erwartet: ["Plätze"], nicht: ["Julia Stein"]) { plaetze(a, .spiele) }
    }

    func testSpieleFehler() async {
        let a = Attrappe()
        a.netzAus()
        await pruefe("plaetze-spiele-fehler", schemata: [.dunkel], erwartet: ["Plätze", DbFehler.verbindungsfehlerText]) { plaetze(a, .spiele) }
    }

    // MARK: - Buchungsblatt

    /// Ein geladenes Modell fuer morgen - dann liegt kein Termin in der Vergangenheit.
    private func modell(_ a: Attrappe, platzrechte: Bool = false) async -> PlaetzeModell {
        if platzrechte { a.setze("ich", json: Beispiel.text("ich-admin")!) }
        let m = PlaetzeModell(client: a.client())
        m.datum = Beispiel.tag(1)
        await m.laden()
        XCTAssertNil(m.ladeFehler)
        XCTAssertEqual(m.plaetze.count, 8)
        XCTAssertEqual(m.darfPlaetze, platzrechte)
        return m
    }

    private func belegung(_ m: PlaetzeModell, _ endung: String) throws -> TagesBelegung {
        try XCTUnwrap(m.belegung.first { $0.bookingId.hasSuffix(endung) }, "Belegung …\(endung) fehlt")
    }

    private func blatt(
        _ name: String, _ m: PlaetzeModell, _ fenster: Fenster, erwartet: [String], nicht: [String] = [],
        schemata: [Schema] = Schema.allCases
    ) async {
        await pruefe(name, schemata: schemata, erwartet: erwartet, nicht: nicht) { Buchungsblatt(modell: m, fenster: fenster) }
    }

    func testBlattBuchen() async throws {
        let m = await modell(Attrappe())
        m.buchenAuf(m.plaetze[4], minute: 10 * 60)
        let fenster = try XCTUnwrap(m.fenster)
        await blatt("plaetze-buchen", m, fenster, erwartet: ["Platz 5", "Einzel", "Doppel", "Platz 5 buchen"])
    }

    func testBlattBuchenMitPlatzrechten() async throws {
        let m = await modell(Attrappe(), platzrechte: true)
        m.buchenAuf(m.plaetze[4], minute: 10 * 60)
        let fenster = try XCTUnwrap(m.fenster)
        await blatt("plaetze-buchen-platzrechte", m, fenster, erwartet: ["Platz 5", "Stattdessen sperren"], schemata: [.hell])
    }

    /// Kontingent aufgebraucht: statt des Blatts erscheint der Hinweis.
    func testBuchenOhneKontingent() async {
        let a = Attrappe()
        a.setze("my_booking_quota", json: #"[{"used":3,"allowed":3}]"#)
        let m = await modell(a)
        m.buchenAuf(m.plaetze[4], minute: 10 * 60)
        XCTAssertNil(m.fenster)
        XCTAssertEqual(m.meldung?.text, PlaetzeLogik.kontingentAusText)
    }

    func testBlattEigeneBuchung() async throws {
        let m = await modell(Attrappe())
        let b = try belegung(m, "0001")
        await blatt("plaetze-eigene-buchung", m, .verwalten(belegung: b, platzName: "Platz 1", tag: m.datum), erwartet: ["Platz 1", "Dein Spiel", "Erika Sommer", "Bearbeiten", "Buchung stornieren"],
            // Der Bucher steht als "Du" oben, nicht noch einmal unter den Mitspielern.
            nicht: ["Noah Brandt"])
    }

    /// Fremdes Spiel, das Mitspieler sucht.
    func testBlattMitspielen() async throws {
        let m = await modell(Attrappe())
        let b = try belegung(m, "0002")
        XCTAssertTrue(m.oeffnebar(b))
        await blatt("plaetze-mitspielen", m, .verwalten(belegung: b, platzName: "Platz 2", tag: m.datum), erwartet: ["Platz 2", "Julia Stein", "Mitspielen"], schemata: [.hell])
    }

    /// Als Mitspieler in einer fremden Buchung.
    func testBlattAlsMitspieler() async throws {
        let m = await modell(Attrappe())
        let b = try belegung(m, "0004")
        await blatt("plaetze-als-mitspieler", m, .verwalten(belegung: b, platzName: "Platz 4", tag: m.datum), erwartet: ["Platz 4", "Uwe Engel"], schemata: [.dunkel])
    }

    func testBlattSperrung() async throws {
        let m = await modell(Attrappe(), platzrechte: true)
        let b = try belegung(m, "0003")
        await blatt("plaetze-sperrung", m, .verwalten(belegung: b, platzName: "Platz 3", tag: m.datum), erwartet: ["Platz 3", "Linien erneuern", "Platzpflege"])
    }

    /// Ein Serientermin (Training) mit Platzrechten.
    func testBlattSerientermin() async throws {
        let m = await modell(Attrappe(), platzrechte: true)
        let b = try XCTUnwrap(m.belegung.first { $0.seriesId != nil })
        await blatt("plaetze-serientermin", m, .verwalten(belegung: b, platzName: "Platz 8", tag: m.datum), erwartet: ["Platz 8", "Jugendtraining"], schemata: [.hell])
    }

    /// Fremde Buchung mit Platzrechten: Umsetzen und Stornieren mit Grund.
    func testBlattFremdeBuchungMitPlatzrechten() async throws {
        let m = await modell(Attrappe(), platzrechte: true)
        let b = try belegung(m, "0002")
        await blatt("plaetze-fremde-buchung", m, .verwalten(belegung: b, platzName: "Platz 2", tag: m.datum), erwartet: ["Platz 2", "Julia Stein", "Umsetzen"])
    }

    /// Schlaegt eine Aktion fehl, steht der Satz der Datenbank im Blatt.
    func testBlattZeigtFehlerDerAktion() async throws {
        let a = Attrappe()
        let m = await modell(a)
        let b = try belegung(m, "0001")
        a.setze("cancel_booking", .fehler("P0002", "Diese Buchung gibt es nicht.", status: 500))
        m.fenster = .verwalten(belegung: b, platzName: "Platz 1", tag: m.datum)
        await m.stornieren(b.bookingId, grund: "")
        XCTAssertEqual(m.fensterFehler, "Diese Buchung gibt es nicht.")
        XCTAssertNotNil(m.fenster, "Das Blatt bleibt offen")
        await blatt("plaetze-aktion-fehler", m, try XCTUnwrap(m.fenster), erwartet: ["Diese Buchung gibt es nicht."], schemata: [.hell])
    }
}
