import XCTest

/**
 * Konto, Bereich "Tennis" gegen den lokalen Stack: falsche LK steht am Feld,
 * Speichern zeigt "Gespeichert." und die Uebersicht, LK und nuLiga-ID leeren
 * laesst das Mannschaftsinteresse stehen (save_my_tennis bekommt immer alle
 * drei Werte). Zum Schluss sind alle Angaben wieder leer.
 *
 * Braucht eine Sitzung (LokalAnmeldenUITests, TCM_EMAIL) mit einem Konto
 * ohne Tennis-Angaben. Bilder wie in SuchfilterUITests: TCM_SCREENSHOTS,
 * TCM_DARSTELLUNG (hell/dunkel). Nur Konfiguration Lokal, nie Dev oder Prod.
 */
final class KontoTennisUITests: XCTestCase {
    private var app: XCUIApplication!
    private let lkFeld = "LK oder geschätzte LK"
    private let lkFehler = "Bitte eine LK zwischen 1 und 25 eingeben, höchstens eine Nachkommastelle (etwa 14,5)."

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments += ["-TCMTab", "konto", "-TCMKontoRollen", "einstellungen"]
    }

    func testTennisPflegen() throws {
        let suffix = ProcessInfo.processInfo.environment["TCM_DARSTELLUNG"] ?? "hell"
        app.launch()
        let eintrag = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Tennis'")).firstMatch
        XCTAssertTrue(eintrag.waitForExistence(timeout: 30), "Eintrag Tennis fehlt")
        XCTAssertTrue(eintrag.label.contains("Noch keine Angaben"), "Konto hat schon Tennis-Angaben: \(eintrag.label)")

        // Falsche LK: der Fehler steht am Feld
        eintrag.tap()
        let lk = app.textFields[lkFeld]
        XCTAssertTrue(lk.waitForExistence(timeout: 10), "Blatt Tennis erscheint nicht")
        XCTAssertTrue(app.staticTexts["Die LK bestimmt, welche Mitspielersuchen du siehst."].exists)
        lk.tap()
        lk.typeText("30")
        app.buttons["Speichern"].firstMatch.tap()
        XCTAssertTrue(app.staticTexts[lkFehler].waitForExistence(timeout: 10), "Fehler an der LK fehlt")

        // Richtig ausgefuellt
        leeren(lk)
        lk.typeText("14.5")
        let nuliga = app.textFields["nuLiga-ID"]
        nuliga.tap()
        nuliga.typeText("12345678")
        XCTAssertFalse(app.staticTexts[lkFehler].exists, "Fehler bleibt nach dem Tippen stehen")
        let schalter = app.switches["Interesse an einer Mannschaft"]
        schalter.coordinate(withNormalizedOffset: CGVector(dx: 0.93, dy: 0.5)).tap()
        XCTAssertEqual(schalter.value as? String, "1")
        app.textFields["nuLiga-ID"].typeText("\n")  // Tastatur weg
        foto("konto-tennis-\(suffix)")

        app.buttons["Speichern"].firstMatch.tap()
        XCTAssertTrue(app.staticTexts["Gespeichert."].waitForExistence(timeout: 10), "Meldung fehlt")
        XCTAssertTrue(
            warte(auf: eintrag, enthaelt: "LK14,5 · nuLiga 12345678 · Interesse an Mannschaft"),
            "Übersicht stimmt nicht: \(eintrag.label)"
        )
        foto("konto-tennis-uebersicht-\(suffix)")

        // LK und nuLiga-ID leeren: das Interesse bleibt
        eintrag.tap()
        XCTAssertTrue(lk.waitForExistence(timeout: 10))
        XCTAssertEqual(lk.value as? String, "LK14,5")
        leeren(lk)
        leeren(app.textFields["nuLiga-ID"])
        app.buttons["Speichern"].firstMatch.tap()
        XCTAssertTrue(warte(auf: eintrag, enthaelt: "Tennis, Interesse an Mannschaft"), "Übersicht: \(eintrag.label)")

        // Aufraeumen: Interesse aus
        eintrag.tap()
        XCTAssertTrue(schalter.waitForExistence(timeout: 10))
        XCTAssertEqual(schalter.value as? String, "1")
        schalter.coordinate(withNormalizedOffset: CGVector(dx: 0.93, dy: 0.5)).tap()
        app.buttons["Speichern"].firstMatch.tap()
        XCTAssertTrue(warte(auf: eintrag, enthaelt: "Noch keine Angaben"), "Übersicht: \(eintrag.label)")
    }

    private func leeren(_ feld: XCUIElement) {
        feld.tap()
        let laenge = (feld.value as? String)?.count ?? 0
        feld.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: laenge + 2))
    }

    private func warte(auf element: XCUIElement, enthaelt text: String) -> Bool {
        let erwartung = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label CONTAINS %@", text), object: element)
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
