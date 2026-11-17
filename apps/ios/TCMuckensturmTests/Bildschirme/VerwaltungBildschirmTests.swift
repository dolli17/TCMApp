import SwiftUI
import XCTest
@testable import TCMuckensturm

/// Verwaltung: Plaetze, Serien und die drei Blaetter (VerwaltungBildschirmfotoTest in apps/android).
final class VerwaltungBildschirmTests: BildschirmTestfall {
    private func attrappe() -> Attrappe {
        let a = Attrappe()
        a.setze("ich", json: Beispiel.text("ich-admin")!)
        return a
    }

    private func verwaltung(_ a: Attrappe, admin: Bool? = true) -> some View {
        let zugang = VerwaltungZugang()
        zugang.sichtbar = true
        zugang.admin = admin
        return VerwaltungBildschirm().environment(zugang).environment(a.sitzung())
    }

    func testPlaetze() async {
        let a = attrappe()
        await pruefe("verwaltung-plaetze", erwartet: ["Verwaltung", "Plätze", "Serien", "Platz 1", "Platz 8", "Platz 9", "Sandplatz"]) {
            verwaltung(a)
        }
        XCTAssertTrue(Set(a.rpcs).isSuperset(of: ["court_overview", "booking_types_aktiv", "series_overview", "day_schedule", "booking_settings"]))
    }

    func testSerien() async {
        let a = attrappe()
        await pruefe("verwaltung-serien", erwartet: ["Verwaltung", "Serien"], danach: { b in
            XCTAssertTrue(b.tippe("Serien"))
            let fehlt = await b.warteAuf(["Jugendtraining", "Herren 30"])
            XCTAssertEqual(fehlt, [])
        }) { verwaltung(a) }
    }

    func testOhneAdminRechte() async {
        let a = attrappe()
        await pruefe("verwaltung-platzwart", schemata: [.hell], erwartet: ["Verwaltung", "Platz 1"]) { verwaltung(a, admin: false) }
    }

    func testLadefehler() async {
        let a = attrappe()
        a.setze("court_overview", .fehler("42501", "permission denied for function court_overview"))
        await pruefe("verwaltung-fehler", schemata: [.dunkel], erwartet: ["Verwaltung", "Dafür fehlt dir die Berechtigung.", "Erneut versuchen"]) {
            verwaltung(a)
        }
    }

    func testLaedt() async {
        let a = attrappe()
        a.allesHaengt()
        await pruefe("verwaltung-laedt", schemata: [.hell], erwartet: ["Verwaltung"], nicht: ["Platz 1", "Erneut versuchen"]) { verwaltung(a) }
    }

    func testGrosseSchrift() async {
        let a = attrappe()
        await pruefe("verwaltung-schrift-gross", schemata: [.hell], schrift: .accessibility2, erwartet: ["Verwaltung", "Platz 1"]) { verwaltung(a) }
    }

    // MARK: - Blaetter

    private func modell(_ a: Attrappe) async -> VerwaltungModell {
        let m = VerwaltungModell(client: a.client())
        await m.laden()
        XCTAssertNil(m.fehler)
        XCTAssertEqual(m.stand?.plaetze.count, 9)
        XCTAssertEqual(m.stand?.aktivePlaetze.count, 8)
        XCTAssertEqual(m.stand?.serien.count, 2)
        XCTAssertEqual(m.stand?.blockungsarten.map(\.code), ["training", "verbandsspiel", "platzpflege"])
        XCTAssertEqual(m.stand?.oeffnung, "08:00")
        XCTAssertEqual(m.stand?.schluss, "21:00")
        return m
    }

    func testBlattSperren() async {
        let m = await modell(attrappe())
        await pruefe("verwaltung-sperren", erwartet: ["Plätze sperren", "Alle Plätze wählen", "Plätze 1", "Plätze 8", "Kategorie", "Training", "Sperren"]) {
            VerwaltungBlattInhalt(modell: m, blatt: .sperren)
        }
    }

    func testBlattSerieAnlegen() async {
        let m = await modell(attrappe())
        await pruefe("verwaltung-serie-anlegen", erwartet: ["Platz 1", "Training"]) {
            VerwaltungBlattInhalt(modell: m, blatt: .serieAnlegen)
        }
    }

    func testBlattSerie() async throws {
        let m = await modell(attrappe())
        let serie = try XCTUnwrap(m.stand?.serien.first)
        await pruefe("verwaltung-serie", erwartet: ["Jugendtraining", "Platz 8"]) {
            VerwaltungBlattInhalt(modell: m, blatt: .serie(serie))
        }
    }
}
