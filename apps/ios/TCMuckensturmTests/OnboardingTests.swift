import XCTest
@testable import TCMuckensturm

/// Onboarding: Faelle aus packages/core/src/onboarding.test.ts und iban.test.ts,
/// dazu die Pruefungen aus daten.ts und die Ansichtslogik aus onboarding.tsx.
final class OnboardingTests: XCTestCase {
    private let allesOffen: [String: Bool] = [
        "passwort": true, "stammdaten": false, "rechtliches": false, "erziehungsberechtigte": false,
        "notfallkontakt": false, "sepa": false, "einwilligungen": false, "tennis": false, "einstellungen": false,
    ]

    // MARK: - onboardingSchritte, naechsterPflichtschritt

    func testErwachseneOhneErziehungsberechtigte() {
        let s = Onboarding.schritte(minderjaehrig: false, status: allesOffen)
        XCTAssertEqual(s.map(\.key), [.passwort, .stammdaten, .rechtliches, .notfallkontakt, .sepa, .einwilligungen, .tennis, .einstellungen])
        XCTAssertEqual(s.filter(\.pflicht).map(\.key), [.passwort, .stammdaten, .rechtliches, .sepa])
        XCTAssertEqual(s.map(\.titel).first, "Passwort")
    }

    func testMinderjaehrigeMitPflichten() {
        let s = Onboarding.schritte(minderjaehrig: true, status: allesOffen)
        XCTAssertEqual(s.filter(\.pflicht).map(\.key), [.passwort, .stammdaten, .rechtliches, .erziehungsberechtigte, .notfallkontakt, .sepa])
    }

    func testErledigtAusDerDatenbank() {
        var status = allesOffen
        status["stammdaten"] = true
        let s = Onboarding.schritte(minderjaehrig: false, status: status)
        XCTAssertEqual(s.first { $0.key == .stammdaten }?.erledigt, true)
        XCTAssertEqual(s.first { $0.key == .sepa }?.erledigt, false)
    }

    func testNaechsterPflichtschritt() {
        XCTAssertEqual(Onboarding.naechsterPflichtschritt(minderjaehrig: false, status: allesOffen), .stammdaten)
        var status = allesOffen
        status["stammdaten"] = true
        status["rechtliches"] = true
        XCTAssertEqual(Onboarding.naechsterPflichtschritt(minderjaehrig: false, status: status), .sepa)
        XCTAssertEqual(Onboarding.naechsterPflichtschritt(minderjaehrig: true, status: status), .erziehungsberechtigte)
        status["sepa"] = true
        XCTAssertNil(Onboarding.naechsterPflichtschritt(minderjaehrig: false, status: status))
    }

    /// Derselbe Text steht als Erwartung in supabase/tests/23_onboarding.sql.
    func testMandatstext() {
        XCTAssertEqual(
            Onboarding.mandatstext(glaeubigerName: "TC Muckensturm e.V.", glaeubigerId: "DE98ZZZ09999999999", referenz: "TCM-0001-2026"),
            "SEPA-Lastschriftmandat (SEPA-Basislastschrift)\n"
                + "\n"
                + "Zahlungsempfänger: TC Muckensturm e.V.\n"
                + "Gläubiger-Identifikationsnummer: DE98ZZZ09999999999\n"
                + "Mandatsreferenz: TCM-0001-2026\n"
                + "Zahlungsart: Wiederkehrende Zahlungen\n"
                + "\n"
                + "Ich ermächtige TC Muckensturm e.V., Zahlungen von meinem Konto mittels Lastschrift einzuziehen. "
                + "Zugleich weise ich mein Kreditinstitut an, die von TC Muckensturm e.V. auf mein Konto gezogenen Lastschriften einzulösen.\n"
                + "\n"
                + "Hinweis: Ich kann innerhalb von acht Wochen, beginnend mit dem Belastungsdatum, die Erstattung des belasteten Betrages verlangen. "
                + "Es gelten dabei die mit meinem Kreditinstitut vereinbarten Bedingungen."
        )
    }

    // MARK: - IBAN

    func testIban() {
        for gut in ["DE89370400440532013000", "DE89 3704 0044 0532 0130 00", "de89370400440532013000",
                    "GB82WEST12345698765432", "AT611904300234573201", "CH9300762011623852957", "DE89-3704-0044-0532-0130-00"] {
            XCTAssertTrue(Iban.istGueltig(gut), gut)
        }
        for schlecht in ["DE88370400440532013000", "DE00370400440532013000", "DE89370400440532010300",
                         "DE8937040044053201300", "DE893704004405320130000", "", "keine iban", "1234567890"] {
            XCTAssertFalse(Iban.istGueltig(schlecht), schlecht)
        }
        XCTAssertFalse(Iban.istGueltig(nil))
        XCTAssertEqual(Iban.normalisiert(" de89 3704-0044 "), "DE8937040044")
    }

    // MARK: - Stammdaten

