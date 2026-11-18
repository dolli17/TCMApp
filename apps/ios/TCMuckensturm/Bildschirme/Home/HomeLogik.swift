/**
 * Was Home zeigt, als reine Funktionen
 *
 * Texte und Auswahl wie apps/mobile/app/(tabs)/home.tsx, ohne SwiftUI -
 * damit sich jeder Satz ohne Simulator und ohne Netz pruefen laesst
 * (HomeLogikTests). Die Bildschirme setzen nur noch zusammen.
 */

import Foundation

/// Ergebnis eines Abschnitts, der fuer sich laedt: ein Wert oder ein Fehlertext.
/// Schlaegt einer fehl, steht dort der Fehler, und der Rest bleibt gefuellt.
enum Abschnitt<T> {
    case wert(T)
    case fehler(String)

    var wert: T? {
        if case let .wert(w) = self { return w }
        return nil
    }

    var fehler: String? {
        if case let .fehler(f) = self { return f }
        return nil
    }

    static func von(_ laden: () async throws -> T) async -> Abschnitt<T> {
        do {
            return .wert(try await laden())
        } catch {
            return .fehler(Meldung.aus(error).text)
        }
    }
}

extension Abschnitt: Sendable where T: Sendable {}

/// Was "Jetzt frei" braucht - vier Quellen; fehlt eine, fehlt der Abschnitt.
struct FreiDaten: Sendable {
    let heute: String
    let plaetze: [AktiverPlatz]
    let belegung: [TagesBelegung]
    let einstellungen: Buchungseinstellungen?
    let dauer: Int
}

struct HomeInhalt: Sendable {
    let name: MeinName?
    let termine: Abschnitt<[MeineBuchung]>
    let frei: Abschnitt<FreiDaten>
    let offen: Abschnitt<[OffenesSpiel]>
    let events: Abschnitt<[MitgliedEvent]>
}

/// Eine Zeile unter "Jetzt frei".
struct FreiKarte: Equatable, Identifiable, Sendable {
    let id: String
    let name: String
    let bis: String
}

enum HomeLogik {
    static func titel(vorname: String?) -> String {
        if let vorname, !vorname.isEmpty { return "Hallo, \(vorname)" }
        return "Hallo"
    }

    /// Unter dem Titel: "Mittwoch, 18. November · TC Muckensturm" (Berliner Zeit).
    static func datumszeile(_ jetzt: Date) -> String {
        var stil = Date.FormatStyle(date: .omitted, time: .omitted, locale: Locale(identifier: "de_DE"), timeZone: TimeZone(identifier: "Europe/Berlin")!)
        stil = stil.weekday(.wide).day().month(.wide)
        return "\(jetzt.formatted(stil)) · TC Muckensturm"
    }

    /// Kicker und Marker der Terminkarte: aus "Heute · in 4 Stunden" wird ("Heute", "in 4 Stunden").
    static func terminKicker(_ t: MeineBuchung, jetzt: Date) -> (tag: String, wann: String?) {
        let teile = Startseite.bookingKicker(startsAt: t.startsAt, endsAt: t.endsAt, now: jetzt).components(separatedBy: " · ")
        return (teile.first ?? "", teile.count > 1 ? teile.dropFirst().joined(separator: " · ") : nil)
    }

    /// "Platz 3 · mit Jonas Weber"
    static func terminOrt(_ t: MeineBuchung) -> String {
        "\(t.courtName ?? "") · \(mitText(t))"
    }

    /// "und 1 weiterer Termin" unter der Terminkarte; nil ohne weitere.
    static func weitereTermine(_ anzahl: Int) -> String? {
        anzahl > 0 ? "und \(anzahl) \(anzahl == 1 ? "weiterer Termin" : "weitere Termine")" : nil
    }

    /// Zaehler neben "Jetzt frei": "3 Plätze"
    static func freiZaehler(_ anzahl: Int) -> String {
        "\(anzahl) \(anzahl == 1 ? "Platz" : "Plätze")"
    }

    /// "17:00 – 18:00" in Berliner Zeit
    static func zeitSpanne(_ t: some Zeitraum) -> String {
        "\(Zeit.minutesToTime(Zeit.minutesOf(t.startsAt))) – \(Zeit.minutesToTime(Zeit.minutesOf(t.endsAt)))"
    }

    /// Zeile unten auf der Terminkarte: "mit A, B", "Du hast gebucht" oder "von X".
    static func mitText(_ t: MeineBuchung) -> String {
        let mit = (t.players ?? []).compactMap { $0 }.filter { !$0.isEmpty && $0 != t.ownerName }
        if !mit.isEmpty { return "mit \(mit.joined(separator: ", "))" }
        if t.binBucher == true { return "Du hast gebucht" }
        return "von \(t.ownerName ?? "")"
    }

