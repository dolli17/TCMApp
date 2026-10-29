/**
 * Was der Tab Verein zeigt, als reine Funktionen
 *
 * Texte wie apps/mobile/app/(tabs)/verein/ (getraenke.tsx, veranstaltung/[id].tsx),
 * ohne SwiftUI - damit sich jeder Satz ohne Simulator pruefen laesst
 * (VereinLogikTests). Die Regeln selbst stehen im Kern (Getraenke,
 * Veranstaltungen); hier nur, was die Bildschirme daraus zusammensetzen.
 */

import Foundation

enum VereinReiter: String, CaseIterable, Sendable {
    case getraenke, veranstaltungen

    var label: String {
        switch self {
        case .getraenke: "Getränke"
        case .veranstaltungen: "Veranstaltungen"
        }
    }
}

enum VereinLogik {
    // MARK: - Getraenke

    private static let quelle = ["kiosk": "Theke", "bar_duty": "Thekendienst", "app": "App"]

    /// Woher eine Entnahme kommt; Unbekanntes gilt als App.
    static func quelleText(_ source: String?) -> String {
        quelle[source ?? ""] ?? "App"
    }

    /// "Do., 29.10., 18:05" wie Intl.DateTimeFormat("de-DE", {weekday: "short", day, month, hour, minute})
    static func zeitpunkt(_ iso: String?) -> String {
        guard let iso, let d = Zeit.datum(iso) else { return "" }
        let k = Zeit.berlin.dateComponents([.day, .month, .hour, .minute], from: d)
        return "\(Zeit.kurzerWochentag(d))., "
            + String(format: "%02d.%02d., %02d:%02d", k.day ?? 0, k.month ?? 0, k.hour ?? 0, k.minute ?? 0)
    }

    /// Die Unterzeile in "Zuletzt": "Do., 29.10., 18:05 · App · zurückgenommen"
    static func entnahmeZeile(_ g: EigenesGetraenk) -> String {
        let zurueck = g.voidedAt != nil ? " · zurückgenommen" : ""
        return "\(zeitpunkt(g.createdAt)) · \(quelleText(g.source))\(zurueck)"
    }

    /// "2× Bier", eins ohne Zahl
    static func entnahmeTitel(_ g: EigenesGetraenk) -> String {
        let menge = g.quantity ?? 1
        return "\(menge > 1 ? "\(menge)× " : "")\(g.itemName ?? "")"
    }

    /// Kicker der Monatskarte: "Oktober · läuft noch"
    static func monatKicker(_ jetzt: Date) -> String {
        "\(Zeit.monatLang(jetzt)) · läuft noch"
    }

    /// "3 Entnahmen · wird mit der Monatsabrechnung eingezogen"
    static func entnahmenText(_ anzahl: Int) -> String {
        "\(anzahl) \(anzahl == 1 ? "Entnahme" : "Entnahmen") · wird mit der Monatsabrechnung eingezogen"
    }

    /// Unterzeile einer Kachel: "2,50 € · 0,5 l"
    static func artikelZeile(_ a: Getraenk) -> String {
        let preis = Geld.formatCents(a.priceCents ?? 0)
        guard let d = a.description, !d.isEmpty else { return preis }
        return "\(preis) · \(d)"
    }

    /// Die Eintragen-Leiste: "3 Getränke · 7,50 €"
    static func korbZeile(stueck: Int, betrag: Int) -> String {
        "\(stueck) \(stueck == 1 ? "Getränk" : "Getränke") · \(Geld.formatCents(betrag))"
    }

    /// Die Rueckfrage beim Verlassen mit vollem Korb.
    static func erinnerung(stueck: Int, betrag: Int) -> String {
        "\(Getraenke.basketReminder(count: stueck, totalCents: betrag)) Gebucht wird erst mit „Eintragen“ – die Auswahl bleibt gemerkt."
    }

    static func stornoHinweis(_ minuten: Int) -> String {
        "Eine Entnahme lässt sich \(minuten) Minuten lang selbst zurücknehmen."
    }

