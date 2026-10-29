/**
 * Freie Plaetze
 *
 * Portierung aus packages/core/src/booking.ts (canStartAt, nextSlotMinute,
 * latestStart, freeCourtsNow) - fuer "Jetzt frei" auf Home. Durchgesetzt
 * wird die Regel weiterhin nur in create_booking; die App blendet nur aus,
 * was die Datenbank ohnehin ablehnen wuerde.
 */

import Foundation

/// Eine Belegung, wie day_schedule sie liefert - nur was die Frei-Rechnung braucht.
protocol BelegterSlot: Zeitraum {
    var courtId: String { get }
}

struct FreeWindow: Equatable, Sendable {
    let courtId: String
    /// Erste Startzeit im Raster ab jetzt, in Minuten seit Mitternacht
    let fromMinute: Int
    /// Beginn der naechsten Belegung auf diesem Platz, sonst Schluss
    let untilMinute: Int
}

enum Belegung {
    /// Der spaeteste Beginn, den create_booking jetzt noch annimmt: now() plus lead_days Tage.
    static func latestStart(leadDays: Int, now: Date = Date()) -> Date {
        now.addingTimeInterval(TimeInterval(leadDays * 86_400))
    }

    /// Kann auf diesem Platz um genau diese Minute eine Buchung beginnen? (gegen die volle Dauer)
    static func canStartAt(
        day: String,
        courtId: String,
        minute: Int,
        durationMinutes: Int,
        closingMinutes: Int,
        occupied: [some BelegterSlot],
        leadDays: Int? = nil,
        now: Date = Date()
    ) -> Bool {
        let beginn = Zeit.berlinTime(day: day, minutes: minute)
        if beginn < now { return false }
        if let leadDays, beginn > latestStart(leadDays: leadDays, now: now) { return false }
        if minute + durationMinutes > closingMinutes { return false }
        return !occupied.contains { b in
            b.courtId == courtId
                && Zeit.minutesOf(b.startsAt) < minute + durationMinutes
                && Zeit.minutesOf(b.endsAt) > minute
        }
    }

    /// Die naechste Startzeit im Raster ab jetzt - vor der Oeffnung die Oeffnung.
    static func nextSlotMinute(openingMinutes: Int, slotMinutes: Int, now: Date = Date()) -> Int {
        // Angebrochene Minuten zaehlen als vorbei: um 13:30:20 ist 13:30 schon Vergangenheit.
        let millis = Int64((now.timeIntervalSince1970 * 1000).rounded())
        let angebrochen = millis % 60_000 != 0 ? 1 : 0
        let jetzt = Zeit.localMinutes(now) + angebrochen
        if jetzt <= openingMinutes { return openingMinutes }
        let schritte = (Double(jetzt - openingMinutes) / Double(slotMinutes)).rounded(.up)
        return openingMinutes + Int(schritte) * slotMinutes
    }

    /**
     * Welche Plaetze sind ab jetzt frei - und bis wann? Ab der naechsten
     * Startzeit im Raster, frei bis zur naechsten Belegung, sonst bis zum
     * Schluss. Sortiert nach der laengsten freien Zeit, bei Gleichstand in der
     * Reihenfolge der Plaetze.
     */
    static func freeCourtsNow<T: BelegterSlot>(
        day: String,
        courtIds: [String],
        openingMinutes: Int,
        closingMinutes: Int,
        slotMinutes: Int,
        durationMinutes: Int,
        occupied: [T],
        leadDays: Int? = nil,
        now: Date = Date()
    ) -> [FreeWindow] {
        let ab = nextSlotMinute(openingMinutes: openingMinutes, slotMinutes: slotMinutes, now: now)

        var out: [FreeWindow] = []
        for courtId in courtIds {
            let frei = canStartAt(
                day: day, courtId: courtId, minute: ab, durationMinutes: durationMinutes,
                closingMinutes: closingMinutes, occupied: occupied, leadDays: leadDays, now: now
            )
            guard frei else { continue }
            let naechste = occupied
                .filter { $0.courtId == courtId && Zeit.minutesOf($0.endsAt) > ab }
                .map { Zeit.minutesOf($0.startsAt) }
            out.append(FreeWindow(courtId: courtId, fromMinute: ab, untilMinute: ([closingMinutes] + naechste).min()!))
        }

        return out.enumerated()
            .sorted { $0.element.untilMinute != $1.element.untilMinute ? $0.element.untilMinute > $1.element.untilMinute : $0.offset < $1.offset }
            .map(\.element)
    }
}
