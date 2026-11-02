import XCTest

/**
 * Bildschirmfotos vom Buchungsblatt mit "Mitspieler gesucht" und "Nur für …"
 * (LK 10–16 · Herren). Gebucht wird nichts: das Blatt wird nur ausgefuellt.
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
        app.launch()
        try anmelden()

        app.tabBars.buttons["Plätze"].tap()
        XCTAssertTrue(app.buttons["Folgetag"].waitForExistence(timeout: 20), "Plätze erscheint nicht")
        Thread.sleep(forTimeInterval: 1.5)
        let zeile = app.buttons.matching(NSPredicate(format: "label BEGINSWITH '17:00 Uhr'")).firstMatch
        XCTAssertTrue(zeile.waitForExistence(timeout: 20), "Zeile 17:00 fehlt")
        zeile.tap()
        let buchen = app.buttons.matching(NSPredicate(format: "label ENDSWITH 'um 17:00 Uhr buchen'")).firstMatch
        XCTAssertTrue(buchen.waitForExistence(timeout: 5), "kein freier Platz um 17:00")
        buchen.tap()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Wer spielt mit?'")).firstMatch.waitForExistence(timeout: 5))

        // Mitspieler gesucht einschalten
        let schalter = app.switches.matching(NSPredicate(format: "label BEGINSWITH 'Mitspieler gesucht'")).firstMatch
        XCTAssertTrue(schalter.waitForExistence(timeout: 5))
        schalter.coordinate(withNormalizedOffset: CGVector(dx: 0.93, dy: 0.5)).tap()

        // "Nur für …" aufklappen, Herren und LK 10–16
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

        // So weit hoch, dass Schalter und Filter zusammen zu sehen sind
        app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Wer spielt mit?'")).firstMatch.swipeUp(velocity: .slow)
        foto("plaetze-suchfilter-\(suffix)")
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
