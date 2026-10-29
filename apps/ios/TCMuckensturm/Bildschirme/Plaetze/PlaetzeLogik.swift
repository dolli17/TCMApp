/**
 * Ansichtslogik des Tabs Plaetze als reine Funktionen
 *
 * Texte und Entscheidungen aus apps/mobile/app/(tabs)/plaetze/index.tsx und
 * src/components/BuchungsFenster.tsx: welche Tage waehlbar sind, wie sie
 * heissen, was im Blatt angeboten wird und was zum Buchen noch fehlt. Die
 * Regeln selbst stehen im Kern (Platzplan, Belegung); hier wird nur
 * zusammengesetzt, was die Ansicht zeigt. Getestet in PlaetzeLogikTests.
 */

import Foundation

enum PlaetzeLogik {
    // MARK: - Tage

    /// "2026-10-29" plus n Tage, als Kalendertag gerechnet.
    static func verschiebe(_ datum: String, um tage: Int) -> String {
        guard let d = Zeit.datum(datum), let neu = Zeit.utc.date(byAdding: .day, value: tage, to: d) else { return datum }
        let k = Zeit.utc.dateComponents([.year, .month, .day], from: neu)
        return String(format: "%04d-%02d-%02d", k.year ?? 0, k.month ?? 0, k.day ?? 0)
    }

    /**
     * Die buchbaren Tage: heute und lead_days weitere - dieselbe Zahl, gegen
     * die create_booking prueft. Ein Kalender wuerde Tage anbieten, die die
     * Datenbank ohnehin abweist.
     */
    static func tage(heute: String, vorlauf: Int) -> [String] {
        (0...max(vorlauf, 0)).map { verschiebe(heute, um: $0) }
    }

    /// Wochentag des Kalendertags (0 = Sonntag), unabhaengig von der Zeitzone.
    private static func wochentag(_ datum: String) -> Int {
        guard let d = Zeit.datum(datum) else { return 0 }
        return Zeit.utc.component(.weekday, from: d) - 1
    }

    private static func tagUndMonat(_ datum: String) -> (tag: Int, monat: Int) {
        let teile = datum.split(separator: "-").compactMap { Int($0) }
        guard teile.count == 3 else { return (0, 0) }
        return (teile[2], teile[1])
    }

    /// Fuer die Tageszeile: "Heute, 13.10.", "Morgen, 14.10." oder "Do., 15.10."
    static func tageszeile(_ datum: String, heute: String) -> String {
        let (t, m) = tagUndMonat(datum)
        let kurz = String(format: "%02d.%02d.", t, m)
        if datum == heute { return "Heute, \(kurz)" }
        if datum == verschiebe(heute, um: 1) { return "Morgen, \(kurz)" }
        return "\(Zeit.wochentageKurz[wochentag(datum)])., \(kurz)"
    }

    /// Fuer VoiceOver: "Donnerstag, 15. Oktober"
    static func lesbar(_ datum: String) -> String {
        let (t, m) = tagUndMonat(datum)
        return "\(Zeit.wochentageLang[wochentag(datum)]), \(String(format: "%02d", t)). \(Zeit.monateLang[max(m - 1, 0)])"
    }

    /// Kicker im Blatt: "Montag, 28.09."
    static func tagText(_ datum: String) -> String {
        let (t, m) = tagUndMonat(datum)
        return "\(Zeit.wochentageLang[wochentag(datum)]), \(String(format: "%02d.%02d.", t, m))"
    }

    /// Fuer die Datums-Kachel: "MO" und 28, heute "HEUTE".
    static func kachel(_ datum: String, heute: String? = nil) -> (wochentag: String, tag: Int) {
        let name = datum == heute ? "HEUTE" : Zeit.wochentageKurz[wochentag(datum)].uppercased()
        return (name, tagUndMonat(datum).tag)
    }

    // MARK: - Kontingent

    /// 0 erlaubt heisst unbegrenzt - die Regel bleibt in der Datenbank, nur abgeschaltet.
    static func unbegrenzt(_ k: Kontingent) -> Bool { k.allowed <= 0 }

    static func kontingentAus(_ k: Kontingent) -> Bool { !unbegrenzt(k) && k.used >= k.allowed }

    static func kontingentText(_ k: Kontingent) -> String? {
        guard !unbegrenzt(k) else { return nil }
        return "Kontingent: \(k.used) von \(k.allowed) offenen Buchungen. Buchungen, bei denen du als Mitspieler eingetragen bist, zählen mit."
    }

    static let kontingentAusText = "Dein Kontingent ist ausgeschöpft."

    // MARK: - Plan

    /// Sperrungen lassen sich nur mit Platzrechten oeffnen, alles andere zum Ansehen oder Mitspielen.
    static func oeffnebar(_ b: some Belegungsmerkmale, darfPlaetze: Bool) -> Bool {
        Startseite.occupancyKind(b) == .gesperrt ? darfPlaetze : true
    }

