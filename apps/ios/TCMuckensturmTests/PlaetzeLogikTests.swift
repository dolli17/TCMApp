import XCTest
@testable import TCMuckensturm

/// Texte und Entscheidungen des Tabs Plaetze (PlaetzeLogik, Verwalten) - wie plaetze/index.tsx und BuchungsFenster.tsx.
final class PlaetzeLogikTests: XCTestCase {
    private func belegung(_ felder: [String: Any?]) throws -> TagesBelegung {
        var json: [String: Any?] = [
            "booking_id": "b1", "court_id": "c1",
            "starts_at": "2026-10-29T16:00:00Z", "ends_at": "2026-10-29T17:00:00Z", "kind": "booking",
        ]
        json.merge(felder) { _, neu in neu }
        let daten = try JSONSerialization.data(withJSONObject: json.mapValues { $0 ?? NSNull() })
        return try JSONDecoder().decode(TagesBelegung.self, from: daten)
    }

    /// Donnerstag, 29.10.2026, 15:00 Berlin (Winterzeit)
    private let jetzt = Zeit.datum("2026-10-29T14:00:00Z")!

    // MARK: - Tage

    func testTage() {
        XCTAssertEqual(PlaetzeLogik.tage(heute: "2026-10-29", vorlauf: 3), ["2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"])
        XCTAssertEqual(PlaetzeLogik.tage(heute: "2026-12-31", vorlauf: 1), ["2026-12-31", "2027-01-01"])
        // Ueber die Zeitumstellung hinweg bleibt es ein Kalendertag.
        XCTAssertEqual(PlaetzeLogik.verschiebe("2026-10-24", um: 1), "2026-10-25")
        XCTAssertEqual(PlaetzeLogik.verschiebe("2026-03-29", um: -1), "2026-03-28")
    }

    func testTageszeile() {
        XCTAssertEqual(PlaetzeLogik.tageszeile("2026-10-29", heute: "2026-10-29"), "Heute, 29.10.")
        XCTAssertEqual(PlaetzeLogik.tageszeile("2026-10-30", heute: "2026-10-29"), "Morgen, 30.10.")
        XCTAssertEqual(PlaetzeLogik.tageszeile("2026-10-31", heute: "2026-10-29"), "Sa., 31.10.")
        XCTAssertEqual(PlaetzeLogik.lesbar("2026-11-05"), "Donnerstag, 05. November")
        XCTAssertEqual(PlaetzeLogik.tagText("2026-09-28"), "Montag, 28.09.")
        XCTAssertEqual(PlaetzeLogik.kachel("2026-09-28").wochentag, "MO")
        XCTAssertEqual(PlaetzeLogik.kachel("2026-09-28").tag, 28)
        XCTAssertEqual(PlaetzeLogik.kachel("2026-09-28", heute: "2026-09-28").wochentag, "HEUTE")
    }

    // MARK: - Kontingent und Plan

    func testKontingent() {
        XCTAssertNil(PlaetzeLogik.kontingentText(Kontingent(used: 3, allowed: 0)))
        XCTAssertFalse(PlaetzeLogik.kontingentAus(Kontingent(used: 3, allowed: 0)))
        XCTAssertTrue(PlaetzeLogik.kontingentAus(Kontingent(used: 2, allowed: 2)))
        XCTAssertEqual(
            PlaetzeLogik.kontingentText(Kontingent(used: 1, allowed: 2)),
            "Kontingent: 1 von 2 offenen Buchungen. Buchungen, bei denen du als Mitspieler eingetragen bist, zählen mit."
        )
    }

    func testOeffnebar() throws {
        let sperre = try belegung(["kind": "blocking"])
        XCTAssertFalse(PlaetzeLogik.oeffnebar(sperre, darfPlaetze: false))
        XCTAssertTrue(PlaetzeLogik.oeffnebar(sperre, darfPlaetze: true))
        XCTAssertTrue(PlaetzeLogik.oeffnebar(try belegung([:]), darfPlaetze: false))
        // Ein Training ist eine Serie, keine Sperrung: ansehen darf jeder.
        XCTAssertTrue(PlaetzeLogik.oeffnebar(try belegung(["kind": "blocking", "series_id": "s"]), darfPlaetze: false))
    }

