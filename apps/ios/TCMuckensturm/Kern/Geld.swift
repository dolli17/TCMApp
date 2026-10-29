/**
 * Geldbetraege
 *
 * Portierung aus packages/core/src/money.ts. Gerechnet wird in ganzen Cent;
 * formatCents schreibt wie Intl.NumberFormat("de-DE", EUR): Tausenderpunkt,
 * Komma, geschuetztes Leerzeichen (U+00A0) vor dem Euro-Zeichen.
 */

enum Geld {
    /// 1900 -> "19,00 €"
    static func formatCents(_ cents: Int) -> String {
        let betrag = cents.magnitude
        var euro = String(betrag / 100)
        // Tausenderpunkte von rechts
        var gruppiert = ""
        while euro.count > 3 {
            gruppiert = "." + euro.suffix(3) + gruppiert
            euro = String(euro.dropLast(3))
        }
        let rest = betrag % 100
        let vorzeichen = cents < 0 ? "-" : ""
        return "\(vorzeichen)\(euro)\(gruppiert),\(rest < 10 ? "0" : "")\(rest)\u{00A0}€"
    }
}