    /// Die Startzeiten im Anzeigeblock (bei 60 Minuten 17:00-18:00), die canStartAt bestehen.
    static func startzeiten(
        tag: String, courtId: String, stunde: Int, anzeige: Int, raster: Int, dauer: Int, schluss: Int,
        belegung: [TagesBelegung], vorlauf: Int, jetzt: Date
    ) -> [Int] {
        stride(from: stunde, to: stunde + anzeige, by: max(raster, 1)).filter {
            Belegung.canStartAt(
                day: tag, courtId: courtId, minute: $0, durationMinutes: dauer, closingMinutes: schluss,
                occupied: belegung, leadDays: vorlauf, now: jetzt
            )
        }
    }

    /// Der Anzeigeblock, in dem eine Minute liegt: bei 60 Minuten Anzeige und 08:00 Oeffnung 17:30 -> 17:00.
    static func stunde(von minute: Int, oeffnung: Int, anzeige: Int) -> Int {
        oeffnung + Int((Double(minute - oeffnung) / Double(max(anzeige, 1))).rounded(.down)) * anzeige
    }

    /// "Platz 3" -> "3"; andere Namen bleiben bei der Kurzform.
    static func platzNummer(name: String?, kurz: String?) -> String {
        let n = name ?? ""
        if n.lowercased().hasPrefix("platz ") {
            let rest = n.dropFirst(6).trimmingCharacters(in: .whitespaces)
            if !rest.isEmpty { return rest }
        }
        return kurz ?? n
    }

    /// Hoechstens ein Nachladen je Sekunde: wie lange noch warten? 0 heisst sofort.
    static func drosselWartezeit(jetzt: Date, letzte: Date?, abstand: TimeInterval = 1) -> TimeInterval {
        guard let letzte else { return 0 }
        return max(0, abstand - jetzt.timeIntervalSince(letzte))
    }

    // MARK: - Freie Zeiten

    /// "n frei", "voll"
    static func freiText(_ n: Int) -> String { n == 0 ? "voll" : "\(n) frei" }

    static func freiLabel(_ n: Int) -> String {
        n == 0 ? "kein Platz frei" : n == 1 ? "1 Platz frei" : "\(n) Plätze frei"
    }

    // MARK: - Buchungsblatt

    static func initialen(_ vor: String?, _ nach: String?) -> String {
        let k = "\((vor ?? "").prefix(1))\((nach ?? "").prefix(1))".uppercased()
        return k.isEmpty ? "?" : k
    }

    /// Initialen aus einem ganzen Namen: erstes und letztes Wort.
    static func initialen(name: String?) -> String {
        let teile = (name ?? "").split(separator: " ").map(String.init)
        return initialen(teile.first, teile.count > 1 ? teile.last : nil)
    }

    static let trefferMax = 6

    /// Mitspieler durch Tippen finden: Vor- oder Nachname zuerst, ohne die schon Gewaehlten.
    static func treffer(_ suche: String, in verzeichnis: [Mitglied], ohne: [String]) -> [Mitglied] {
        let q = suche.trimmingCharacters(in: .whitespaces).lowercased()
        guard !q.isEmpty else { return [] }
        return Array(
            verzeichnis
                .filter { !ohne.contains($0.id) }
                .filter { m in
                    "\(m.firstName ?? "") \(m.lastName ?? "")".lowercased().contains(q)
                        || "\(m.lastName ?? "") \(m.firstName ?? "")".lowercased().contains(q)
                }
                .prefix(trefferMax)
        )
    }

    /**
     * Was zum Buchen noch fehlt - als naechster Schritt formuliert, nicht als
     * Regelverstoss. nil heisst: buchbar.
     */
    static func buchenHinweis(art: BookingTypeInfo?, mitglieder: Int, gaeste: Int, sucht: Bool) -> String? {
        guard let art else { return nil }
        let maxWeitere = max(art.maxPlayers - 1, 0)
        let nochPlatz = mitglieder + gaeste < maxWeitere
        let suchtWirklich = sucht && nochPlatz
        let fehlen = suchtWirklich ? 0 : Platzplan.missingPlayers(art, memberCount: mitglieder, guestCount: gaeste)
        if fehlen > 0 {
            return "Noch \(fehlen) Mitspieler wählen\(nochPlatz ? " – oder „Mitspieler gesucht“ einschalten" : "")."
        }
        return Platzplan.checkPlayers(art, memberCount: mitglieder, guestCount: gaeste, partnerWanted: suchtWirklich)
    }

    /// Wer von Doppel auf Einzel wechselt, hat womoeglich zu viele eingetragen: die ueberzaehligen fallen hinten weg.
    static func kuerze(mitglieder: [String], gaeste: [String], maxPlayers: Int) -> (mitglieder: [String], gaeste: [String]) {
        let max = Swift.max(maxPlayers - 1, 0)
        let m = Array(mitglieder.prefix(max))
        return (m, Array(gaeste.prefix(Swift.max(0, max - m.count))))
    }

    static func gastText(gebuehrCents: Int) -> String {
        gebuehrCents > 0 ? "Gast · \(Geld.formatCents(gebuehrCents))" : "Gast"
    }

