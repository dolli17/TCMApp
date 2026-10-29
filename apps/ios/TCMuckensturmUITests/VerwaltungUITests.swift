import XCTest

/**
 * Bilder fuer das README: die Veranstaltung im Detail, oben und gescrollt -
 * dann steht der Titel klein in der Leiste. Erwartet eine angemeldete Sitzung
 * (LokalAnmeldenUITests) und die Seed-Veranstaltung "Saisonabschlussfest"
 * (TCM_VERANSTALTUNG fuer eine andere Id). Ziel der Bilder: TCM_SCREENSHOTS
 * (beim Aufruf als TEST_RUNNER_TCM_SCREENSHOTS setzen), sonst nur als
 * Anhang. Aendert nichts. Nur Konfiguration Lokal, nie Dev oder Prod.
 */
final class VerwaltungUITests: XCTestCase {
    func testVeranstaltungKompakterTitel() throws {
        let umgebung = ProcessInfo.processInfo.environment
        let id = umgebung["TCM_VERANSTALTUNG"] ?? "a1000000-0000-4000-8000-00000000f001"
        let endung = umgebung["TCM_DARSTELLUNG"] ?? "hell"

        let app = XCUIApplication()
        app.launchArguments += ["-TCMTab", "verein", "-TCMVerein", id]
        app.launch()

        let wann = app.staticTexts["Wann"]
        XCTAssertTrue(wann.waitForExistence(timeout: 20), "Detail erscheint nicht")
        bild(app, "verein-veranstaltung-oben-\(endung)")

        app.swipeUp(velocity: .slow)
        sleep(1)
        bild(app, "verein-veranstaltung-gescrollt-\(endung)")
    }

    private func bild(_ app: XCUIApplication, _ name: String) {
        let bild = app.screenshot()
        let anhang = XCTAttachment(screenshot: bild)
        anhang.name = name
        anhang.lifetime = .keepAlways
        add(anhang)
        if let ordner = ProcessInfo.processInfo.environment["TCM_SCREENSHOTS"] {
            try? bild.pngRepresentation.write(to: URL(fileURLWithPath: ordner).appendingPathComponent("\(name).png"))
        }
    }
}
