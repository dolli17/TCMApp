import XCTest

/**
 * Geht den Tab Plaetze gegen den lokalen Stack durch und legt Bildschirmfotos
 * hell und dunkel ab (README, Abschnitt Plaetze): Belegungsplan, offenes
 * Spiel, eigene Buchung, Auswahl und Buchungsblatt. Gebucht wird dabei nichts.
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
    }

    /// Hell oder dunkel stellt der Aufruf ein (`xcrun simctl ui <geraet> appearance`), TCM_DARSTELLUNG benennt die Bilder.
    func testRundgang() throws {
        let suffix = ProcessInfo.processInfo.environment["TCM_DARSTELLUNG"] ?? "hell"
        app.launch()
        try anmelden()

        app.tabBars.buttons["Plätze"].tap()
        // Die Tagesleiste: Pillen mit "Montag, 16. November"; die zweite ist morgen.
        let tage = app.buttons.matching(NSPredicate(format: "label MATCHES %@", "^[A-Za-z]+, [0-9]{2}\\. .+$"))
        XCTAssertTrue(tage.element(boundBy: 1).waitForExistence(timeout: 20), "Plätze erscheint nicht")
        tage.element(boundBy: 1).tap()

        // Belegungsplan von morgen mit allen Arten
        let eigene = app.buttons.matching(NSPredicate(format: "label CONTAINS 'deine Buchung'")).firstMatch
        XCTAssertTrue(eigene.waitForExistence(timeout: 20), "eigene Buchung fehlt im Plan")
        foto("plaetze-raster-\(suffix)")

        // Offenes Spiel: Mitspielen
        let offen = app.buttons.matching(NSPredicate(format: "label CONTAINS 'sucht noch'")).firstMatch
        XCTAssertTrue(offen.waitForExistence(timeout: 5), "offenes Spiel fehlt im Plan")
        offen.tap()
        XCTAssertTrue(app.buttons["Mitspielen"].waitForExistence(timeout: 5))
        foto("plaetze-mitspielen-\(suffix)")
        app.buttons["Schließen"].tap()

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

        // Eine freie Flaeche waehlen: die Leiste unten bietet "Buchen" an, das Blatt folgt
        let frei = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Platz 2, frei von'")).firstMatch
        XCTAssertTrue(frei.waitForExistence(timeout: 5), "Platz 2 ist nicht frei")
        frei.tap()
        let buchen = app.buttons.matching(NSPredicate(format: "label ENDSWITH 'Uhr buchen'")).firstMatch
        XCTAssertTrue(buchen.waitForExistence(timeout: 5), "Leiste „Buchen“ fehlt")
        foto("plaetze-raster-auswahl-\(suffix)")
        buchen.tap()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Wer spielt mit?'")).firstMatch.waitForExistence(timeout: 5))
        foto("plaetze-buchen-\(suffix)")
        app.buttons["Schließen"].tap()
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
