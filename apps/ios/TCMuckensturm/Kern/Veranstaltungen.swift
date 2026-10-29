/**
 * Veranstaltungen fuer Mitglieder
 *
 * Portierung aus packages/core/src/veranstaltungen-mitglieder.ts und
 * veranstaltungen.ts: die naechsten zwei fuer "Demnächst im Verein", die
 * Liste nach Monat, die Texte der Karte (Datumskachel, Zeit und Ort, fette
 * Zeile, eigener Stand) und das Detail (Eckdaten, Belegung, Knoepfe,
 * Hinweise). Ob eine Anmeldung klappt, entscheiden die RPCs; hier steht nur,
 * was die Oberflaeche anbietet und wie sie es sagt. Gepruefte Faelle:
 * packages/core/golden/event*.json (KernGoldenTests).
 */

import Foundation

/// Eine Zeile aus events_fuer_mitglied. Optional ist, was nicht offensichtlich Pflicht ist (app-api.md).
struct MitgliedEvent: Decodable, Equatable, Identifiable, Sendable {
    let id: String
    let kind: String?
    let status: String?
    let title: String?
    let description: String?
    let location: String?
    let startsAt: String
    let endsAt: String?
    let registrationEnabled: Bool?
    let registrationDeadline: String?
    let maxParticipants: Int?
    let companionsAllowed: Bool?
    let feeCents: Int?
    let workHours: Double?
    let personen: Int?
    let warteliste: Int?
    let meinStatus: String?
    let meineBegleitpersonen: Int?
    let meineBemerkung: String?
    /// Die eigene, nicht erlassene Forderung zur Anmeldung, sonst nil (seit Phase A in events_fuer_mitglied).
    let meineForderungCents: Int?
    let meineForderungStatus: String?

    enum CodingKeys: String, CodingKey {
        case id, kind, status, title, description, location, personen, warteliste
        case startsAt = "starts_at"
        case endsAt = "ends_at"
        case registrationEnabled = "registration_enabled"
        case registrationDeadline = "registration_deadline"
        case maxParticipants = "max_participants"
        case companionsAllowed = "companions_allowed"
        case feeCents = "fee_cents"
        case workHours = "work_hours"
        case meinStatus = "mein_status"
        case meineBegleitpersonen = "meine_begleitpersonen"
        case meineBemerkung = "meine_bemerkung"
        case meineForderungCents = "meine_forderung_cents"
        case meineForderungStatus = "meine_forderung_status"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        kind = try c.decodeIfPresent(String.self, forKey: .kind)
        status = try c.decodeIfPresent(String.self, forKey: .status)
        title = try c.decodeIfPresent(String.self, forKey: .title)
        description = try c.decodeIfPresent(String.self, forKey: .description)
        location = try c.decodeIfPresent(String.self, forKey: .location)
        startsAt = try c.decode(String.self, forKey: .startsAt)
        endsAt = try c.decodeIfPresent(String.self, forKey: .endsAt)
        registrationEnabled = try c.decodeIfPresent(Bool.self, forKey: .registrationEnabled)
        registrationDeadline = try c.decodeIfPresent(String.self, forKey: .registrationDeadline)
        maxParticipants = try c.decodeIfPresent(Int.self, forKey: .maxParticipants)
        companionsAllowed = try c.decodeIfPresent(Bool.self, forKey: .companionsAllowed)
        feeCents = try c.decodeIfPresent(Int.self, forKey: .feeCents)
        // numeric kommt als Zahl, manche Wege liefern Text - wie Number(z.work_hours) in daten.ts
        workHours = try c.decodeIfPresent(Zahl.self, forKey: .workHours)?.wert
        personen = try c.decodeIfPresent(Int.self, forKey: .personen)
        warteliste = try c.decodeIfPresent(Int.self, forKey: .warteliste)
        meinStatus = try c.decodeIfPresent(String.self, forKey: .meinStatus)
        meineBegleitpersonen = try c.decodeIfPresent(Int.self, forKey: .meineBegleitpersonen)
        meineBemerkung = try c.decodeIfPresent(String.self, forKey: .meineBemerkung)
        meineForderungCents = try c.decodeIfPresent(Int.self, forKey: .meineForderungCents)
        meineForderungStatus = try c.decodeIfPresent(String.self, forKey: .meineForderungStatus)
    }
}

