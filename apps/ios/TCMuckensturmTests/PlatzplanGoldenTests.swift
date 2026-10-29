import XCTest
@testable import TCMuckensturm

/**
 * Prueft Kern/Platzplan.swift gegen packages/core/golden/<funktion>.json - jeden Fall.
 * Wie KernGoldenTests, nur fuer den Belegungsplan und das Buchungsblatt.
 */
final class PlatzplanGoldenTests: XCTestCase {
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

    /// Eine Belegung, wie die Golden Files sie schreiben (CourtSlot, UmsetzBuchung).
    struct Slot: Decodable, Equatable, PlanSlot {
        let courtId: String
        let startsAt: String
        let endsAt: String
        let kind: String?
        let isOwn: Bool?
        let partnerWanted: Bool?
        let frei: Int?
        let seriesId: String?
        let title: String?
        let typeName: String?
        let ownerName: String?
        enum CodingKeys: String, CodingKey {
            case kind, frei, title
            case courtId = "court_id", startsAt = "starts_at", endsAt = "ends_at", isOwn = "is_own"
            case partnerWanted = "partner_wanted", seriesId = "series_id", typeName = "type_name", ownerName = "owner_name"
        }
    }

    struct UmsetzSlot: Decodable, BuchungsSlot {
        let bookingId: String
        let courtId: String
        let startsAt: String
        let endsAt: String
        enum CodingKeys: String, CodingKey {
            case bookingId = "booking_id", courtId = "court_id", startsAt = "starts_at", endsAt = "ends_at"
        }
    }

    /// Ein Status mit der Belegung, um die es geht - verglichen als ganzes Objekt.
    struct Status: Decodable, Equatable {
        let art: String
        let text: String
        let belegung: Slot?
    }

    private func status(_ s: CourtStatus<Slot>) -> Status {
        Status(art: s.art.rawValue, text: s.text, belegung: s.belegung)
    }

    // MARK: - Freie Zeiten

    func testCourtStatusAt() throws {
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
        for f in try faelle("courtStatusAt", In.self, Status.self) {
            let i = f.input
            let s = Platzplan.courtStatusAt(
                day: i.day, courtId: i.courtId, minute: i.minute, durationMinutes: i.durationMinutes,
                closingMinutes: i.closingMinutes, occupied: i.occupied, leadDays: i.leadDays, now: try zeit(i.now)
            )
            XCTAssertEqual(status(s), f.output, f.name)
        }
    }

    func testFreeSlotsOfDay() throws {
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
        struct Platz: Decodable, Equatable { let courtId: String; let status: Status }
        struct Zeile: Decodable, Equatable { let minute: Int; let courts: [Platz]; let free: Int }
        for f in try faelle("freeSlotsOfDay", In.self, [Zeile].self) {
            let i = f.input
            let zeilen = Platzplan.freeSlotsOfDay(
                day: i.day, courtIds: i.courtIds, openingMinutes: i.openingMinutes, closingMinutes: i.closingMinutes,
                slotMinutes: i.slotMinutes, durationMinutes: i.durationMinutes, occupied: i.occupied,
                leadDays: i.leadDays, now: try zeit(i.now)
            )
            XCTAssertEqual(
                zeilen.map { z in
                    Zeile(minute: z.minute, courts: z.courts.map { Platz(courtId: $0.courtId, status: status($0.status)) }, free: z.free)
                },
                f.output, f.name
            )
        }
    }

    // MARK: - Raster

    func testFreeGaps() throws {
        struct In: Decodable {
            let day: String
            let courtId: String
            let openingMinutes: Int
            let closingMinutes: Int
            let slotMinutes: Int
            let durationMinutes: Int
            let occupied: [Slot]
            let leadDays: Int?
            let now: String
        }
        struct Luecke: Decodable, Equatable { let courtId: String; let from: Int; let until: Int }
        for f in try faelle("freeGaps", In.self, [Luecke].self) {
            let i = f.input
            let l = Platzplan.freeGaps(
                day: i.day, courtId: i.courtId, openingMinutes: i.openingMinutes, closingMinutes: i.closingMinutes,
                slotMinutes: i.slotMinutes, durationMinutes: i.durationMinutes, occupied: i.occupied,
                leadDays: i.leadDays, now: try zeit(i.now)
            )
            XCTAssertEqual(l.map { Luecke(courtId: $0.courtId, from: $0.from, until: $0.until) }, f.output, f.name)
        }
    }

    func testStartInGap() throws {
        struct Luecke: Decodable { let courtId: String; let from: Int; let until: Int }
        struct In: Decodable { let gap: Luecke; let minute: Int; let slotMinutes: Int; let durationMinutes: Int }
        for f in try faelle("startInGap", In.self, Int.self) {
            let i = f.input
            let gap = FreeGap(courtId: i.gap.courtId, from: i.gap.from, until: i.gap.until)
            XCTAssertEqual(
                Platzplan.startInGap(gap, minute: i.minute, slotMinutes: i.slotMinutes, durationMinutes: i.durationMinutes),
                f.output, f.name
            )
        }
    }

