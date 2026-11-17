import SwiftUI
import XCTest
@testable import TCMuckensturm

/// Konto, seine Blaetter und die Mannschaft (KontoBildfotoTest, MannschaftBildfotoTest in apps/android).
final class KontoBildschirmTests: BildschirmTestfall {
    private func konto(_ a: Attrappe) -> some View {
        KontoBildschirm().environment(KontoZustand()).environment(a.sitzung())
    }

    func testKonto() async {
        let a = Attrappe()
        await pruefe("konto", erwartet: [
            "Konto", "Noah Brandt", "Einstellungen", "Meine Daten", "Notfallkontakt", "Tennis", "Mannschaft", "Einwilligungen",
            "Bankverbindung & Mandat", PushSchalter.titel, "Passwort ändern", "Erscheinungsbild", "Datenschutz", "Impressum",
            "Abmelden", Kontoloeschung.titel,
        ]) { konto(a) }
        XCTAssertEqual(
            Set(a.rpcs),
            ["mein_profil", "my_charges", "my_drink_purchases", "my_work_duty", "mein_mandat", "ich", "member_attributes",
             "my_onboarding", "meine_mannschaft", "meine_mannschaft_einladungen", "my_unread_notification_count"]
        )
        XCTAssertEqual(a.letzte("member_attributes")?["p_member_id"] as? String, "e2e00000-0000-4000-8000-000000000002")
    }

    /// Ein Abschnitt faellt aus, der Rest steht.
    func testKontoMitFehlern() async {
        let a = Attrappe()
        a.setze("my_charges", .fehler("P0001", "Die Abrechnung ist gerade gesperrt."))
        a.setze("my_work_duty", .netzfehler(.timedOut))
        await pruefe("konto-fehler", schemata: [.hell], erwartet: ["Noah Brandt", "Die Abrechnung ist gerade gesperrt.", "Meine Daten", "Abmelden"]) {
            konto(a)
        }
    }

    func testKontoOhneNetz() async {
        let a = Attrappe()
        a.netzAus()
        await pruefe("konto-ohne-netz", schemata: [.dunkel], erwartet: ["Konto", DbFehler.verbindungsfehlerText, "Abmelden"]) { konto(a) }
    }

    func testKontoLaedt() async {
        let a = Attrappe()
        a.allesHaengt()
        await pruefe("konto-laedt", schemata: [.hell], erwartet: ["Konto"], nicht: ["Abmelden", "Meine Daten"]) { konto(a) }
    }

    func testKontoGrosseSchrift() async {
        let a = Attrappe()
        await pruefe("konto-schrift-gross", schemata: [.hell], schrift: .accessibility2, erwartet: ["Noah Brandt", "Meine Daten"]) { konto(a) }
    }

    /// "Abmelden" fragt erst nach (U28).
    func testAbmeldenFragtNach() async {
        let a = Attrappe()
        await pruefe("konto-abmelden", schemata: [.hell], erwartet: ["Abmelden"], danach: { b in
            XCTAssertTrue(b.tippe("Abmelden"))
            let fehlt = await b.warteAuf(["Wirklich abmelden?", "Abbrechen"])
            XCTAssertEqual(fehlt, [])
        }) { konto(a) }
        XCTAssertFalse(a.anfragen.contains { $0.pfad.hasSuffix("/auth/v1/logout") }, "Ohne Bestaetigung wird nicht abgemeldet")
    }

    // MARK: - Blaetter

    private func blatt(_ art: KontoBlatt, _ a: Attrappe, erwartet: [String], schemata: [Schema] = Schema.allCases) async {
        let client = a.client()
        let inhalt = await KontoBildschirm.lade(
            Kontodaten(client: client), Startdaten(client: client), Onboardingdaten(client: client), Mannschaftsdaten(client: client)
        )
        await pruefe("konto-blatt-\(art.rawValue)", schemata: schemata, erwartet: erwartet) {
            KontoBlattInhalt(art: art, inhalt: inhalt, zu: {}, gespeichert: { _ in }, geaendert: {}, erneut: {})
                .environment(a.sitzung())
        }
    }

    func testBlattMeineDaten() async {
        await blatt(.daten, Attrappe(), erwartet: ["Meine Daten", "Vorname", "Nachname", "Straße", "PLZ", "Ort", "Noah", "Hauptstr. 15", "Speichern"])
    }

    func testBlattNotfallkontakt() async {
        await blatt(.notfall, Attrappe(), erwartet: ["Notfallkontakt", "Erika Mustermann", "Mutter", "Speichern"])
    }

    func testBlattTennis() async {
        await blatt(.tennis, Attrappe(), erwartet: ["Tennis", "Speichern"])
    }

