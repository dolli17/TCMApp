import XCTest

/**
 * Konto -> Mannschaft aus Sicht des Mannschaftsfuehrers gegen den lokalen
 * Stack: Kader und "Spieler hinzufügen" stehen da, die Suche zeigt
 * Kandidaten, ein Kandidat wird eingeladen (dann ausgegraut), steht unter
 * "Offene Einladungen" und wird wieder zurueckgezogen. Danach ist der Stand
 * wie vorher (bis auf die Benachrichtigungen an den Eingeladenen).
 *
 * Braucht eine Sitzung (LokalAnmeldenUITests) mit dem Seed-MF
 * `mitglied@tcm.local` ("Herren 30", supabase/seed.sql). Bilder wie in
 * KontoTennisUITests: TCM_SCREENSHOTS, TCM_DARSTELLUNG (hell/dunkel).
 * Nur Konfiguration Lokal, nie Dev oder Prod.
 */
final class KontoMannschaftUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments += ["-TCMKonto", "mannschaft"]
    }

    func testMannschaftsfuehrerLaedtEinUndZiehtZurueck() throws {
        let suffix = ProcessInfo.processInfo.environment["TCM_DARSTELLUNG"] ?? "hell"
        app.launch()

        let hinzufuegen = app.buttons["Spieler hinzufügen"]
        XCTAssertTrue(hinzufuegen.waitForExistence(timeout: 30), "Kein MF-Bildschirm (Konto mitglied@tcm.local?)")
        XCTAssertTrue(app.staticTexts["Kader"].exists, "Kader fehlt")
        XCTAssertTrue(app.staticTexts["Du bist Mannschaftsführer"].exists)
        foto("konto-mannschaft-mf-\(suffix)")

        // Suche: der erste, der sich einladen laesst
        hinzufuegen.tap()
        let einladen = app.buttons.matching(NSPredicate(format: "label ENDSWITH ' einladen'")).firstMatch
        XCTAssertTrue(einladen.waitForExistence(timeout: 15), "Keine Kandidaten")
        foto("konto-mannschaft-suche-\(suffix)")
        let name = String(einladen.label.dropLast(" einladen".count))
        einladen.tap()
        XCTAssertTrue(app.staticTexts["\(name) ist eingeladen."].waitForExistence(timeout: 10), "Meldung fehlt")

        // Zurueck: die Einladung steht unter "Offene Einladungen" und laesst sich zurueckziehen
        app.buttons["Schließen"].firstMatch.tap()
        let zurueck = app.buttons["Einladung an \(name) zurückziehen"]
        XCTAssertTrue(zurueck.waitForExistence(timeout: 15), "Offene Einladung an \(name) fehlt")
        zurueck.tap()
        XCTAssertTrue(app.staticTexts["Einladung zurückgezogen."].waitForExistence(timeout: 10), "Meldung fehlt")
        XCTAssertTrue(warteBisWeg(zurueck), "Einladung steht noch da")
    }

    private func warteBisWeg(_ element: XCUIElement) -> Bool {
        let erwartung = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: element)
        return XCTWaiter.wait(for: [erwartung], timeout: 15) == .completed
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
