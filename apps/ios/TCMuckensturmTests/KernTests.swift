import XCTest
@testable import TCMuckensturm

/**
 * Was der Kern ueber die Golden Files hinaus fuer Home braucht. Die Faelle
 * stammen aus packages/core/src/home.test.ts und veranstaltungen-*.test.ts.
 * JETZT ist Montag, 28.09.2026, 14:00 in Berlin.
 */
final class KernTests: XCTestCase {
    private let jetzt = Zeit.datum("2026-09-28T12:00:00Z")!

    private func um(_ tag: String, _ uhr: String) -> String {
        Zeit.iso(Zeit.berlinTime(day: tag, minutes: Zeit.timeToMinutes(uhr)))
    }

    func testDatumLiestPostgrestUndJavaScript() {
        let soll = Zeit.datum("2026-07-15T16:30:00.000Z")
        XCTAssertNotNil(soll)
        XCTAssertEqual(Zeit.datum("2026-07-15T16:30:00+00:00"), soll)
        XCTAssertEqual(Zeit.datum("2026-07-15T18:30:00+02:00"), soll)
        XCTAssertEqual(Zeit.datum("2026-07-15 16:30:00+00"), soll)
        XCTAssertEqual(Zeit.datum("2026-07-15T16:30:00Z"), soll)
        XCTAssertEqual(Zeit.iso(Zeit.datum("2026-07-15T16:30:00.123456+00:00")!), "2026-07-15T16:30:00.123Z")
        XCTAssertEqual(Zeit.iso(Zeit.datum("2026-09-01")!), "2026-09-01T00:00:00.000Z")
        XCTAssertNil(Zeit.datum("gestern"))
    }

    /// Die Geraetezeitzone spielt keine Rolle - gerechnet wird in Berlin.
    func testUnabhaengigVonGeraetezeitzone() {
        let alt = NSTimeZone.default
        defer { NSTimeZone.default = alt }
        NSTimeZone.default = TimeZone(identifier: "America/Los_Angeles")!
        XCTAssertEqual(Zeit.minutesOf("2026-07-15T16:30:00Z"), 1110)
        XCTAssertEqual(Zeit.berlinDay(Zeit.datum("2026-09-27T22:30:00Z")!), "2026-09-28")
        XCTAssertEqual(Startseite.dayLabel(startsAt: um("2026-10-01", "19:00"), now: jetzt), "Donnerstag, 01.10.")
    }

    func testBookingKicker() {
        let k = { (tag: String, von: String, bis: String) in
            Startseite.bookingKicker(startsAt: self.um(tag, von), endsAt: self.um(tag, bis), now: self.jetzt)
        }
        XCTAssertEqual(k("2026-09-28", "17:00", "18:00"), "Heute · in 3 Stunden")
        XCTAssertEqual(k("2026-09-28", "15:00", "16:00"), "Heute · in 1 Stunde")
        XCTAssertEqual(k("2026-09-28", "14:30", "15:30"), "Heute · in 30 Minuten")
        XCTAssertEqual(k("2026-09-28", "13:30", "14:30"), "Heute · läuft gerade")
        XCTAssertEqual(k("2026-09-29", "09:00", "10:00"), "Morgen")
        XCTAssertEqual(k("2026-09-30", "18:00", "19:00"), "Mittwoch · 30.09.")
    }

    func testRelativeTimeLabel() {
        let vor = { (minuten: Double) in Zeit.iso(self.jetzt.addingTimeInterval(-minuten * 60)) }
        XCTAssertEqual(Startseite.relativeTimeLabel(vor(0), now: jetzt), "gerade eben")
        XCTAssertEqual(Startseite.relativeTimeLabel(vor(5), now: jetzt), "vor 5 Min.")
        XCTAssertEqual(Startseite.relativeTimeLabel(vor(125), now: jetzt), "vor 2 Std.")
        XCTAssertEqual(Startseite.relativeTimeLabel(um("2026-09-27", "20:00"), now: jetzt), "gestern")
        XCTAssertEqual(Startseite.relativeTimeLabel(um("2026-09-26", "10:00"), now: jetzt), "Sa")
        XCTAssertEqual(Startseite.relativeTimeLabel(um("2026-09-10", "10:00"), now: jetzt), "10.09.")
    }

