import XCTest

/**
 * Bildschirmfotos vom Buchungsblatt mit "Mitspieler gesucht" und "Nur für …"
 * (LK 10–16 · Herren). testBuchungsblattMitFilter bucht nichts, das Blatt
 * wird nur ausgefuellt; testBuchenMitFilter bucht nur mit TCM_BUCHEN=1.
 *
 * Braucht heute um 17:00 einen freien Platz (also vor 17 Uhr laufen lassen) im lokalen Stack. Ziel der
 * Bilder: TCM_SCREENSHOTS (beim Aufruf als TEST_RUNNER_TCM_SCREENSHOTS
 * setzen), TCM_DARSTELLUNG benennt sie (hell/dunkel). Nur Konfiguration
 * Lokal, nie Dev oder Prod.
 */
final class SuchfilterUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
    }

    func testBuchungsblattMitFilter() throws {
        let suffix = ProcessInfo.processInfo.environment["TCM_DARSTELLUNG"] ?? "hell"
        try blattMitFilter()
        // So weit hoch, dass Schalter und Filter zusammen zu sehen sind
        app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Wer spielt mit?'")).firstMatch.swipeUp(velocity: .slow)
        foto("plaetze-suchfilter-\(suffix)")
    }

    /**
     * Bucht wirklich (nur mit TCM_BUCHEN=1, nur lokal): Filter beim Buchen,
     * dann als Zusatz unter "Offene Spiele" und an der eigenen Buchung
     * (aus day_schedule). Zum Schluss wird die Buchung wieder storniert.
     */
    func testBuchenMitFilter() throws {
        let umgebung = ProcessInfo.processInfo.environment
        try XCTSkipUnless(umgebung["TCM_BUCHEN"] == "1", "bucht nur mit TCM_BUCHEN=1")
        let suffix = umgebung["TCM_DARSTELLUNG"] ?? "hell"
        try blattMitFilter()

        app.buttons["Platz 1 buchen"].tap()
        let blatt = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Wer spielt mit?'")).firstMatch
        XCTAssertTrue(blatt.waitForNonExistence(timeout: 10), "Buchen hat nicht geklappt")

        // Offene Spiele: die eigene Suche mit Zusatz
        app.buttons["Meine & offene Spiele"].tap()
        let zusatz = app.staticTexts.matching(NSPredicate(format: "label == 'Nur für LK 10 bis 16 · Herren'")).firstMatch
        XCTAssertTrue(zusatz.waitForExistence(timeout: 10), "Zusatz fehlt bei den offenen Spielen")
        zusatz.swipeUp(velocity: .slow)
        foto("plaetze-spiele-suchfilter-\(suffix)")

        // Eigene Buchung: der Filter kommt aus day_schedule zurueck
        app.buttons["Belegung"].tap()
        let eigene = app.buttons.matching(NSPredicate(format: "label CONTAINS 'deine Buchung'")).firstMatch
        XCTAssertTrue(eigene.waitForExistence(timeout: 10), "eigene Buchung fehlt im Raster")
        eigene.tap()
        let nurFuer = app.buttons.matching(NSPredicate(format: "label == 'Nur für, LK 10 bis 16 · Herren'")).firstMatch
        XCTAssertTrue(nurFuer.waitForExistence(timeout: 10), "Filter der Buchung fehlt")

        // Aufraeumen
        let storno = app.buttons["Buchung stornieren"]
        storno.tap()
        app.buttons["Wirklich stornieren"].tap()
        XCTAssertTrue(nurFuer.waitForNonExistence(timeout: 10), "Stornieren hat nicht geklappt")
    }

    /// Buchungsblatt heute 17:00 auf, Mitspieler gesucht, Nur für LK 10–16 · Herren.
    private func blattMitFilter() throws {
        app.launch()
        try anmelden()

        app.tabBars.buttons["Plätze"].tap()
        try tippeFrei(platz: "Platz 1", minute: 17 * 60)
        let buchen = app.buttons.matching(NSPredicate(format: "label == 'Platz 1 um 17:00 Uhr buchen'")).firstMatch
        XCTAssertTrue(buchen.waitForExistence(timeout: 5), "Platz 1 um 17:00 ist nicht frei")
        buchen.tap()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Wer spielt mit?'")).firstMatch.waitForExistence(timeout: 5))

        let schalter = app.switches.matching(NSPredicate(format: "label BEGINSWITH 'Mitspieler gesucht'")).firstMatch
        XCTAssertTrue(schalter.waitForExistence(timeout: 5))
        schalter.coordinate(withNormalizedOffset: CGVector(dx: 0.93, dy: 0.5)).tap()

        let nurFuer = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Nur für'")).firstMatch
        XCTAssertTrue(nurFuer.waitForExistence(timeout: 5), "Nur für … fehlt")
        nurFuer.tap()
        let herren = app.buttons["Herren"]
        XCTAssertTrue(herren.waitForExistence(timeout: 5))
        herren.tap()
        let raeder = app.pickerWheels
        XCTAssertTrue(raeder.element(boundBy: 1).waitForExistence(timeout: 5))
        raeder.element(boundBy: 0).adjust(toPickerWheelValue: "10,0")
        raeder.element(boundBy: 1).adjust(toPickerWheelValue: "16,0")
        XCTAssertTrue(app.staticTexts["LK 10–16 · Herren"].waitForExistence(timeout: 5))
    }

    /// Tippt im Belegungsplan auf die freie Flaeche eines Platzes, genau bei `minute`.
    private func tippeFrei(platz: String, minute: Int) throws {
        let flaechen = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "\(platz), frei von"))
        XCTAssertTrue(flaechen.firstMatch.waitForExistence(timeout: 20), "\(platz) hat keine freie Fläche")
        Thread.sleep(forTimeInterval: 1.5)
        for i in 0..<flaechen.count {
            let f = flaechen.element(boundBy: i)
            // "Platz 1, frei von 11:30 bis 21:00 Uhr"
            let zeiten = f.label.split(whereSeparator: { !$0.isNumber && $0 != ":" }).filter { $0.contains(":") }
            guard zeiten.count == 2 else { continue }
            let min = zeiten.map { z -> Int in
                let t = z.split(separator: ":").compactMap { Int($0) }
                return t.count == 2 ? t[0] * 60 + t[1] : 0
            }
            guard min[0] <= minute, minute < min[1] else { continue }
            // Etwas unter die Rasterlinie, damit der Tipp sicher im Kaestchen liegt.
            let anteil = (Double(minute - min[0]) + 8) / Double(min[1] - min[0])
            let ziel = f.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: anteil))
            // Der Plan ist hoeher als der Bildschirm: so weit rollen, bis die Uhrzeit ueber der Tab-Leiste liegt.
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

    /// Wie LokalAnmeldenUITests: mit dem Seed-Konto, falls noch keine Sitzung im Schluesselbund liegt.
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

    private func foto(_ name: String) {
        Thread.sleep(forTimeInterval: 1.2)
        let bild = XCUIScreen.main.screenshot()
        let anhang = XCTAttachment(screenshot: bild)
        anhang.name = name
        anhang.lifetime = .keepAlways
        add(anhang)
        if let ordner = ProcessInfo.processInfo.environment["TCM_SCREENSHOTS"] {
            try? bild.pngRepresentation.write(to: URL(fileURLWithPath: ordner).appendingPathComponent("\(name).png"))
        }
    }
}