    func testStartzeitenUndStunde() throws {
        // 17:30-18:30 belegt: um 16 Uhr gehen beide Haelften, um 17 Uhr keine, um 18 Uhr nur 18:30.
        let b = try belegung(["starts_at": "2026-10-29T16:30:00Z", "ends_at": "2026-10-29T17:30:00Z"])
        XCTAssertEqual(
            PlaetzeLogik.startzeiten(tag: "2026-10-29", courtId: "c1", stunde: 960, anzeige: 60, raster: 30, dauer: 60,
                                     schluss: 1260, belegung: [b], vorlauf: 7, jetzt: jetzt),
            [960, 990]
        )
        XCTAssertEqual(
            PlaetzeLogik.startzeiten(tag: "2026-10-29", courtId: "c1", stunde: 1020, anzeige: 60, raster: 30, dauer: 60,
                                     schluss: 1260, belegung: [b], vorlauf: 7, jetzt: jetzt),
            []
        )
        XCTAssertEqual(
            PlaetzeLogik.startzeiten(tag: "2026-10-29", courtId: "c1", stunde: 1080, anzeige: 60, raster: 30, dauer: 60,
                                     schluss: 1260, belegung: [b], vorlauf: 7, jetzt: jetzt),
            [1110]
        )
        XCTAssertEqual(PlaetzeLogik.stunde(von: 1050, oeffnung: 480, anzeige: 60), 1020)
        XCTAssertEqual(PlaetzeLogik.stunde(von: 1020, oeffnung: 480, anzeige: 60), 1020)
    }

    func testPlatzNummer() {
        XCTAssertEqual(PlaetzeLogik.platzNummer(name: "Platz 3", kurz: "P3"), "3")
        XCTAssertEqual(PlaetzeLogik.platzNummer(name: "Center Court", kurz: "CC"), "CC")
    }

    func testDrossel() {
        let t0 = Date(timeIntervalSince1970: 1000)
        XCTAssertEqual(PlaetzeLogik.drosselWartezeit(jetzt: t0, letzte: nil), 0)
        XCTAssertEqual(PlaetzeLogik.drosselWartezeit(jetzt: t0.addingTimeInterval(0.3), letzte: t0), 0.7, accuracy: 0.001)
        XCTAssertEqual(PlaetzeLogik.drosselWartezeit(jetzt: t0.addingTimeInterval(1.5), letzte: t0), 0)
    }

    func testFreiText() {
        XCTAssertEqual(PlaetzeLogik.freiText(0), "voll")
        XCTAssertEqual(PlaetzeLogik.freiText(2), "2 frei")
        XCTAssertEqual(PlaetzeLogik.freiLabel(1), "1 Platz frei")
        XCTAssertEqual(PlaetzeLogik.freiLabel(3), "3 Plätze frei")
    }

    // MARK: - Buchungsblatt

    private let einzel = BookingTypeInfo(code: "einzel", name: "Einzel", durationMinutes: 60, minPlayers: 2, maxPlayers: 2, requiresPartner: true)
    private let doppel = BookingTypeInfo(code: "doppel", name: "Doppel", durationMinutes: 90, minPlayers: 3, maxPlayers: 4, requiresPartner: true)

    func testBuchenHinweis() {
        XCTAssertEqual(
            PlaetzeLogik.buchenHinweis(art: einzel, mitglieder: 0, gaeste: 0, sucht: false),
            "Noch 1 Mitspieler wählen – oder „Mitspieler gesucht“ einschalten."
        )
        XCTAssertNil(PlaetzeLogik.buchenHinweis(art: einzel, mitglieder: 0, gaeste: 0, sucht: true))
        XCTAssertNil(PlaetzeLogik.buchenHinweis(art: einzel, mitglieder: 1, gaeste: 0, sucht: false))
        XCTAssertEqual(
            PlaetzeLogik.buchenHinweis(art: doppel, mitglieder: 1, gaeste: 0, sucht: false),
            "Noch 1 Mitspieler wählen – oder „Mitspieler gesucht“ einschalten."
        )
        XCTAssertNil(PlaetzeLogik.buchenHinweis(art: doppel, mitglieder: 1, gaeste: 1, sucht: false))
        XCTAssertNil(PlaetzeLogik.buchenHinweis(art: nil, mitglieder: 0, gaeste: 0, sucht: false))
    }