    private let gueltig: [String: String] = [
        "first_name": "Nora", "last_name": "Neumitglied", "title": "", "birthday": "19.09.1992", "gender": "female",
        "street": "Hauptstr. 1", "postcode": "70372", "city": "Stuttgart", "phone": "", "mobile": "0170 1234567",
    ]

    func testStammdatenGueltig() {
        XCTAssertEqual(OnboardingLogik.pruefeStammdaten(gueltig, heute: "2026-10-29"), .ok("1992-09-19"))
    }

    func testStammdatenNennenDasFeld() {
        let faelle: [(String, String, String, String)] = [
            ("first_name", " ", "first_name", "Vorname fehlt."),
            ("last_name", "", "last_name", "Nachname fehlt."),
            ("birthday", "", "birthday", "Bitte das Geburtsdatum als TT.MM.JJJJ angeben."),
            ("birthday", "31.02.2000", "birthday", "Bitte das Geburtsdatum als TT.MM.JJJJ angeben."),
            ("birthday", "01.01.85", "birthday", "Das Geburtsdatum liegt in der Zukunft. Bitte das Jahr vierstellig angeben."),
            ("birthday", "01.01.1899", "birthday", "Bitte ein gültiges Geburtsdatum angeben."),
            ("gender", "", "gender", "Bitte das Geschlecht wählen."),
            ("street", "", "street", "Straße fehlt."),
            ("postcode", "", "postcode", "Postleitzahl fehlt."),
            ("city", "", "city", "Ort fehlt."),
            ("mobile", "", "phone", "Bitte Telefon oder Mobil angeben."),
        ]
        for (feld, wert, erwartetesFeld, meldung) in faelle {
            var w = gueltig
            w[feld] = wert
            XCTAssertEqual(
                OnboardingLogik.pruefeStammdaten(w, heute: "2026-10-29"),
                .fehler(.init(feld: erwartetesFeld, meldung: meldung)),
                "\(feld)=\(wert)"
            )
        }
    }

    func testErziehungsberechtigte() {
        XCTAssertEqual(OnboardingLogik.pruefeErziehungsberechtigte(name: " ", email: "a@b.de", telefon: ""),
                       .init(feld: "name", meldung: "Bitte den Namen angeben."))
        XCTAssertEqual(OnboardingLogik.pruefeErziehungsberechtigte(name: "Eva", email: "", telefon: " "),
                       .init(feld: "email", meldung: "Bitte E-Mail oder Telefon angeben."))
        XCTAssertNil(OnboardingLogik.pruefeErziehungsberechtigte(name: "Eva", email: "", telefon: "0711"))
    }

    func testDatum() {
        XCTAssertEqual(OnboardingLogik.isoZuDeutsch("2026-09-29"), "29.09.2026")
        XCTAssertEqual(OnboardingLogik.isoZuDeutsch("2026-09-29T10:00:00+00:00"), "29.09.2026")
        XCTAssertEqual(OnboardingLogik.isoZuDeutsch(nil), "")
        XCTAssertEqual(OnboardingLogik.deutschZuIso("29.09.2026"), "2026-09-29")
        XCTAssertEqual(OnboardingLogik.deutschZuIso("29.9.26"), "2026-09-29")
        XCTAssertEqual(OnboardingLogik.deutschZuIso(" 2026-09-29 "), "2026-09-29")
        XCTAssertNil(OnboardingLogik.deutschZuIso("29.02.2026"))
        XCTAssertNil(OnboardingLogik.deutschZuIso("29.09.026"))
        XCTAssertNil(OnboardingLogik.deutschZuIso("gestern"))
        let d = OnboardingLogik.datum(ausDeutsch: "19.09.2014")!
        XCTAssertEqual(OnboardingLogik.deutsch(d), "19.09.2014")
    }

    // MARK: - Ablauf

    func testFehlendeSchritteAusDemDetail() {
        XCTAssertEqual(OnboardingLogik.fehlendeSchritte("stammdaten, sepa,unbekannt,tennis"), [.stammdaten, .sepa])
        XCTAssertEqual(OnboardingLogik.fehlendeSchritte(nil), [])
    }

