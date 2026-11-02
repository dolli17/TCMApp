/**
 * Was "Meine & offene Spiele" zeigt, als reine Funktionen
 *
 * Texte und Auswahl wie apps/mobile/app/(tabs)/plaetze/spiele.tsx, ohne
 * SwiftUI - damit sich jeder Satz ohne Simulator pruefen laesst
 * (SpieleLogikTests). offenesSpielText kommt aus @tcm/core
 * (offeneSpiele.ts) und ist gegen die Golden Files geprueft.
 *
 * Der Unterschied zwischen "gebucht" und "eingetragen" bestimmt, was man
 * darf: der Bucher storniert (cancel_booking), ein Mitspieler traegt sich
 * aus (leave_booking) - beides nur bis Spielbeginn. Seit dem Austragen die
 * ganze Buchung storniert, sagt die Rueckfrage das ausdruecklich.
 */

import Foundation

/// Die zwei Sichten des Tabs Plaetze (Bereichsreiter.tsx).
enum PlaetzeSicht: String, CaseIterable, Hashable, Sendable {
    case belegung, spiele

    var label: String {
        switch self {
        case .belegung: "Belegung"
        case .spiele: "Meine & offene Spiele"
        }
    }
}

/// Die zwei Abschnitte der Spiele-Sicht.
enum SpieleAbschnitt: Hashable, Sendable {
    case meine, offen
}

/// Was man an einem eigenen Termin tun darf.
enum TerminAktion: Equatable, Sendable {
    /// Bucher: cancel_booking
    case stornieren
    /// Mitspieler: leave_booking - storniert die ganze Buchung
    case austragen
}

/// Kopf und "Schon dabei"-Zeile einer Karte unter "Offene Spiele" (OffenesSpielText).
struct OffenesSpielText: Equatable, Sendable {
    let kopf: String
    let dabei: String?
}

/// Die Rueckfrage vor dem Stornieren oder Austragen.
struct Rueckfrage: Equatable, Sendable {
    let titel: String
    let text: String
    let knopf: String
}

enum SpieleLogik {
    // MARK: - Reihenfolge

    /// Kommt man ueber "Mitspielen" oder "Alle" bei den offenen Spielen, stehen diese oben (U75).
    static func abschnitte(offeneZuerst: Bool) -> [SpieleAbschnitt] {
        offeneZuerst ? [.offen, .meine] : [.meine, .offen]
    }

    // MARK: - Deine Termine

    /// Was noch nicht vorbei ist, der naechste zuerst - laufende Spiele bleiben stehen.
    static func termine(_ meine: [MeineBuchung], jetzt: Date) -> [MeineBuchung] {
        Startseite.upcomingBookings(meine, now: jetzt)
    }

    /// Die Buchungen, die man selbst gebucht hat - fuer "Du suchst" bei den offenen Spielen.
    static func eigene(_ meine: [MeineBuchung]) -> Set<String> {
        Set(meine.filter { $0.binBucher == true }.map(\.bookingId))
    }

    /// Stornieren oder austragen, nil sobald das Spiel begonnen hat.
    static func aktion(_ b: MeineBuchung, jetzt: Date) -> TerminAktion? {
        let bucher = b.binBucher == true
        let darf = Platzplan.bookingActions(startsAt: b.startsAt, own: bucher, joined: !bucher, now: jetzt)
        if bucher { return darf.cancel ? .stornieren : nil }
        return darf.leave ? .austragen : nil
    }

    /// Obere Zeile der Datumskachel: "HEUTE", "MORGEN" oder "MI 4."
    static func kachelTag(_ b: some Zeitraum, jetzt: Date) -> String {
        let tag = Startseite.dayTag(startsAt: b.startsAt, now: jetzt)
        guard tag != "HEUTE" && tag != "MORGEN", let beginn = Zeit.datum(b.startsAt) else { return tag }
        return "\(tag) \(Zeit.berlin.component(.day, from: beginn))."
    }

    /// Die erste Karte ist gelb, wenn sie heute ist.
    static func hervorgehoben(_ b: some Zeitraum, index: Int, jetzt: Date) -> Bool {
        index == 0 && Startseite.dayTag(startsAt: b.startsAt, now: jetzt) == "HEUTE"
    }

    static func uhrzeit(_ iso: String) -> String {
        Zeit.minutesToTime(Zeit.minutesOf(iso))
    }

    /// "Platz 1 · Einzel"
    static func terminTitel(_ b: MeineBuchung) -> String {
        [b.courtName, b.typeName].compactMap { Platzplan.nichtLeer($0) }.joined(separator: " · ")
    }

    /// "mit Erika, Jonas", "nur du" oder "du bist eingetragen · gebucht von Max"
    static func terminZeile(_ b: MeineBuchung) -> String {
        if b.binBucher == true {
            let mit = (b.players ?? []).compactMap { $0 }.filter { !$0.isEmpty && $0 != b.ownerName }
            return mit.isEmpty ? "nur du" : "mit \(mit.joined(separator: ", "))"
        }
        return "du bist eingetragen · gebucht von \(b.ownerName ?? "")"
    }

