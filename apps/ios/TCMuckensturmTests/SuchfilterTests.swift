import XCTest
@testable import TCMuckensturm

/// "Nur für …" der Mitspielersuche und die LK-Eingabe (Vertrag LK-Bereich und Damen/Herren, 02.11.2026).
final class SuchfilterTests: XCTestCase {
    // MARK: - Parameter an create_booking / set_partner_wanted

    func testOffenSendetNichts() {
        let f = Suchfilter.offen
        XCTAssertFalse(f.istEingeschraenkt)
        XCTAssertNil(f.paramVon)
        XCTAssertNil(f.paramBis)
        XCTAssertNil(f.paramFuer)
    }

    func testGrenzenWerdenNull() {
        // von = 1 -> null, bis = 25 -> null
        let f = Suchfilter(vonZehntel: 10, bisZehntel: 250, fuer: .male)
        XCTAssertNil(f.paramVon)
        XCTAssertNil(f.paramBis)
        XCTAssertEqual(f.paramFuer, "male")
        XCTAssertTrue(f.istEingeschraenkt)
    }

    func testZehntelAlsLk() {
        let f = Suchfilter(vonZehntel: 101, bisZehntel: 165, fuer: .female)
        XCTAssertEqual(f.paramVon, 10.1)
        XCTAssertEqual(f.paramBis, 16.5)
        XCTAssertEqual(f.paramFuer, "female")
    }

    func testParameterKodierungLaesstNilWeg() throws {
        // Ohne Filter ruft die App die RPC wie vor der LK-Migration auf: keine neuen Schluessel.
        struct P: Encodable {
            let p_wanted: Bool
            let p_lk_von: Double?
            let p_lk_bis: Double?
            let p_fuer: String?
        }
        let f = Suchfilter.offen
        let ohne = try JSONSerialization.jsonObject(
            with: JSONEncoder().encode(P(p_wanted: true, p_lk_von: f.paramVon, p_lk_bis: f.paramBis, p_fuer: f.paramFuer))
        ) as? [String: Any]
        XCTAssertEqual(ohne?.keys.sorted(), ["p_wanted"])

        let g = Suchfilter(vonZehntel: 100, bisZehntel: 145, fuer: .male)
        let mit = try JSONSerialization.jsonObject(
            with: JSONEncoder().encode(P(p_wanted: true, p_lk_von: g.paramVon, p_lk_bis: g.paramBis, p_fuer: g.paramFuer))
        ) as? [String: Any]
        XCTAssertEqual(mit?["p_lk_von"] as? Double, 10)
        XCTAssertEqual(mit?["p_lk_bis"] as? Double, 14.5)
        XCTAssertEqual(mit?["p_fuer"] as? String, "male")
    }

    // MARK: - Aus der Datenbank

    func testAusSpalten() {
        XCTAssertEqual(Suchfilter(von: nil, bis: nil, fuer: nil), .offen)
        XCTAssertEqual(Suchfilter(von: 10, bis: 16, fuer: "male"), Suchfilter(vonZehntel: 100, bisZehntel: 160, fuer: .male))
        XCTAssertEqual(Suchfilter(von: 14.5, bis: nil, fuer: nil).vonZehntel, 145)
        // Unbekanntes "fuer" gilt als alle, vertauschte Grenzen werden sortiert
        XCTAssertEqual(Suchfilter(von: nil, bis: nil, fuer: "diverse").fuer, .alle)
        XCTAssertEqual(Suchfilter(von: 16, bis: 10, fuer: nil), Suchfilter(vonZehntel: 100, bisZehntel: 160, fuer: .alle))
        // Ausserhalb 1–25 wird begrenzt
        XCTAssertEqual(Suchfilter(von: 0, bis: 30, fuer: nil), .offen)
    }

    // MARK: - Eingabe

    func testVonZiehtBisMit() {
        let f = Suchfilter(vonZehntel: 100, bisZehntel: 120, fuer: .alle).mitVon(150)
        XCTAssertEqual(f.vonZehntel, 150)
        XCTAssertEqual(f.bisZehntel, 150)
    }

    func testBisZiehtVonMit() {
        let f = Suchfilter(vonZehntel: 100, bisZehntel: 120, fuer: .alle).mitBis(80)
        XCTAssertEqual(f.vonZehntel, 80)
        XCTAssertEqual(f.bisZehntel, 80)
        XCTAssertEqual(f.mitBis(5).bisZehntel, 10)
        XCTAssertEqual(Suchfilter.offen.mitBis(999).bisZehntel, 250)
    }

    func testStufen() {
        XCTAssertEqual(Suchfilter.stufen.first, 10)
        XCTAssertEqual(Suchfilter.stufen.last, 250)
        XCTAssertEqual(Suchfilter.stufen.count, 241)
    }

    // MARK: - Texte

    func testKurztext() {
        XCTAssertNil(Suchfilter.offen.kurztext)
        XCTAssertEqual(Suchfilter.kurztext(von: 10, bis: 16, fuer: "male"), "LK 10–16 · Herren")
        XCTAssertEqual(Suchfilter.kurztext(von: nil, bis: 16, fuer: nil), "bis LK 16")
        XCTAssertEqual(Suchfilter.kurztext(von: 10, bis: nil, fuer: nil), "ab LK 10")
        XCTAssertEqual(Suchfilter.kurztext(von: nil, bis: nil, fuer: "female"), "Damen")
        XCTAssertEqual(Suchfilter.kurztext(von: 10.5, bis: 14.5, fuer: nil), "LK 10,5–14,5")
        XCTAssertEqual(Suchfilter.kurztext(von: 12, bis: 12, fuer: "female"), "LK 12 · Damen")
        XCTAssertEqual(Suchfilter.kurztext(von: 1, bis: 25, fuer: nil), nil)
    }