    static func terminLabel(_ t: MeineBuchung, jetzt: Date) -> String {
        "Dein Termin: \(Startseite.bookingKicker(startsAt: t.startsAt, endsAt: t.endsAt, now: jetzt)), \(zeitSpanne(t)), \(terminOrt(t))"
    }

    static func jetztFreiKarten(_ d: FreiDaten, jetzt: Date) -> [FreiKarte] {
        let auf = Zeit.timeToMinutes(d.einstellungen?.openingTime ?? "08:00")
        let zu = Zeit.timeToMinutes(d.einstellungen?.closingTime ?? "21:00")
        return Belegung.freeCourtsNow(
            day: d.heute,
            courtIds: d.plaetze.map(\.id),
            openingMinutes: auf,
            closingMinutes: zu,
            slotMinutes: d.einstellungen?.slotMinutes ?? 30,
            durationMinutes: d.dauer,
            occupied: d.belegung,
            leadDays: d.einstellungen?.leadDays,
            now: jetzt
        ).map { f in
            FreiKarte(
                id: f.courtId,
                name: d.plaetze.first { $0.id == f.courtId }?.name ?? "",
                bis: Zeit.minutesToTime(f.untilMinute)
            )
        }
    }

    /// Hoechstens drei offene Spiele.
    static func offeneSpiele(_ liste: [OffenesSpiel]) -> [OffenesSpiel] {
        Array(liste.prefix(3))
    }

    /// "Morgen, 10:00" - der Tag aus dayTag, lesbar geschrieben.
    static func offenesSpielWann(_ o: OffenesSpiel, jetzt: Date) -> String {
        let tag = Startseite.dayTag(startsAt: o.startsAt, now: jetzt)
        return "\(tag.prefix(1))\(tag.dropFirst().lowercased()), \(Zeit.minutesToTime(Zeit.minutesOf(o.startsAt)))"
    }

    /// "Platz 4 · Martin Keller"; beim eigenen Spiel "Platz 4 · dein Spiel".
    static func offenesSpielZeile(_ o: OffenesSpiel, eigenes: Bool = false) -> String {
        let name = (o.ownerName ?? "").trimmingCharacters(in: .whitespaces)
        return "\(o.courtName ?? "") · \(eigenes ? "dein Spiel" : name.isEmpty ? "Jemand" : name)"
    }

    /// Die Buchungen, die man selbst angelegt hat (fuer "dein Spiel").
    static func eigeneBuchungen(_ termine: [MeineBuchung]) -> Set<String> {
        Set(termine.filter { $0.binBucher == true }.map(\.bookingId))
    }

    /// Der Streifen zur naechsten Veranstaltung: "Samstag, 21. November" und der Titel.
    static func eventStreifen(_ e: MitgliedEvent) -> (datum: String, titel: String) {
        (Zeit.datum(e.startsAt).map(Zeit.heuteLang) ?? "", e.title ?? "")
    }

    /// Zahl wie in einem JavaScript-Template, aber mit deutschem Komma: 3 -> "3", 2.5 -> "2,5".
    static func jsZahl(_ d: Double) -> String {
        d == d.rounded() && abs(d) < 1e15 ? String(Int(d)) : "\(d)".replacingOccurrences(of: ".", with: ",")
    }

    // MARK: - Nachrichten und Glocke

    /// Fuer den Screenreader: "Neu: Titel. Text. vor 5 Min."
    static func nachrichtLabel(_ n: Benachrichtigung, neu: Bool, jetzt: Date) -> String {
        "\(neu ? "Neu: " : "")\(n.title ?? ""). \(n.body ?? ""). \(Startseite.relativeTimeLabel(n.createdAt, now: jetzt))"
    }

    /// Die Zahl an der Glocke: ab zehn "9+".
    static func glockenZahl(_ ungelesen: Int) -> String {
        ungelesen > 9 ? "9+" : String(ungelesen)
    }

    static func glockenLabel(_ ungelesen: Int) -> String {
        ungelesen > 0 ? "Benachrichtigungen, \(ungelesen) ungelesen" : "Benachrichtigungen"
    }

    /// "Alle als gelesen" erscheint nur, solange etwas hervorgehoben ist.
    static func zeigeAlleGelesen(_ liste: [Benachrichtigung]?, alleGesehen: Bool) -> Bool {
        !alleGesehen && (liste ?? []).contains { $0.readAt == nil }
    }

    /// Initialen fuer den Avatar: "MM"
    static func initialen(_ name: MeinName?) -> String {
        guard let name else { return "" }
        return (String(name.vorname.prefix(1)) + String(name.nachname.prefix(1))).uppercased()
    }
}