    /// Fuer den Screenreader, die ganze Karte in einem Satz.
    static func terminLabel(_ b: MeineBuchung, jetzt: Date) -> String {
        let laeuft = aktion(b, jetzt: jetzt) == nil ? ", läuft" : ""
        return "\(Startseite.dayLabel(startsAt: b.startsAt, now: jetzt)), \(HomeLogik.zeitSpanne(b)), "
            + "\(terminTitel(b)), \(terminZeile(b))\(laeuft)"
    }

    /// Der Knopf rechts an der Karte
    static func optionenLabel(_ b: MeineBuchung, jetzt: Date) -> String {
        "Optionen für \(Startseite.dayLabel(startsAt: b.startsAt, now: jetzt)) \(uhrzeit(b.startsAt))"
    }

    static func aktionText(_ a: TerminAktion) -> String {
        switch a {
        case .stornieren: "Buchung stornieren"
        case .austragen: "Mich austragen"
        }
    }

    static func rueckfrage(_ a: TerminAktion) -> Rueckfrage {
        switch a {
        case .stornieren:
            Rueckfrage(
                titel: "Buchung stornieren?",
                text: "Der Platz wird wieder frei. Alle Mitspieler werden benachrichtigt.",
                knopf: "Stornieren"
            )
        case .austragen:
            Rueckfrage(
                titel: "Austragen und Buchung stornieren?",
                text: "Wenn du dich austrägst, wird die ganze Buchung storniert. "
                    + "Der Bucher und alle Mitspieler werden benachrichtigt.",
                knopf: "Austragen und stornieren"
            )
        }
    }

    // MARK: - Offene Spiele

    /// "A", "A und B", "A, B und C" (aufzaehlung)
    static func aufzaehlung(_ namen: [String]) -> String {
        guard namen.count > 1 else { return namen.first ?? "" }
        return "\(namen.dropLast().joined(separator: ", ")) und \(namen[namen.count - 1])"
    }

    /// offenesSpielText aus @tcm/core
    static func offenesSpielText(ownerName: String?, players: [String?], frei: Int, eigenes: Bool = false) -> OffenesSpielText {
        let wer = eigenes ? "Du suchst" : "\(Platzplan.nichtLeer(ownerName) ?? "Jemand") sucht"
        // "Mitspieler" lautet im Plural gleich; die Zahl traegt den Unterschied
        let n = max(frei, 0)
        let namen = players.compactMap { Platzplan.nichtLeer($0) }
        return OffenesSpielText(
            kopf: "\(wer) \(n == 1 ? "einen" : String(n)) Mitspieler",
            dabei: namen.isEmpty ? nil : "Schon dabei: \(aufzaehlung(namen))"
        )
    }

    static func offenesSpielText(_ o: OffenesSpiel, eigene: Set<String>) -> OffenesSpielText {
        offenesSpielText(ownerName: o.ownerName, players: o.players ?? [], frei: o.frei ?? 0, eigenes: eigene.contains(o.bookingId))
    }

    /// Bucher und Mitspieler; players nennt die Mitspieler ohne den Bucher.
    static func leute(_ o: OffenesSpiel) -> [String] {
        [o.ownerName ?? ""] + (o.players ?? []).compactMap { $0 }
    }

    /// "Morgen · Platz 3"
    static func spielKicker(_ o: OffenesSpiel, jetzt: Date) -> String {
        "\(Startseite.dayLabel(startsAt: o.startsAt, now: jetzt)) · \(o.courtName ?? "")"
    }

    /// "Doppel · 2 von 4 dabei"
    static func besetzung(_ o: OffenesSpiel) -> String {
        let dabei = 1 + (o.players ?? []).count
        let gesamt = dabei + max(o.frei ?? 0, 0)
        return "\(o.typeName ?? "") · \(dabei) von \(gesamt) dabei"
    }

    /// Nicht fuer eigene, schon besetzte oder begonnene Spiele (join_booking).
    static func darfMitspielen(_ o: OffenesSpiel, eigene: Set<String>, jetzt: Date) -> Bool {
        Platzplan.bookingActions(
            startsAt: o.startsAt, own: eigene.contains(o.bookingId), joined: o.binDabei, partnerWanted: true,
            free: o.frei, now: jetzt
        ).join
    }

    static func mitspielenLabel(_ o: OffenesSpiel, jetzt: Date) -> String {
        "Mitspielen: \(o.typeName ?? "") \(Startseite.dayLabel(startsAt: o.startsAt, now: jetzt)) \(uhrzeit(o.startsAt))"
    }

    /// Initialen fuer die runden Marken: erster und letzter Teil des Namens.
    static func initialen(_ name: String) -> String {
        let teile = name.split(whereSeparator: \.isWhitespace)
        guard let erstes = teile.first?.first else { return "" }
        let letztes = teile.count > 1 ? teile.last?.first.map(String.init) ?? "" : ""
        return (String(erstes) + letztes).uppercased()
    }
}
