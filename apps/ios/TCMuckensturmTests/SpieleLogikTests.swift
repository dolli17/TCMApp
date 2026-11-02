import XCTest
@testable import TCMuckensturm

/// Texte, Reihenfolge und Knoepfe von "Meine & offene Spiele" (SpieleLogik) - wie plaetze/spiele.tsx.
final class SpieleLogikTests: XCTestCase {
    /// Montag, 28.09.2026, 14:00 in Berlin
    private let jetzt = Zeit.datum("2026-09-28T12:00:00Z")!

    private func buchung(
        id: String = "b1", start: String = "2026-09-28T15:00:00Z", ende: String = "2026-09-28T16:00:00Z",
        players: [String?]? = nil, owner: String? = "Max Muster", bucher: Bool? = true
    ) throws -> MeineBuchung {
        let json: [String: Any?] = [
            "booking_id": id, "starts_at": start, "ends_at": ende, "court_name": "Platz 3", "type_name": "Einzel",
            "owner_name": owner, "bin_bucher": bucher, "players": players,
        ]
        let daten = try JSONSerialization.data(withJSONObject: json.mapValues { $0 ?? NSNull() })
        return try JSONDecoder().decode(MeineBuchung.self, from: daten)
    }

    private func spiel(
        id: String = "o1", start: String = "2026-09-29T15:00:00Z", players: [String?] = [], frei: Int = 2,
        dabei: Bool = false, owner: String? = "Erika Mustermann"
    ) throws -> OffenesSpiel {
        let json: [String: Any?] = [
            "booking_id": id, "starts_at": start, "ends_at": "2026-09-29T16:30:00Z", "court_name": "Platz 2",
            "type_name": "Doppel", "owner_name": owner, "players": players, "frei": frei, "bin_dabei": dabei,
        ]
        let daten = try JSONSerialization.data(withJSONObject: json.mapValues { $0 ?? NSNull() })
        return try JSONDecoder().decode(OffenesSpiel.self, from: daten)
    }

    // MARK: - Reihenfolge

    func testAbschnitte() {
        XCTAssertEqual(SpieleLogik.abschnitte(offeneZuerst: false), [.meine, .offen])
        XCTAssertEqual(SpieleLogik.abschnitte(offeneZuerst: true), [.offen, .meine])
    }

    @MainActor func testZustand() {
        let z = PlaetzeZustand()
        XCTAssertEqual(z.sicht, .belegung)
        z.oeffne(.spiele(offeneZuerst: true))
        XCTAssertEqual(z.sicht, .spiele)
        XCTAssertTrue(z.offeneZuerst)
        // Der Umschalter zeigt die Spiele wieder in der gewohnten Reihenfolge.
        z.wechsle(zu: .belegung)
        z.wechsle(zu: .spiele)
        XCTAssertFalse(z.offeneZuerst)
        z.oeffne(.belegung)
        XCTAssertEqual(z.sicht, .belegung)
        XCTAssertEqual(PlaetzeSicht.allCases.map(\.label), ["Belegung", "Meine & offene Spiele"])
    }

    // MARK: - Deine Termine

    func testTermineSortiertUndOhneVergangene() throws {
        let vorbei = try buchung(id: "alt", start: "2026-09-28T09:00:00Z", ende: "2026-09-28T10:00:00Z")
        let laeuft = try buchung(id: "jetzt", start: "2026-09-28T11:30:00Z", ende: "2026-09-28T12:30:00Z")
        let morgen = try buchung(id: "morgen", start: "2026-09-29T15:00:00Z", ende: "2026-09-29T16:00:00Z")
        let heute = try buchung(id: "heute")
        XCTAssertEqual(SpieleLogik.termine([morgen, vorbei, heute, laeuft], jetzt: jetzt).map(\.id), ["jetzt", "heute", "morgen"])
        XCTAssertEqual(SpieleLogik.eigene([heute, try buchung(id: "fremd", bucher: false)]), ["heute"])
    }

