/**
 * Getraenke: der Korb, die Rueckmeldung nach dem Eintragen und das Stornofenster
 *
 * Portierung aus packages/core/src/drinks.ts (changeBasket, basketSummary,
 * basketAfterBatch, basketReminder, drinkBatchReport, canVoidSelf). Mit "+"
 * waechst nur der Korb - gebucht ist erst, was ueber "Eintragen" an die
 * Datenbank gegangen ist (U17). Gebucht wird je Artikel einzeln
 * (record_drink_purchase), es gibt keinen Sammelauftrag. Ob eine Rueckname
 * noch geht, prueft die Datenbank ein zweites Mal; hier wird nur der Knopf
 * rechtzeitig ausgeblendet. Gepruefte Faelle: packages/core/golden/
 * (changeBasket, basketSummary, basketAfterBatch, basketReminder,
 * drinkBatchReport, canVoidSelf).
 */

import Foundation

/// Ein Artikel der Karte, soweit der Korb ihn braucht.
protocol Korbartikel {
    var id: String { get }
    var priceCents: Int? { get }
}

/// Artikel-Id -> Menge, gesammelt und noch nicht eingetragen.
typealias Getraenkekorb = [String: Int]

/// Was beim Eintragen eines Artikels herauskam (DrinkBatchResult).
struct EintragErgebnis: Equatable, Sendable {
    let id: String
    let name: String
    let quantity: Int
    let ok: Bool
    /// Grund aus der Datenbank, wenn es nicht geklappt hat
    var message: String?
}

enum Getraenke {
    /// Hoechstmenge je Artikel und Eintragung - dieselbe Grenze in App und Web.
    static let maxMenge = 50

    /// Eins mehr oder weniger, begrenzt auf 0 bis maxMenge. Bei 0 faellt der Artikel heraus.
    static func changeBasket(_ korb: Getraenkekorb, itemId: String, delta: Int) -> Getraenkekorb {
        let neu = max(0, min(maxMenge, (korb[itemId] ?? 0) + delta))
        var rest = korb
        rest[itemId] = neu == 0 ? nil : neu
        return rest
    }

    /**
     * Was im Korb liegt, in der Reihenfolge der Karte. Nur Artikel, die noch
     * auf der Karte stehen, zaehlen mit.
     */
    static func basketSummary<T: Korbartikel>(_ karte: [T], _ korb: Getraenkekorb) -> (lines: [T], count: Int, totalCents: Int) {
        let zeilen = karte.filter { (korb[$0.id] ?? 0) > 0 }
        return (
            zeilen,
            zeilen.reduce(0) { $0 + (korb[$1.id] ?? 0) },
            zeilen.reduce(0) { $0 + (korb[$1.id] ?? 0) * ($1.priceCents ?? 0) }
        )
    }

    /// Nach dem Eintragen: was geklappt hat, verlaesst den Korb; was nicht, bleibt fuer einen neuen Versuch.
    static func basketAfterBatch(_ ergebnisse: [EintragErgebnis]) -> Getraenkekorb {
        Dictionary(ergebnisse.filter { !$0.ok }.map { ($0.id, $0.quantity) }, uniquingKeysWith: { _, b in b })
    }

    /// "2 Getränke (5,00 €) sind noch nicht eingetragen."
    static func basketReminder(count: Int, totalCents: Int) -> String {
        let was = count == 1 ? "1 Getränk" : "\(count) Getränke"
        return "\(was) (\(Geld.formatCents(totalCents))) \(count == 1 ? "ist" : "sind") noch nicht eingetragen."
    }

    /**
     * Rueckmeldung nach dem gesammelten Eintragen: schlaegt einer fehl, muss
     * klar sein, welcher - und dass die anderen trotzdem stehen.
     */
    static func drinkBatchReport(_ ergebnisse: [EintragErgebnis]) -> (ok: Bool, text: String) {
        let teil = { (r: EintragErgebnis) in "\(r.quantity)× \(r.name)" }
        let gut = ergebnisse.filter(\.ok)
        let schlecht = ergebnisse.filter { !$0.ok }

        if schlecht.isEmpty {
            return (true, "Eingetragen: \(gut.map(teil).joined(separator: ", ")).")
        }
        let fehler = schlecht.map { r -> String in
            guard let m = r.message, !m.isEmpty else { return teil(r) }
            return "\(teil(r)) (\(m.hasSuffix(".") ? String(m.dropLast()) : m))"
        }.joined(separator: ", ")
        if gut.isEmpty { return (false, "Nicht eingetragen: \(fehler).") }
        return (false, "Nicht eingetragen: \(fehler). Eingetragen: \(gut.map(teil).joined(separator: ", ")).")
    }

    /**
     * Darf das Mitglied diese Buchung noch selbst zuruecknehmen? Genau auf der
     * Grenze noch ja. Ohne lesbaren Zeitpunkt nein - die Datenbank haette das
     * letzte Wort, der Knopf soll dann gar nicht erst erscheinen.
     */
    static func canVoidSelf(createdAt: String?, voidedAt: String?, fensterMinuten: Int, now: Date) -> Bool {
        if let voidedAt, !voidedAt.isEmpty { return false }
        guard let createdAt, let erstellt = Zeit.datum(createdAt) else { return false }
        return now.timeIntervalSince(erstellt) <= Double(fensterMinuten) * 60
    }
}
