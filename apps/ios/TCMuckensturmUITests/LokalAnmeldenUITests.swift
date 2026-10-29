import XCTest

/**
 * Meldet die App im Simulator mit dem Seed-Konto des lokalen Stacks an
 * (supabase/seed.sql) und wartet auf Home. Die Sitzung bleibt danach im
 * Schluesselbund - so lassen sich Screenshots per `xcrun simctl` machen,
 * ohne den Simulator von Hand zu bedienen (README, Abschnitt Screenshots).
 *
 * Nur gegen den lokalen Stack (Konfiguration Lokal), nie gegen Dev oder Prod.
 */
final class LokalAnmeldenUITests: XCTestCase {
    func testMitSeedKontoAnmelden() throws {
        let umgebung = ProcessInfo.processInfo.environment
        let email = umgebung["TCM_EMAIL"] ?? "mitglied@tcm.local"
        let passwort = umgebung["TCM_PASSWORT"] ?? "tcm-lokal-2026"

        let app = XCUIApplication()
        app.launch()

        let hallo = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Hallo'")).firstMatch
        if hallo.waitForExistence(timeout: 5) { return }

        let feld = app.textFields["E-Mail"]
        XCTAssertTrue(feld.waitForExistence(timeout: 20), "Anmeldung erscheint nicht")
        feld.tap()
        feld.typeText(email)
        let geheim = app.secureTextFields["Passwort"]
        geheim.tap()
        geheim.typeText(passwort)
        app.buttons["Anmelden"].firstMatch.tap()

        XCTAssertTrue(hallo.waitForExistence(timeout: 30), "Home erscheint nicht")
    }
}