    struct N: Benachrichtigungsdaten {
        let id: String
        let createdAt: String
        let readAt: String?
    }

    func testStartseitenNeuigkeiten() {
        let n = { (id: String, tage: Double, gelesen: Bool) in
            N(id: id, createdAt: Zeit.iso(self.jetzt.addingTimeInterval(-tage * 86_400)), readAt: gelesen ? "2026-09-28T12:00:00Z" : nil)
        }
        let ids = { (liste: [N]) in Startseite.startseitenNeuigkeiten(liste, now: self.jetzt).map(\.id) }
        XCTAssertEqual(ids([n("frisch", 1, true), n("grenze", 7, true), n("alt", 7.01, true)]), ["frisch", "grenze"])
        XCTAssertEqual(ids([n("uralt", 40, false)]), ["uralt"])
        XCTAssertEqual(ids(["a", "b", "c", "d"].map { n($0, 0, false) }), ["a", "b", "c"])
        XCTAssertEqual(ids([n("alt", 8, true)]), [])
    }

    func testGroupNotifications() {
        let jetzt = Zeit.datum("2026-09-28T08:00:00Z")!
        let liste = ["2026-09-28T07:00:00Z", "2026-09-27T22:30:00Z", "2026-09-27T10:00:00Z", "2026-09-23T10:00:00Z", "2026-09-10T10:00:00Z"]
            .map { N(id: $0, createdAt: $0, readAt: nil) }
        let g = Startseite.groupNotifications(liste, now: jetzt)
        XCTAssertEqual(g.map(\.label), ["Heute", "Gestern", "Diese Woche", "Früher"])
        XCTAssertEqual(g.map(\.items.count), [2, 1, 1, 1])
        XCTAssertTrue(Startseite.groupNotifications([N](), now: jetzt).isEmpty)
    }

    struct B: Zeitraum, Belegungsmerkmale {
        let startsAt: String
        let endsAt: String
        var kind: String? = "booking"
        var isOwn: Bool?
        var partnerWanted: Bool?
        var frei: Int?
        var seriesId: String?
    }

    func testTimelineSegmenteUndPosition() {
        let b = { (von: String, bis: String) in B(startsAt: self.um("2026-09-28", von), endsAt: self.um("2026-09-28", bis)) }
        let s = Startseite.timelineSegments([b("08:00", "09:00")], openingMinutes: 480, closingMinutes: 1260)
        XCTAssertEqual(s.first?.left, 0)
        XCTAssertEqual(s.first?.width ?? 0, 100 / 13, accuracy: 0.0001)
        let rand = Startseite.timelineSegments([b("20:30", "22:00")], openingMinutes: 480, closingMinutes: 1260)
        XCTAssertEqual((rand.first?.left ?? 0) + (rand.first?.width ?? 0), 100, accuracy: 0.0001)
        var serie = b("16:00", "19:00")
        serie.seriesId = "s1"
        serie.isOwn = true
        XCTAssertEqual(Startseite.timelineSegments([serie], openingMinutes: 480, closingMinutes: 1260).first?.art, .serie)
        XCTAssertEqual(Startseite.timelinePosition(360, openingMinutes: 480, closingMinutes: 1260), 0)
        XCTAssertEqual(Startseite.timelinePosition(870, openingMinutes: 480, closingMinutes: 1260), 50)
        XCTAssertEqual(Startseite.timelinePosition(1320, openingMinutes: 480, closingMinutes: 1260), 100)
    }

