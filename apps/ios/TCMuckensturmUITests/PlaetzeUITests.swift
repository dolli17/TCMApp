import XCTest

/**
 * Geht den Tab Plaetze gegen den lokalen Stack durch und legt Bildschirmfotos
 * hell und dunkel ab (README, Abschnitt Plaetze): Freie Zeiten, Raster,
 * Buchungsblatt, offenes Spiel und eigene Buchung. Gebucht wird dabei nichts.
 *
 * Erwartet die Testbuchungen aus dem README (Platz 3 sucht morgen um 17:00
 * Mitspieler, eigene Buchung morgen 18:00 auf Platz 1). Ziel der Bilder:
 * TCM_SCREENSHOTS (beim Aufruf als TEST_RUNNER_TCM_SCREENSHOTS setzen), sonst
 * nur als Anhang im Testergebnis. Nur Konfiguration Lokal, nie Dev oder Prod.
 */
final class PlaetzeUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        // Ansicht nicht aus dem letzten Lauf uebernehmen: wie beim ersten Start mit Freie Zeiten.
        app.launchArguments += ["-tcm-plaetze-ansicht", "freie-zeiten"]
    }

    /// Hell oder dunkel stellt der Aufruf ein (`xcrun simctl ui <geraet> appearance`), TCM_DARSTELLUNG benennt die Bilder.
    func testRundgang() throws {
        let suffix = ProcessInfo.processInfo.environment["TCM_DARSTELLUNG"] ?? "hell"
        app.launch()
        try anmelden()

        app.tabBars.buttons["Plätze"].tap()
        let folgetag = app.buttons["Folgetag"]
        XCTAssertTrue(folgetag.waitForExistence(timeout: 20), "Plätze erscheint nicht")

        // Freie Zeiten von morgen, eine Zeile aufgeklappt
        folgetag.tap()
        // Erst wenn der Folgetag steht - sonst greift die Suche noch die Zeile von heute.
        let morgen = app.buttons.matching(NSPredicate(format: "label ENDSWITH 'Tag wählen'")).firstMatch
        XCTAssertTrue(morgen.waitForExistence(timeout: 10))
        let tageszeile = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Morgen'")).firstMatch
        XCTAssertTrue(tageszeile.waitForExistence(timeout: 10), "Folgetag erscheint nicht")
        Thread.sleep(forTimeInterval: 1.5)
        let zeile = app.buttons.matching(NSPredicate(format: "label BEGINSWITH '17:00 Uhr'")).firstMatch
        XCTAssertTrue(zeile.waitForExistence(timeout: 20), "Zeile 17:00 fehlt")
        foto("plaetze-freie-zeiten-\(suffix)")
        zeile.tap()
        let mitspielen = app.buttons.matching(NSPredicate(format: "label CONTAINS 'mitspielen'")).firstMatch
        XCTAssertTrue(mitspielen.waitForExistence(timeout: 5))
        foto("plaetze-freie-zeiten-offen-\(suffix)")

        // Buchungsblatt fuer einen freien Platz
        app.buttons.matching(NSPredicate(format: "label ENDSWITH 'um 17:00 Uhr buchen'")).firstMatch.tap()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Wer spielt mit?'")).firstMatch.waitForExistence(timeout: 5))
        foto("plaetze-buchen-\(suffix)")
        app.buttons["Schließen"].tap()

        // Offenes Spiel: Mitspielen
        XCTAssertTrue(mitspielen.waitForExistence(timeout: 5))
        mitspielen.tap()
        XCTAssertTrue(app.buttons["Mitspielen"].waitForExistence(timeout: 5))
        foto("plaetze-mitspielen-\(suffix)")
        app.buttons["Schließen"].tap()

        // Raster mit allen Arten
        app.buttons["Übersicht"].tap()
        let eigene = app.buttons.matching(NSPredicate(format: "label CONTAINS 'deine Buchung'")).firstMatch
        XCTAssertTrue(eigene.waitForExistence(timeout: 10), "eigene Buchung fehlt im Raster")
        // An einem kommenden Tag steht das Raster auf der Oeffnung: zum Nachmittag wischen.
        let flaeche = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Platz 4, frei von'")).firstMatch
        for _ in 0..<3 where flaeche.exists { flaeche.swipeLeft() }
        foto("plaetze-raster-\(suffix)")

        // Eigene Buchung: Mitspieler und Stornieren
        eigene.tap()
        let storno = app.buttons["Buchung stornieren"]
        XCTAssertTrue(storno.waitForExistence(timeout: 5))
        foto("plaetze-eigene-buchung-\(suffix)")
        storno.tap()
        XCTAssertTrue(app.buttons["Wirklich stornieren"].waitForExistence(timeout: 5))
        foto("plaetze-stornieren-\(suffix)")
        app.buttons["Abbrechen"].tap()
        app.buttons["Schließen"].tap()

        // Eine freie Flaeche im Raster waehlen: die Leiste unten bietet "Buchen" an
        let frei = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Platz 2, frei von'")).firstMatch
        if frei.waitForExistence(timeout: 5) {
            frei.tap()
            if app.buttons["Buchen"].waitForExistence(timeout: 5) { foto("plaetze-raster-auswahl-\(suffix)") }
        }
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
        // Animationen (Blatt, Aufklappen) auslaufen lassen
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
