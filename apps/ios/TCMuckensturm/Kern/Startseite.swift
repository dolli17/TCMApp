/**
 * Aufbereitung fuer die Startseite
 *
 * Portierung aus packages/core/src/home.ts: welche Termine noch kommen, wie
 * ein Termin ueberschrieben wird, wie alt eine Nachricht ist, was im Monat an
 * Getraenken aufgelaufen ist und wie eine Belegung auf der kleinen Zeitleiste
 * liegt. Gerechnet wird in Europe/Berlin (Zeit).
 */

import Foundation

/// Etwas mit Beginn und Ende als ISO-Text (Buchung, Belegung, offenes Spiel)
protocol Zeitraum {
    var startsAt: String { get }
    var endsAt: String { get }
}

/// Was eine Belegung ausmacht, soweit es fuer ihre Einordnung zaehlt (OccupancyFlags).
protocol Belegungsmerkmale {
    var kind: String? { get }
    var isOwn: Bool? { get }
    var partnerWanted: Bool? { get }
    var frei: Int? { get }
    var seriesId: String? { get }
}

protocol Benachrichtigungsdaten {
    var createdAt: String { get }
    var readAt: String? { get }
}

protocol Getraenkekauf {
    var totalCents: Int? { get }
    var voidedAt: String? { get }
}

enum TimelineKind: String, Sendable, Codable {
    case belegt, eigen, sucht, serie, gesperrt
}

struct TimelineSegment: Equatable, Sendable {
    /// Anteil vom linken Rand, 0 bis 100
    let left: Double
    /// Breite, 0 bis 100
    let width: Double
    let art: TimelineKind
}

enum NotificationSymbol: String, Sendable {
    case platz, storno, geld, person, glocke
}

/// Wohin eine Nachricht fuehrt. Nativ zaehlt die Kennung, die Pfade bleiben fuer Links.
struct NotificationZiel: Equatable, Sendable {
    let eventId: String
    var web: String { "/verein/veranstaltungen/\(eventId)" }
    var app: String { "/verein/veranstaltung/\(eventId)" }
}

enum Startseite {
    /// So viele Tage bleibt eine gelesene Nachricht auf der Startseite stehen.
    static let neuigkeitenTage = 7

    /// Termine, die noch nicht vorbei sind, der naechste zuerst.
    static func upcomingBookings<T: Zeitraum>(_ termine: [T], now: Date = Date()) -> [T] {
        termine
            .filter { (Zeit.datum($0.endsAt)?.timeIntervalSince(now) ?? -1) > 0 }
            .enumerated()
            // stabil wie Array.prototype.sort
            .sorted { $0.element.startsAt != $1.element.startsAt ? $0.element.startsAt < $1.element.startsAt : $0.offset < $1.offset }
            .map(\.element)
    }

    /**
     * Die Zeile ueber der Uhrzeit einer Terminkarte: "Heute · in 3 Stunden",
     * "Heute · läuft gerade", "Morgen", "Mittwoch · 30.09.".
     */
    static func bookingKicker(startsAt: String, endsAt: String, now: Date = Date()) -> String {
        guard let beginn = Zeit.datum(startsAt) else { return "" }
        let tage = Zeit.tageZwischen(now, beginn)

        if tage <= 0 {
            if beginn <= now {
                let ende = Zeit.datum(endsAt) ?? beginn
                return ende > now ? "Heute · läuft gerade" : "Heute"
            }
            let minuten = jsRound(beginn.timeIntervalSince(now) / 60)
            if minuten < 60 { return "Heute · in \(minuten) \(minuten == 1 ? "Minute" : "Minuten")" }
            let stunden = jsRound(Double(minuten) / 60)
            return "Heute · in \(stunden) \(stunden == 1 ? "Stunde" : "Stunden")"
        }
        if tage == 1 { return "Morgen" }
        return "\(Zeit.langerWochentag(beginn)) · \(Zeit.tagMonat(beginn))"
    }

    /// Der Tag eines Termins in Worten: "Heute", "Morgen", "Donnerstag, 01.10."
    static func dayLabel(startsAt: String, now: Date = Date()) -> String {
        guard let beginn = Zeit.datum(startsAt) else { return "" }
        let tage = Zeit.tageZwischen(now, beginn)
        if tage == 0 { return "Heute" }
        if tage == 1 { return "Morgen" }
        return "\(Zeit.langerWochentag(beginn)), \(Zeit.tagMonat(beginn))"
    }

    /// Kurzer Tag fuer die Datumsmarke eines offenen Spiels: "HEUTE", "MORGEN", "MI".
    static func dayTag(startsAt: String, now: Date = Date()) -> String {
        guard let beginn = Zeit.datum(startsAt) else { return "" }
        let tage = Zeit.tageZwischen(now, beginn)
        if tage <= 0 { return "HEUTE" }
        if tage == 1 { return "MORGEN" }
        return Zeit.kurzerWochentag(beginn).uppercased()
    }

