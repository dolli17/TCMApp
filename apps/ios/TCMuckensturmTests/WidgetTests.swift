import XCTest
@testable import TCMuckensturm

/// Schnappschuss, Zeitplan, Aufbereitung und Links der Widgets (TCMWidgets/Gemeinsam).
final class WidgetTests: XCTestCase {
    /// Montag, 28.09.2026, 14:00 in Berlin (Sommerzeit)
    private let jetzt = Zeit.datum("2026-09-28T12:00:00Z")!

    private func berlin(_ uhr: String, tag: String = "2026-09-28") -> Date {
        Zeit.berlinTime(day: tag, minutes: Zeit.timeToMinutes(uhr))
    }

    // MARK: - Schnappschuss

    func testKodierungHinUndZurueck() throws {
        let s = WidgetSchnappschuss.beispiel(jetzt: jetzt)
        let daten = try WidgetSchnappschuss.kodieren(s)
        XCTAssertEqual(WidgetSchnappschuss.dekodieren(daten), s)
        // Zeitpunkte als ISO-Text, lesbar fuer Menschen und andere Werkzeuge
        XCTAssertTrue(String(decoding: daten, as: UTF8.self).contains(#""stand":"2026-09-28T12:00:00Z""#))
    }

    func testFremdeVersionOderKaputteDateiGiltAlsLeer() throws {
        var s = WidgetSchnappschuss.beispiel(jetzt: jetzt)
        s.version = WidgetSchnappschuss.aktuelleVersion + 1
        XCTAssertNil(WidgetSchnappschuss.dekodieren(try WidgetSchnappschuss.kodieren(s)))
        XCTAssertNil(WidgetSchnappschuss.dekodieren(Data("kaputt".utf8)))
        XCTAssertNil(WidgetSchnappschuss.dekodieren(Data("{}".utf8)))
    }

    func testNichtGeladenesBleibtAusDemAltenStehen() {
        let alt = WidgetSchnappschuss.beispiel(jetzt: jetzt)
        let spaeter = jetzt.addingTimeInterval(600)
        let neu = WidgetSchnappschuss(stand: spaeter, termine: [], plan: nil, veranstaltungen: nil)
        let gesamt = neu.ueber(alt)
        XCTAssertEqual(gesamt.stand, spaeter)
        XCTAssertEqual(gesamt.termine, [], "leer geladen ist nicht 'nicht geladen'")
        XCTAssertEqual(gesamt.plan, alt.plan)
        XCTAssertEqual(gesamt.veranstaltungen, alt.veranstaltungen)
        XCTAssertEqual(neu.ueber(nil), neu)
    }

    func testGleicherInhaltOhneZeitpunkt() {
        let a = WidgetSchnappschuss.beispiel(jetzt: jetzt)
        var b = a
        b.stand = jetzt.addingTimeInterval(60)
        XCTAssertTrue(WidgetBruecke.gleicherInhalt(a, b))
        b.termine = []
        XCTAssertFalse(WidgetBruecke.gleicherInhalt(a, b))
    }

    func testAblage() throws {
        let datei = FileManager.default.temporaryDirectory.appending(path: "widget-test-\(UUID().uuidString).json")
        let ablage = WidgetAblage(datei: datei)
        defer { ablage.loeschen() }
        XCTAssertNil(ablage.lesen())

        let s = WidgetSchnappschuss.beispiel(jetzt: jetzt)
        try ablage.speichern(s)
        XCTAssertEqual(ablage.lesen(), s)

        // Ein Teil fehlt beim naechsten Laden: der alte bleibt.
        let gesamt = try ablage.speichern(WidgetSchnappschuss(stand: jetzt, termine: nil, plan: nil, veranstaltungen: []))
        XCTAssertEqual(gesamt.termine, s.termine)
        XCTAssertEqual(gesamt.veranstaltungen, [])
        XCTAssertEqual(ablage.lesen(), gesamt)

        ablage.loeschen()
        XCTAssertNil(ablage.lesen())
    }

    func testAusDenDatenDerAppOhneNamenFremder() throws {
        let buchungen = try JSONDecoder().decode([MeineBuchung].self, from: Data("""
        [{"booking_id":"alt","starts_at":"2026-09-28T08:00:00Z","ends_at":"2026-09-28T09:00:00Z","court_name":"Platz 2"},
         {"booking_id":"b2","starts_at":"2026-09-29T08:00:00Z","ends_at":"2026-09-29T09:00:00Z","court_name":"Platz 3",
          "type_name":"Doppel","owner_name":"Max","players":["Max","Erika"]},
         {"booking_id":"b1","starts_at":"2026-09-28T16:00:00Z","ends_at":"2026-09-28T17:00:00Z","court_name":"Platz 1",
          "type_name":"Einzel","bin_bucher":true,"players":[]}]
        """.utf8))
        let belegung = try JSONDecoder().decode([TagesBelegung].self, from: Data("""
        [{"booking_id":"x","court_id":"c1","starts_at":"2026-09-28T14:00:00Z","ends_at":"2026-09-28T15:00:00Z",
          "kind":"booking","owner_name":"Fremde Person","players":["Fremde Person","Noch Jemand"],"guest_names":["Gast Name"]}]
        """.utf8))
        let plaetze = try JSONDecoder().decode([AktiverPlatz].self, from: Data(#"[{"id":"c1","name":"Platz 1"}]"#.utf8))
        let einstellungen = try JSONDecoder().decode(Buchungseinstellungen.self, from: Data(
            #"{"opening_time":"08:00:00","closing_time":"21:00:00","slot_minutes":30,"lead_days":7}"#.utf8
        ))
        let frei = FreiDaten(heute: "2026-09-28", plaetze: plaetze, belegung: belegung, einstellungen: einstellungen, dauer: 60)

        let s = WidgetSchnappschuss.aus(termine: buchungen, frei: frei, events: nil, jetzt: jetzt)
        // Vorbei faellt weg, der naechste zuerst
        XCTAssertEqual(s.termine?.map(\.id), ["b1", "b2"])
        XCTAssertEqual(s.termine?.first?.mit, "Du hast gebucht")
        XCTAssertEqual(s.termine?.last?.mit, "mit Erika")
        XCTAssertEqual(s.plan?.oeffnung, 480)
        XCTAssertEqual(s.plan?.schluss, 1260)
        XCTAssertEqual(s.plan?.vorlaufTage, 7)
        XCTAssertEqual(s.plan?.belegungen.count, 1)
        XCTAssertNil(s.veranstaltungen)

        let json = String(decoding: try WidgetSchnappschuss.kodieren(s), as: UTF8.self)
        XCTAssertFalse(json.contains("Fremde Person"))
        XCTAssertFalse(json.contains("Noch Jemand"))
        XCTAssertFalse(json.contains("Gast Name"))
    }

    // MARK: - Zeitplan

    func testNeuLadenNachDemNaechstenSpielUmMitternachtOderImTakt() {
        let s = WidgetSchnappschuss.beispiel(jetzt: jetzt)
        let termine = s.termine ?? []
        // 14:00: der Takt kommt vor dem Spiel um 18:00
        XCTAssertEqual(WidgetZeitplan.neuLaden(termine: termine, jetzt: jetzt, takt: 3600), berlin("15:00"))
        // 18:30, das Spiel laeuft bis 19:00: eine Minute danach
        XCTAssertEqual(WidgetZeitplan.neuLaden(termine: termine, jetzt: berlin("18:30"), takt: 3600), berlin("19:01"))
        // 23:30: Mitternacht kommt vor dem Takt
        XCTAssertEqual(WidgetZeitplan.neuLaden(termine: termine, jetzt: berlin("23:30"), takt: 3600), berlin("00:00", tag: "2026-09-29"))
        // Ohne Termine: der Takt
        XCTAssertEqual(WidgetZeitplan.neuLaden(termine: [WidgetTermin](), jetzt: jetzt, takt: 1800), berlin("14:30"))
    }

    func testMitternachtInBerlinAuchBeimUmstellen() {
        // Sommerzeit: Mitternacht ist 22:00 UTC
        XCTAssertEqual(WidgetZeitplan.naechsteMitternacht(nach: jetzt), Zeit.datum("2026-09-28T22:00:00Z"))
        // 25.10.2026 hat 25 Stunden: die naechste Mitternacht ist 23:00 UTC
        XCTAssertEqual(WidgetZeitplan.naechsteMitternacht(nach: Zeit.datum("2026-10-25T12:00:00Z")!), Zeit.datum("2026-10-25T23:00:00Z"))
        // Kurz vor Mitternacht (Winterzeit) ist es die desselben Abends
        XCTAssertEqual(WidgetZeitplan.naechsteMitternacht(nach: Zeit.datum("2026-11-02T22:59:00Z")!), Zeit.datum("2026-11-02T23:00:00Z"))
        // Genau um Mitternacht: die naechste
        XCTAssertEqual(WidgetZeitplan.naechsteMitternacht(nach: Zeit.datum("2026-11-02T23:00:00Z")!), Zeit.datum("2026-11-03T23:00:00Z"))
    }

    func testEintraegeJedeViertelstundeUndZuBeginnUndEnde() {
        let ab = Zeit.datum("2026-09-28T12:07:00Z")!
        let termin = WidgetTermin(id: "t", startsAt: "2026-09-28T12:40:00Z", endsAt: "2026-09-28T13:40:00Z", platz: "", art: "", mit: "")
        let zeiten = WidgetZeitplan.eintraege(jetzt: ab, bis: Zeit.datum("2026-09-28T13:00:00Z")!, termine: [termin])
        XCTAssertEqual(zeiten.map(Zeit.iso), [
            "2026-09-28T12:07:00.000Z", "2026-09-28T12:15:00.000Z", "2026-09-28T12:30:00.000Z",
            "2026-09-28T12:40:00.000Z", "2026-09-28T12:45:00.000Z",
        ])
        XCTAssertEqual(WidgetZeitplan.eintraege(jetzt: ab, bis: ab), [ab])
    }

    // MARK: - Aufbereitung

    func testSpiele() {
        let s = WidgetSchnappschuss.beispiel(jetzt: jetzt)
        let zeilen = WidgetInhalt.spiele(s.termine ?? [], jetzt: jetzt, hoechstens: 3)
        XCTAssertEqual(zeilen.map(\.kicker), ["Heute · in 4 Stunden", "Morgen"])
        XCTAssertEqual(zeilen.first?.beginn, "18:00")
        XCTAssertEqual(zeilen.first?.zeit, "18:00 – 19:00")
        XCTAssertEqual(WidgetInhalt.inline(zeilen[0], jetzt: jetzt, startsAt: s.termine![0].startsAt), "Heute · 18:00 · Platz 1")
        // Waehrend des Spiels steht es noch da, danach nicht mehr
        XCTAssertEqual(WidgetInhalt.spiele(s.termine ?? [], jetzt: berlin("18:30"), hoechstens: 1).first?.kicker, "Heute · läuft gerade")
        XCTAssertEqual(WidgetInhalt.spiele(s.termine ?? [], jetzt: berlin("19:00"), hoechstens: 1).first?.kicker, "Morgen")
        XCTAssertEqual(WidgetInhalt.spiele(s.termine ?? [], jetzt: jetzt, hoechstens: 1).count, 1)
    }

    func testPlaetzeJetzt() throws {
        let lage = try XCTUnwrap(WidgetInhalt.plaetze(WidgetSchnappschuss.beispiel(jetzt: jetzt).plan, jetzt: jetzt))
        XCTAssertEqual(lage.ueberschrift, "4 von 6 frei")
        XCTAssertFalse(lage.geschlossen)
        XCTAssertEqual(lage.zeilen.map(\.status), [
            "frei bis 15:00", "belegt bis 17:30", "frei bis 16:00", "belegt bis 21:00", "frei bis 17:30", "frei bis 21:00",
        ])
        XCTAssertEqual(lage.zeilen[0].lueckenText, "14:00–15:00, 16:30–18:00, 19:00–21:00")
        XCTAssertEqual(lage.zeilen[3].lueckenText, "keine freie Zeit mehr")
        XCTAssertEqual(lage.zeilen[3].frei, [])
        // 14:00 auf der Leiste 08:00 bis 21:00
        XCTAssertEqual(lage.jetzt, 6.0 / 13.0 * 100, accuracy: 0.001)
        XCTAssertEqual(lage.zeilen[0].belegt.map(\.art), [.eigen, .belegt])
        XCTAssertEqual(WidgetInhalt.mittelZeilen(lage.zeilen, hoechstens: 4).map(\.name), ["Platz 1", "Platz 3", "Platz 5", "Platz 6"])
    }

    func testBelegtBisUeberAnschliessendeBelegungen() throws {
        // 16:15: Platz 3 ist von 16:00 bis 17:00 und gleich danach bis 19:00 belegt
        let lage = try XCTUnwrap(WidgetInhalt.plaetze(WidgetSchnappschuss.beispiel(jetzt: jetzt).plan, jetzt: berlin("16:15")))
        XCTAssertEqual(lage.zeilen[2].status, "belegt bis 19:00")
    }

    func testFreiAbWennDieZeitBisZurNaechstenBelegungNichtReicht() throws {
        let plan = WidgetPlan(
            tag: "2026-09-28", oeffnung: 480, schluss: 1260, raster: 30, dauer: 60, vorlaufTage: nil,
            plaetze: [WidgetPlatz(id: "c1", name: "Platz 1")],
            belegungen: [WidgetBelegung(
                courtId: "c1", startsAt: Zeit.iso(berlin("14:30")), endsAt: Zeit.iso(berlin("15:00")),
                kind: "booking", isOwn: false, partnerWanted: false, frei: 0, seriesId: nil
            )]
        )
        let lage = try XCTUnwrap(WidgetInhalt.plaetze(plan, jetzt: jetzt))
        XCTAssertEqual(lage.zeilen[0].status, "frei ab 15:00")
        XCTAssertEqual(lage.ueberschrift, "0 von 1 frei")
    }

    func testNachSchlussUndAmNaechstenTag() throws {
        let plan = WidgetSchnappschuss.beispiel(jetzt: jetzt).plan
        let abends = try XCTUnwrap(WidgetInhalt.plaetze(plan, jetzt: berlin("21:30")))
        XCTAssertTrue(abends.geschlossen)
        XCTAssertEqual(abends.ueberschrift, "Für heute geschlossen")
        XCTAssertEqual(Set(abends.zeilen.map(\.status)), ["geschlossen"])
        // Der Plan von gestern zaehlt nicht mehr: erst neu laden
        XCTAssertNil(WidgetInhalt.plaetze(plan, jetzt: berlin("00:05", tag: "2026-09-29")))
        XCTAssertNil(WidgetInhalt.plaetze(nil, jetzt: jetzt))
    }

    func testStandNurWennAlt() {
        XCTAssertNil(WidgetInhalt.standText(jetzt, jetzt: jetzt.addingTimeInterval(30 * 60)))
        XCTAssertEqual(WidgetInhalt.standText(jetzt, jetzt: jetzt.addingTimeInterval(60 * 60)), "Stand 14:00")
        XCTAssertEqual(WidgetInhalt.standText(jetzt, jetzt: jetzt.addingTimeInterval(86_400)), "Stand 28.09. 14:00")
    }

    func testNaechsteVeranstaltung() {
        let e = WidgetVeranstaltung(id: "e", titel: "Fest", startsAt: "2026-09-28T17:00:00Z", endsAt: "2026-09-28T21:00:00Z", zeit: "", marke: nil)
        XCTAssertEqual(WidgetInhalt.veranstaltung([e], jetzt: jetzt)?.id, "e")
        XCTAssertEqual(WidgetInhalt.veranstaltung([e], jetzt: Zeit.datum("2026-09-28T20:00:00Z")!)?.id, "e", "laeuft noch")
        XCTAssertNil(WidgetInhalt.veranstaltung([e], jetzt: Zeit.datum("2026-09-28T21:30:00Z")!))
    }

    // MARK: - Laden wie die Erweiterung

    /**
     * Laedt wie das Widget, mit der Sitzung aus dem Schluesselbund der App Group.
     * Nur mit TEST_RUNNER_TCM_LOKAL_STACK=1, nach `LokalAnmeldenUITests` (README),
     * und nur gegen 127.0.0.1/localhost - nie gegen Dev oder Prod.
     */
    func testLadenGegenDenLokalenStack() async throws {
        guard ProcessInfo.processInfo.environment["TCM_LOKAL_STACK"] != nil else {
            throw XCTSkip("Nur mit TEST_RUNNER_TCM_LOKAL_STACK=1 und angemeldetem Seed-Konto")
        }
        let umgebung = try Umgebung.ausBundle()
        guard ["127.0.0.1", "localhost"].contains(umgebung.supabaseURL.host() ?? "") else {
            throw XCTSkip("Nur gegen den lokalen Stack")
        }
        guard case let .geladen(s) = await WidgetLaden.laden(umgebung: umgebung) else {
            return XCTFail("Widget konnte nicht laden - angemeldet (LokalAnmeldenUITests)?")
        }
        XCTAssertNotNil(s.termine)
        XCTAssertEqual(s.plan?.tag, Zeit.berlinDay(Date()))
        XCTAssertFalse(s.plan?.plaetze.isEmpty ?? true)
        XCTAssertNotNil(s.veranstaltungen)
    }

    // MARK: - Links

    func testLinksHinUndZurueck() throws {
        let url = try XCTUnwrap(WidgetLink.url(WidgetLink.veranstaltung("4f1c-9a"), schema: "tcmlokal"))
        XCTAssertEqual(url.absoluteString, "tcmlokal://verein/veranstaltung/4f1c-9a")
        let pfad = try XCTUnwrap(WidgetLink.pfad(aus: url, schema: "tcmlokal"))
        XCTAssertEqual(pfad, "/verein/veranstaltung/4f1c-9a")
        XCTAssertEqual(PushZiel.ausPfad(pfad), .veranstaltung(id: "4f1c-9a"))

        XCTAssertEqual(WidgetLink.url(WidgetLink.plaetze, schema: "tcm")?.absoluteString, "tcm://plaetze")
        XCTAssertEqual(WidgetLink.pfad(aus: URL(string: "tcm://plaetze")!, schema: "tcm").flatMap(PushZiel.ausPfad), .tab(.plaetze))
        XCTAssertEqual(WidgetLink.pfad(aus: URL(string: "tcm://home")!, schema: "tcm").flatMap(PushZiel.ausPfad), .tab(.home))
        XCTAssertEqual(WidgetLink.pfad(aus: URL(string: "tcm://verein")!, schema: "tcm").flatMap(PushZiel.ausPfad), .tab(.verein))
    }

    func testFremdeLinksNicht() {
        XCTAssertNil(WidgetLink.url("/plaetze", schema: nil))
        XCTAssertNil(WidgetLink.pfad(aus: URL(string: "tcmdev://plaetze")!, schema: "tcm"))
        XCTAssertNil(WidgetLink.pfad(aus: URL(string: "https://app.tennisclub-muckensturm.de/plaetze")!, schema: "tcm"))
        XCTAssertNil(WidgetLink.pfad(aus: URL(string: "tcm://passwort-setzen?token_hash=x&type=recovery")!, schema: "tcm"))
        XCTAssertNil(WidgetLink.pfad(aus: URL(string: "tcm:plaetze")!, schema: "tcm"))
        // Unbekannte Pfade oeffnen nichts
        XCTAssertNil(WidgetLink.pfad(aus: URL(string: "tcm://admin")!, schema: "tcm").flatMap(PushZiel.ausPfad))
    }
}
