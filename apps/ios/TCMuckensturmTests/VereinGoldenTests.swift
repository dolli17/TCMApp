import XCTest
@testable import TCMuckensturm

/**
 * Prueft den Kern des Tabs Verein (Kern/Veranstaltungen.swift, Kern/Getraenke.swift)
 * gegen packages/core/golden/<funktion>.json - jeden Fall, wie KernGoldenTests.
 */
final class VereinGoldenTests: XCTestCase {
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

    private func zeit(_ iso: String) throws -> Date {
        try XCTUnwrap(Zeit.datum(iso), iso)
    }

    // MARK: - Veranstaltungen

    struct EventJetzt: Decodable { let e: MitgliedEvent; let now: String }
    struct EventBegleitung: Decodable { let e: MitgliedEvent; let begleitpersonen: Int }
    struct NurEvent: Decodable { let e: MitgliedEvent }
    struct Spanne: Decodable { let startsAt: String; let endsAt: String? }

    func testEventMonatsGruppen() throws {
        struct In: Decodable { let liste: [MitgliedEvent]; let now: String; let vergangen: Bool? }
        struct Event: Decodable { let id: String }
        struct Gruppe: Decodable { let schluessel: String; let titel: String; let events: [Event] }
        for f in try faelle("eventMonatsGruppen", In.self, [Gruppe].self) {
            let g = Veranstaltungen.eventMonatsGruppen(f.input.liste, now: try zeit(f.input.now), vergangen: f.input.vergangen ?? false)
            XCTAssertEqual(g.map(\.schluessel), f.output.map(\.schluessel), f.name)
            XCTAssertEqual(g.map(\.titel), f.output.map(\.titel), f.name)
            XCTAssertEqual(g.map { $0.events.map(\.id) }, f.output.map { $0.events.map(\.id) }, f.name)
        }
    }

    func testEventLangeZeit() throws {
        for f in try faelle("eventLangeZeit", Spanne.self, String.self) {
            XCTAssertEqual(Veranstaltungen.eventLangeZeit(startsAt: f.input.startsAt, endsAt: f.input.endsAt), f.output, f.name)
        }
    }

    func testEventZeitText() throws {
        for f in try faelle("eventZeitText", Spanne.self, String.self) {
            XCTAssertEqual(Veranstaltungen.eventZeitText(startsAt: f.input.startsAt, endsAt: f.input.endsAt), f.output, f.name)
        }
    }

    func testEventStatusMarke() throws {
        struct Marke: Decodable { let text: String; let ton: String }
        for f in try faelle("eventStatusMarke", EventJetzt.self, Marke.self) {
            let m = Veranstaltungen.eventStatusMarke(f.input.e, now: try zeit(f.input.now))
            XCTAssertEqual(m.text, f.output.text, f.name)
            XCTAssertEqual(m.ton.rawValue, f.output.ton, f.name)
        }
    }

    func testEventBelegungText() throws {
        for f in try faelle("eventBelegungText", NurEvent.self, String.self) {
            XCTAssertEqual(Veranstaltungen.eventBelegungText(f.input.e), f.output, f.name)
        }
    }

    func testEventAenderbar() throws {
        for f in try faelle("eventAenderbar", EventJetzt.self, Bool.self) {
            XCTAssertEqual(Veranstaltungen.eventAenderbar(f.input.e, now: try zeit(f.input.now)), f.output, f.name)
        }
    }

    func testEventAbmeldbar() throws {
        for f in try faelle("eventAbmeldbar", EventJetzt.self, Bool.self) {
            XCTAssertEqual(Veranstaltungen.eventAbmeldbar(f.input.e, now: try zeit(f.input.now)), f.output, f.name)
        }
    }

    func testEventNurWarteliste() throws {
        for f in try faelle("eventNurWarteliste", EventBegleitung.self, Bool.self) {
            XCTAssertEqual(
                Veranstaltungen.eventNurWarteliste(f.input.e, begleitpersonen: f.input.begleitpersonen), f.output, f.name
            )
        }
    }

    func testEventPersonenText() throws {
        struct In: Decodable { let begleitpersonen: Int }
        for f in try faelle("eventPersonenText", In.self, String.self) {
            XCTAssertEqual(Veranstaltungen.eventPersonenText(f.input.begleitpersonen), f.output, f.name)
        }
    }