/// Eine Zahl, die als JSON-Zahl oder als Text kommt (Postgres numeric).
struct Zahl: Decodable, Equatable, Sendable {
    let wert: Double

    init(_ wert: Double) { self.wert = wert }

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let d = try? c.decode(Double.self) {
            wert = d
        } else if let d = Double(try c.decode(String.self)) {
            wert = d
        } else {
            throw DecodingError.dataCorruptedError(in: c, debugDescription: "Keine Zahl")
        }
    }
}

enum EventTon: String, Sendable {
    case gelb, gruen, blau, grau, rot
}

struct MeineMarke: Equatable, Sendable {
    let text: String
    let ton: EventTon
}

enum Veranstaltungen {
    static let kindLabel = ["arbeitsdienst": "Arbeitsdienst", "fest": "Fest", "termin": "Termin"]
    static let kindTon: [String: EventTon] = ["arbeitsdienst": .grau, "fest": .gelb, "termin": .blau]

    /// Vorbei ist eine Veranstaltung mit ihrem Ende, ohne Ende mit dem Beginn.
    static func eventVorbei(_ e: MitgliedEvent, now: Date) -> Bool {
        guard let ende = Zeit.datum(e.endsAt ?? e.startsAt) else { return false }
        return ende < now
    }

    /// Ab wann die Anmeldung feststeht: Anmeldeschluss, sonst Beginn.
    static func eventSchluss(_ e: MitgliedEvent) -> String {
        e.registrationDeadline ?? e.startsAt
    }

    static func eventSchlussVorbei(_ e: MitgliedEvent, now: Date) -> Bool {
        guard let schluss = Zeit.datum(eventSchluss(e)) else { return false }
        return schluss <= now
    }

    static func eventBegonnen(_ e: MitgliedEvent, now: Date) -> Bool {
        guard let beginn = Zeit.datum(e.startsAt) else { return false }
        return beginn <= now
    }

    static func eventIchDabei(_ e: MitgliedEvent) -> Bool {
        e.meinStatus == "registered" || e.meinStatus == "waitlisted"
    }

    static func eventAnmeldbar(_ e: MitgliedEvent, now: Date) -> Bool {
        e.status == "published" && e.registrationEnabled == true && !eventSchlussVorbei(e, now: now) && !eventIchDabei(e)
    }

    /// Die naechsten n veroeffentlichten Veranstaltungen fuer die Startseite.
    static func eventDemnaechst(_ liste: [MitgliedEvent], now: Date, n: Int = 2) -> [MitgliedEvent] {
        let zeit = { (e: MitgliedEvent) in Zeit.datum(e.startsAt) ?? .distantFuture }
        return Array(
            liste.filter { $0.status == "published" && !eventVorbei($0, now: now) }
                .enumerated()
                .sorted { zeit($0.element) != zeit($1.element) ? zeit($0.element) < zeit($1.element) : $0.offset < $1.offset }
                .map(\.element)
                .prefix(n)
        )
    }

    /// "19:00" -> "19", "23:30" bleibt (Intl mit zweistelliger Stunde, also "09").
    static func uhr(_ d: Date) -> String {
        let k = Zeit.berlin.dateComponents([.hour, .minute], from: d)
        let h = String(format: "%02d", k.hour ?? 0)
        return (k.minute ?? 0) == 0 ? h : "\(h):\(String(format: "%02d", k.minute ?? 0))"
    }

    static func uhrSpanne(startsAt: String, endsAt: String?) -> String {
        guard let a = Zeit.datum(startsAt) else { return "" }
        guard let endsAt, let b = Zeit.datum(endsAt) else { return "\(uhr(a)) Uhr" }
        if Zeit.berlinDay(a) != Zeit.berlinDay(b) { return "ab \(uhr(a)) Uhr" }
        return "\(uhr(a))–\(uhr(b)) Uhr"
    }

    /// "Fr 19 Uhr · Clubhaus", "Sa 09–13 Uhr · Anlage"
    static func eventKartenZeit(_ e: MitgliedEvent) -> String {
        guard let a = Zeit.datum(e.startsAt) else { return "" }
        let zeit = "\(Zeit.kurzerWochentag(a)) \(uhrSpanne(startsAt: e.startsAt, endsAt: e.endsAt))"
        if let ort = e.location, !ort.isEmpty { return "\(zeit) · \(ort)" }
        return zeit
    }

