import XCTest
@testable import TCMuckensturm

/**
 * Konto, Bereich "Mannschaft" (Vertrag vom 02.11.2026): Decoding der RPCs,
 * Sichtbarkeit des Eintrags, Texte fuer Kader, Einladungen und die
 * Funktionen des Mannschaftsfuehrers sowie das Push-Ziel der neuen Arten.
 */
final class MannschaftLogikTests: XCTestCase {
    private let decoder = JSONDecoder()

    private func json<T: Decodable>(_ text: String, als: T.Type = T.self) throws -> T {
        try decoder.decode(T.self, from: Data(text.utf8))
    }

    private func kader(
        _ vor: String, _ nach: String, lk: String? = nil, mf: Bool = false, telefon: String? = nil
    ) -> KaderMitglied {
        KaderMitglied(memberId: "\(vor)-\(nach)", firstName: vor, lastName: nach, tennisLk: lk, isTeamCaptain: mf, telefon: telefon)
    }

    private func mannschaft(mf: Bool, kader: [KaderMitglied] = [], offen: [OffeneEinladung]? = nil) -> MeineMannschaft {
        MeineMannschaft(teamId: "t1", name: "Herren 40", ichBinMf: mf, telefonSichtbar: false, kader: kader, offeneEinladungen: offen)
    }

    private func einladung(
        wechsel: String? = nil, moeglich: Bool = true, hinweis: String? = nil, von: String? = "Max Muster",
        bis: String? = "2026-12-02T10:00:00+00:00"
    ) -> MannschaftEinladung {
        MannschaftEinladung(
            id: "e1", teamId: "t2", teamName: "Damen 30", eingeladenVon: von, createdAt: "2026-11-02T10:00:00+00:00",
            expiresAt: bis, wechselVon: wechsel, annehmenMoeglich: moeglich, hinweis: hinweis
        )
    }

    private func kandidat(interesse: Bool = false, team: String? = nil, eingeladen: Bool = false, lk: String? = "LK18") -> MannschaftKandidat {
        MannschaftKandidat(
            memberId: "k1", firstName: "Lena", lastName: "Kurz", tennisLk: lk,
            mannschaftInteresse: interesse, aktuelleMannschaft: team, eingeladen: eingeladen
        )
    }

    // MARK: - Decoding

    func testMeineMannschaftAlsMf() throws {
        let m: MeineMannschaft = try json("""
        {"team_id":"t1","name":"Herren 40","ich_bin_mf":true,"telefon_sichtbar":false,
         "kader":[{"member_id":"a","first_name":"Max","last_name":"Muster","tennis_lk":"LK12","is_team_captain":true,"telefon":null},
                  {"member_id":"b","first_name":"Uli","last_name":"Ohne","tennis_lk":null,"is_team_captain":false,"telefon":"0171 234"}],
         "offene_einladungen":[{"id":"i1","member_id":"c","first_name":"Lena","last_name":"Kurz",
                                "created_at":"2026-11-02T10:00:00+00:00","expires_at":"2026-12-02T10:00:00+00:00"}]}
        """)
        XCTAssertEqual(m.name, "Herren 40")
        XCTAssertTrue(m.ichBinMf)
        XCTAssertEqual(m.kader.map(\.memberId), ["a", "b"])
        XCTAssertEqual(m.kader[1].telefon, "0171 234")
        XCTAssertEqual(m.offeneEinladungen?.first?.id, "i1")
    }

    /// Spieler bekommen keine offenen Einladungen mit, und ohne Mannschaft kommt null.
    func testMeineMannschaftAlsSpielerUndOhne() throws {
        let m: MeineMannschaft = try json("""
        {"team_id":"t1","name":"Herren 40","ich_bin_mf":false,"telefon_sichtbar":true,"kader":[]}
        """)
        XCTAssertNil(m.offeneEinladungen)
        XCTAssertTrue(m.telefonSichtbar)
        let ohne: MeineMannschaft? = try json("null")
        XCTAssertNil(ohne)
    }

