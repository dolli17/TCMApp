import XCTest
@testable import TCMuckensturm

/**
 * Konto, Bereich "Tennis": Uebersicht, Pruefung vor save_my_tennis (immer
 * alle drei Werte, LK normalisiert wie im Onboarding) und der Entwurf.
 */
final class TennisLogikTests: XCTestCase {
    private func tennis(_ lk: String?, _ nuliga: String?, _ interesse: Bool) -> OnboardingZustand.Tennis {
        OnboardingZustand.Tennis(tennisLk: lk, nuligaId: nuliga, mannschaftInteresse: interesse)
    }

    // MARK: - Uebersicht

    func testUebersichtAlles() {
        XCTAssertEqual(
            TennisLogik.uebersicht(tennis("LK14,5", "12345678", true)),
            "LK14,5 · nuLiga 12345678 · Interesse an Mannschaft"
        )
    }

    func testUebersichtTeilweise() {
        XCTAssertEqual(TennisLogik.uebersicht(tennis("LK12", nil, false)), "LK12")
        XCTAssertEqual(TennisLogik.uebersicht(tennis(nil, " 987 ", false)), "nuLiga 987")
        XCTAssertEqual(TennisLogik.uebersicht(tennis("", "", true)), "Interesse an Mannschaft")
    }

    func testUebersichtLeer() {
        XCTAssertEqual(TennisLogik.uebersicht(nil), "Noch keine Angaben")
        XCTAssertEqual(TennisLogik.uebersicht(tennis(nil, nil, false)), "Noch keine Angaben")
        XCTAssertEqual(TennisLogik.uebersicht(tennis("  ", "", false)), "Noch keine Angaben")
    }

    /// Vom Vorstand anders geschrieben: lesbar wird normalisiert, sonst wie gespeichert.
    func testUebersichtFremdeSchreibweise() {
        XCTAssertEqual(TennisLogik.uebersicht(tennis("14.5", nil, false)), "LK14,5")
        XCTAssertEqual(TennisLogik.uebersicht(tennis("LK 30", nil, false)), "LK 30")
    }

    // MARK: - Pruefung

    func testPruefeNormalisiertUndSchicktAlles() {
        XCTAssertEqual(
            TennisLogik.pruefe(lk: " lk 14.5 ", nuligaId: " 12345678 ", mannschaftInteresse: true),
            .ok(TennisEingabe(tennisLk: "LK14,5", nuligaId: "12345678", mannschaftInteresse: true))
        )
    }

    /// Leer ist erlaubt und geht als "" mit (in der Datenbank null), das Interesse bleibt erhalten.
    func testPruefeLeer() {
        XCTAssertEqual(
            TennisLogik.pruefe(lk: "", nuligaId: "  ", mannschaftInteresse: true),
            .ok(TennisEingabe(tennisLk: "", nuligaId: "", mannschaftInteresse: true))
        )
        XCTAssertEqual(
            TennisLogik.pruefe(lk: "", nuligaId: "", mannschaftInteresse: false),
            .ok(TennisEingabe(tennisLk: "", nuligaId: "", mannschaftInteresse: false))
        )
    }

    func testPruefeLkFalsch() {
        for falsch in ["26", "0,9", "12,34", "abc", "LK"] {
            XCTAssertEqual(
                TennisLogik.pruefe(lk: falsch, nuligaId: "", mannschaftInteresse: false),
                .fehler(LkEingabe.fehlerText, feld: TennisLogik.feldLk),
                falsch
            )
        }
    }

    func testPruefeLkGrenzen() {
        XCTAssertEqual(
            TennisLogik.pruefe(lk: "1", nuligaId: "", mannschaftInteresse: false),
            .ok(TennisEingabe(tennisLk: "LK1", nuligaId: "", mannschaftInteresse: false))
        )
        XCTAssertEqual(
            TennisLogik.pruefe(lk: "25,0", nuligaId: "", mannschaftInteresse: false),
            .ok(TennisEingabe(tennisLk: "LK25", nuligaId: "", mannschaftInteresse: false))
        )
    }

    func testPruefeNuligaLaenge() {
        let genau = String(repeating: "1", count: 40)
        XCTAssertEqual(
            TennisLogik.pruefe(lk: "", nuligaId: genau, mannschaftInteresse: false),
            .ok(TennisEingabe(tennisLk: "", nuligaId: genau, mannschaftInteresse: false))
        )
        XCTAssertEqual(
            TennisLogik.pruefe(lk: "", nuligaId: genau + "1", mannschaftInteresse: false),
            .fehler(TennisLogik.nuligaZuLang, feld: TennisLogik.feldNuliga)
        )
        // Leerzeichen aussen zaehlen nicht mit.
        XCTAssertEqual(
            TennisLogik.pruefe(lk: "", nuligaId: " \(genau) ", mannschaftInteresse: false),
            .ok(TennisEingabe(tennisLk: "", nuligaId: genau, mannschaftInteresse: false))
        )
    }

    /// Die LK wird vor der nuLiga-ID geprueft.
    func testPruefeReihenfolge() {
        XCTAssertEqual(
            TennisLogik.pruefe(lk: "99", nuligaId: String(repeating: "x", count: 41), mannschaftInteresse: false),
            .fehler(LkEingabe.fehlerText, feld: TennisLogik.feldLk)
        )
    }

    // MARK: - Entwurf

    func testEntwurf() {
        let e = TennisLogik.entwurf(tennis("LK14,5", "123", true))
        XCTAssertEqual(e.lk, "LK14,5")
        XCTAssertEqual(e.nuliga, "123")
        XCTAssertTrue(e.interesse)
        let leer = TennisLogik.entwurf(nil)
        XCTAssertEqual(leer.lk, "")
        XCTAssertEqual(leer.nuliga, "")
        XCTAssertFalse(leer.interesse)
    }

    // MARK: - Decoding

    /// So liefert my_onboarding() den Tennis-Teil auch nach dem Onboarding.
    func testDecodingTennis() throws {
        let json = #"{"tennis_lk":"LK14,5","nuliga_id":null,"mannschaft_interesse":true}"#
        let t = try JSONDecoder().decode(OnboardingZustand.Tennis.self, from: Data(json.utf8))
        XCTAssertEqual(t, tennis("LK14,5", nil, true))
    }
}