    func testEventAnmeldenKnopf() throws {
        for f in try faelle("eventAnmeldenKnopf", EventBegleitung.self, String.self) {
            XCTAssertEqual(
                Veranstaltungen.eventAnmeldenKnopf(f.input.e, begleitpersonen: f.input.begleitpersonen), f.output, f.name
            )
        }
    }

    func testEventAbmeldenKnopf() throws {
        for f in try faelle("eventAbmeldenKnopf", EventJetzt.self, String.self) {
            XCTAssertEqual(Veranstaltungen.eventAbmeldenKnopf(f.input.e, now: try zeit(f.input.now)), f.output, f.name)
        }
    }

    func testEventGebuehrHinweis() throws {
        for f in try faelle("eventGebuehrHinweis", NurEvent.self, String?.self) {
            XCTAssertEqual(Veranstaltungen.eventGebuehrHinweis(f.input.e), f.output, f.name)
        }
    }

    func testEventWartelisteText() throws {
        struct In: Decodable { let platz: Int?; let laenge: Int }
        for f in try faelle("eventWartelisteText", In.self, String.self) {
            XCTAssertEqual(Veranstaltungen.eventWartelisteText(platz: f.input.platz, laenge: f.input.laenge), f.output, f.name)
        }
    }

    // MARK: - Getraenke

    struct Artikel: Decodable, Korbartikel {
        let id: String
        let priceCents: Int?
        enum CodingKeys: String, CodingKey { case id, priceCents = "price_cents" }
    }

    struct Ergebnis: Decodable {
        let id: String?
        let name: String
        let quantity: Int
        let ok: Bool
        let message: String?

        var alsErgebnis: EintragErgebnis {
            EintragErgebnis(id: id ?? name, name: name, quantity: quantity, ok: ok, message: message)
        }
    }

    func testChangeBasket() throws {
        struct In: Decodable { let basket: [String: Int]; let itemId: String; let delta: Int }
        for f in try faelle("changeBasket", In.self, [String: Int].self) {
            XCTAssertEqual(Getraenke.changeBasket(f.input.basket, itemId: f.input.itemId, delta: f.input.delta), f.output, f.name)
        }
    }

    func testBasketSummary() throws {
        struct In: Decodable { let items: [Artikel]; let basket: [String: Int] }
        struct Out: Decodable { let lines: [Artikel]; let count: Int; let totalCents: Int }
        for f in try faelle("basketSummary", In.self, Out.self) {
            let s = Getraenke.basketSummary(f.input.items, f.input.basket)
            XCTAssertEqual(s.lines.map(\.id), f.output.lines.map(\.id), f.name)
            XCTAssertEqual(s.count, f.output.count, f.name)
            XCTAssertEqual(s.totalCents, f.output.totalCents, f.name)
        }
    }

    func testBasketAfterBatch() throws {
        struct In: Decodable { let results: [Ergebnis] }
        for f in try faelle("basketAfterBatch", In.self, [String: Int].self) {
            XCTAssertEqual(Getraenke.basketAfterBatch(f.input.results.map(\.alsErgebnis)), f.output, f.name)
        }
    }

    func testBasketReminder() throws {
        struct In: Decodable { let count: Int; let totalCents: Int }
        for f in try faelle("basketReminder", In.self, String.self) {
            XCTAssertEqual(Getraenke.basketReminder(count: f.input.count, totalCents: f.input.totalCents), f.output, f.name)
        }
    }

    func testDrinkBatchReport() throws {
        struct In: Decodable { let results: [Ergebnis] }
        struct Out: Decodable { let ok: Bool; let text: String }
        for f in try faelle("drinkBatchReport", In.self, Out.self) {
            let r = Getraenke.drinkBatchReport(f.input.results.map(\.alsErgebnis))
            XCTAssertEqual(r.ok, f.output.ok, f.name)
            XCTAssertEqual(r.text, f.output.text, f.name)
        }
    }

    func testCanVoidSelf() throws {
        struct Kauf: Decodable { let createdAt: String; let voidedAt: String? }
        struct In: Decodable { let purchase: Kauf; let windowMinutes: Int; let now: String }
        for f in try faelle("canVoidSelf", In.self, Bool.self) {
            XCTAssertEqual(
                Getraenke.canVoidSelf(
                    createdAt: f.input.purchase.createdAt, voidedAt: f.input.purchase.voidedAt,
                    fensterMinuten: f.input.windowMinutes, now: try zeit(f.input.now)
                ),
                f.output,
                f.name
            )
        }
    }
}
