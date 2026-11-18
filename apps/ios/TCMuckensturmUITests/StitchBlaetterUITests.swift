import XCTest

/**
 * Bildschirmfotos der Blaetter im Tab Plaetze zum Vergleich mit den Entwuerfen
 * (docs/design/stitch/screens/blatt-*): Buchen, "Mitspieler gesucht", und -
 * nur mit TCM_BUCHEN=1 - das eigene Spiel, Stornieren und, mit Platzrechten,
 * Umsetzen und Sperren. Mit TCM_BUCHEN=1 wird heute 17:00 auf Platz 2 gebucht
 * und am Ende wieder storniert.
 *
 * Braucht heute um 17:00 einen freien Platz 2 im lokalen Stack. Ziel der
 * Bilder: TCM_SCREENSHOTS (beim Aufruf als TEST_RUNNER_TCM_SCREENSHOTS
 * setzen), TCM_DARSTELLUNG benennt sie (hell/dunkel). Nur Konfiguration
 * Lokal, nie Dev oder Prod.
 */
final class StitchBlaetterUITests: XCTestCase {
    private var app: XCUIApplication!
    private var suffix = "hell"

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        suffix = ProcessInfo.processInfo.environment["TCM_DARSTELLUNG"] ?? "hell"
    }

    func testBlaetter() throws {
        let umgebung = ProcessInfo.processInfo.environment
        app.launch()
        try anmelden()
        app.tabBars.buttons["Plätze"].tap()

        // Buchen
        try tippeFrei(platz: "Platz 2", minute: 17 * 60)
        let leiste = app.buttons.matching(NSPredicate(format: "label == 'Platz 2 um 17:00 Uhr buchen'")).firstMatch
        XCTAssertTrue(leiste.waitForExistence(timeout: 5), "Platz 2 um 17:00 ist nicht frei")
        foto("plan-auswahl")
        leiste.tap()
        let buchen = app.buttons["Platz 2 buchen"]
        XCTAssertTrue(buchen.waitForExistence(timeout: 5))
        foto("blatt-platz-buchen")

        // Mit Platzrechten: stattdessen sperren - eine eigene Seite im Blatt
        let sperren = app.buttons["Stattdessen sperren"]
        if sperren.exists {
            sperren.tap()
            XCTAssertTrue(app.buttons["Sperren"].waitForExistence(timeout: 5))
            foto("blatt-sperren")
            zurueck()
        }

        let schalter = app.switches.matching(NSPredicate(format: "label BEGINSWITH 'Mitspieler gesucht'")).firstMatch
        XCTAssertTrue(schalter.waitForExistence(timeout: 5))
        schalter.coordinate(withNormalizedOffset: CGVector(dx: 0.93, dy: 0.5)).tap()
        // "Nur für …" steht unter dem Schalter; die Liste legt es erst beim Rollen an.
        let herren = app.buttons["Herren"]
        for _ in 0..<5 where !herren.exists || !herren.isHittable { schalter.swipeUp(velocity: .slow) }
        XCTAssertTrue(herren.waitForExistence(timeout: 5), "Nur für … fehlt")
        foto("blatt-platz-buchen-gesucht")

        guard umgebung["TCM_BUCHEN"] == "1" else { return }
        buchen.tap()
        XCTAssertTrue(buchen.waitForNonExistence(timeout: 10), "Buchen hat nicht geklappt")
        foto("plan-eigenes-spiel")

        app.tabBars.buttons["Home"].tap()
        foto("start-mit-termin")
        app.tabBars.buttons["Plätze"].tap()
        app.buttons["Meine & offene Spiele"].tap()
        foto("spiele-mit-termin")
        app.buttons["Belegung"].tap()

        // Eigenes Spiel
        // Genau die eben gebuchte - es kann weitere eigene Buchungen geben
        let eigene = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Platz 2, 17:00' AND label CONTAINS 'deine Buchung'")).firstMatch
        XCTAssertTrue(eigene.waitForExistence(timeout: 10), "eigene Buchung fehlt im Plan")
        eigene.tap()
        // Die Karte oeffnet halbhoch; Stornieren steht unten und entsteht erst beim Rollen.
        XCTAssertTrue(app.staticTexts["Dein Spiel"].waitForExistence(timeout: 5), "Karte erscheint nicht")
        let storno = app.buttons["Buchung stornieren"]
        ganzeHoehe()
        for _ in 0..<5 where !storno.exists || !storno.isHittable { app.staticTexts["Dein Spiel"].swipeUp(velocity: .slow) }
        XCTAssertTrue(storno.waitForExistence(timeout: 5), "Stornieren fehlt")
        foto("blatt-eigenes-spiel")

        let umsetzen = app.buttons["Umsetzen"]
        if umsetzen.exists {
            umsetzen.tap()
            XCTAssertTrue(app.buttons["Hierhin umsetzen"].waitForExistence(timeout: 5))
            foto("blatt-umsetzen")
            zurueck()
        }

        // Stornieren fragt per Action Sheet nach - und raeumt damit auf
        storno.tap()
        let wirklich = app.sheets.buttons["Buchung stornieren"].firstMatch
        XCTAssertTrue(wirklich.waitForExistence(timeout: 5))
        foto("blatt-stornieren-bestaetigen")
        wirklich.tap()
        XCTAssertTrue(storno.waitForNonExistence(timeout: 10), "Stornieren hat nicht geklappt")
    }

    /// Unterseiten im Blatt (Sperren, Umsetzen) verlaesst man ueber den Zurueck-Knopf der Leiste.
    private func zurueck() {
        let knopf = app.navigationBars.buttons["BackButton"].firstMatch
        XCTAssertTrue(knopf.waitForExistence(timeout: 5), "Zurück fehlt")
        knopf.tap()
    }

    /// Tippt im Belegungsplan auf die freie Flaeche eines Platzes, genau bei `minute`.
    private func tippeFrei(platz: String, minute: Int) throws {
        let flaechen = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "\(platz), frei von"))
        XCTAssertTrue(flaechen.firstMatch.waitForExistence(timeout: 20), "\(platz) hat keine freie Fläche")
        Thread.sleep(forTimeInterval: 1.5)
        for i in 0..<flaechen.count {
            let f = flaechen.element(boundBy: i)
            let zeiten = f.label.split(whereSeparator: { !$0.isNumber && $0 != ":" }).filter { $0.contains(":") }
            guard zeiten.count == 2 else { continue }
            let min = zeiten.map { z -> Int in
                let t = z.split(separator: ":").compactMap { Int($0) }
                return t.count == 2 ? t[0] * 60 + t[1] : 0
            }
            guard min[0] <= minute, minute < min[1] else { continue }
            let anteil = (Double(minute - min[0]) + 8) / Double(min[1] - min[0])
            let ziel = f.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: anteil))
            let unten = app.windows.firstMatch.frame.height - 220
            for _ in 0..<8 where ziel.screenPoint.y > unten {
                let mitte = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.6))
                mitte.press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.35)))
            }
            ziel.tap()
            return
        }
        XCTFail("\(platz) ist um \(minute / 60):\(String(format: "%02d", minute % 60)) nicht frei")
    }

    private func anmelden() throws {
        let tabs = app.tabBars.buttons["Plätze"]
        if tabs.waitForExistence(timeout: 8) { return }
        let umgebung = ProcessInfo.processInfo.environment
        let feld = app.textFields["E-Mail"]
        XCTAssertTrue(feld.waitForExistence(timeout: 20), "Anmeldung erscheint nicht")
        feld.tap()
        feld.typeText(umgebung["TCM_EMAIL"] ?? "mitglied@tcm.local")
        let geheim = app.secureTextFields["Passwort"]
        geheim.tap()
        geheim.typeText(umgebung["TCM_PASSWORT"] ?? "tcm-lokal-2026")
        app.buttons["Anmelden"].firstMatch.tap()
        XCTAssertTrue(tabs.waitForExistence(timeout: 30), "Tabs erscheinen nicht")
    }

    /// Die Karte einer Buchung oeffnet halbhoch: am Griff auf volle Hoehe ziehen.
    private func ganzeHoehe() {
        let griff = app.buttons["Aufzeichnungsblatt"].firstMatch
        guard griff.waitForExistence(timeout: 3) else { return }
        griff.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
            .press(forDuration: 0.1, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.05)))
    }

    private func foto(_ name: String) {
        Thread.sleep(forTimeInterval: 1.2)
        let bild = XCUIScreen.main.screenshot()
        let anhang = XCTAttachment(screenshot: bild)
        anhang.name = "\(name)-\(suffix)"
        anhang.lifetime = .keepAlways
        add(anhang)
        if let ordner = ProcessInfo.processInfo.environment["TCM_SCREENSHOTS"] {
            try? bild.pngRepresentation.write(to: URL(fileURLWithPath: ordner).appendingPathComponent("\(name)-\(suffix).png"))
        }
    }
}