    func testGebuchtStorniertEingetragenTraegtAus() throws {
        XCTAssertEqual(SpieleLogik.aktion(try buchung(bucher: true), jetzt: jetzt), .stornieren)
        XCTAssertEqual(SpieleLogik.aktion(try buchung(bucher: false), jetzt: jetzt), .austragen)
        // ohne Angabe gilt: eingetragen
        XCTAssertEqual(SpieleLogik.aktion(try buchung(bucher: nil), jetzt: jetzt), .austragen)
    }

    func testNurBisSpielbeginn() throws {
        let begonnen = try buchung(start: "2026-09-28T11:30:00Z", ende: "2026-09-28T12:30:00Z")
        XCTAssertNil(SpieleLogik.aktion(begonnen, jetzt: jetzt))
        XCTAssertNil(SpieleLogik.aktion(try buchung(start: "2026-09-28T12:00:00Z", bucher: false), jetzt: jetzt))
        XCTAssertEqual(SpieleLogik.aktion(try buchung(start: "2026-09-28T12:01:00Z", bucher: false), jetzt: jetzt), .austragen)
        XCTAssertEqual(
            SpieleLogik.terminLabel(begonnen, jetzt: jetzt),
            "Heute, 13:30 – 14:30, Platz 3 · Einzel, nur du, läuft"
        )
    }

    func testKarte() throws {
        let heute = try buchung(players: ["Max Muster", "Erika", nil, "Jonas"])
        XCTAssertEqual(SpieleLogik.kachelTag(heute, jetzt: jetzt), "HEUTE")
        XCTAssertEqual(SpieleLogik.uhrzeit(heute.startsAt), "17:00")
        XCTAssertEqual(SpieleLogik.terminTitel(heute), "Platz 3 · Einzel")
        XCTAssertEqual(SpieleLogik.terminZeile(heute), "mit Erika, Jonas")
        XCTAssertEqual(SpieleLogik.terminZeile(try buchung(players: ["Max Muster"])), "nur du")
        XCTAssertEqual(
            SpieleLogik.terminZeile(try buchung(players: ["Max Muster", "Ich"], bucher: false)),
            "du bist eingetragen · gebucht von Max Muster"
        )
        XCTAssertEqual(SpieleLogik.kachelTag(try buchung(start: "2026-09-29T15:00:00Z"), jetzt: jetzt), "MORGEN")
        // Mittwoch, 30.09.
        XCTAssertEqual(SpieleLogik.kachelTag(try buchung(start: "2026-09-30T15:00:00Z"), jetzt: jetzt), "MI 30.")
        XCTAssertTrue(SpieleLogik.hervorgehoben(heute, index: 0, jetzt: jetzt))
        XCTAssertFalse(SpieleLogik.hervorgehoben(heute, index: 1, jetzt: jetzt))
        XCTAssertFalse(SpieleLogik.hervorgehoben(try buchung(start: "2026-09-29T15:00:00Z"), index: 0, jetzt: jetzt))
        XCTAssertEqual(SpieleLogik.terminLabel(heute, jetzt: jetzt), "Heute, 17:00 – 18:00, Platz 3 · Einzel, mit Erika, Jonas")
        XCTAssertEqual(SpieleLogik.optionenLabel(heute, jetzt: jetzt), "Optionen für Heute 17:00")
    }

    /// Austragen storniert die ganze Buchung - das muss die Rueckfrage sagen.
    func testRueckfragen() {
        let aus = SpieleLogik.rueckfrage(.austragen)
        XCTAssertEqual(aus.titel, "Austragen und Buchung stornieren?")
        XCTAssertEqual(
            aus.text,
            "Wenn du dich austrägst, wird die ganze Buchung storniert. Der Bucher und alle Mitspieler werden benachrichtigt."
        )
        XCTAssertEqual(aus.knopf, "Austragen und stornieren")
        XCTAssertEqual(SpieleLogik.rueckfrage(.stornieren).titel, "Buchung stornieren?")
        XCTAssertEqual(SpieleLogik.aktionText(.austragen), "Mich austragen")
        XCTAssertEqual(SpieleLogik.aktionText(.stornieren), "Buchung stornieren")
    }

