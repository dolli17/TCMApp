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
    let getraenke: Abschnitt<[EigenesGetraenk]>
    let dienst: Abschnitt<Arbeitsdienst?>
    let neues: Abschnitt<[Benachrichtigung]>
    let events: Abschnitt<[MitgliedEvent]>
}

struct FreiKarte: Equatable, Identifiable, Sendable {
    let id: String
    let name: String
    let bis: String
    let segmente: [TimelineSegment]
    /// Marke fuer jetzt, in Prozent
    let jetzt: Double
}

/// Die zwei Kacheln unter "Dein Stand".
struct DeinStand: Equatable, Sendable {
    let getraenkeTitel: String
    let getraenkeWert: String?
    let getraenkeFehler: String?
    let getraenkeLabel: String
    let dienstTitel: String
    /// "4 / 10 h", nil ohne Soll
    let dienstWert: String?
    let dienstAnteil: Double
    let dienstFehler: String?
    let dienstLabel: String
}

enum HomeLogik {
    static func titel(vorname: String?) -> String {
        if let vorname, !vorname.isEmpty { return "Hallo, \(vorname)" }
        return "Hallo"
    }

    /// Kicker ueber dem Titel: "Donnerstag, 29. Oktober" (die Ansicht schreibt ihn gross).
    static func kicker(_ jetzt: Date) -> String {
        Zeit.heuteLang(jetzt)
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
        "\(Startseite.bookingKicker(startsAt: t.startsAt, endsAt: t.endsAt, now: jetzt)), \(zeitSpanne(t)), \(t.courtName ?? ""), Details"
    }

    static func jetztFreiKarten(_ d: FreiDaten, jetzt: Date) -> [FreiKarte] {
        let auf = Zeit.timeToMinutes(d.einstellungen?.openingTime ?? "08:00")
        let zu = Zeit.timeToMinutes(d.einstellungen?.closingTime ?? "21:00")
        let marke = Startseite.timelinePosition(Zeit.localMinutes(jetzt), openingMinutes: auf, closingMinutes: zu)
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
                bis: Zeit.minutesToTime(f.untilMinute),
                segmente: Startseite.timelineSegments(
                    d.belegung.filter { $0.courtId == f.courtId }, openingMinutes: auf, closingMinutes: zu
                ),
                jetzt: marke
            )
        }
    }

    /// Hoechstens drei offene Spiele.
    static func offeneSpiele(_ liste: [OffenesSpiel]) -> [OffenesSpiel] {
        Array(liste.prefix(3))
    }

    static func offenesSpielTitel(_ o: OffenesSpiel) -> String {
        "\(o.typeName ?? "") · sucht \(o.frei ?? 0)"
    }

    static func offenesSpielZeile(_ o: OffenesSpiel) -> String {
        "\(o.courtName ?? "") · \(o.ownerName ?? "")"
    }

    /// Zahl wie in einem JavaScript-Template: 3 -> "3", 2.5 -> "2.5".
    static func jsZahl(_ d: Double) -> String {
        d == d.rounded() && abs(d) < 1e15 ? String(Int(d)) : "\(d)"
    }

    static func deinStand(
        getraenke: Abschnitt<[EigenesGetraenk]>, dienst: Abschnitt<Arbeitsdienst?>, jetzt: Date
    ) -> DeinStand {
        let monat = Zeit.monatLang(jetzt)
        let summe = Geld.formatCents(Startseite.sumOpenDrinks(getraenke.wert ?? []))
        let werte = dienst.wert ?? nil
        let ist = werte?.completedHours ?? 0
        let soll = werte?.requiredHours ?? 0
        // Der Arbeitsdienst zaehlt aufs Jahr, nicht auf den Monat (U55).
        let jahr = werte?.year ?? Zeit.jahr(jetzt)
        let mitSoll = werte != nil && soll > 0

        let dienstLabel: String
        if let f = dienst.fehler {
            dienstLabel = "Arbeitsdienst: \(f)"
        } else if soll > 0 {
            dienstLabel = "Arbeitsdienst \(jahr): \(jsZahl(ist)) von \(jsZahl(soll)) Stunden. Zum Konto"
        } else {
            dienstLabel = "Arbeitsdienst \(jahr): kein Soll. Zum Konto"
        }

        return DeinStand(
            getraenkeTitel: "Getränke \(monat)",
            getraenkeWert: getraenke.fehler == nil ? summe : nil,
            getraenkeFehler: getraenke.fehler,
            getraenkeLabel: getraenke.fehler.map { "Getränke: \($0)" }
                ?? "Getränke im \(monat): \(summe), läuft noch. Zu den Getränken",
            dienstTitel: "Arbeitsdienst \(jahr)",
            dienstWert: mitSoll ? "\(jsZahl(ist)) / \(jsZahl(soll)) h" : nil,
            dienstAnteil: soll > 0 ? min(1, ist / soll) : 0,
            dienstFehler: dienst.fehler,
            dienstLabel: dienstLabel
        )
    }

    /// Link "Alle" bei Neuigkeiten nur, wenn ueberhaupt etwas da ist.
    static func zeigeAlleNeuigkeiten(_ neues: Abschnitt<[Benachrichtigung]>) -> Bool {
        !(neues.wert ?? []).isEmpty
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