    func testDecodingUndAktuellerSchritt() throws {
        let z = try JSONDecoder().decode(OnboardingZustand.self, from: Data(Self.beispiel.utf8))
        XCTAssertTrue(z.minderjaehrig)
        XCTAssertEqual(z.dokumente.map(\.code), ["satzung", "beitragsordnung", "datenschutz"])
        XCTAssertEqual(z.mandat.referenz, "TCM-402-2026")
        XCTAssertNil(z.einstellungen.bookingMail)

        // Ohne Wahl der erste offene Pflichtschritt, mit Wahl dieser.
        XCTAssertEqual(OnboardingLogik.aktuell(gewaehlt: nil, zustand: z).key, .stammdaten)
        XCTAssertEqual(OnboardingLogik.aktuell(gewaehlt: nil, zustand: z).index, 1)
        XCTAssertEqual(OnboardingLogik.aktuell(gewaehlt: .tennis, zustand: z).index, 7)
        XCTAssertEqual(OnboardingLogik.kopfKicker(index: 1, anzahl: z.schritte.count), "Konto einrichten · Schritt 2 von 9")
        XCTAssertEqual(OnboardingLogik.fortschritt(z.schritte, index: 1).prefix(3), [.erledigt, .jetzt, .offen])

        // Nach der Freischaltung kein Weg zurueck in die Pflicht.
        XCTAssertEqual(OnboardingLogik.ersterErreichbarer(z.schritte, freigeschaltet: false), 0)
        XCTAssertEqual(OnboardingLogik.ersterErreichbarer(z.schritte, freigeschaltet: true), 6)

        // Minderjaehrig ohne Notfallkontakt: vorbelegt mit den Erziehungsberechtigten (hier leer).
        XCTAssertEqual(OnboardingLogik.notfallVorbelegung(z).verhaeltnis, "")
        XCTAssertEqual(OnboardingLogik.stammdatenWerte(z.stammdaten)["birthday"], "19.09.2014")
    }

    func testTexte() {
        XCTAssertEqual(OnboardingLogik.zustimmungstext(code: "satzung", titel: "Satzung"), "Ich akzeptiere die Satzung.")
        XCTAssertEqual(OnboardingLogik.zustimmungstext(code: "datenschutz", titel: "Datenschutzerklärung"),
                       "Ich habe die Datenschutzerklärung zur Kenntnis genommen.")
        XCTAssertEqual(
            OnboardingLogik.einleitung(.notfallkontakt, minderjaehrig: false),
            "Wen sollen wir anrufen, wenn auf der Anlage etwas passiert? Freiwillig – du kannst den Schritt überspringen."
        )
    }

    func testBuchungsmail() {
        XCTAssertEqual(OnboardingLogik.buchungsmail(nil), "wichtige")
        XCTAssertEqual(OnboardingLogik.buchungsmail("alle"), "alle")
        XCTAssertEqual(OnboardingLogik.buchungsmail("quatsch"), "wichtige")
        // Noch nichts gesetzt: speichern, auch wenn die Vorgabe bleibt.
        XCTAssertTrue(OnboardingLogik.buchungsmailSpeichern(gewaehlt: "wichtige", gespeichert: nil))
        XCTAssertFalse(OnboardingLogik.buchungsmailSpeichern(gewaehlt: "alle", gespeichert: "alle"))
        XCTAssertTrue(OnboardingLogik.buchungsmailSpeichern(gewaehlt: "keine", gespeichert: "alle"))
    }

    /// my_onboarding() fuer kind@tcm.local aus dem lokalen Stack (gekuerzt).
    static let beispiel = """
    {"mandat":{"text":null,"moeglich":true,"referenz":"TCM-402-2026","vorhanden":false,"text_version":1,
      "glaeubiger_id":"DE98ZZZ09999999999","glaeubiger_name":"TC Muckensturm e.V.","online_erteilt_am":null,"kontoinhaber_vorschlag":null},
     "status":{"sepa":false,"tennis":false,"passwort":true,"stammdaten":false,"rechtliches":false,"einstellungen":false,
      "einwilligungen":false,"notfallkontakt":false,"erziehungsberechtigte":false},
     "tennis":{"nuliga_id":null,"tennis_lk":null,"mannschaft_interesse":false},
     "merkmale":[{"code":"foto","name":"Fotos und Veröffentlichung","gesetzt":false,"description":"Darf die Person auf Fotos erscheinen?"}],
     "dokumente":[{"code":"satzung","title":"Satzung","version":1,"valid_from":"2026-10-29","zugestimmt_am":null},
      {"code":"beitragsordnung","title":"Beitragsordnung","version":1,"valid_from":"2026-10-29","zugestimmt_am":null},
      {"code":"datenschutz","title":"Datenschutzerklärung","version":1,"valid_from":"2026-10-29","zugestimmt_am":null}],
     "stammdaten":{"city":"Stuttgart","email":"kind@tcm.local","phone":null,"title":null,"gender":"male","mobile":"0170 1234567",
      "street":"Hauptstr. 1","birthday":"2014-09-19","postcode":"70372","last_name":"Neumitglied","first_name":"Kian",
      "salutation":"male","country_code":"DE","bestaetigt_am":null,"nationality_code":null},
     "beitragsarten":[{"code":"jugend","name":"Kinder und Jugendliche"}],"einstellungen":{"booking_mail":null},
     "minderjaehrig":true,"pflicht_fehlt":["stammdaten","rechtliches","erziehungsberechtigte","notfallkontakt","sepa"],
     "notfallkontakt":{"name":null,"phone":null,"relation":null},"abgeschlossen_am":null,
     "erziehungsberechtigte":{"name":null,"email":null,"phone":null,"zustimmung_am":null}}
    """
}