    func testOccupancyLabel() throws {
        struct In: Decodable { let b: Slot }
        struct Aus: Decodable, Equatable { let art: String; let title: String; let detail: String; let spoken: String }
        for f in try faelle("occupancyLabel", In.self, Aus.self) {
            let l = Platzplan.occupancyLabel(f.input.b)
            XCTAssertEqual(Aus(art: l.art.rawValue, title: l.title, detail: l.detail, spoken: l.spoken), f.output, f.name)
        }
    }

    func testBlockingLabel() throws {
        struct B: Decodable {
            let title: String?
            let typeName: String?
            enum CodingKeys: String, CodingKey { case title, typeName = "type_name" }
        }
        struct In: Decodable { let b: B }
        struct Aus: Decodable, Equatable { let kategorie: String; let grund: String? }
        for f in try faelle("blockingLabel", In.self, Aus.self) {
            let l = Platzplan.blockingLabel(title: f.input.b.title, typeName: f.input.b.typeName)
            XCTAssertEqual(Aus(kategorie: l.kategorie, grund: l.grund), f.output, f.name)
        }
    }

    // MARK: - Buchungsblatt

    func testBookingActions() throws {
        struct In: Decodable {
            let startsAt: String
            let own: Bool
            let joined: Bool?
            let partnerWanted: Bool?
            let free: Int?
            let managesCourts: Bool?
            let now: String
        }
        struct Aus: Decodable, Equatable { let cancel: Bool; let editPlayers: Bool; let leave: Bool; let join: Bool }
        for f in try faelle("bookingActions", In.self, Aus.self) {
            let i = f.input
            let a = Platzplan.bookingActions(
                startsAt: i.startsAt, own: i.own, joined: i.joined, partnerWanted: i.partnerWanted, free: i.free,
                managesCourts: i.managesCourts, now: try zeit(i.now)
            )
            XCTAssertEqual(Aus(cancel: a.cancel, editPlayers: a.editPlayers, leave: a.leave, join: a.join), f.output, f.name)
        }
    }

    struct Art: Decodable {
        let code: String
        let name: String
        let durationMinutes: Int
        let minPlayers: Int
        let maxPlayers: Int
        let requiresPartner: Bool

        var info: BookingTypeInfo {
            BookingTypeInfo(
                code: code, name: name, durationMinutes: durationMinutes, minPlayers: minPlayers,
                maxPlayers: maxPlayers, requiresPartner: requiresPartner
            )
        }
    }

    struct BesetzungIn: Decodable {
        let type: Art
        let memberCount: Int
        let guestCount: Int
        let partnerWanted: Bool?
    }

    func testCheckPlayers() throws {
        struct Aus: Decodable, Equatable { let ok: Bool; let reason: String? }
        for f in try faelle("checkPlayers", BesetzungIn.self, Aus.self) {
            let i = f.input
            let grund = Platzplan.checkPlayers(
                i.type.info, memberCount: i.memberCount, guestCount: i.guestCount, partnerWanted: i.partnerWanted ?? false
            )
            XCTAssertEqual(Aus(ok: grund == nil, reason: grund), f.output, f.name)
        }
    }

    func testMissingPlayers() throws {
        for f in try faelle("missingPlayers", BesetzungIn.self, Int.self) {
            let i = f.input
            XCTAssertEqual(
                Platzplan.missingPlayers(i.type.info, memberCount: i.memberCount, guestCount: i.guestCount),
                f.output, f.name
            )
        }
    }

    func testOtherPlayersLabel() throws {
        struct In: Decodable { let type: Art }
        for f in try faelle("otherPlayersLabel", In.self, String.self) {
            XCTAssertEqual(Platzplan.otherPlayersLabel(f.input.type.info), f.output, f.name)
        }
    }

    func testUmsetzZiele() throws {
        struct In: Decodable {
            let booking: UmsetzSlot
            let day: String
            let courtIds: [String]
            let openingMinutes: Int
            let closingMinutes: Int
            let slotMinutes: Int
            let occupied: [UmsetzSlot]
            let now: String
        }
        struct Ziel: Decodable, Equatable { let courtId: String; let minute: Int }
        for f in try faelle("umsetzZiele", In.self, [Ziel].self) {
            let i = f.input
            let ziele = Platzplan.umsetzZiele(
                booking: i.booking, day: i.day, courtIds: i.courtIds, openingMinutes: i.openingMinutes,
                closingMinutes: i.closingMinutes, slotMinutes: i.slotMinutes, occupied: i.occupied, now: try zeit(i.now)
            )
            XCTAssertEqual(ziele.map { Ziel(courtId: $0.courtId, minute: $0.minute) }, f.output, f.name)
        }
    }
}
