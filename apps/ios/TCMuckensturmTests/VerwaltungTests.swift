import XCTest
@testable import TCMuckensturm

/**
 * Verwaltung: die reinen Funktionen aus VerwaltungLogik mit denselben
 * Faellen wie apps/mobile/src/lib/verwaltung/plaetze.test.ts (normZeit,
 * zustandJetzt, Pruefen vor dem Sperren, pruefeSerie, Meldungen), dazu
 * Sichtbarkeit, Datumsumwandlung und das Decoding der Modelle.
 */
final class VerwaltungTests: XCTestCase {
    private func lies<T: Decodable>(_ json: String, als _: T.Type = T.self) throws -> T {
        try JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    private func zeit(_ iso: String) -> Date { Zeit.datum(iso)! }

    private let platz = "11111111-1111-4111-8111-111111111111"

    private var serie: SerienEingabe {
        SerienEingabe(
            courtId: platz, bookingTypeCode: "training", weekday: 2, startTime: "18:30", endTime: "20:00",
            validFrom: "01.10.2026", validTo: "31.10.2026", title: "Training Herren"
        )
    }

    // MARK: - Sichtbarkeit

    func testSichtbarNurMitPlatzrechten() throws {
        let platzwart = try lies(#"[{"member_id":"m","admin":false,"platz_rechte":true}]"#, als: [Ich].self).first
        let admin = try lies(#"[{"member_id":"m","admin":true,"platz_rechte":true}]"#, als: [Ich].self).first
        let mitglied = try lies(#"[{"member_id":"m","admin":false,"platz_rechte":false}]"#, als: [Ich].self).first
        XCTAssertTrue(VerwaltungLogik.sichtbar(platzwart))
        XCTAssertTrue(VerwaltungLogik.sichtbar(admin))
        XCTAssertFalse(VerwaltungLogik.sichtbar(mitglied))
        XCTAssertFalse(VerwaltungLogik.sichtbar(nil))
        XCTAssertFalse(VerwaltungLogik.sichtbar(try lies(#"[{"member_id":null}]"#, als: [Ich].self).first))
    }

    func testWebLinkJeNachRechten() {
        XCTAssertEqual(VerwaltungLogik.webPfad(admin: true), "/admin")
        XCTAssertEqual(VerwaltungLogik.webPfad(admin: false), "/admin/plaetze")
        XCTAssertEqual(VerwaltungLogik.webTitel(admin: false), "Plätze & Serien am PC")
        XCTAssertTrue(VerwaltungLogik.webText(admin: true).hasPrefix("Mitglieder, Kasse"))
    }

    func testWebLinkAusDerUmgebung() throws {
        let u = try Umgebung(info: [
            "TCMSupabaseURL": "https://x.supabase.co", "TCMSupabaseKey": "k", "TCMSiteURL": "https://tcm.example/",
        ])
        XCTAssertEqual(u.webLink(VerwaltungLogik.webPfad(admin: false))?.absoluteString, "https://tcm.example/admin/plaetze")
    }

    // MARK: - normZeit

    func testNormZeitNimmtKurzeStundenUndPunktAn() {
        XCTAssertEqual(VerwaltungLogik.normZeit("8:00"), "08:00")
        XCTAssertEqual(VerwaltungLogik.normZeit(" 18.30 "), "18:30")
        XCTAssertEqual(VerwaltungLogik.normZeit("24:00"), "24:00")
    }

    func testNormZeitWeistUnsinnAb() {
        XCTAssertNil(VerwaltungLogik.normZeit("25:00"))
        XCTAssertNil(VerwaltungLogik.normZeit("8:60"))
        XCTAssertNil(VerwaltungLogik.normZeit("acht"))
        XCTAssertNil(VerwaltungLogik.normZeit("24:30"))
        XCTAssertNil(VerwaltungLogik.normZeit("8:0"))
    }

    // MARK: - Datum

    func testDeutschZuIso() {
        XCTAssertEqual(VerwaltungLogik.deutschZuIso("29.09.2026"), "2026-09-29")
        XCTAssertEqual(VerwaltungLogik.deutschZuIso("29.9.26"), "2026-09-29")
        XCTAssertEqual(VerwaltungLogik.deutschZuIso("2026-09-29"), "2026-09-29")
        XCTAssertNil(VerwaltungLogik.deutschZuIso("31.02.2026"))
        XCTAssertNil(VerwaltungLogik.deutschZuIso("29.13.2026"))
        XCTAssertNil(VerwaltungLogik.deutschZuIso("morgen"))
    }

    func testIsoZuDeutsch() {
        XCTAssertEqual(VerwaltungLogik.isoZuDeutsch("2026-09-29"), "29.09.2026")
        XCTAssertEqual(VerwaltungLogik.isoZuDeutsch(nil), "")
        XCTAssertEqual(VerwaltungLogik.isoZuDeutsch(""), "")
    }

    // MARK: - zustandJetzt

    private func plan(_ json: String) throws -> [TagesBelegung] {
        try lies(json)
    }

    func testZustandNenntLaufendeSperrungUndSerieNichtAberBuchungen() throws {
        let p = try plan(#"""
        [
          {"booking_id":"1","court_id":"a","kind":"blocking","series_id":null,"starts_at":"2026-09-29T09:00:00Z","ends_at":"2026-09-29T12:00:00Z"},
          {"booking_id":"2","court_id":"b","kind":"blocking","series_id":"s","starts_at":"2026-09-29T09:00:00Z","ends_at":"2026-09-29T11:00:00Z"},
          {"booking_id":"3","court_id":"c","kind":"booking","starts_at":"2026-09-29T09:00:00Z","ends_at":"2026-09-29T11:00:00Z"},
          {"booking_id":"4","court_id":"d","kind":"blocking","starts_at":"2026-09-29T12:00:00Z","ends_at":"2026-09-29T13:00:00Z"}
        ]
        """#)
        // 12:00 UTC ist 14:00 in Berlin (Sommerzeit)
        XCTAssertEqual(VerwaltungLogik.zustandJetzt(p, jetzt: zeit("2026-09-29T10:00:00Z")), [
            "a": PlatzJetzt(art: .gesperrt, text: "gesperrt bis 14:00"),
            "b": PlatzJetzt(art: .serie, text: "Serie bis 13:00"),
        ])
    }

    func testZustandZaehltDenBeginnMitDasEndeNicht() throws {
        let p = try plan(#"""
        [{"booking_id":"1","court_id":"a","kind":"blocking","series_id":null,"starts_at":"2026-09-29T09:00:00Z","ends_at":"2026-09-29T10:00:00Z"}]
        """#)
        XCTAssertEqual(VerwaltungLogik.zustandJetzt(p, jetzt: zeit("2026-09-29T09:00:00Z")), [
            "a": PlatzJetzt(art: .gesperrt, text: "gesperrt bis 12:00"),
        ])
        XCTAssertEqual(VerwaltungLogik.zustandJetzt(p, jetzt: zeit("2026-09-29T10:00:00Z")), [:])
    }

    func testZustandNimmtJePlatzDenErstenLaufendenEintrag() throws {
        let p = try plan(#"""
        [
          {"booking_id":"1","court_id":"a","kind":"blocking","series_id":"s","starts_at":"2026-12-01T09:00:00Z","ends_at":"2026-12-01T11:00:00Z"},
          {"booking_id":"2","court_id":"a","kind":"blocking","series_id":null,"starts_at":"2026-12-01T09:30:00Z","ends_at":"2026-12-01T15:00:00Z"}
        ]
        """#)
        // Im Winter liegt Berlin nur eine Stunde vor UTC
        XCTAssertEqual(VerwaltungLogik.zustandJetzt(p, jetzt: zeit("2026-12-01T10:00:00Z")), [
            "a": PlatzJetzt(art: .serie, text: "Serie bis 12:00"),
        ])
    }

    func testZustandIstOhneEintraegeLeer() {
        XCTAssertEqual(VerwaltungLogik.zustandJetzt([TagesBelegung]()), [:])
    }

    func testPlatzHinweis() {
        XCTAssertEqual(VerwaltungLogik.platzHinweis(aktiv: false, jetzt: nil).text, "stillgelegt")
        XCTAssertEqual(VerwaltungLogik.platzHinweis(aktiv: false, jetzt: nil).ton, .leise)
        XCTAssertEqual(VerwaltungLogik.platzHinweis(aktiv: true, jetzt: nil).text, "frei")
        XCTAssertEqual(VerwaltungLogik.platzHinweis(aktiv: true, jetzt: nil).ton, .gruen)
        let gesperrt = PlatzJetzt(art: .gesperrt, text: "gesperrt bis 14:00")
        let laufend = PlatzJetzt(art: .serie, text: "Serie bis 13:00")
        XCTAssertEqual(VerwaltungLogik.platzHinweis(aktiv: true, jetzt: gesperrt).ton, .rot)
        XCTAssertEqual(VerwaltungLogik.platzHinweis(aktiv: true, jetzt: laufend).ton, .gold)
        // Nur eine Sperrung fuehrt in den Platzplan.
        XCTAssertTrue(VerwaltungLogik.fuehrtZuPlaetzen(gesperrt))
        XCTAssertFalse(VerwaltungLogik.fuehrtZuPlaetzen(laufend))
        XCTAssertFalse(VerwaltungLogik.fuehrtZuPlaetzen(nil))
    }

    // MARK: - Sperren

    func testSperreRechnetDieZeitenInBerlinerZeit() throws {
        let z = try VerwaltungLogik.pruefeSperre(tag: "11.08.2026", von: "8:00", bis: "21:00").get()
        XCTAssertEqual(Zeit.iso(z.von), "2026-08-11T06:00:00.000Z")
        XCTAssertEqual(Zeit.iso(z.bis), "2026-08-11T19:00:00.000Z")
    }

    func testSperreWeistUnlesbaresDatumUndUhrzeitAb() {
        XCTAssertEqual(
            VerwaltungLogik.pruefeSperre(tag: "31.02.2026", von: "8:00", bis: "21:00").fehlerText,
            "Das Datum bitte als TT.MM.JJJJ angeben."
        )
        XCTAssertEqual(
            VerwaltungLogik.pruefeSperre(tag: "11.08.2026", von: "8 Uhr", bis: "21:00").fehlerText,
            "Uhrzeit als HH:MM angeben."
        )
    }

    func testSperrMeldungen() {
        XCTAssertEqual(VerwaltungLogik.gesperrtMeldung(angelegt: 1, verdraengt: 0), "1 Platz gesperrt.")
        XCTAssertEqual(VerwaltungLogik.gesperrtMeldung(angelegt: 3, verdraengt: 0), "3 Plätze gesperrt.")
        XCTAssertEqual(
            VerwaltungLogik.gesperrtMeldung(angelegt: 2, verdraengt: 4),
            "2 Plätze gesperrt, 4 Buchungen verdrängt. Die Betroffenen wurden benachrichtigt."
        )
        // Die Zahl der Kollisionen aus der Meldung der Datenbank
        XCTAssertEqual(PlaetzeLogik.kollisionen(aus: "3 Buchungen liegen im gewählten Zeitraum."), 3)
    }

    // MARK: - Serien

    func testSeriePrueftMitDemSchemaDesWebs() {
        var f = serie
        f.endTime = "17:00"
        XCTAssertEqual(VerwaltungLogik.pruefeSerie(f).fehlerText, "Die Endzeit muss nach der Startzeit liegen.")
        f = serie
        f.validTo = "01.09.2026"
        XCTAssertEqual(VerwaltungLogik.pruefeSerie(f).fehlerText, "Das Enddatum darf nicht vor dem Startdatum liegen.")
        f = serie
        f.title = " "
        XCTAssertEqual(VerwaltungLogik.pruefeSerie(f).fehlerText, "Titel fehlt.")
        f = serie
        f.validFrom = "1.10."
        XCTAssertEqual(VerwaltungLogik.pruefeSerie(f).fehlerText, "Das Datum bitte als TT.MM.JJJJ angeben.")
        f = serie
        f.startTime = "halb sieben"
        XCTAssertEqual(VerwaltungLogik.pruefeSerie(f).fehlerText, "Uhrzeit als HH:MM angeben.")
    }

    func testSerieGibtDieWerteFuerDieRpcs() throws {
        var f = serie
        f.startTime = "9:00"
        f.endTime = "10.30"
        let w = try VerwaltungLogik.pruefeSerie(f).get()
        XCTAssertEqual(w.startTime, "09:00")
        XCTAssertEqual(w.endTime, "10:30")
        XCTAssertEqual(w.validFrom, "2026-10-01")
        XCTAssertEqual(w.validTo, "2026-10-31")
        XCTAssertEqual(w.weekday, 2)
        XCTAssertEqual(w.title, "Training Herren")
    }

    func testSerienMeldungen() {
        XCTAssertEqual(
            VerwaltungLogik.serieAngelegtMeldung(angelegt: 5, verdraengt: 2),
            "Serie angelegt: 5 Termine, 2 bestehende Buchungen verdrängt und die Betroffenen benachrichtigt."
        )
        XCTAssertEqual(VerwaltungLogik.serieAngelegtMeldung(angelegt: 5, verdraengt: 0), "Serie angelegt: 5 Termine.")
        XCTAssertEqual(
            VerwaltungLogik.serieGeaendertMeldung(neu: 1, verdraengt: 0),
            "Serie geändert: 1 künftige Termin steht in der neuen Lage."
        )
        XCTAssertEqual(
            VerwaltungLogik.serieGeaendertMeldung(neu: 3, verdraengt: 1),
            "Serie geändert: 3 Termine neu angelegt, 1 Buchungen verdrängt. Die Betroffenen wurden benachrichtigt."
        )
        XCTAssertEqual(VerwaltungLogik.serieBeendetMeldung(4), "Serie beendet. 4 künftige Termine wurden abgesagt.")
        XCTAssertEqual(VerwaltungLogik.serieBeendetMeldung(1), "Serie beendet. 1 künftige Termin wurde abgesagt.")
        XCTAssertEqual(VerwaltungLogik.serieBeendetMeldung(0), "Serie beendet. Es standen keine Termine mehr aus.")
        XCTAssertEqual(VerwaltungLogik.terminKollisionen(aus: "2 Termine kollidieren mit Buchungen."), 2)
        XCTAssertNil(VerwaltungLogik.terminKollisionen(aus: "Keine Berechtigung."))
    }

    func testVorschauUndKnopf() {
        XCTAssertEqual(
            VerwaltungLogik.vorschauText(termine: 5, kollisionen: 0),
            "5 Termine, nichts im Weg. Die Serie kann so angelegt werden."
        )
        XCTAssertTrue(VerwaltungLogik.vorschauText(termine: 5, kollisionen: 2).hasPrefix("2 Buchungen liegen im Weg."))
        XCTAssertEqual(VerwaltungLogik.anlegenText(termine: 5, kollisionen: 0), "Serie anlegen · 5 Termine")
        XCTAssertEqual(VerwaltungLogik.anlegenText(termine: 5, kollisionen: 1), "Anlegen und 1 Buchung verdrängen")
        // 16:30 UTC am 6.10. ist Dienstag 18:30 in Berlin
        XCTAssertEqual(
            VerwaltungLogik.kollisionsZeile(startsAt: "2026-10-06T16:30:00+00:00", mitglied: "Max Muster", art: "booking"),
            "• Di, 06.10., 18:30 · Max Muster"
        )
        XCTAssertTrue(VerwaltungLogik.kollisionsZeile(startsAt: "2026-10-06T16:30:00Z", mitglied: nil, art: "blocking").hasSuffix("andere Blockung"))
    }

    func testSerienZeile() {
        XCTAssertEqual(VerwaltungLogik.serienZeit(weekday: 2, start: "18:30:00", ende: "20:00:00"), "Dienstag · 18:30 – 20:00")
        XCTAssertEqual(
            VerwaltungLogik.serienKontext(typ: "Training", platz: "Platz 1", bis: "2026-10-31"),
            "Training · Platz 1 · bis 31.10.2026"
        )
        XCTAssertEqual(VerwaltungLogik.platzChip("P3"), "3")
        XCTAssertEqual(VerwaltungLogik.platzOhneWort("Platz 3"), "3")
        XCTAssertEqual(VerwaltungLogik.uhrzeit("08:00:00", ersatz: "07:00"), "08:00")
        XCTAssertEqual(VerwaltungLogik.uhrzeit(nil, ersatz: "21:00"), "21:00")
    }

    // MARK: - Decoding

    func testModelleLesen() throws {
        let plaetze: [VerwalteterPlatz] = try lies(#"""
        [{"id":"p1","name":"Platz 1","short_name":"P1","subline":"Sand","sort_position":1,"active":true,"offene_buchungen":3},
         {"id":"p2","name":"Platz 2","short_name":"P2","subline":null,"sort_position":2,"active":false,"offene_buchungen":0}]
        """#)
        XCTAssertEqual(plaetze.map(\.aktiv), [true, false])
        let serien: [Serie] = try lies(#"""
        [{"id":"s1","court_name":"Platz 1","type_name":"Training","title":"Herren","weekday":2,
          "start_time":"18:30:00","end_time":"20:00:00","valid_from":"2026-10-01","valid_to":"2026-10-31","kuenftige":4}]
        """#)
        XCTAssertEqual(serien.first?.kuenftige, 4)
        let termine: [SerienTermin] = try lies(#"""
        [{"starts_at":"2026-10-06T16:30:00+00:00","ends_at":"2026-10-06T18:00:00+00:00","conflict_booking_id":null,
          "conflict_member_name":null,"conflict_kind":null}]
        """#)
        XCTAssertNil(termine.first?.conflictBookingId)
    }
}

private extension Result where Failure == Meldung {
    var fehlerText: String? {
        if case let .failure(m) = self { return m.text }
        return nil
    }
}