    /// Datumskachel: Tag zweistellig und Monat kurz ("06", "Nov")
    static func eventDatumKachel(_ startsAt: String) -> (tag: String, monat: String) {
        guard let d = Zeit.datum(startsAt) else { return ("", "") }
        let k = Zeit.berlin.dateComponents([.month, .day], from: d)
        return (String(format: "%02d", k.day ?? 0), Zeit.monateKurz[(k.month ?? 1) - 1])
    }

    /// Stunden deutsch: 3 -> "3", 2.5 -> "2,5".
    static func stundenText(_ h: Double) -> String {
        let gerundet = (h * 100).rounded() / 100
        if gerundet == gerundet.rounded() { return String(Int(gerundet)) }
        return "\(gerundet)".replacingOccurrences(of: ".", with: ",")
    }

    /// Freie Plaetze, ohne Grenze nil.
    static func eventFrei(_ e: MitgliedEvent) -> Int? {
        guard let max = e.maxParticipants else { return nil }
        return Swift.max(0, max - (e.personen ?? 0))
    }

    private static func plaetzeFreiText(_ frei: Int) -> String {
        if frei == 0 { return "ausgebucht · Warteliste" }
        return "noch \(frei) \(frei == 1 ? "Platz" : "Plätze") frei"
    }

    /// Die fette Zeile der Karte ("18,00 € p. P. · noch 18 Plätze frei", "Ohne Anmeldung" ...).
    static func eventKartenZeile(_ e: MitgliedEvent, now: Date) -> String {
        if e.status == "cancelled" { return "Abgesagt" }
        let vorbei = eventVorbei(e, now: now)
        let personen = e.personen ?? 0

        if e.kind == "arbeitsdienst", let h = e.workHours, h != 0 {
            let stunden = "\(stundenText(h)) Std. Arbeitsdienst"
            if e.registrationEnabled != true { return stunden }
            let belegt = e.maxParticipants.map { "\(personen) von \($0) Plätzen" } ?? "\(personen) angemeldet"
            return "\(stunden) · \(belegt)"
        }

        if e.registrationEnabled != true { return "Ohne Anmeldung" }
        var teile: [String] = []
        if let fee = e.feeCents, fee != 0 { teile.append("\(Geld.formatCents(fee)) p. P.") }
        if vorbei {
            teile.append(personen == 1 ? "1 Person war dabei" : "\(personen) Personen waren dabei")
        } else if eventSchlussVorbei(e, now: now) {
            teile.append("Anmeldung geschlossen")
        } else if let frei = eventFrei(e) {
            teile.append(plaetzeFreiText(frei))
        } else if let schluss = e.registrationDeadline, let d = Zeit.datum(schluss) {
            teile.append("Anmeldung bis \(Zeit.tagMonat(d))")
        } else {
            teile.append("Anmeldung offen")
        }
        return teile.joined(separator: " · ")
    }

    /// Der eigene Stand als Marke; mit aufforderung (Startseite) auch "Anmelden".
    static func eventMeineMarke(_ e: MitgliedEvent, now: Date, aufforderung: Bool = false) -> MeineMarke? {
        if e.status == "cancelled" { return nil }
        if e.meinStatus == "registered" {
            let b = e.meineBegleitpersonen ?? 0
            return MeineMarke(text: b > 0 ? "Angemeldet · \(1 + b)" : "Angemeldet", ton: .gruen)
        }
        if e.meinStatus == "waitlisted" { return MeineMarke(text: "Warteliste", ton: .gelb) }
        if aufforderung && eventAnmeldbar(e, now: now) { return MeineMarke(text: "Anmelden", ton: .gelb) }
        return nil
    }

    // MARK: - Liste

    struct Monat: Equatable, Sendable {
        /// "2026-11"
        let schluessel: String
        /// "November 2026"
        let titel: String
        var events: [MitgliedEvent]
    }

