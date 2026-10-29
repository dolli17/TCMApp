import XCTest
@testable import TCMuckensturm

/**
 * Prueft den Swift-Kern gegen packages/core/golden/<funktion>.json - jeden Fall.
 * Die Dateien kommen ueber project.yml als Ordner "golden" ins Testbundle.
 * Passt ein Fall nicht, ist die Portierung falsch (packages/core/golden/README.md).
 */
final class KernGoldenTests: XCTestCase {
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

    // MARK: - Zeit

    func testBerlinTime() throws {
        struct In: Decodable { let day: String; let minutes: Int }
        for f in try faelle("berlinTime", In.self, String.self) {
            XCTAssertEqual(Zeit.iso(Zeit.berlinTime(day: f.input.day, minutes: f.input.minutes)), f.output, f.name)
        }
    }

    func testMinutesOf() throws {
        struct In: Decodable { let iso: String }
        for f in try faelle("minutesOf", In.self, Int.self) {
            XCTAssertEqual(Zeit.minutesOf(f.input.iso), f.output, f.name)
        }
    }

    func testMinutesToTime() throws {
        struct In: Decodable { let minutes: Int }
        for f in try faelle("minutesToTime", In.self, String.self) {
            XCTAssertEqual(Zeit.minutesToTime(f.input.minutes), f.output, f.name)
        }
    }

    func testTimeToMinutes() throws {
        struct In: Decodable { let value: String }
        for f in try faelle("timeToMinutes", In.self, Int.self) {
            XCTAssertEqual(Zeit.timeToMinutes(f.input.value), f.output, f.name)
        }
    }

    // MARK: - Startseite

    struct TagIn: Decodable { let startsAt: String; let now: String }

    func testDayLabel() throws {
        for f in try faelle("dayLabel", TagIn.self, String.self) {
            XCTAssertEqual(Startseite.dayLabel(startsAt: f.input.startsAt, now: try zeit(f.input.now)), f.output, f.name)
        }
    }

    func testDayTag() throws {
        for f in try faelle("dayTag", TagIn.self, String.self) {
            XCTAssertEqual(Startseite.dayTag(startsAt: f.input.startsAt, now: try zeit(f.input.now)), f.output, f.name)
        }
    }

    struct Termin: Decodable, Equatable, Zeitraum {
        let startsAt: String
        let endsAt: String
        enum CodingKeys: String, CodingKey {
            case startsAt = "starts_at", endsAt = "ends_at"
        }
    }

    func testUpcomingBookings() throws {
        struct In: Decodable { let termine: [Termin]; let now: String }
        for f in try faelle("upcomingBookings", In.self, [Termin].self) {
            XCTAssertEqual(Startseite.upcomingBookings(f.input.termine, now: try zeit(f.input.now)), f.output, f.name)
        }
    }

    func testSumOpenDrinks() throws {
        struct Kauf: Decodable, Getraenkekauf {
            let totalCents: Int?
            let voidedAt: String?
            enum CodingKeys: String, CodingKey {
                case totalCents = "total_cents", voidedAt = "voided_at"
            }
        }
        struct In: Decodable { let kaeufe: [Kauf] }
        for f in try faelle("sumOpenDrinks", In.self, Int.self) {
            XCTAssertEqual(Startseite.sumOpenDrinks(f.input.kaeufe), f.output, f.name)
        }
    }

    func testOccupancyKind() throws {
        struct Merkmale: Decodable, Belegungsmerkmale {
            let kind: String?
            let isOwn: Bool?
            let partnerWanted: Bool?
            let frei: Int?
            let seriesId: String?
            enum CodingKeys: String, CodingKey {
                case kind, frei
                case isOwn = "is_own", partnerWanted = "partner_wanted", seriesId = "series_id"
            }
        }
        struct In: Decodable { let b: Merkmale }
        for f in try faelle("occupancyKind", In.self, String.self) {
            XCTAssertEqual(Startseite.occupancyKind(f.input.b).rawValue, f.output, f.name)
        }
    }

    // MARK: - Belegung

    struct Slot: Decodable, BelegterSlot {
        let courtId: String
        let startsAt: String
        let endsAt: String
        enum CodingKeys: String, CodingKey {
            case courtId = "court_id", startsAt = "starts_at", endsAt = "ends_at"
        }
    }

    func testCanStartAt() throws {
        struct In: Decodable {
            let day: String
            let courtId: String
            let minute: Int
            let durationMinutes: Int
            let closingMinutes: Int
            let occupied: [Slot]
            let leadDays: Int?
            let now: String
        }
        for f in try faelle("canStartAt", In.self, Bool.self) {
            let i = f.input
            XCTAssertEqual(
                Belegung.canStartAt(
                    day: i.day, courtId: i.courtId, minute: i.minute, durationMinutes: i.durationMinutes,
                    closingMinutes: i.closingMinutes, occupied: i.occupied, leadDays: i.leadDays, now: try zeit(i.now)
                ),
                f.output, f.name
            )
        }
    }

    func testFreeCourtsNow() throws {
        struct In: Decodable {
            let day: String
            let courtIds: [String]
            let openingMinutes: Int
            let closingMinutes: Int
            let slotMinutes: Int
            let durationMinutes: Int
            let occupied: [Slot]
            let leadDays: Int?
            let now: String
        }
        struct Aus: Decodable, Equatable {
            let courtId: String
            let fromMinute: Int
            let untilMinute: Int
        }
        for f in try faelle("freeCourtsNow", In.self, [Aus].self) {
            let i = f.input
            let ergebnis = Belegung.freeCourtsNow(
                day: i.day, courtIds: i.courtIds, openingMinutes: i.openingMinutes, closingMinutes: i.closingMinutes,
                slotMinutes: i.slotMinutes, durationMinutes: i.durationMinutes, occupied: i.occupied,
                leadDays: i.leadDays, now: try zeit(i.now)
            )
            XCTAssertEqual(
                ergebnis.map { Aus(courtId: $0.courtId, fromMinute: $0.fromMinute, untilMinute: $0.untilMinute) },
                f.output, f.name
            )
        }
    }

    // MARK: - Geld und Fehler

    func testFormatCents() throws {
        struct In: Decodable { let cents: Int }
        for f in try faelle("formatCents", In.self, String.self) {
            XCTAssertEqual(Geld.formatCents(f.input.cents), f.output, f.name)
        }
    }

    func testTranslateDbError() throws {
        struct In: Decodable { let error: PostgresFehler? }
        for f in try faelle("translateDbError", In.self, String.self) {
            XCTAssertEqual(DbFehler.translateDbError(f.input.error), f.output, f.name)
        }
    }
}