    /**
     * Wie alt ist eine Nachricht? "gerade eben", "vor 5 Min.", "vor 2 Std.",
     * "gestern", innerhalb einer Woche der Wochentag ("Sa"), danach das Datum.
     */
    static func relativeTimeLabel(_ iso: String, now: Date = Date()) -> String {
        guard let zeit = Zeit.datum(iso) else { return "" }
        let minuten = Int((now.timeIntervalSince(zeit) / 60).rounded(.down))
        let tage = Zeit.tageZwischen(zeit, now)

        if tage <= 0 {
            if minuten < 1 { return "gerade eben" }
            if minuten < 60 { return "vor \(minuten) Min." }
            return "vor \(minuten / 60) Std."
        }
        if tage == 1 { return "gestern" }
        if tage < 7 { return Zeit.kurzerWochentag(zeit) }
        return Zeit.tagMonat(zeit)
    }

    /**
     * Was die Startseite unter "Neuigkeiten" zeigt: Ungelesenes, egal wie alt,
     * und Gelesenes der letzten sieben Tage, hoechstens `max` Stueck. Die
     * Reihenfolge bleibt die der Liste.
     */
    static func startseitenNeuigkeiten<T: Benachrichtigungsdaten>(_ liste: [T], now: Date = Date(), max: Int = 3) -> [T] {
        let grenze = now.addingTimeInterval(TimeInterval(-neuigkeitenTage * 86_400))
        return Array(
            liste.filter { n in
                n.readAt == nil || (Zeit.datum(n.createdAt).map { $0 >= grenze } ?? false)
            }
            .prefix(max)
        )
    }

    /// Summe der Getraenke, die nicht zurueckgenommen wurden.
    static func sumOpenDrinks<T: Getraenkekauf>(_ kaeufe: [T]) -> Int {
        kaeufe.reduce(0) { s, k in s + ((k.voidedAt ?? "").isEmpty ? (k.totalCents ?? 0) : 0) }
    }

    /// Die Art einer Belegung; die Reihenfolge zaehlt (siehe home.ts).
    static func occupancyKind(_ b: some Belegungsmerkmale) -> TimelineKind {
        if let serie = b.seriesId, !serie.isEmpty { return .serie }
        if b.kind == "blocking" { return .gesperrt }
        if b.isOwn == true { return .eigen }
        if b.partnerWanted == true, (b.frei ?? 0) > 0 { return .sucht }
        return .belegt
    }

    /// Wo eine Belegung auf der Zeitleiste von Oeffnung bis Schluss liegt, in Prozent.
    static func timelineSegments<T: Zeitraum & Belegungsmerkmale>(
        _ belegungen: [T], openingMinutes: Int, closingMinutes: Int
    ) -> [TimelineSegment] {
        let spanne = closingMinutes - openingMinutes
        guard spanne > 0 else { return [] }
        return belegungen.compactMap { b in
            let von = Swift.max(openingMinutes, Zeit.minutesOf(b.startsAt))
            let bis = Swift.min(closingMinutes, Zeit.minutesOf(b.endsAt))
            guard bis > von else { return nil }
            return TimelineSegment(
                left: Double(von - openingMinutes) / Double(spanne) * 100,
                width: Double(bis - von) / Double(spanne) * 100,
                art: occupancyKind(b)
            )
        }
    }

    /// Position einer Minute auf derselben Zeitleiste, in Prozent (0 bis 100).
    static func timelinePosition(_ minute: Int, openingMinutes: Int, closingMinutes: Int) -> Double {
        let spanne = closingMinutes - openingMinutes
        guard spanne > 0 else { return 0 }
        return Swift.min(100, Swift.max(0, Double(minute - openingMinutes) / Double(spanne) * 100))
    }

    // MARK: - Benachrichtigungen

    static func notificationSymbol(_ kind: String) -> NotificationSymbol {
        if ["booking_cancelled", "booking_displaced", "booking_removed"].contains(kind) { return .storno }
        if kind == "event_cancelled" { return .storno }
        if kind.hasPrefix("booking_") || kind == "player_left" { return .platz }
        if kind.hasPrefix("charge_") { return .geld }
        if kind.hasPrefix("application_") { return .person }
        return .glocke
    }

    /// Zur Veranstaltung, wenn die Nachricht eine nennt, sonst nirgends.
    static func notificationZiel(eventId: String?) -> NotificationZiel? {
        guard let eventId, !eventId.isEmpty else { return nil }
        return NotificationZiel(eventId: eventId)
    }

    struct Gruppe<T> {
        let label: String
        var items: [T]
    }

    /**
     * Nachrichten nach Tagen gruppiert (Berlin): Heute, Gestern, Diese Woche
     * (die letzten sieben Tage), Früher. Leere Gruppen fallen weg.
     */
    static func groupNotifications<T: Benachrichtigungsdaten>(_ liste: [T], now: Date = Date()) -> [Gruppe<T>] {
        var gruppen: [Gruppe<T>] = ["Heute", "Gestern", "Diese Woche", "Früher"].map { Gruppe(label: $0, items: []) }
        for n in liste {
            let tage = Zeit.datum(n.createdAt).map { Zeit.tageZwischen($0, now) } ?? 0
            let i = tage <= 0 ? 0 : tage == 1 ? 1 : tage < 7 ? 2 : 3
            gruppen[i].items.append(n)
        }
        return gruppen.filter { !$0.items.isEmpty }
    }
}