    /**
     * Kommende (bzw. mit vergangen: vergangene) Veranstaltungen nach Monat.
     * Kommendes der Reihe nach, Vergangenes neueste zuerst. Gleiche Zeiten
     * bleiben in der Reihenfolge der Liste (Array.sort in JavaScript ist stabil).
     */
    static func eventMonatsGruppen(_ liste: [MitgliedEvent], now: Date, vergangen: Bool = false) -> [Monat] {
        let zeit = { (e: MitgliedEvent) in Zeit.datum(e.startsAt) ?? .distantFuture }
        let auswahl = liste
            .filter { $0.status != "draft" && eventVorbei($0, now: now) == vergangen }
            .enumerated()
            .sorted {
                let a = zeit($0.element), b = zeit($1.element)
                if a == b { return $0.offset < $1.offset }
                return vergangen ? a > b : a < b
            }
            .map(\.element)
        var gruppen: [Monat] = []
        for e in auswahl {
            guard let d = Zeit.datum(e.startsAt) else { continue }
            let schluessel = String(Zeit.berlinDay(d).prefix(7))
            if gruppen.last?.schluessel == schluessel {
                gruppen[gruppen.count - 1].events.append(e)
            } else {
                gruppen.append(Monat(schluessel: schluessel, titel: "\(Zeit.monatLang(d)) \(Zeit.jahr(d))", events: [e]))
            }
        }
        return gruppen
    }

    // MARK: - Detail

    /// "06.11."
    static func eventTagKurz(_ iso: String) -> String {
        guard let d = Zeit.datum(iso) else { return "" }
        return Zeit.tagMonat(d)
    }

    /// "Freitag, 6. November · 19–23:30 Uhr"
    static func eventLangeZeit(startsAt: String, endsAt: String?) -> String {
        guard let a = Zeit.datum(startsAt) else { return "" }
        return "\(Zeit.heuteLang(a)) · \(uhrSpanne(startsAt: startsAt, endsAt: endsAt))"
    }

    /// "Fr 06.11.2026"
    private static func tagMitJahr(_ d: Date) -> String {
        let k = Zeit.berlin.dateComponents([.year, .month, .day], from: d)
        return "\(Zeit.kurzerWochentag(d)) \(String(format: "%02d.%02d.%04d", k.day ?? 0, k.month ?? 0, k.year ?? 0))"
    }

    /// "Fr 06.11.2026 · 19–23:30 Uhr", mehrtaegig "Fr 06.11.2026, 19 Uhr – Sa 07.11.2026, 02 Uhr".
    static func eventZeitText(startsAt: String, endsAt: String?) -> String {
        guard let a = Zeit.datum(startsAt) else { return "" }
        let tagA = tagMitJahr(a)
        guard let endsAt, let b = Zeit.datum(endsAt) else { return "\(tagA) · \(uhr(a)) Uhr" }
        if Zeit.berlinDay(a) == Zeit.berlinDay(b) { return "\(tagA) · \(uhr(a))–\(uhr(b)) Uhr" }
        return "\(tagA), \(uhr(a)) Uhr – \(tagMitJahr(b)), \(uhr(b)) Uhr"
    }

    /// Die Statusmarke: "Anmeldung offen", "Abgeschlossen", "Abgesagt" ...
    static func eventStatusMarke(_ e: MitgliedEvent, now: Date) -> MeineMarke {
        if e.status == "draft" { return MeineMarke(text: "Entwurf", ton: .grau) }
        if e.status == "cancelled" { return MeineMarke(text: "Abgesagt", ton: .rot) }
        if eventVorbei(e, now: now) { return MeineMarke(text: "Abgeschlossen", ton: .gruen) }
        if eventBegonnen(e, now: now) { return MeineMarke(text: "Läuft", ton: .gelb) }
        if e.registrationEnabled != true { return MeineMarke(text: "Veröffentlicht", ton: .grau) }
        return eventSchlussVorbei(e, now: now)
            ? MeineMarke(text: "Anmeldung geschlossen", ton: .gelb)
            : MeineMarke(text: "Anmeldung offen", ton: .blau)
    }

    /// Begleitpersonen und Bemerkung aendern geht bis zum Anmeldeschluss.
    static func eventAenderbar(_ e: MitgliedEvent, now: Date) -> Bool {
        e.status == "published" && eventIchDabei(e) && !eventSchlussVorbei(e, now: now)
    }

    /// Abmelden geht bis zum Beginn - nach dem Anmeldeschluss kostet es trotzdem.
    static func eventAbmeldbar(_ e: MitgliedEvent, now: Date) -> Bool {
        e.status == "published" && eventIchDabei(e) && !eventBegonnen(e, now: now)
    }

