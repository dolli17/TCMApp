import XCTest
@testable import TCMuckensturm

/**
 * Konto: Pruefung der Stammdaten (dieselben Faelle wie
 * packages/core/src/schemas.test.ts), Kuendigung (kontoloeschung.test.ts),
 * CHARGE_KIND_LABEL und merkmalBeschreibung gegen die Golden Files, das
 * Decoding der Konto-Modelle und die View-Logik.
 */
final class KontoTests: XCTestCase {
    private func lies<T: Decodable>(_ json: String, als _: T.Type = T.self) throws -> T {
        try JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    struct Fall<Input: Decodable, Output: Decodable>: Decodable {
        let name: String
        let input: Input
        let output: Output
    }

    private func faelle<I: Decodable, O: Decodable>(_ datei: String, _: I.Type, _: O.Type) throws -> [Fall<I, O>] {
        let url = try XCTUnwrap(
            Bundle(for: Self.self).url(forResource: datei, withExtension: "json", subdirectory: "golden"),
            "\(datei).json fehlt im Testbundle"
        )
        let liste = try JSONDecoder().decode([Fall<I, O>].self, from: Data(contentsOf: url))
        XCTAssertFalse(liste.isEmpty, datei)
        return liste
    }

    // MARK: - memberProfileSchema

    private let gueltig: [String: String] = [
        "first_name": "Anna", "last_name": "Meier", "title": "", "phone": "",
        "mobile": "0170 1234567", "street": "Bahnhofstr. 20", "postcode": "70376", "city": "Stuttgart",
    ]

    private func mit(_ feld: String, _ wert: String) -> [String: String] {
        var w = gueltig
        w[feld] = wert
        return w
    }

    func testNimmtVollstaendigenDatensatzAn() {
        XCTAssertNil(Profil.pruefen(gueltig))
    }

    func testErlaubtLeereOptionaleFelder() {
        var w = gueltig
        for f in ["mobile", "street", "postcode", "city"] { w[f] = "" }
        XCTAssertNil(Profil.pruefen(w))
    }

    func testBestehtAufVorUndNachname() {
        XCTAssertEqual(Profil.pruefen(mit("first_name", "   ")), .init(feld: "first_name", meldung: "Vorname fehlt."))
        XCTAssertEqual(Profil.pruefen(mit("last_name", "")), .init(feld: "last_name", meldung: "Nachname fehlt."))
    }

    func testPostleitzahl() {
        XCTAssertEqual(Profil.pruefen(mit("postcode", "7037")), .init(feld: "postcode", meldung: "Postleitzahl muss fünfstellig sein."))
        XCTAssertNotNil(Profil.pruefen(mit("postcode", "7037A")))
        // Arabisch-indische Ziffern sind fuer \d in JavaScript keine Ziffern.
        XCTAssertNotNil(Profil.pruefen(mit("postcode", "٧٠٣٧٦")))
        XCTAssertNil(Profil.pruefen(mit("postcode", " 70376 ")))
    }

    func testLaengen() {
        XCTAssertNil(Profil.pruefen(mit("phone", String(repeating: "1", count: 50))))
        XCTAssertEqual(Profil.pruefen(mit("phone", String(repeating: "1", count: 51)))?.feld, "phone")
        XCTAssertEqual(Profil.pruefen(mit("street", String(repeating: "a", count: 201)))?.meldung, "Höchstens 200 Zeichen.")
    }

    func testErsterFehlerInSchemaReihenfolge() {
        var w = mit("postcode", "1")
        w["first_name"] = ""
        XCTAssertEqual(Profil.pruefen(w)?.feld, "first_name")
    }

    func testSpeichernNurGeaenderteFelder() {
        XCTAssertEqual(Profil.speichern(neu: gueltig, alt: gueltig), .nichtsGeaendert)
        // Nur Leerraum geaendert zaehlt nicht.
        XCTAssertEqual(Profil.speichern(neu: mit("city", " Stuttgart "), alt: gueltig), .nichtsGeaendert)
        XCTAssertEqual(Profil.speichern(neu: mit("city", "  Ludwigsburg "), alt: gueltig), .senden(["city": "Ludwigsburg"]))
        // Leeren schickt den leeren Text: save_my_profile leert dann das Feld.
        XCTAssertEqual(Profil.speichern(neu: mit("mobile", ""), alt: gueltig), .senden(["mobile": ""]))
        XCTAssertEqual(
            Profil.speichern(neu: mit("postcode", "123"), alt: gueltig),
            .fehler(.init(feld: "postcode", meldung: "Postleitzahl muss fünfstellig sein."))
        )
    }

    func testNotfallkontakt() {
        XCTAssertEqual(
            Profil.pruefeNotfallkontakt(["emergency_contact_name": " ", "emergency_contact_phone": "0711 1"]),
            .init(feld: "emergency_contact_name", meldung: "Zur Notfallnummer gehört auch ein Name.")
        )
        XCTAssertNil(Profil.pruefeNotfallkontakt(["emergency_contact_name": "", "emergency_contact_phone": ""]))
        XCTAssertNil(Profil.pruefeNotfallkontakt(["emergency_contact_name": "Eva", "emergency_contact_phone": ""]))
    }

    // MARK: - Kuendigung

    func testKontoloeschungPruefen() {
        XCTAssertEqual(Kontoloeschung.pruefen(""), .ok(nachricht: nil))
        XCTAssertEqual(Kontoloeschung.pruefen("   "), .ok(nachricht: nil))
        XCTAssertEqual(Kontoloeschung.pruefen(nil), .ok(nachricht: nil))
        XCTAssertEqual(Kontoloeschung.pruefen("  Ich ziehe weg. "), .ok(nachricht: "Ich ziehe weg."))
        XCTAssertEqual(
            Kontoloeschung.pruefen(String(repeating: "a", count: 1000)),
            .ok(nachricht: String(repeating: "a", count: 1000))
        )
        XCTAssertEqual(
            Kontoloeschung.pruefen(String(repeating: "a", count: 1001)),
            .fehler("Die Nachricht ist zu lang (höchstens 1000 Zeichen).")
        )
    }

    func testKontoloeschungMeldung() {
        XCTAssertEqual(Kontoloeschung.meldung(neu: true), Kontoloeschung.eingegangen)
        XCTAssertEqual(Kontoloeschung.meldung(neu: false), "Dein Antrag liegt schon vor. Der Vorstand kümmert sich darum.")
    }

    // MARK: - Golden Files

    func testChargeKindLabel() throws {
        struct In: Decodable { let kind: String }
        let liste = try faelle("CHARGE_KIND_LABEL", In.self, String.self)
        for f in liste {
            XCTAssertEqual(Forderungen.chargeKindLabel(f.input.kind), f.output, f.name)
        }
        // Dieselbe Reihenfolge wie CHARGE_KINDS
        XCTAssertEqual(liste.map(\.input.kind), Forderungen.arten.map(\.0))
    }

    func testMerkmalBeschreibung() throws {
        struct In: Decodable { let code: String; let beschreibung: String; let sicht: Merkmaltexte.Sicht }
        for f in try faelle("merkmalBeschreibung", In.self, String.self) {
            XCTAssertEqual(
                Merkmaltexte.merkmalBeschreibung(code: f.input.code, beschreibung: f.input.beschreibung, sicht: f.input.sicht),
                f.output, f.name
            )
        }
    }

    // MARK: - Decoding

    func testMeinProfil() throws {
        let p: [MeinProfil] = try lies("""
        [{"first_name":"Max","last_name":"Muster","title":null,"phone":"0711 1","mobile":null,"street":"Hauptstr. 1",
          "postcode":"71711","city":"Murr","emergency_contact_name":null,"emergency_contact_phone":null,
          "emergency_contact_relation":null,"membership_number":"0042","member_since":"2019-04-01",
          "team_name":"Herren 40","is_team_captain":true}]
        """)
        XCTAssertEqual(p[0].werte["title"], "")
        XCTAssertEqual(p[0].werte["postcode"], "71711")
        XCTAssertEqual(KontoLogik.marken(p[0]), ["Mitglied seit 2019", "Herren 40", "Mannschaftsführer"])
        XCTAssertEqual(KontoLogik.initialen(vorname: "max", nachname: "Muster"), "MM")

        let ohne: [MeinProfil] = try lies(#"[{"first_name":"Eva","last_name":"E","team_name":null,"is_team_captain":false}]"#)
        XCTAssertEqual(KontoLogik.marken(ohne[0]), [])
    }

    func testForderungenUndSumme() throws {
        let f: [Forderung] = try lies("""
        [{"id":"1","kind":"fee","description":"Jahresbeitrag","period_label":"2026","amount_cents":12000,
          "due_date":"2026-11-02","status":"notified","member_name":"Max","is_for_other":false},
         {"id":"2","kind":"drinks","period_label":"September 2026","amount_cents":850,"status":"returned"},
         {"id":"3","kind":"guest","amount_cents":500,"status":"paid"},
         {"id":"4","kind":"neu","amount_cents":100,"status":"open"}]
        """)
        let offen = KontoLogik.offen(f)
        XCTAssertEqual(offen.map(\.id), ["1", "2", "4"])
        XCTAssertEqual(KontoLogik.summe(offen: offen, getraenkeLaufend: 1250), 12000 + 850 + 100 + 1250)
        XCTAssertEqual(KontoLogik.forderungTitel(f[0]), "Beitrag 2026")
        XCTAssertEqual(KontoLogik.forderungTitel(f[3]), "neu")
        XCTAssertEqual(KontoLogik.statusmarke(status: "notified", faellig: "2026-11-02"), Statusmarke(text: "Einzug am 02.11.2026", ton: .gold))
        XCTAssertEqual(KontoLogik.statusmarke(status: "notified", faellig: nil).text, "angekündigt")
        XCTAssertEqual(KontoLogik.statusmarke(status: "returned", faellig: nil), Statusmarke(text: "zurückgebucht", ton: .rot))
        XCTAssertEqual(KontoLogik.statusmarke(status: "laufend", faellig: nil).text, "läuft noch")
        XCTAssertEqual(KontoLogik.statusmarke(status: "open", faellig: nil).text, "offen")
        XCTAssertNil(KontoLogik.zurueckText(0))
        XCTAssertEqual(KontoLogik.zurueckText(1), "Eine Lastschrift kam zurück – die Beträge sind wieder offen. Bitte melde dich beim Verein.")
        XCTAssertEqual(KontoLogik.zurueckText(2)?.hasPrefix("2 Lastschriften kamen zurück"), true)
    }

    func testArbeitsdienst() {
        let offen = Arbeitsdienst(year: 2026, requiredHours: 10, completedHours: 4, missingHours: 6)
        XCTAssertEqual(KontoLogik.dienstWert(offen), "4 / 10 h")
        XCTAssertEqual(KontoLogik.dienstText(offen), "Fehlende Stunden werden zum Jahresende als Ausgleich berechnet.")
        XCTAssertEqual(KontoLogik.dienstAnteil(offen), 0.4, accuracy: 0.0001)
        let fertig = Arbeitsdienst(year: 2026, requiredHours: 10, completedHours: 12.5, missingHours: 0)
        XCTAssertEqual(KontoLogik.dienstText(fertig), "Erledigt – danke für deinen Einsatz.")
        XCTAssertEqual(KontoLogik.dienstAnteil(fertig), 1)
        let ohne = Arbeitsdienst(year: 2026, requiredHours: 0, completedHours: 2.5, missingHours: 0)
        XCTAssertEqual(KontoLogik.dienstWert(ohne), "2.5 h")
        XCTAssertEqual(KontoLogik.dienstText(ohne), "Für dieses Jahr ist kein Arbeitsdienst vorgesehen.")
    }

    func testMandat() throws {
        let m: [MeinMandat] = try lies("""
        [{"reference":"TCM-0042","signed_on":"2024-03-01","status":"active","holder":"Max Muster",
          "bank_name":null,"iban_last4":"4321"}]
        """)
        let zeilen = KontoLogik.mandatZeilen(m[0])
        XCTAssertEqual(zeilen.map(\.0), ["Kontoinhaber", "IBAN", "Bank", "Mandatsreferenz", "Unterschrieben am"])
        XCTAssertEqual(zeilen.map(\.1), ["Max Muster", "•••• 4321", "–", "TCM-0042", "01.03.2024"])
    }

    func testTagDatum() {
        XCTAssertEqual(KontoLogik.tagDatum("2026-10-29"), "29.10.2026")
        // 23:30 UTC ist in Berlin schon der naechste Tag.
        XCTAssertEqual(KontoLogik.tagDatum("2026-06-30T23:30:00+00:00"), "01.07.2026")
        XCTAssertEqual(KontoLogik.tagDatum("kaputt"), "kaputt")
    }

    func testMerkmaleBuendeln() throws {
        let z: [MerkmalZeile] = try lies("""
        [{"code":"foto","name":"Fotos","description":"Darf die Person auf Fotos der Website, in Aushängen und in der Presse erscheinen? Bei Minderjährigen erteilen die Erziehungsberechtigten die Einwilligung.",
          "value_kind":"boolean","multiple":false,"optionen":[],"option_value":"true","option_label":null,"text_value":null,
          "set_at":"2026-05-01T10:00:00+00:00","self_editable":true,"darf_ich":true},
         {"code":"bereich","name":"Bereiche","description":"","value_kind":"list","multiple":true,
          "optionen":[{"value":"jugend","label":"Jugend"},{"value":"technik","label":"Technik"}],
          "option_value":"jugend","option_label":"Jugend","text_value":null,"set_at":null,"self_editable":true,"darf_ich":true},
         {"code":"bereich","name":"Bereiche","description":"","value_kind":"list","multiple":true,
          "optionen":[{"value":"jugend","label":"Jugend"},{"value":"technik","label":"Technik"}],
          "option_value":"technik","option_label":"Technik","text_value":null,"set_at":null,"self_editable":true,"darf_ich":true},
         {"code":"mail","name":"Benachrichtigungen","value_kind":"list","multiple":false,
          "optionen":[{"value":"alle","label":"Alle"},{"value":"keine","label":"Keine"}],
          "option_value":null,"option_label":null,"text_value":null,"self_editable":true,"darf_ich":true},
         {"code":"ehrung","name":"Ehrung","value_kind":"text","multiple":false,"optionen":null,
          "option_value":null,"text_value":"25 Jahre","self_editable":true,"darf_ich":false},
         {"code":"intern","name":"Intern","value_kind":"text","self_editable":false,"darf_ich":false}]
        """)
        let m = KontoLogik.merkmale(z)
        XCTAssertEqual(m.map(\.code), ["foto", "bereich", "mail", "ehrung"])
        XCTAssertEqual(m[0].darstellung, .jaNein)
        XCTAssertTrue(m[0].gesetzt)
        XCTAssertTrue(m[0].beschreibung.hasPrefix("Dürfen wir dich"))
        XCTAssertEqual(m[1].darstellung, .liste)
        XCTAssertEqual(m[1].werte.map(\.option), ["jugend", "technik"])
        XCTAssertEqual(m[2].darstellung, .einzelwahl)
        XCTAssertFalse(m[2].gesetzt)
        XCTAssertEqual(m[3].darstellung, .nurLesen)
        XCTAssertEqual(KontoLogik.nurLesenText(m[3]), "25 Jahre · nur der Verein kann das ändern")
        XCTAssertTrue(KontoLogik.zeigeEinwilligungen(z))
        XCTAssertFalse(KontoLogik.zeigeEinwilligungen([z[5]]))
        XCTAssertFalse(KontoLogik.zeigeEinwilligungen(nil))
    }

    func testErscheinungsbild() {
        XCTAssertNil(Erscheinungsbild.system.farbschema)
        XCTAssertEqual(Erscheinungsbild.hell.farbschema, .light)
        XCTAssertEqual(Erscheinungsbild.dunkel.farbschema, .dark)
        XCTAssertEqual(Erscheinungsbild.allCases.map(\.label), ["System", "Hell", "Dunkel"])
    }
}
