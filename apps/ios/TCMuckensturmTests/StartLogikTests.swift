import XCTest
@testable import TCMuckensturm

/// Die Weiche wie apps/mobile/app/index.tsx.
final class StartLogikTests: XCTestCase {
    func testOhneSitzungZurAnmeldung() {
        XCTAssertEqual(StartLogik.ziel(angemeldet: false, zugang: nil), .anmelden)
        XCTAssertEqual(
            StartLogik.ziel(angemeldet: false, zugang: Zugang(zugang: true, grund: nil, onboardingOffen: false)),
            .anmelden
        )
    }

    func testMitZugangInDieTabs() {
        XCTAssertEqual(
            StartLogik.ziel(angemeldet: true, zugang: Zugang(zugang: true, grund: nil, onboardingOffen: false)),
            .tabs
        )
    }

    func testOffenesOnboarding() {
        XCTAssertEqual(
            StartLogik.ziel(angemeldet: true, zugang: Zugang(zugang: true, grund: nil, onboardingOffen: true)),
            .onboarding
        )
    }

    func testKeinZugangMitGrund() {
        for grund in ["archiviert", "gesperrt", "ausgetreten"] {
            XCTAssertEqual(
                StartLogik.ziel(angemeldet: true, zugang: Zugang(zugang: false, grund: grund, onboardingOffen: false)),
                .keinZugang(ZugangsGrund(rawValue: grund)!)
            )
        }
    }

    /// Kein Zugang schlaegt ein offenes Onboarding.
    func testKeinZugangVorOnboarding() {
        XCTAssertEqual(
            StartLogik.ziel(angemeldet: true, zugang: Zugang(zugang: false, grund: "gesperrt", onboardingOffen: true)),
            .keinZugang(.gesperrt)
        )
    }

    func testUnbekannterGrund() {
        XCTAssertEqual(
            StartLogik.ziel(angemeldet: true, zugang: Zugang(zugang: false, grund: "irgendwas", onboardingOffen: false)),
            .keinZugang(.unbekannt)
        )
        XCTAssertEqual(
            StartLogik.ziel(angemeldet: true, zugang: Zugang(zugang: false, grund: nil, onboardingOffen: false)),
            .keinZugang(.unbekannt)
        )
    }

    /// Faellt das Lesen aus, geht es in die Tabs - die Datenbank weist ein offenes Konto selbst ab.
    func testLesefehlerInDieTabs() {
        XCTAssertEqual(StartLogik.ziel(angemeldet: true, zugang: nil), .tabs)
    }

    func testNachAbmeldenZurAnmeldung() {
        XCTAssertEqual(StartLogik.nachAbmelden(aktuell: .tabs), .anmelden)
        XCTAssertEqual(StartLogik.nachAbmelden(aktuell: .onboarding), .anmelden)
        XCTAssertEqual(StartLogik.nachAbmelden(aktuell: .laden), .anmelden)
    }

    func testKeinZugangBleibtNachAbmelden() {
        XCTAssertEqual(StartLogik.nachAbmelden(aktuell: .keinZugang(.ausgetreten)), .keinZugang(.ausgetreten))
    }

    func testZugangDekodiertDieRpcZeile() throws {
        let json = Data(#"[{"zugang":false,"grund":"archiviert","onboarding_offen":false}]"#.utf8)
        let zeilen = try JSONDecoder().decode([Zugang].self, from: json)
        XCTAssertEqual(zeilen, [Zugang(zugang: false, grund: "archiviert", onboardingOffen: false)])
    }

    func testKeinZugangTexteWieInCore() {
        XCTAssertEqual(KeinZugang.titel, "Kein Zugang mehr")
        XCTAssertEqual(KeinZugang.text(.gesperrt), "Der Verein hat deinen Zugang gesperrt.")
        XCTAssertEqual(KeinZugang.text(.archiviert), KeinZugang.text(.ausgetreten))
        XCTAssertEqual(KeinZugang.text(.unbekannt), "Mit diesem Konto ist im Moment keine Anmeldung möglich.")
    }
}
