import XCTest

/**
 * Einmal durch das Onboarding mit einem lokalen Testkonto - fuer die
 * Bildschirmfotos im README und als Nachweis, dass Mandat, Freischaltung und
 * Push-Anmeldung gegen den lokalen Stack laufen.
 *
 * Schreibt in die Datenbank und schliesst das Onboarding ab. Laeuft deshalb
 * nur, wenn TCM_ONBOARDING_EMAIL gesetzt ist (beim Aufruf als
 * TEST_RUNNER_TCM_ONBOARDING_EMAIL), und nie mit den Seed-Konten neu@ und
 * kind@, die andere fuer ihre Tests brauchen. Ein frisches Konto legt man
 * wie im README beschrieben per SQL gegen den lokalen Stack an.
 * Nur Konfiguration Lokal, nie Dev oder Prod.
 */
@MainActor
final class OnboardingUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
    }

    func testRundgang() throws {
        let umgebung = ProcessInfo.processInfo.environment
        guard let email = umgebung["TCM_ONBOARDING_EMAIL"], !email.isEmpty else {
            throw XCTSkip("TCM_ONBOARDING_EMAIL fehlt - der Test schliesst ein Onboarding ab.")
        }
        guard !["neu@tcm.local", "kind@tcm.local"].contains(email) else {
            throw XCTSkip("Die Seed-Konten bleiben offen.")
        }
        let suffix = umgebung["TCM_DARSTELLUNG"] ?? "hell"

        app.launch()
        anmelden(email: email, passwort: umgebung["TCM_PASSWORT"] ?? "tcm-lokal-2026")

        // Stammdaten sind vorbelegt (wie create_member sie anlegt).
        warte(auf: "Deine Daten")
        foto("onboarding-stammdaten-\(suffix)")
        weiter("Weiter")

        warte(auf: "Satzung und Datenschutz")
        for anfang in ["Ich akzeptiere die Satzung", "Ich akzeptiere die Beitragsordnung", "Ich habe die Datenschutz"] {
            umlegen(anfang)
        }
        foto("onboarding-rechtliches-\(suffix)")
        weiter("Weiter")

        warte(auf: "Notfallkontakt")
        weiter("Überspringen")

        warte(auf: "SEPA-Lastschriftmandat")
        let iban = app.textFields["IBAN"]
        sichtbar(iban)
        iban.tap()
        iban.typeText("DE89370400440532013000")
        umlegen("Ich erteile dieses Mandat")
        foto("onboarding-sepa-\(suffix)")
        weiter("Mandat erteilen")

        // Freigeschaltet: die freiwilligen Schritte folgen.
        warte(auf: "Einwilligungen")
        XCTAssertTrue(app.staticTexts["Dein Konto ist freigeschaltet. Die nächsten Schritte sind freiwillig."].exists)
        foto("onboarding-freigeschaltet-\(suffix)")
        weiter("Überspringen")
        warte(auf: "Tennis")
        weiter("Überspringen")

        warte(auf: "App-Einstellungen")
        // Erst hier fragt das Geraet nach der Erlaubnis.
        addUIInterruptionMonitor(withDescription: "Mitteilungen") { alarm in
            for knopf in ["Erlauben", "Allow"] where alarm.buttons[knopf].exists {
                alarm.buttons[knopf].tap()
                return true
            }
            return false
        }
        umlegen("Mitteilungen aufs Handy")
        // Irgendeine Beruehrung, damit der Monitor den Systemdialog sieht - nicht mitten auf "Fertig".
        app.staticTexts["App-Einstellungen"].firstMatch.tap()
        // An heisst: Erlaubnis da, Marke von APNs, register_push_token ohne Fehler.
        let push = app.switches.matching(NSPredicate(format: "label BEGINSWITH 'Mitteilungen aufs Handy'")).firstMatch
        let an = NSPredicate(format: "value == '1'")
        XCTAssertEqual(XCTWaiter().wait(for: [expectation(for: an, evaluatedWith: push)], timeout: 25), .completed,
                       "Push-Anmeldung schlaegt fehl")
        foto("onboarding-einstellungen-\(suffix)")
        weiter("Fertig")

        let hallo = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Hallo'")).firstMatch
        XCTAssertTrue(hallo.waitForExistence(timeout: 20), "Home erscheint nicht")

        // Abmelden im Konto meldet vorher die Marke ab (remove_push_token, Sitzung.abmelden).
        app.tabBars.buttons["Konto"].tap()
        let abmelden = app.buttons["Abmelden"].firstMatch
        sichtbar(abmelden)
        abmelden.tap()
        app.alerts.buttons["Abmelden"].tap()
        XCTAssertTrue(app.textFields["E-Mail"].waitForExistence(timeout: 20), "Anmeldung erscheint nicht")
    }

    private func anmelden(email: String, passwort: String) {
        // Noch angemeldet (Sitzung im Schluesselbund): gleich weiter.
        if app.staticTexts["Deine Daten"].waitForExistence(timeout: 6) { return }
        let feld = app.textFields["E-Mail"]
        XCTAssertTrue(feld.waitForExistence(timeout: 20), "Anmeldung erscheint nicht")
        feld.tap()
        feld.typeText(email)
        let geheim = app.secureTextFields["Passwort"]
        geheim.tap()
        geheim.typeText(passwort)
        app.buttons["Anmelden"].firstMatch.tap()
        // Nach einer frischen Anmeldung fragt iOS, ob es das Passwort sichern soll.
        _ = spaeter.waitForExistence(timeout: 10)
        passwortDialogWeg()
    }

    /// "Passwort sichern?" liegt im App-Prozess und kommt mal frueher, mal spaeter.
    private var spaeter: XCUIElement {
        app.buttons.matching(NSPredicate(format: "label IN {'Später', 'Not Now'}")).firstMatch
    }

    private func passwortDialogWeg() {
        if spaeter.exists { spaeter.tap() }
    }

    private func warte(auf titel: String) {
        XCTAssertTrue(app.staticTexts[titel].firstMatch.waitForExistence(timeout: 20), "\(titel) erscheint nicht")
    }

    private func weiter(_ knopf: String) {
        let k = app.buttons[knopf].firstMatch
        sichtbar(k)
        k.tap()
    }

    /// SwiftUI-Schalter nimmt das Tippen nur rechts auf dem Knopf an.
    private func umlegen(_ anfang: String) {
        let schalter = app.switches.matching(NSPredicate(format: "label BEGINSWITH %@", anfang)).firstMatch
        XCTAssertTrue(schalter.waitForExistence(timeout: 10), "\(anfang) fehlt")
        sichtbar(schalter)
        schalter.coordinate(withNormalizedOffset: CGVector(dx: 0.93, dy: 0.5)).tap()
    }

    /// Rollt, bis das Element antippbar ist.
    private func sichtbar(_ element: XCUIElement) {
        var versuche = 0
        while !element.isHittable && versuche < 8 {
            passwortDialogWeg()
            if element.isHittable { break }
            app.swipeUp()
            versuche += 1
        }
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