    func testKuerze() {
        let k = PlaetzeLogik.kuerze(mitglieder: ["a", "b"], gaeste: ["Gast"], maxPlayers: 2)
        XCTAssertEqual(k.mitglieder, ["a"])
        XCTAssertEqual(k.gaeste, [])
        let d = PlaetzeLogik.kuerze(mitglieder: ["a"], gaeste: ["Gast", "Gast", "Gast"], maxPlayers: 4)
        XCTAssertEqual(d.gaeste.count, 2)
    }

    func testTreffer() {
        let verzeichnis = [
            Mitglied(id: "1", firstName: "Eva", lastName: "Muster"),
            Mitglied(id: "2", firstName: "Max", lastName: "Mustermann"),
            Mitglied(id: "3", firstName: "Jonas", lastName: "Berg"),
        ]
        XCTAssertEqual(PlaetzeLogik.treffer("must", in: verzeichnis, ohne: []).map(\.id), ["1", "2"])
        XCTAssertEqual(PlaetzeLogik.treffer("Muster Eva", in: verzeichnis, ohne: []).map(\.id), ["1"])
        XCTAssertEqual(PlaetzeLogik.treffer("must", in: verzeichnis, ohne: ["1"]).map(\.id), ["2"])
        XCTAssertEqual(PlaetzeLogik.treffer("  ", in: verzeichnis, ohne: []), [])
    }

    func testInitialenUndGast() {
        XCTAssertEqual(PlaetzeLogik.initialen("eva", "Muster"), "EM")
        XCTAssertEqual(PlaetzeLogik.initialen(nil, nil), "?")
        XCTAssertEqual(PlaetzeLogik.initialen(name: "Eva Maria Muster"), "EM")
        XCTAssertEqual(PlaetzeLogik.gastText(gebuehrCents: 0), "Gast")
        XCTAssertEqual(PlaetzeLogik.gastText(gebuehrCents: 500), "Gast · 5,00\u{00A0}€")
    }

    func testSperrTexte() {
        XCTAssertEqual(PlaetzeLogik.kollisionen(aus: "3 Buchungen liegen in diesem Zeitraum. Bestätige das Verdrängen."), 3)
        XCTAssertNil(PlaetzeLogik.kollisionen(aus: "Dafür fehlt dir die Berechtigung."))
        XCTAssertEqual(PlaetzeLogik.verdraengenText(1), "1 Buchung verdrängen")
        XCTAssertEqual(PlaetzeLogik.verdraengenText(2), "2 Buchungen verdrängen")
        XCTAssertEqual(PlaetzeLogik.sperreGeaendert(verdraengt: 0), "Sperrung geändert.")
        XCTAssertEqual(PlaetzeLogik.sperreGeaendert(verdraengt: 1), "Sperrung geändert, 1 Buchung verdrängt.")
    }

    // MARK: - Verwalten

    func testEigeneBuchungVorBeginn() throws {
        let b = try belegung(["is_own": true, "type_name": "Einzel", "partner_wanted": true, "frei": 1])
        let v = Verwalten(b, darfPlaetze: false, jetzt: jetzt)
        XCTAssertTrue(v.darfVerwalten)
        XCTAssertFalse(v.kannMitspielen)
        XCTAssertFalse(v.kannUmsetzen)
        XCTAssertFalse(v.grundNoetig)
        XCTAssertEqual(v.untertitel, "Einzel · gebucht von dir")
        XCTAssertEqual(v.stornoText(bestaetigen: false), "Buchung stornieren")
        XCTAssertEqual(v.stornoText(bestaetigen: true), "Wirklich stornieren")
        XCTAssertEqual(Verwalten.suchtText(b), "Hier wird noch ein Mitspieler gesucht.")
    }