    func testEinladungenUndKandidaten() throws {
        let e: [MannschaftEinladung] = try json("""
        [{"id":"e1","team_id":"t2","team_name":"Damen 30","eingeladen_von":"Max Muster",
          "created_at":"2026-11-02T10:00:00+00:00","expires_at":"2026-12-02T10:00:00+00:00",
          "wechsel_von":"Damen 1","annehmen_moeglich":true,"hinweis":null}]
        """)
        XCTAssertEqual(e.first?.wechselVon, "Damen 1")
        XCTAssertEqual(e.first?.annehmenMoeglich, true)
        let k: [MannschaftKandidat] = try json("""
        [{"member_id":"k1","first_name":"Lena","last_name":"Kurz","tennis_lk":"LK18",
          "mannschaft_interesse":true,"aktuelle_mannschaft":null,"eingeladen":false}]
        """)
        XCTAssertEqual(k.first?.mannschaftInteresse, true)
        XCTAssertNil(k.first?.aktuelleMannschaft)
    }

    // MARK: - Eintrag im Konto

    func testEintragSichtbar() {
        XCTAssertFalse(MannschaftLogik.zeigeEintrag(profilTeam: nil, mannschaft: nil, einladungen: 0))
        XCTAssertFalse(MannschaftLogik.zeigeEintrag(profilTeam: "", mannschaft: nil, einladungen: 0))
        XCTAssertTrue(MannschaftLogik.zeigeEintrag(profilTeam: nil, mannschaft: nil, einladungen: 1))
        XCTAssertTrue(MannschaftLogik.zeigeEintrag(profilTeam: nil, mannschaft: mannschaft(mf: false), einladungen: 0))
        // meine_mannschaft() schlug fehl, das Profil kennt die Mannschaft: der Eintrag bleibt.
        XCTAssertTrue(MannschaftLogik.zeigeEintrag(profilTeam: "Herren 40", mannschaft: nil, einladungen: 0))
    }

    func testUebersicht() {
        XCTAssertEqual(
            MannschaftLogik.uebersicht(mannschaft: mannschaft(mf: true), profilTeam: nil, einladungen: 0),
            "Herren 40 · Mannschaftsführer"
        )
        XCTAssertEqual(MannschaftLogik.uebersicht(mannschaft: mannschaft(mf: false), profilTeam: nil, einladungen: 1), "Herren 40 · 1 Einladung")
        XCTAssertEqual(MannschaftLogik.uebersicht(mannschaft: nil, profilTeam: nil, einladungen: 2), "2 Einladungen")
        XCTAssertEqual(MannschaftLogik.uebersicht(mannschaft: nil, profilTeam: "Damen 1", einladungen: 0), "Damen 1")
        XCTAssertNil(MannschaftLogik.uebersicht(mannschaft: nil, profilTeam: nil, einladungen: 0))
    }

    // MARK: - Kader

    func testKaderUnterzeile() {
        XCTAssertEqual(MannschaftLogik.kaderUnterzeile(kader("Max", "Muster", lk: "LK12", mf: true)), "LK12 · Mannschaftsführer")
        XCTAssertEqual(MannschaftLogik.kaderUnterzeile(kader("Uli", "Ohne")), "ohne LK")
        XCTAssertEqual(MannschaftLogik.kaderUnterzeile(kader("Eva", "Punkt", lk: "14.5")), "LK14,5")
    }

    func testAustragenNurMfUndNichtSich() {
        let mf = kader("Max", "Muster", mf: true)
        let spieler = kader("Uli", "Ohne")
        XCTAssertTrue(MannschaftLogik.darfAustragen(spieler, in: mannschaft(mf: true)))
        XCTAssertFalse(MannschaftLogik.darfAustragen(mf, in: mannschaft(mf: true)))
        XCTAssertFalse(MannschaftLogik.darfAustragen(spieler, in: mannschaft(mf: false)))
    }

