import SwiftUI
import XCTest
@testable import TCMuckensturm

/// Verein: Getraenke, Veranstaltungen und das Detail (VereinBildschirmfotoTest in apps/android).
final class VereinBildschirmTests: BildschirmTestfall {
    private func verein(_ a: Attrappe, _ zustand: VereinZustand = VereinZustand()) -> some View {
        VereinBildschirm().environment(zustand).environment(a.sitzung())
    }

    // MARK: - Getraenke

    func testGetraenke() async {
        let a = Attrappe()
        await pruefe("verein-getraenke", erwartet: ["Verein", "Getränke", "Veranstaltungen", "Wasser still", "Apfelschorle"]) { verein(a) }
        XCTAssertEqual(Set(a.rpcs), ["drink_menu", "my_drink_purchases", "drink_void_window_minutes", "my_unread_notification_count"])
    }

    /// Zwei Artikel im Korb: unten steht die Leiste mit Summe und "Eintragen".
    func testGetraenkeMitKorb() async throws {
        let a = Attrappe()
        let karte: [Getraenk] = try JSONDecoder().decode([Getraenk].self, from: Beispiel.daten("drink_menu"))
        let zustand = VereinZustand()
        zustand.karte = karte
        zustand.korb = [karte[0].id: 2, karte[1].id: 1]
        let summe = Geld.formatCents(Getraenke.basketSummary(karte, zustand.korb).totalCents)
        await pruefe("verein-getraenke-korb", erwartet: ["Wasser still", summe]) { verein(a, zustand) }
    }

    func testGetraenkeLeer() async {
        let a = Attrappe()
        a.setze("drink_menu", json: "[]")
        a.setze("my_drink_purchases", json: "[]")
        await pruefe("verein-getraenke-leer", schemata: [.hell], erwartet: ["Verein"], nicht: ["Wasser still"]) { verein(a) }
    }

    func testGetraenkeFehler() async {
        let a = Attrappe()
        a.netzAus()
        await pruefe("verein-getraenke-fehler", schemata: [.dunkel], erwartet: ["Verein", DbFehler.verbindungsfehlerText, "Erneut versuchen"]) {
            verein(a)
        }
    }

    func testGetraenkeLaedt() async {
        let a = Attrappe()
        a.allesHaengt()
        await pruefe("verein-getraenke-laedt", schemata: [.hell], erwartet: ["Verein"], nicht: ["Wasser still", "Erneut versuchen"]) { verein(a) }
    }

    // MARK: - Veranstaltungen

    private func liste() -> VereinZustand {
        let z = VereinZustand()
        z.reiter = .veranstaltungen
        return z
    }

    func testVeranstaltungen() async {
        let a = Attrappe()
        let z = liste()
        await pruefe("verein-veranstaltungen", erwartet: ["Verein", "Sommerfest", "Plätze winterfest machen", "Weihnachtsfeier", "Mitgliederversammlung"]) {
            verein(a, z)
        }
        XCTAssertEqual(Set(a.rpcs), ["events_fuer_mitglied", "my_unread_notification_count"])
    }

    func testVeranstaltungenLeer() async {
        let a = Attrappe()
        a.setze("events_fuer_mitglied", json: "[]")
        let z = liste()
        await pruefe("verein-veranstaltungen-leer", schemata: [.hell], erwartet: ["Gerade ist nichts geplant."]) { verein(a, z) }
    }

    func testVeranstaltungenFehler() async {
        let a = Attrappe()
        a.alleRpcsScheitern("Die Veranstaltungen sind gerade nicht erreichbar.")
        let z = liste()
        await pruefe("verein-veranstaltungen-fehler", schemata: [.dunkel], erwartet: ["Die Veranstaltungen sind gerade nicht erreichbar.", "Erneut versuchen"]) {
            verein(a, z)
        }
    }

    func testVeranstaltungenGrosseSchrift() async {
        let a = Attrappe()
        let z = liste()
        await pruefe("verein-schrift-gross", schemata: [.hell], schrift: .accessibility2, erwartet: ["Sommerfest"]) { verein(a, z) }
    }

    // MARK: - Detail

    private func detail(_ id: String, _ a: Attrappe) -> some View {
        NavigationStack { VeranstaltungBildschirm(id: id) }.environment(a.sitzung())
    }

    /// Angemeldet mit Begleitung, Bemerkung und offener Forderung.
    func testVeranstaltungAngemeldet() async {
        let a = Attrappe()
        let id = "e0000000-0000-4000-8000-000000000001"
        await pruefe("verein-veranstaltung", erwartet: ["Sommerfest", "Clubhaus", "Mit Grill und Musik. Salate bitte mitbringen."]) {
            detail(id, a)
        }
        XCTAssertEqual(a.aufrufe("events_fuer_mitglied").last?.abfrage, "id=eq.\(id)")
        XCTAssertEqual(a.letzte("event_mein_wartelistenplatz")?["p_event_id"] as? String, id)
    }

    func testVeranstaltungArbeitsdienstAnmelden() async {
        let a = Attrappe()
        await pruefe("verein-arbeitsdienst", schemata: [.hell], erwartet: ["Plätze winterfest machen", "Anlage"]) {
            detail("e0000000-0000-4000-8000-000000000002", a)
        }
    }

    func testVeranstaltungWarteliste() async {
        let a = Attrappe()
        await pruefe("verein-warteliste", schemata: [.dunkel], erwartet: ["Weihnachtsfeier", "Warteliste"]) {
            detail("e0000000-0000-4000-8000-000000000003", a)
        }
    }

    func testVeranstaltungOhneAnmeldung() async {
        let a = Attrappe()
        await pruefe("verein-versammlung", schemata: [.hell], erwartet: ["Mitgliederversammlung"]) {
            detail("e0000000-0000-4000-8000-000000000004", a)
        }
    }

    func testVeranstaltungAbgesagt() async {
        let a = Attrappe()
        await pruefe("verein-abgesagt", schemata: [.hell], erwartet: ["Schleifchenturnier"]) {
            detail("e0000000-0000-4000-8000-000000000006", a)
        }
    }

    func testVeranstaltungGibtEsNicht() async {
        let a = Attrappe()
        await pruefe("verein-veranstaltung-fehlt", schemata: [.hell], erwartet: ["Diese Veranstaltung gibt es nicht (mehr)."]) {
            detail("00000000-0000-4000-8000-00000000dead", a)
        }
    }

    func testVeranstaltungFehler() async {
        let a = Attrappe()
        a.netzAus()
        await pruefe("verein-veranstaltung-fehler", schemata: [.dunkel], erwartet: [DbFehler.verbindungsfehlerText]) {
            detail("e0000000-0000-4000-8000-000000000001", a)
        }
    }
}