    func testFremdeBuchungMitspielen() throws {
        let b = try belegung(["owner_name": "Eva Muster", "type_name": "Doppel", "partner_wanted": true, "frei": 2])
        let v = Verwalten(b, darfPlaetze: false, jetzt: jetzt)
        XCTAssertFalse(v.darfVerwalten)
        XCTAssertTrue(v.kannMitspielen)
        XCTAssertEqual(v.untertitel, "Doppel · gebucht von Eva Muster")
        XCTAssertEqual(Verwalten.suchtText(b), "Hier werden noch 2 Mitspieler gesucht.")
        // Schon eingetragen: nicht noch einmal mitspielen.
        XCTAssertFalse(Verwalten(try belegung(["partner_wanted": true, "frei": 1, "bin_dabei": true]), darfPlaetze: false, jetzt: jetzt).kannMitspielen)
    }

    func testPlatzrechte() throws {
        let fremd = try belegung(["owner_name": "Eva Muster", "type_name": "Einzel"])
        let v = Verwalten(fremd, darfPlaetze: true, jetzt: jetzt)
        XCTAssertTrue(v.darfVerwalten)
        XCTAssertTrue(v.kannUmsetzen)
        XCTAssertTrue(v.grundNoetig)

        let sperre = try belegung(["kind": "blocking", "type_name": "Platzpflege", "title": "Regen"])
        let s = Verwalten(sperre, darfPlaetze: true, jetzt: jetzt)
        XCTAssertTrue(s.nurStorno)
        XCTAssertTrue(s.kannSperreAendern)
        XCTAssertFalse(s.kannUmsetzen)
        XCTAssertFalse(s.grundNoetig)
        XCTAssertFalse(s.grundFeld)
        XCTAssertEqual(s.untertitel, "Gesperrt · Platzpflege")
        XCTAssertEqual(s.stornoText(bestaetigen: false), "Sperrung aufheben")

        let training = try belegung(["kind": "blocking", "series_id": "s1", "title": "Training", "type_name": "Training"])
        let t = Verwalten(training, darfPlaetze: true, jetzt: jetzt)
        XCTAssertTrue(t.serientermin)
        XCTAssertFalse(t.kannSperreAendern)
        XCTAssertTrue(t.grundFeld)
        XCTAssertEqual(t.untertitel, "Training · Serientermin")
        XCTAssertEqual(t.stornoText(bestaetigen: false), "Fällt diese Woche aus")
        XCTAssertEqual(t.stornoText(bestaetigen: true), "Termin wirklich absagen")
    }

    func testNachBeginn() throws {
        // Laeuft seit 14:30 Berlin: der Bucher darf nichts mehr, Platzrechte schon.
        let b = try belegung(["is_own": true, "starts_at": "2026-10-29T13:30:00Z", "ends_at": "2026-10-29T14:30:00Z"])
        XCTAssertFalse(Verwalten(b, darfPlaetze: false, jetzt: jetzt).darfVerwalten)
        XCTAssertTrue(Verwalten(b, darfPlaetze: false, jetzt: jetzt).laeuftSchon)
        XCTAssertTrue(Verwalten(b, darfPlaetze: true, jetzt: jetzt).darfVerwalten)
        XCTAssertTrue(Verwalten(b, darfPlaetze: true, jetzt: jetzt).kannUmsetzen)
    }

    func testSperrZeit() throws {
        let b = try belegung(["starts_at": "2026-10-29T21:00:00Z", "ends_at": "2026-10-30T01:00:00Z"])
        let z = Platzplan.sperrZeit(b)
        XCTAssertEqual(z.von, 22 * 60)
        XCTAssertEqual(z.bis, 24 * 60)
    }

    // MARK: - Decoding

    func testKontingentUndMitglied() throws {
        let k = try JSONDecoder().decode([Kontingent].self, from: Data(#"[{"used":1,"allowed":2}]"#.utf8))
        XCTAssertEqual(k.first, Kontingent(used: 1, allowed: 2))
        let leer = try JSONDecoder().decode(Kontingent.self, from: Data(#"{"used":null,"allowed":null}"#.utf8))
        XCTAssertEqual(leer, .leer)
        let m = try JSONDecoder().decode([Mitglied].self, from: Data(#"[{"id":"x","first_name":"Eva","last_name":"Muster"}]"#.utf8))
        XCTAssertEqual(m.first?.name, "Eva Muster")
    }
}