    /// Der MF sieht Nummern nur bei Zustimmung, Spieler sehen nichts dazu.
    func testTelefonZeile() {
        let mit = kader("Uli", "Ohne", telefon: "0171 234567")
        let ohne = kader("Eva", "Punkt")
        XCTAssertEqual(MannschaftLogik.telefonZeile(mit, in: mannschaft(mf: true)), "0171 234567")
        XCTAssertEqual(MannschaftLogik.telefonZeile(ohne, in: mannschaft(mf: true)), "Telefon nicht freigegeben")
        XCTAssertNil(MannschaftLogik.telefonZeile(mit, in: mannschaft(mf: false)))
        XCTAssertNil(MannschaftLogik.telefonZeile(kader("Max", "Muster", mf: true), in: mannschaft(mf: true)))
    }

    func testTelefonLink() {
        XCTAssertEqual(MannschaftLogik.telefonLink("0171 / 234-567")?.absoluteString, "tel:0171234567")
        XCTAssertEqual(MannschaftLogik.telefonLink(" +49 171 234567 ")?.absoluteString, "tel:+49171234567")
        XCTAssertNil(MannschaftLogik.telefonLink(nil))
        XCTAssertNil(MannschaftLogik.telefonLink("ab"))
        // Nur ASCII-Ziffern, nichts anderes landet in der Adresse.
        XCTAssertEqual(MannschaftLogik.telefonLink("0171;x=1 ٣٣")?.absoluteString, "tel:01711")
    }

    func testRueckfragen() {
        let k = kader("Uli", "Ohne")
        XCTAssertEqual(MannschaftLogik.austragenFrage(k, team: "Herren 40"), "Uli Ohne aus Herren 40 austragen?")
        XCTAssertEqual(MannschaftLogik.ausgetragenMeldung(k), "Uli Ohne ist nicht mehr im Kader.")
        XCTAssertEqual(MannschaftLogik.austretenFrage("Herren 40"), "Aus Herren 40 austreten?")
        XCTAssertEqual(MannschaftLogik.ausgetretenMeldung("Herren 40"), "Du bist aus Herren 40 ausgetreten.")
    }

    func testName() {
        XCTAssertEqual(MannschaftLogik.name(" Max ", "Muster"), "Max Muster")
        XCTAssertEqual(MannschaftLogik.name(nil, "Muster"), "Muster")
        XCTAssertEqual(MannschaftLogik.name("", nil), "")
    }

    // MARK: - Einladungen an mich

    func testEinladungUnterzeile() {
        XCTAssertEqual(MannschaftLogik.einladungUnterzeile(einladung()), "Eingeladen von Max Muster · gültig bis 02.12.2026")
        XCTAssertEqual(MannschaftLogik.einladungUnterzeile(einladung(von: nil)), "gültig bis 02.12.2026")
        XCTAssertEqual(MannschaftLogik.einladungUnterzeile(einladung(von: " ", bis: nil)), "")
    }

    func testHinweisWechselUndSperre() {
        XCTAssertNil(MannschaftLogik.hinweis(einladung()))
        XCTAssertEqual(MannschaftLogik.hinweis(einladung(wechsel: "Damen 1")), "Du wechselst damit aus Damen 1 in Damen 30.")
        XCTAssertEqual(
            MannschaftLogik.hinweis(einladung(wechsel: "Damen 1", moeglich: false)),
            "Du bist Mannschaftsführer von Damen 1. Das kann nur der Vorstand ändern."
        )
        XCTAssertEqual(MannschaftLogik.hinweis(einladung(moeglich: false)), "Du kannst diese Einladung gerade nicht annehmen.")
    }

    /// Was die Datenbank in `hinweis` schreibt, hat Vorrang.
    func testHinweisAusDerDatenbank() {
        XCTAssertEqual(MannschaftLogik.hinweis(einladung(wechsel: "Damen 1", hinweis: "Satz der DB.")), "Satz der DB.")
        XCTAssertEqual(MannschaftLogik.hinweis(einladung(wechsel: "Damen 1", hinweis: "  ")), "Du wechselst damit aus Damen 1 in Damen 30.")
    }