    // MARK: - Veranstaltung im Detail

    /// Abgesagt ist abgesagt: dann zaehlt die Anmeldung nicht mehr, es gibt nur den Hinweis.
    static func dabei(_ e: MitgliedEvent) -> Bool {
        e.status != "cancelled" && Veranstaltungen.eventIchDabei(e)
    }

    /// Steht die Forderung noch offen (oder kam zurueck) - oder ist sie schon im Einzug?
    static func forderungText(status: String?) -> String {
        ["open", "notified", "returned"].contains(status ?? "")
            ? "steht in deinem Konto unter „Offen“"
            : "ist im Einzug"
    }

    /// Die Zeile "Preis" in den Eckdaten.
    static func preisHinweis(_ e: MitgliedEvent) -> String {
        "\(e.companionsAllowed == true ? "Auch für Begleitpersonen. " : "")"
            + "Mit der Anmeldung steht der Betrag in deinem Konto und wird per Lastschrift eingezogen."
    }

    /// Die Rueckfrage vor dem Abmelden.
    static func abmeldenFrage(_ e: MitgliedEvent, now: Date) -> String {
        if e.meinStatus != "waitlisted", (e.feeCents ?? 0) != 0, Veranstaltungen.eventSchlussVorbei(e, now: now) {
            return "Der Anmeldeschluss ist vorbei – die Gebühr bleibt trotzdem fällig. Wirklich abmelden?"
        }
        return "Wirklich abmelden?"
    }

    /// Der Knopf im Aenderungsformular, angemeldet mit Gebuehr mit dem neuen Betrag.
    static func aenderungKnopf(_ e: MitgliedEvent, begleitpersonen: Int) -> String {
        guard let fee = e.feeCents, fee != 0, e.meinStatus == "registered" else { return "Änderung sichern" }
        return "Änderung sichern · \(Geld.formatCents(Veranstaltungen.eventGebuehrCents(fee, begleitpersonen: begleitpersonen)))"
    }

    /// Unter "Begleitpersonen": der Preis je Person oder wer gemeint ist.
    static func begleitHinweis(_ e: MitgliedEvent) -> String {
        guard let fee = e.feeCents, fee != 0 else { return "Familie, Freunde" }
        return "je \(Geld.formatCents(fee))"
    }

    /// Passt die Gruppe nicht mehr, sagt das Formular es vor dem Absenden.
    static func wartelisteVorab(begleitpersonen: Int) -> String {
        "Für \(begleitpersonen > 0 ? "euch alle" : "dich") ist gerade kein Platz frei – du kommst auf die Warteliste "
            + "und rückst automatisch nach, wenn etwas frei wird."
    }

    /// Wenn es nichts zu tun gibt: warum nicht.
    static func nichtsZuTun(_ e: MitgliedEvent, now: Date) -> String {
        if e.status == "cancelled" { return "Diese Veranstaltung ist abgesagt." }
        if Veranstaltungen.eventVorbei(e, now: now) { return "Diese Veranstaltung ist vorbei." }
        if e.registrationEnabled != true { return "Ohne Anmeldung – komm einfach vorbei." }
        if Veranstaltungen.eventBegonnen(e, now: now) { return "Die Veranstaltung läuft schon." }
        return "Der Anmeldeschluss ist vorbei."
    }

    /// Die Marken unter dem Kopf: Art und - abgesagt oder vorbei - der Stand.
    static func marken(_ e: MitgliedEvent, now: Date) -> [MeineMarke] {
        let art = e.kind ?? ""
        var liste = [MeineMarke(text: Veranstaltungen.kindLabel[art] ?? art, ton: Veranstaltungen.kindTon[art] ?? .grau)]
        if e.status == "cancelled" || Veranstaltungen.eventVorbei(e, now: now) {
            liste.append(Veranstaltungen.eventStatusMarke(e, now: now))
        }
        return liste
    }
}