    /// Mit LK, nuLiga-Id und Interesse - das Formular zeigt die gespeicherten Werte.
    func testBlattTennisGefuellt() async {
        let a = Attrappe()
        a.setze("my_onboarding", json: Beispiel.objekt("my_onboarding-fertig") {
            $0["tennis"] = ["tennis_lk": "LK14,5", "nuliga_id": "12345678", "mannschaft_interesse": true]
        })
        await blatt(.tennis, a, erwartet: ["Tennis", "14,5", "12345678"], schemata: [.hell])
    }

    func testBlattEinwilligungen() async {
        await blatt(.einwilligungen, Attrappe(), erwartet: [
            "Einwilligungen", "Fotos und Veröffentlichung", "Vereinsnachrichten per E-Mail", "E-Mails zu Buchungen", "Nur Wichtiges",
        ])
    }

    func testBlattBank() async {
        await blatt(.bank, Attrappe(), erwartet: ["Bankverbindung & Mandat", "TCM-00070", "Uwe Engel", "0284"])
    }

    func testBlattBankOhneMandat() async {
        let a = Attrappe()
        a.setze("mein_mandat", json: "[]")
        await blatt(.bank, a, erwartet: ["Bankverbindung & Mandat"], schemata: [.hell])
    }

    func testBlattPasswort() async {
        await blatt(.passwort, Attrappe(), erwartet: ["Passwort ändern"])
    }

    func testBlattKuendigung() async {
        await blatt(.loeschen, Attrappe(), erwartet: [Kontoloeschung.titel])
    }

    /// Profil nicht ladbar: das Formular hat keine Werte und sagt das.
    func testBlattOhneProfil() async {
        let a = Attrappe()
        a.setze("mein_profil", .fehler("P0001", "Dein Profil ist gerade nicht lesbar."))
        await blatt(.daten, a, erwartet: ["Meine Daten"], schemata: [.hell])
    }

    // MARK: - Push-Schalter

    func testPushSchalter() async {
        let a = Attrappe()
        await pruefe("push-schalter", schemata: [.hell], erwartet: [PushSchalter.titel]) {
            VStack {
                PushSchalter(symbol: "bell")
                PushSchalter(beschreibung: "Wenn sich an deinen Buchungen etwas ändert.")
            }
            .background(Farbe.bg)
            .environment(a.sitzung())
        }
        // Ohne gemerkte Marke fragt der Schalter die Datenbank gar nicht erst.
        XCTAssertTrue(a.aufrufe("push_token_aktiv").isEmpty)
    }

    // MARK: - Mannschaft

    private func mannschaft(_ a: Attrappe) -> some View {
        NavigationStack { MannschaftBildschirm() }.environment(a.sitzung())
    }

    /// Der Mannschaftsfuehrer: Kader, offene Einladung, Suche nach Kandidaten.
    func testMannschaftAlsMF() async {
        let a = Attrappe()
        a.setze("meine_mannschaft_einladungen", json: "[]")
        await pruefe("mannschaft-mf", erwartet: ["Mannschaft", "Herren 30", "Noah Brandt", "Christian Bauer", MannschaftLogik.sucheLabel]) {
            mannschaft(a)
        }
    }

    /// Spieler ohne MF-Rechte mit einer Einladung in eine andere Mannschaft.
    func testMannschaftSpielerMitEinladung() async {
        let a = Attrappe()
        a.setze("meine_mannschaft", json: Beispiel.objekt("meine_mannschaft") {
            $0["ich_bin_mf"] = false
            $0["offene_einladungen"] = nil
        })
        await pruefe("mannschaft-einladung", erwartet: ["Einladung", "Herren", "Julia Stein", "Annehmen", "Ablehnen", "Herren 30"]) {
            mannschaft(a)
        }
        XCTAssertFalse(buehne.enthaelt(MannschaftLogik.sucheLabel))
    }

    func testMannschaftOhneMannschaft() async {
        let a = Attrappe()
        a.setze("meine_mannschaft", json: "null")
        a.setze("meine_mannschaft_einladungen", json: "[]")
        await pruefe("mannschaft-ohne", schemata: [.hell], erwartet: ["Mannschaft"], nicht: ["Herren 30", "Annehmen"]) { mannschaft(a) }
    }

    func testMannschaftFehler() async {
        let a = Attrappe()
        a.alleRpcsScheitern("Die Mannschaft ist gerade nicht erreichbar.")
        await pruefe("mannschaft-fehler", schemata: [.dunkel], erwartet: ["Mannschaft", "Die Mannschaft ist gerade nicht erreichbar."]) {
            mannschaft(a)
        }
    }

    func testMannschaftLaedt() async {
        let a = Attrappe()
        a.allesHaengt()
        await pruefe("mannschaft-laedt", schemata: [.hell], erwartet: ["Mannschaft"], nicht: ["Herren 30"]) { mannschaft(a) }
    }
}