    func testBeantwortetMeldung() {
        XCTAssertEqual(MannschaftLogik.beantwortetMeldung(einladung(), angenommen: true), "Willkommen in Damen 30.")
        XCTAssertEqual(MannschaftLogik.beantwortetMeldung(einladung(), angenommen: false), "Einladung abgelehnt.")
    }

    // MARK: - Fuer den MF

    func testOffeneUnterzeile() {
        let e = OffeneEinladung(id: "i", memberId: "m", firstName: "Lena", lastName: "Kurz", createdAt: nil, expiresAt: "2026-12-02T23:30:00+00:00")
        // Spaet abends UTC ist in Berlin schon der naechste Tag.
        XCTAssertEqual(MannschaftLogik.offeneUnterzeile(e), "offen · gültig bis 03.12.2026")
        let ohne = OffeneEinladung(id: "i", memberId: "m", firstName: nil, lastName: nil, createdAt: nil, expiresAt: nil)
        XCTAssertEqual(MannschaftLogik.offeneUnterzeile(ohne), "offen")
    }

    func testKandidatMarken() {
        XCTAssertEqual(MannschaftLogik.kandidatMarken(kandidat()), [])
        XCTAssertEqual(MannschaftLogik.kandidatMarken(kandidat(interesse: true)).map(\.text), ["Interesse"])
        XCTAssertEqual(
            MannschaftLogik.kandidatMarken(kandidat(interesse: true, team: "Herren 1")),
            [.init(text: "Interesse", ton: .gruen), .init(text: "spielt in Herren 1", ton: .grau)]
        )
        XCTAssertEqual(MannschaftLogik.kandidatUnterzeile(kandidat(lk: nil)), "ohne LK")
    }

    func testEingeladeneSindGesperrt() {
        XCTAssertTrue(MannschaftLogik.kannEinladen(kandidat()))
        XCTAssertEqual(MannschaftLogik.einladenKnopf(kandidat()), "Einladen")
        XCTAssertFalse(MannschaftLogik.kannEinladen(kandidat(eingeladen: true)))
        XCTAssertEqual(MannschaftLogik.einladenKnopf(kandidat(eingeladen: true)), "Eingeladen")
        XCTAssertEqual(MannschaftLogik.eingeladenMeldung(kandidat()), "Lena Kurz ist eingeladen.")

        let andere = MannschaftKandidat(
            memberId: "k2", firstName: "A", lastName: "B", tennisLk: nil,
            mannschaftInteresse: nil, aktuelleMannschaft: nil, eingeladen: false
        )
        let neu = MannschaftLogik.alsEingeladen([kandidat(), andere], "k1")
        XCTAssertEqual(neu.map { $0.eingeladen }, [true, false])
    }

    // MARK: - Push und Neuigkeiten

    func testNachrichtenArten() {
        for kind in ["team_invited", "team_invitation_answered", "team_removed", "team_left"] {
            XCTAssertTrue(MannschaftLogik.istMannschaftsNachricht(kind), kind)
            XCTAssertEqual(PushZiel.aus(["kind": kind]), .mannschaft, kind)
            // Auch wenn der Pfad noch die Neuigkeiten nennt.
            XCTAssertEqual(PushZiel.aus(["kind": kind, "ziel": "/nachrichten"]), .mannschaft, kind)
        }
        XCTAssertFalse(MannschaftLogik.istMannschaftsNachricht("booking_cancelled"))
        XCTAssertFalse(MannschaftLogik.istMannschaftsNachricht(nil))
        XCTAssertEqual(PushZiel.aus(["kind": "booking_cancelled"]), .nachrichten)
    }

    func testPfadMannschaft() {
        XCTAssertEqual(PushZiel.ausPfad("/konto/mannschaft"), .mannschaft)
        XCTAssertEqual(PushZiel.ausPfad("/konto/mannschaft?x=1#y"), .mannschaft)
        XCTAssertEqual(PushZiel.ausPfad("/konto"), .tab(.konto))
        XCTAssertEqual(PushZiel.ausPfad("/konto/anderes"), .tab(.konto))
    }
}