    func testZusammenfassungUndVorlesen() {
        XCTAssertEqual(Suchfilter.offen.zusammenfassung, "alle")
        XCTAssertEqual(Suchfilter.offen.vorleseText, "Alle")
        XCTAssertEqual(Suchfilter(von: 10, bis: 16, fuer: "male").vorleseText, "LK 10 bis 16 · Herren")
    }

    func testFilterGespeichert() {
        XCTAssertEqual(PlaetzeLogik.filterGespeichert(.offen), "Die Suche gilt jetzt für alle.")
        XCTAssertEqual(
            PlaetzeLogik.filterGespeichert(Suchfilter(von: nil, bis: 16, fuer: "female")),
            "Die Suche ist jetzt eingeschränkt: bis LK 16 · Damen."
        )
    }

    // MARK: - LK im Profil

    func testLkLesen() {
        XCTAssertEqual(LkEingabe.zehntel("LK12,3"), 123)
        XCTAssertEqual(LkEingabe.zehntel("12.3"), 123)
        XCTAssertEqual(LkEingabe.zehntel("12"), 120)
        XCTAssertEqual(LkEingabe.zehntel(" lk 14,5 "), 145)
        XCTAssertEqual(LkEingabe.zehntel("LK 1"), 10)
        XCTAssertEqual(LkEingabe.zehntel("25"), 250)
        XCTAssertNil(LkEingabe.zehntel("25,1"))
        XCTAssertNil(LkEingabe.zehntel("0,9"))
        XCTAssertNil(LkEingabe.zehntel("12,34"))
        XCTAssertNil(LkEingabe.zehntel("abc"))
        XCTAssertNil(LkEingabe.zehntel(""))
        XCTAssertNil(LkEingabe.zehntel(nil))
    }

    func testLkNormalisieren() {
        XCTAssertEqual(LkEingabe.normalisiert("14.5"), "LK14,5")
        XCTAssertEqual(LkEingabe.normalisiert("lk 12"), "LK12")
        XCTAssertEqual(LkEingabe.normalisiert("LK18,4"), "LK18,4")
        XCTAssertEqual(LkEingabe.normalisiert("  "), "")
        XCTAssertNil(LkEingabe.normalisiert("26"))
    }

    func testLkFehler() {
        XCTAssertNil(LkEingabe.fehler(""))
        XCTAssertNil(LkEingabe.fehler("18,4"))
        XCTAssertEqual(LkEingabe.fehler("18,45"), LkEingabe.fehlerText)
        XCTAssertEqual(LkEingabe.beschriftung, "LK oder geschätzte LK")
    }

    // MARK: - Decoding und Karten

    private func spiel(_ zusatz: [String: Any]) throws -> OffenesSpiel {
        var json: [String: Any] = [
            "booking_id": "o1", "starts_at": "2026-09-29T15:00:00Z", "ends_at": "2026-09-29T16:00:00Z",
            "court_name": "Platz 2", "type_name": "Einzel", "owner_name": "Erika", "players": [], "frei": 1,
        ]
        json.merge(zusatz) { $1 }
        return try JSONDecoder().decode(OffenesSpiel.self, from: JSONSerialization.data(withJSONObject: json))
    }

    func testOffenesSpielMitFilter() throws {
        let o = try spiel(["lk_von": 10, "lk_bis": 16.5, "fuer": "male"])
        XCTAssertEqual(SpieleLogik.filterZusatz(o), "LK 10–16,5 · Herren")
    }

    func testOffenesSpielOhneNeueSpalten() throws {
        // Datenbank vor der LK-Migration: die Spalten fehlen ganz
        XCTAssertNil(SpieleLogik.filterZusatz(try spiel([:])))
        XCTAssertNil(SpieleLogik.filterZusatz(try spiel(["lk_von": NSNull(), "lk_bis": NSNull(), "fuer": NSNull()])))
    }

    private func belegung(_ zusatz: [String: Any]) throws -> TagesBelegung {
        var json: [String: Any] = [
            "booking_id": "b1", "court_id": "c1", "starts_at": "2026-09-29T15:00:00Z", "ends_at": "2026-09-29T16:00:00Z",
            "partner_wanted": true, "frei": 1,
        ]
        json.merge(zusatz) { $1 }
        return try JSONDecoder().decode(TagesBelegung.self, from: JSONSerialization.data(withJSONObject: json))
    }

    func testTagesBelegungFilter() throws {
        let b = try belegung(["partner_lk_von": NSNull(), "partner_lk_bis": 16, "partner_fuer": "female"])
        XCTAssertEqual(b.suchfilter, Suchfilter(vonZehntel: 10, bisZehntel: 160, fuer: .female))
        XCTAssertEqual(Verwalten.suchtText(b), "Hier wird noch ein Mitspieler gesucht. Eingeschränkt: bis LK 16 · Damen.")
        XCTAssertEqual(try belegung([:]).suchfilter, .offen)
        XCTAssertEqual(Verwalten.suchtText(try belegung([:])), "Hier wird noch ein Mitspieler gesucht.")
    }
}
