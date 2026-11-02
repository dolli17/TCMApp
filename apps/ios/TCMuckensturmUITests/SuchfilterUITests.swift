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
        app.launchArguments += ["-tcm-plaetze-ansicht", "freie-zeiten"]
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
        app.buttons["Übersicht"].tap()
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
        XCTAssertTrue(app.buttons["Folgetag"].waitForExistence(timeout: 20), "Plätze erscheint nicht")
        Thread.sleep(forTimeInterval: 1.5)
        let zeile = app.buttons.matching(NSPredicate(format: "label BEGINSWITH '17:00 Uhr'")).firstMatch
        XCTAssertTrue(zeile.waitForExistence(timeout: 20), "Zeile 17:00 fehlt")
        zeile.tap()
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