    static func gastHinweis(gebuehrCents: Int) -> String {
        "Für jeden Gast werden \(Geld.formatCents(gebuehrCents)) berechnet und mit der nächsten Lastschrift eingezogen."
    }

    /// "3 Buchungen liegen in diesem Zeitraum ..." - die Zahl fuer die Rueckfrage.
    static func kollisionen(aus meldung: String) -> Int? {
        guard let r = meldung.range(of: #"^(\d+) Buchungen liegen"#, options: .regularExpression) else { return nil }
        return Int(meldung[r].prefix { $0.isNumber })
    }

    static func sperreGeaendert(verdraengt: Int) -> String {
        verdraengt > 0
            ? "Sperrung geändert, \(verdraengt) \(verdraengt == 1 ? "Buchung" : "Buchungen") verdrängt."
            : "Sperrung geändert."
    }

    static func verdraengenText(_ n: Int) -> String {
        "\(n) \(n == 1 ? "Buchung" : "Buchungen") verdrängen"
    }

    static func imWegText(_ n: Int) -> String {
        n == 1
            ? "1 Buchung liegt im Weg. Sie wird abgesagt, die Mitglieder bekommen Bescheid."
            : "\(n) Buchungen liegen im Weg. Sie werden abgesagt, die Mitglieder bekommen Bescheid."
    }
}

/**
 * Was das Blatt an einer bestehenden Belegung anbietet (VerwaltenInhalt).
 *
 * Drei Rollen an demselben Blatt: der Bucher verwaltet, wer Platzrechte hat,
 * verwaltet fremd, und wer nur eingeladen ist, kann ausschliesslich
 * mitspielen. Ab Spielbeginn bleibt nur, wer Platzrechte hat - so eng wie
 * die RPCs (bookingActions).
 */
struct Verwalten: Equatable {
    /// Eine Sperrung (auch ein Serientermin): nur aufheben bzw. absagen.
    let nurStorno: Bool
    /// Training einer Serie: faellt ueber cancel_series_occurrence aus.
    let serientermin: Bool
    let laeuftSchon: Bool
    /// Stornieren und Mitspieler aendern
    let darfVerwalten: Bool
    let kannMitspielen: Bool
    let kannUmsetzen: Bool
    let kannSperreAendern: Bool
    /// Nur beim Storno einer fremden Buchung ist ein Grund Pflicht.
    let grundNoetig: Bool
    /// Die Zeile unter dem Titel: "Doppel · gebucht von dir", "Gesperrt · Platzpflege", "Training · Serientermin"
    let untertitel: String

    init(_ b: TagesBelegung, darfPlaetze: Bool, jetzt: Date = Date()) {
        nurStorno = b.kind == "blocking"
        serientermin = !(b.seriesId ?? "").isEmpty
        let beginn = Zeit.datum(b.startsAt) ?? .distantPast
        let ende = Zeit.datum(b.endsAt) ?? .distantPast
        laeuftSchon = beginn <= jetzt
        let darf = Platzplan.bookingActions(
            startsAt: b.startsAt, own: b.isOwn == true, joined: b.binDabei == true, partnerWanted: b.partnerWanted == true,
            free: b.frei, managesCourts: darfPlaetze, now: jetzt
        )
        darfVerwalten = darf.cancel
        kannMitspielen = darf.join
        kannUmsetzen = darfPlaetze && b.kind == "booking" && !serientermin && ende > jetzt
        kannSperreAendern = darfPlaetze && nurStorno && !serientermin
        grundNoetig = darfPlaetze && b.isOwn != true && b.kind == "booking"

        if serientermin {
            untertitel = "\(Platzplan.nichtLeer(b.title) ?? b.typeName ?? "") · Serientermin"
        } else if nurStorno {
            untertitel = "Gesperrt · \(Platzplan.blockingLabel(title: b.title, typeName: b.typeName).kategorie)"
        } else {
            untertitel = "\(b.typeName ?? "") · gebucht von \(b.isOwn == true ? "dir" : (b.ownerName ?? "unbekannt"))"
        }
    }

    /// Der rote Knopf, je nach Schritt: erst fragen, dann bestaetigen.
    func stornoText(bestaetigen: Bool) -> String {
        if bestaetigen {
            return serientermin ? "Termin wirklich absagen" : nurStorno ? "Wirklich aufheben" : "Wirklich stornieren"
        }
        return serientermin ? "Fällt diese Woche aus" : nurStorno ? "Sperrung aufheben" : "Buchung stornieren"
    }

    /// Ein Grundfeld gibt es beim Absagen eines Serientermins und beim Stornieren einer Buchung.
    var grundFeld: Bool { serientermin || !nurStorno }

    /// "Hier wird noch ein Mitspieler gesucht." bzw. "… werden noch 2 Mitspieler …"
    static func suchtText(_ b: TagesBelegung) -> String? {
        guard b.partnerWanted == true, let frei = b.frei, frei > 0 else { return nil }
        return "Hier \(frei == 1 ? "wird noch ein Mitspieler" : "werden noch \(frei) Mitspieler") gesucht."
    }
}