    /// Was eine Anmeldung kostet: Preis pro Person, Begleitpersonen eingerechnet.
    static func eventGebuehrCents(_ feeCents: Int?, begleitpersonen: Int) -> Int {
        (feeCents ?? 0) * (1 + Swift.max(0, begleitpersonen))
    }

    /// Wuerde diese Gruppe nur noch auf die Warteliste passen?
    static func eventNurWarteliste(_ e: MitgliedEvent, begleitpersonen: Int) -> Bool {
        guard let max = e.maxParticipants else { return false }
        return (e.personen ?? 0) + 1 + Swift.max(0, begleitpersonen) > max
    }

    /// "62 angemeldet · noch 18 frei", ohne Grenze "62 angemeldet". Nur Zahlen, keine Namen.
    static func eventBelegungText(_ e: MitgliedEvent) -> String {
        var teile = ["\(e.personen ?? 0) angemeldet"]
        if let frei = eventFrei(e) { teile.append(frei > 0 ? "noch \(frei) frei" : "ausgebucht") }
        if let w = e.warteliste, w > 0 { teile.append("\(w) auf der Warteliste") }
        return teile.joined(separator: " · ")
    }

    /// Fuellstand fuer den Balken (0...1), ohne Grenze nil.
    static func eventBelegungAnteil(_ e: MitgliedEvent) -> Double? {
        guard let max = e.maxParticipants, max != 0 else { return nil }
        return Swift.min(1, Double(e.personen ?? 0) / Double(max))
    }

    /// "Du allein", "Du + 1 Begleitperson", "Du + 2 Begleitpersonen".
    static func eventPersonenText(_ begleitpersonen: Int) -> String {
        if begleitpersonen <= 0 { return "Du allein" }
        return "Du + \(begleitpersonen) \(begleitpersonen == 1 ? "Begleitperson" : "Begleitpersonen")"
    }

    /// Beschriftung des Anmeldeknopfs: "Verbindlich anmelden · 36,00 €", "Auf die Warteliste".
    static func eventAnmeldenKnopf(_ e: MitgliedEvent, begleitpersonen: Int) -> String {
        if eventNurWarteliste(e, begleitpersonen: begleitpersonen) { return "Auf die Warteliste" }
        guard let fee = e.feeCents, fee != 0 else { return "Anmelden" }
        return "Verbindlich anmelden · \(Geld.formatCents(eventGebuehrCents(fee, begleitpersonen: begleitpersonen)))"
    }

    /// "Abmelden (bis 30.10. kostenlos)", nach dem Schluss "Abmelden (Gebühr bleibt)".
    static func eventAbmeldenKnopf(_ e: MitgliedEvent, now: Date) -> String {
        if (e.feeCents ?? 0) == 0 || e.meinStatus == "waitlisted" { return "Abmelden" }
        return eventSchlussVorbei(e, now: now)
            ? "Abmelden (Gebühr bleibt)"
            : "Abmelden (bis \(eventTagKurz(eventSchluss(e))) kostenlos)"
    }

    /**
     * Der Hinweis zur Gebuehr vor dem Anmelden. Die Forderung entsteht mit der
     * Anmeldung, steht im Konto unter Offen; nach dem Schluss kostet Abmelden
     * trotzdem.
     */
    static func eventGebuehrHinweis(_ e: MitgliedEvent) -> String? {
        guard let fee = e.feeCents, fee != 0 else { return nil }
        let begleit = e.companionsAllowed == true ? " – auch für jede Begleitperson" : ""
        return "\(Geld.formatCents(fee)) pro Person\(begleit). Mit der Anmeldung entsteht die Forderung, "
            + "sie steht in deinem Konto unter „Offen“ und wird per Lastschrift eingezogen. "
            + "Bis zum Anmeldeschluss am \(eventTagKurz(eventSchluss(e))) kannst du dich kostenlos abmelden, "
            + "danach kostet die Abmeldung trotzdem."
    }

    /// Der Stand auf der Warteliste: "Platz 2 von 3 auf der Warteliste. ..."
    static func eventWartelisteText(platz: Int?, laenge: Int) -> String {
        let wo = platz.map { "Platz \($0) von \(Swift.max($0, laenge))" } ?? "Du stehst"
        return "\(wo) auf der Warteliste. Wird ein Platz frei, rückst du bis zum Anmeldeschluss automatisch nach – "
            + "erst dann entsteht eine Forderung."
    }
}
