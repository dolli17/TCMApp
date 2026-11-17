import SwiftUI
import XCTest
@testable import TCMuckensturm

/// Anmeldung, Passwort vergessen/setzen, Kein Zugang, die Weiche und die Tabs (BildschirmfotoTest in apps/android).
final class AnmeldungBildschirmTests: BildschirmTestfall {
    func testAnmelden() async {
        let a = Attrappe()
        await pruefe("anmelden", erwartet: ["Willkommen zurück auf dem Platz.", "E-Mail", "Passwort", "Passwort vergessen?", "Anmelden", "Antrag stellen"]) {
            AnmeldenBildschirm().environment(a.sitzung(.keine))
        }
        XCTAssertTrue(a.anfragen.isEmpty, "Die Anmeldeseite fragt nichts ab")
    }

    /// Falsches Passwort: die Meldung steht unter den Feldern (Aufzeichnung: 400 invalid_credentials).
    func testAnmeldenMitFehler() async {
        let a = Attrappe()
        a.setze("/auth/v1/token", .authFehler("invalid_credentials", "Invalid login credentials", status: 400))
        await pruefe("anmelden-fehler", schemata: [.dunkel], erwartet: ["Anmelden"], danach: { b in
            XCTAssertTrue(b.tippe("Anmelden"))
            let fehlt = await b.warteAuf([Anmeldefehler.anmeldedatenFalsch])
            XCTAssertEqual(fehlt, [])
        }) {
            AnmeldenBildschirm().environment(a.sitzung(.keine))
        }
        XCTAssertEqual(a.anfragen.last?.pfad, "/auth/v1/token")
    }

    func testPasswortVergessen() async {
        let a = Attrappe()
        await pruefe("passwort-vergessen", erwartet: [PasswortTexte.vergessenTitel, "E-Mail"]) {
            NavigationStack { PasswortVergessenBildschirm {} }.environment(a.sitzung(.keine))
        }
    }

    func testPasswortSetzenBereit() async {
        let a = Attrappe()
        await pruefe("passwort-setzen", erwartet: [PasswortTexte.setzenTitel, "mitglied@tcm.local"]) {
            PasswortSetzenBildschirm(zustand: .bereit(konto: "mitglied@tcm.local")).environment(a.sitzung(.keine))
        }
    }

    func testPasswortSetzenFehlerUndLaden() async {
        let a = Attrappe()
        let text = PasswortAblauf.einloeseFehlerText(nil, zeitUeberschritten: true)
        await pruefe("passwort-setzen-fehler", schemata: [.hell], erwartet: [PasswortTexte.setzenTitel, text]) {
            PasswortSetzenBildschirm(zustand: .fehler(text)).environment(a.sitzung(.keine))
        }
        await pruefe("passwort-setzen-laedt", schemata: [.dunkel], erwartet: [PasswortTexte.setzenTitel], nicht: [text]) {
            PasswortSetzenBildschirm(zustand: .laden).environment(a.sitzung(.keine))
        }
    }

    /// Ein anderes Konto ist angemeldet: die Rueckfrage liegt als Dialog darueber.
    func testPasswortSetzenRueckfrage() async {
        let a = Attrappe()
        await pruefe("passwort-setzen-rueckfrage", schemata: [.hell], erwartet: [PasswortTexte.rueckfrage(email: "anna@example.org")]) {
            PasswortSetzenBildschirm(zustand: .rueckfrage(email: "anna@example.org")).environment(a.sitzung())
        }
    }

    func testKeinZugang() async {
        let a = Attrappe()
        for grund in ZugangsGrund.allCases {
            await pruefe("kein-zugang-\(grund.rawValue)", schemata: [grund == .gesperrt ? .dunkel : .hell], erwartet: [
                KeinZugang.titel, KeinZugang.text(grund), "Vorstand kontaktieren", "Mit einem anderen Konto anmelden",
            ]) {
                KeinZugangBildschirm(grund: grund).environment(a.sitzung(.keine))
            }
        }
    }

    // MARK: - Weiche und Tabs

    /// Vor dem ersten Ereignis: der Ladekreis auf dem Startgrund.
    func testStartLaedt() async {
        let a = Attrappe()
        await pruefe("start-laedt", schemata: [.hell], erwartet: [], nicht: ["Anmelden", "Home"]) {
            StartAnsicht().environment(a.sitzung())
        }
    }

    /// Mit Sitzung und Zugang fuehrt die Weiche in die Tabs; die vier Tabs stehen in der Leiste.
    func testStartFuehrtInDieTabs() async {
        let a = Attrappe()
        let sitzung = a.sitzung()
        sitzung.starten()
        await pruefe("tabs", erwartet: ["Hallo, Noah", "Home", "Plätze", "Verein", "Konto"], nicht: ["Verwaltung"]) {
            StartAnsicht().environment(sitzung)
        }
        XCTAssertEqual(sitzung.ziel, .tabs)
    }

    /// Mit Platzrechten kommt der fuenfte Tab dazu.
    func testTabsMitVerwaltung() async {
        let a = Attrappe()
        a.setze("ich", json: Beispiel.text("ich-admin")!)
        await pruefe("tabs-verwaltung", schemata: [.hell], erwartet: ["Home", "Plätze", "Verein", "Konto", "Verwaltung"]) {
            HauptTabs().environment(a.sitzung())
        }
    }

    func testStartOhneSitzungZeigtAnmeldung() async {
        let a = Attrappe()
        let sitzung = a.sitzung(.keine)
        sitzung.starten()
        await pruefe("start-anmelden", schemata: [.hell], erwartet: ["Willkommen zurück auf dem Platz."]) {
            StartAnsicht().environment(sitzung)
        }
        XCTAssertEqual(sitzung.ziel, .anmelden)
    }

    func testStartMitOffenemOnboarding() async {
        let a = Attrappe()
        a.setze("mein_zugang", json: #"[{"zugang":true,"grund":null,"onboarding_offen":true}]"#)
        let sitzung = a.sitzung()
        sitzung.starten()
        await pruefe("start-onboarding", schemata: [.hell], erwartet: ["Abmelden", "Kian"]) {
            StartAnsicht().environment(sitzung)
        }
        XCTAssertEqual(sitzung.ziel, .onboarding)
    }
}