    // MARK: - Offene Spiele

    func testOffenesSpiel() throws {
        let o = try spiel(players: ["Anna Schmidt"], frei: 2)
        XCTAssertEqual(SpieleLogik.spielKicker(o, jetzt: jetzt), "Morgen · Platz 2")
        XCTAssertEqual(SpieleLogik.besetzung(o), "Doppel · 2 von 4 dabei")
        XCTAssertEqual(SpieleLogik.leute(o), ["Erika Mustermann", "Anna Schmidt"])
        XCTAssertEqual(SpieleLogik.offenesSpielText(o, eigene: []).kopf, "Erika Mustermann sucht 2 Mitspieler")
        XCTAssertEqual(SpieleLogik.offenesSpielText(o, eigene: ["o1"]).kopf, "Du suchst 2 Mitspieler")
        XCTAssertEqual(SpieleLogik.mitspielenLabel(o, jetzt: jetzt), "Mitspielen: Doppel Morgen 17:00")
    }

    func testMitspielen() throws {
        XCTAssertTrue(SpieleLogik.darfMitspielen(try spiel(), eigene: [], jetzt: jetzt))
        XCTAssertFalse(SpieleLogik.darfMitspielen(try spiel(), eigene: ["o1"], jetzt: jetzt), "eigenes Spiel")
        XCTAssertFalse(SpieleLogik.darfMitspielen(try spiel(dabei: true), eigene: [], jetzt: jetzt), "schon dabei")
        XCTAssertFalse(SpieleLogik.darfMitspielen(try spiel(frei: 0), eigene: [], jetzt: jetzt), "voll")
        XCTAssertFalse(SpieleLogik.darfMitspielen(try spiel(start: "2026-09-28T11:00:00Z"), eigene: [], jetzt: jetzt), "begonnen")
    }

    func testInitialen() {
        XCTAssertEqual(SpieleLogik.initialen("Erika Mustermann"), "EM")
        XCTAssertEqual(SpieleLogik.initialen("Anna Maria Schmidt"), "AS")
        XCTAssertEqual(SpieleLogik.initialen("  jonas "), "J")
        XCTAssertEqual(SpieleLogik.initialen(""), "")
    }

    func testAufzaehlung() {
        XCTAssertEqual(SpieleLogik.aufzaehlung([]), "")
        XCTAssertEqual(SpieleLogik.aufzaehlung(["A"]), "A")
        XCTAssertEqual(SpieleLogik.aufzaehlung(["A", "B"]), "A und B")
        XCTAssertEqual(SpieleLogik.aufzaehlung(["A", "B", "C"]), "A, B und C")
    }

    // MARK: - Golden File

    func testOffenesSpielTextGolden() throws {
        struct Spiel: Decodable {
            let owner_name: String?
            let players: [String?]
            let frei: Int
        }
        struct In: Decodable {
            let spiel: Spiel
            let eigenes: Bool?
        }
        struct Aus: Decodable {
            let kopf: String
            let dabei: String?
        }
        struct Fall: Decodable {
            let name: String
            let input: In
            let output: Aus
        }
        let url = try XCTUnwrap(
            Bundle(for: Self.self).url(forResource: "offenesSpielText", withExtension: "json", subdirectory: "golden")
        )
        let faelle = try JSONDecoder().decode([Fall].self, from: Data(contentsOf: url))
        XCTAssertFalse(faelle.isEmpty)
        for f in faelle {
            let t = SpieleLogik.offenesSpielText(
                ownerName: f.input.spiel.owner_name, players: f.input.spiel.players, frei: f.input.spiel.frei,
                eigenes: f.input.eigenes ?? false
            )
            XCTAssertEqual(t, OffenesSpielText(kopf: f.output.kopf, dabei: f.output.dabei), f.name)
        }
    }
}
