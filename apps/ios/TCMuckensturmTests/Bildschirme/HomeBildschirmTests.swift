import SwiftUI
import XCTest
@testable import TCMuckensturm

/// Home, Glocke und Neuigkeiten - Zustaende wie HomeBildschirmfotoTest in apps/android.
final class HomeBildschirmTests: BildschirmTestfall {
    private func home(_ a: Attrappe) -> some View {
        HomeBildschirm().environment(a.sitzung())
    }

    func testHomeVoll() async {
        let a = Attrappe()
        await pruefe("home", erwartet: [
            "Hallo, Noah", "Benachrichtigungen, 2 ungelesen", "Dein Termin: Morgen", "Platz buchen", "Getränk eintragen",
            "Jetzt frei", "Offene Spiele", "Platz 2 · Julia Stein",
        ], danach: { b in
            // Die naechste Veranstaltung steht ganz unten in der Liste.
            await b.rolle()
            let fehlt = await b.warteAuf(["Demnächst im Verein", "Plätze winterfest machen"])
            XCTAssertEqual(fehlt, [])
            await b.rolle(ansEnde: false)
        }) { home(a) }
        // Alle Abschnitte laden ueber ihre RPCs - und nichts sonst.
        XCTAssertEqual(
            Set(a.rpcs),
            ["ich", "my_bookings", "courts_aktiv", "day_schedule", "booking_settings", "booking_types_aktiv", "open_matches",
             "events_fuer_mitglied", "my_unread_notification_count"]
        )
        XCTAssertEqual(a.letzte("day_schedule")?["p_date"] as? String, Beispiel.tag(0))
    }

    func testHomeLeer() async {
        let a = Attrappe()
        for rpc in ["my_bookings", "open_matches", "events_fuer_mitglied", "day_schedule"] { a.setze(rpc, json: "[]") }
        a.setze("my_unread_notification_count", json: "0")
        await pruefe("home-leer", schemata: [.hell], erwartet: ["Hallo, Noah", "Noch nichts geplant", "Benachrichtigungen"], nicht: ["ungelesen"]) {
            home(a)
        }
    }

    /// Jeder Abschnitt zeigt seinen eigenen Fehler, der Kopf bleibt.
    func testHomeFehler() async {
        let a = Attrappe()
        a.alleRpcsScheitern("Der Server ist gerade nicht erreichbar.")
        await pruefe("home-fehler", schemata: [.dunkel], erwartet: ["Hallo", "Der Server ist gerade nicht erreichbar.", "Erneut versuchen"], nicht: ["frei bis"]) {
            home(a)
        }
    }

    func testHomeOhneNetz() async {
        let a = Attrappe()
        a.netzAus()
        await pruefe("home-ohne-netz", schemata: [.hell], erwartet: ["Hallo", DbFehler.verbindungsfehlerText]) { home(a) }
    }

    func testHomeLaedt() async {
        let a = Attrappe()
        a.allesHaengt()
        await pruefe("home-laedt", schemata: [.hell], erwartet: ["Hallo"], nicht: ["Jetzt frei", "Erneut versuchen"]) { home(a) }
    }

    func testHomeGrosseSchrift() async {
        let a = Attrappe()
        await pruefe("home-schrift-gross", schemata: [.hell], schrift: .accessibility2, erwartet: ["Hallo, Noah", "Jetzt frei"]) { home(a) }
    }

    // MARK: - Glocke

    /// Ein Tippen oeffnet das Blatt, laedt die Nachrichten und hakt sie ab.
    func testGlockeOeffnetBlatt() async {
        let a = Attrappe()
        await pruefe("glocke", erwartet: ["Benachrichtigungen, 2 ungelesen"], danach: { b in
            XCTAssertTrue(b.tippe("Benachrichtigungen, 2 ungelesen"))
            let fehlt = await b.warteAuf(["Jemand spielt mit", "Neu im Verein: Sommerfest", "Alle als gelesen"])
            XCTAssertEqual(fehlt, [])
            await b.warte { !a.aufrufe("mark_notifications_read").isEmpty }
        }) {
            Glocke().environment(a.sitzung())
        }
        XCTAssertEqual(a.letzte("my_notifications")?["p_limit"] as? Int, 30)
        XCTAssertFalse(a.aufrufe("mark_notifications_read").isEmpty, "Ungelesenes wird beim Oeffnen abgehakt")
    }

    func testGlockeMitFehler() async {
        let a = Attrappe()
        a.setze("my_notifications", .fehler("42501", "permission denied for function my_notifications"))
        await pruefe("glocke-fehler", schemata: [.hell], erwartet: ["Benachrichtigungen"], danach: { b in
            b.tippe("Benachrichtigungen", genau: false)
            let fehlt = await b.warteAuf(["Dafür fehlt dir die Berechtigung."])
            XCTAssertEqual(fehlt, [])
        }) {
            Glocke().environment(a.sitzung())
        }
        XCTAssertTrue(a.aufrufe("mark_notifications_read").isEmpty)
    }

    // MARK: - Neuigkeiten

    private func neuigkeiten(_ a: Attrappe) -> some View {
        NavigationStack { NachrichtenBildschirm() }.environment(a.sitzung())
    }

    func testNeuigkeiten() async {
        let a = Attrappe()
        await pruefe("neuigkeiten", erwartet: [
            "Neuigkeiten", "Jemand spielt mit", "Neu im Verein: Sommerfest", "Einladung in die Mannschaft Herren", "Buchung storniert",
            "Alle als gelesen",
        ]) { neuigkeiten(a) }
        XCTAssertFalse(a.aufrufe("mark_notifications_read").isEmpty)
    }

    func testNeuigkeitenLeer() async {
        let a = Attrappe()
        a.setze("my_notifications", json: "[]")
        await pruefe("neuigkeiten-leer", schemata: [.hell], erwartet: ["Neuigkeiten", "Keine Neuigkeiten."], nicht: ["Alle als gelesen"]) {
            neuigkeiten(a)
        }
        XCTAssertTrue(a.aufrufe("mark_notifications_read").isEmpty, "Ohne Ungelesenes wird nichts abgehakt")
    }

    func testNeuigkeitenFehler() async {
        let a = Attrappe()
        a.netzAus()
        await pruefe("neuigkeiten-fehler", schemata: [.dunkel], erwartet: ["Neuigkeiten", DbFehler.verbindungsfehlerText, "Erneut versuchen"]) {
            neuigkeiten(a)
        }
    }

    func testNeuigkeitenLaedt() async {
        let a = Attrappe()
        a.allesHaengt()
        await pruefe("neuigkeiten-laedt", schemata: [.hell], erwartet: ["Neuigkeiten"], nicht: ["Keine Neuigkeiten.", "Erneut versuchen"]) {
            neuigkeiten(a)
        }
    }
}