    func testNotificationSymbolUndZiel() {
        XCTAssertEqual(Startseite.notificationSymbol("booking_cancelled"), .storno)
        XCTAssertEqual(Startseite.notificationSymbol("booking_created"), .platz)
        XCTAssertEqual(Startseite.notificationSymbol("player_left"), .platz)
        XCTAssertEqual(Startseite.notificationSymbol("charge_created"), .geld)
        XCTAssertEqual(Startseite.notificationSymbol("application_new"), .person)
        XCTAssertEqual(Startseite.notificationSymbol("event_cancelled"), .storno)
        XCTAssertEqual(Startseite.notificationSymbol("sonstwas"), .glocke)
        XCTAssertNil(Startseite.notificationZiel(eventId: nil))
        XCTAssertEqual(Startseite.notificationZiel(eventId: "e1")?.app, "/verein/veranstaltung/e1")
    }

    func testFormatCentsMitTausenderpunktUndMinus() {
        XCTAssertEqual(Geld.formatCents(12_345_670), "123.456,70\u{00A0}€")
        XCTAssertEqual(Geld.formatCents(-250), "-2,50\u{00A0}€")
    }

    // MARK: - Veranstaltungen

    private func event(_ felder: [String: Any]) throws -> MitgliedEvent {
        var basis: [String: Any] = [
            "id": "e1", "kind": "fest", "status": "published", "title": "Sommerfest",
            "starts_at": "2026-11-06T18:00:00+00:00", "ends_at": "2026-11-06T22:30:00+00:00",
            "registration_enabled": true, "personen": 7,
        ]
        basis.merge(felder) { $1 }
        return try JSONDecoder().decode(MitgliedEvent.self, from: JSONSerialization.data(withJSONObject: basis))
    }

    func testEventKarte() throws {
        let e = try event(["location": "Clubhaus", "fee_cents": 1800, "max_participants": 25])
        XCTAssertEqual(Veranstaltungen.eventKartenZeit(e), "Fr 19–23:30 Uhr · Clubhaus")
        XCTAssertEqual(Veranstaltungen.eventKartenZeile(e, now: jetzt), "18,00\u{00A0}€ p. P. · noch 18 Plätze frei")
        XCTAssertEqual(Veranstaltungen.eventDatumKachel(e.startsAt).tag, "06")
        XCTAssertEqual(Veranstaltungen.eventDatumKachel(e.startsAt).monat, "Nov")
        XCTAssertEqual(Veranstaltungen.eventMeineMarke(e, now: jetzt, aufforderung: true), MeineMarke(text: "Anmelden", ton: .gelb))
        XCTAssertNil(Veranstaltungen.eventMeineMarke(e, now: jetzt))

        let dienst = try event(["kind": "arbeitsdienst", "work_hours": "2.5", "max_participants": 10, "personen": 4])
        XCTAssertEqual(Veranstaltungen.eventKartenZeile(dienst, now: jetzt), "2,5 Std. Arbeitsdienst · 4 von 10 Plätzen")

        let dabei = try event(["mein_status": "registered", "meine_begleitpersonen": 1])
        XCTAssertEqual(Veranstaltungen.eventMeineMarke(dabei, now: jetzt), MeineMarke(text: "Angemeldet · 2", ton: .gruen))

        XCTAssertEqual(Veranstaltungen.eventKartenZeile(try event(["status": "cancelled"]), now: jetzt), "Abgesagt")
        XCTAssertEqual(Veranstaltungen.eventKartenZeile(try event(["registration_enabled": false]), now: jetzt), "Ohne Anmeldung")
    }

    func testEventDemnaechst() throws {
        let liste = [
            try event(["id": "spaeter", "starts_at": "2026-12-01T18:00:00Z", "ends_at": NSNull()]),
            try event(["id": "vorbei", "starts_at": "2026-09-01T18:00:00Z", "ends_at": "2026-09-01T20:00:00Z"]),
            try event(["id": "entwurf", "status": "draft"]),
            try event(["id": "bald"]),
            try event(["id": "noch spaeter", "starts_at": "2027-01-01T18:00:00Z", "ends_at": NSNull()]),
        ]
        XCTAssertEqual(Veranstaltungen.eventDemnaechst(liste, now: jetzt).map(\.id), ["bald", "spaeter"])
    }
}
