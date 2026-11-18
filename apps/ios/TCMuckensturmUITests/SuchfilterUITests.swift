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
        // Schalter und Filter stehen nach blattMitFilter() zusammen im Bild.
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

        let buchen = app.buttons["Platz 1 buchen"]
        buchen.tap()
        XCTAssertTrue(buchen.waitForNonExistence(timeout: 10), "Buchen hat nicht geklappt")

        // Offene Spiele: die eigene Suche mit Zusatz
        app.buttons["Meine & offene Spiele"].tap()
        let zusatz = app.staticTexts.matching(NSPredicate(format: "label == 'Nur für LK 10 bis 16 · Herren'")).firstMatch
        XCTAssertTrue(zusatz.waitForExistence(timeout: 10), "Zusatz fehlt bei den offenen Spielen")
        // In der Bildschirmmitte rollen: auf dem Zusatz selbst begaenne die Geste womoeglich
        // auf der Tab-Leiste und tippte dort "Home".
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.6))
            .press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.4)))
        foto("plaetze-spiele-suchfilter-\(suffix)")

        // Eigene Buchung: der Filter kommt aus day_schedule zurueck
        app.buttons["Belegung"].tap()
        // Genau die eben gebuchte - es kann weitere eigene Buchungen geben
        let eigene = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Platz 1, 17:00' AND label CONTAINS 'deine Buchung'")).firstMatch
        XCTAssertTrue(eigene.waitForExistence(timeout: 10), "eigene Buchung fehlt im Raster")
        eigene.tap()
        // Die Karte oeffnet halbhoch; was weiter unten steht, entsteht erst beim Rollen.
        let karte = app.staticTexts["Dein Spiel"]
        XCTAssertTrue(karte.waitForExistence(timeout: 5), "Karte erscheint nicht")
        // Unter "Details" steht der Filter neben "Mitspieler gesucht".
        let nurFuer = app.staticTexts["LK 10–16 · Herren"]
        ganzeHoehe()
        for _ in 0..<5 where !nurFuer.exists { karte.swipeUp(velocity: .slow) }
        XCTAssertTrue(nurFuer.waitForExistence(timeout: 10), "Filter der Buchung fehlt")

        // Aufraeumen: Stornieren fragt per Action Sheet nach
        let storno = app.buttons["Buchung stornieren"]
        for _ in 0..<5 where !storno.isHittable { nurFuer.swipeUp(velocity: .slow) }
        storno.tap()
        app.sheets.buttons["Buchung stornieren"].firstMatch.tap()
        XCTAssertTrue(karte.waitForNonExistence(timeout: 10), "Stornieren hat nicht geklappt")
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
        XCTAssertTrue(app.staticTexts["Spieler"].firstMatch.waitForExistence(timeout: 5))

        let schalter = app.switches.matching(NSPredicate(format: "label BEGINSWITH 'Mitspieler gesucht'")).firstMatch
        XCTAssertTrue(schalter.waitForExistence(timeout: 5))
        schalter.coordinate(withNormalizedOffset: CGVector(dx: 0.93, dy: 0.5)).tap()

        // "Nur für …" steht offen unter dem Schalter (erst nach dem Rollen angelegt):
        // Herren waehlen, LK mit Plus und Minus auf 10 bis 16.
        let herren = app.buttons["Herren"]
        for _ in 0..<5 where !herren.exists || !herren.isHittable { schalter.swipeUp(velocity: .slow) }
        XCTAssertTrue(herren.waitForExistence(timeout: 5), "Nur für … fehlt")
        herren.tap()
        let vonHoch = app.buttons["LK von erhöhen"]
        let bisRunter = app.buttons["LK bis verringern"]
        XCTAssertTrue(vonHoch.waitForExistence(timeout: 5))
        for _ in 0..<9 { vonHoch.tap() }
        for _ in 0..<9 { bisRunter.tap() }
        let stand = app.descendants(matching: .any).matching(NSPredicate(format: "label == 'Nur für, LK 10 bis 16 · Herren'")).firstMatch
        XCTAssertTrue(stand.waitForExistence(timeout: 5), "Filter steht nicht auf LK 10–16 · Herren")
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

    /// Die Karte einer Buchung oeffnet halbhoch: am Griff auf volle Hoehe ziehen.
    private func ganzeHoehe() {
        let griff = app.buttons["Aufzeichnungsblatt"].firstMatch
        guard griff.waitForExistence(timeout: 3) else { return }
        griff.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
            .press(forDuration: 0.1, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.05)))
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
