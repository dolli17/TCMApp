import SwiftUI
import XCTest
@testable import TCMuckensturm

/// Der Onboarding-Assistent Schritt fuer Schritt (OnboardingBildfotoTest in apps/android).
final class OnboardingBildschirmTests: BildschirmTestfall {
    private static let reihenfolge = [
        "passwort", "stammdaten", "rechtliches", "erziehungsberechtigte", "notfallkontakt", "sepa", "einwilligungen", "tennis",
        "einstellungen",
    ]

    /// my_onboarding, bei dem alles vor `schritt` erledigt ist - der Assistent steht dann dort.
    private func zustand(bis schritt: String, datei: String = "my_onboarding", _ aendern: ((inout [String: Any]) -> Void)? = nil) -> String {
        Beispiel.objekt(datei) { o in
            var status = o["status"] as? [String: Bool] ?? [:]
            for s in Self.reihenfolge { status[s] = Self.reihenfolge.firstIndex(of: s)! < Self.reihenfolge.firstIndex(of: schritt)! }
            o["status"] = status
            aendern?(&o)
        }
    }

    private func assistent(_ a: Attrappe) -> some View {
        OnboardingBildschirm().environment(a.sitzung())
    }

    private func titel(_ key: OnboardingSchrittKey) -> String { Onboarding.titel[key]! }

    func testPasswort() async {
        let a = Attrappe()
        a.setze("my_onboarding", json: zustand(bis: "passwort"))
        await pruefe("onboarding-passwort", schemata: [.hell], erwartet: [titel(.passwort), "Abmelden"]) { assistent(a) }
    }

    func testStammdaten() async {
        let a = Attrappe()
        await pruefe("onboarding-stammdaten", erwartet: [titel(.stammdaten), "Kian", "Neumitglied", "Hauptstr. 1", "70372", "Stuttgart"]) {
            assistent(a)
        }
        XCTAssertEqual(Set(a.rpcs), ["my_onboarding"])
    }

    func testRechtliches() async {
        let a = Attrappe()
        a.setze("my_onboarding", json: zustand(bis: "rechtliches"))
        await pruefe("onboarding-rechtliches", erwartet: [titel(.rechtliches), "Satzung"]) { assistent(a) }
    }

    /// Nur bei Minderjaehrigen.
    func testErziehungsberechtigte() async {
        let a = Attrappe()
        a.setze("my_onboarding", json: zustand(bis: "erziehungsberechtigte"))
        await pruefe("onboarding-erziehungsberechtigte", schemata: [.hell], erwartet: [titel(.erziehungsberechtigte)]) { assistent(a) }
    }

    func testNotfallkontakt() async {
        let a = Attrappe()
        a.setze("my_onboarding", json: zustand(bis: "notfallkontakt"))
        await pruefe("onboarding-notfall", schemata: [.dunkel], erwartet: [titel(.notfallkontakt)]) { assistent(a) }
    }

    func testSepa() async {
        let a = Attrappe()
        a.setze("my_onboarding", json: zustand(bis: "sepa"))
        await pruefe("onboarding-sepa", erwartet: [titel(.sepa), "TC Muckensturm e.V.", "DE98ZZZ09999999999", "IBAN"]) { assistent(a) }
    }

    /// Ohne Glaeubigerdaten des Vereins geht kein Mandat.
    func testSepaOhneGlaeubiger() async {
        let a = Attrappe()
        a.setze("my_onboarding", json: zustand(bis: "sepa") { o in
            var mandat = o["mandat"] as! [String: Any]
            mandat["moeglich"] = false
            mandat["glaeubiger_id"] = NSNull()
            o["mandat"] = mandat
        })
        await pruefe("onboarding-sepa-gesperrt", schemata: [.hell], erwartet: [titel(.sepa)], nicht: ["DE98ZZZ09999999999"]) { assistent(a) }
    }

    /// Erwachsene haben den Schritt "Erziehungsberechtigte" nicht.
    func testErwachsene() async {
        let a = Attrappe()
        a.setze("my_onboarding", json: zustand(bis: "erziehungsberechtigte", datei: "my_onboarding-erwachsen"))
        await pruefe("onboarding-erwachsen", schemata: [.hell], erwartet: ["Schritt 5 von 8", titel(.sepa), "Nora Neumitglied"], nicht: [titel(.erziehungsberechtigte)]) {
            assistent(a)
        }
    }

    // MARK: - Die freiwilligen Schritte (nach der Freischaltung), direkt gerendert

    private func schritt(_ name: String, _ key: OnboardingSchrittKey, erwartet: [String], schemata: [Schema] = Schema.allCases) async throws {
        let a = Attrappe()
        let geladen = try await Onboardingdaten(client: a.client()).laden()
        let zustand = try XCTUnwrap(geladen)
        let titel = titel(key)
        await pruefe(name, schemata: schemata, erwartet: [titel] + erwartet) {
            let sitzung = a.sitzung()
            let k = OnboardingKontext(
                zustand: zustand, daten: Onboardingdaten(client: sitzung.client), weiter: { .erfolg("") }, zurueck: {},
                ueberspringen: { .erfolg("") }, letzter: key == .einstellungen
            )
            OnboardingRahmen(kicker: OnboardingLogik.kicker, titel: titel) {
                switch key {
                case .einwilligungen: SchrittEinwilligungen(k: k)
                case .tennis: SchrittTennis(k: k)
                default: SchrittEinstellungen(k: k)
                }
            }
            .environment(sitzung)
        }
    }

    func testEinwilligungen() async throws {
        try await schritt("onboarding-einwilligungen", .einwilligungen, erwartet: ["Fotos und Veröffentlichung"], schemata: [.hell])
    }

    func testTennis() async throws {
        try await schritt("onboarding-tennis", .tennis, erwartet: [], schemata: [.dunkel])
    }

    func testEinstellungen() async throws {
        try await schritt("onboarding-einstellungen", .einstellungen, erwartet: [PushSchalter.titel])
    }

    // MARK: - Laden

    func testLadefehler() async {
        let a = Attrappe()
        a.setze("my_onboarding", .fehler("P0001", "Dein Konto ist noch nicht eingerichtet."))
        await pruefe("onboarding-fehler", schemata: [.hell], erwartet: ["Das hat nicht geklappt", "Dein Konto ist noch nicht eingerichtet.", "Erneut versuchen"]) {
            assistent(a)
        }
    }

    func testLaedt() async {
        let a = Attrappe()
        a.allesHaengt()
        await pruefe("onboarding-laedt", schemata: [.hell], erwartet: [], nicht: ["Abmelden", "Erneut versuchen"]) { assistent(a) }
    }

    /// Schon abgeschlossen (oder kein Mitglied): der Assistent verlaesst sich selbst in die Tabs.
    func testAbgeschlossenFuehrtInDieTabs() async {
        let a = Attrappe()
        a.setze("mein_zugang", json: #"[{"zugang":true,"grund":null,"onboarding_offen":true}]"#)
        a.setze("my_onboarding", json: Beispiel.text("my_onboarding-fertig")!)
        let sitzung = a.sitzung()
        sitzung.starten()
        buehne.zeige(StartAnsicht().environment(sitzung))
        let da = await buehne.warte { sitzung.ziel == .tabs }
        XCTAssertTrue(da, "Ziel: \(sitzung.ziel)")
    }
}
