/**
 * Datenbankfehler in verstaendliche Saetze uebersetzen
 *
 * Portierung aus packages/core/src/errors.ts (translateDbError, Regeln in
 * docs/native/app-api.md, Abschnitt "Fehler"). Was hier herauskommt, zeigt
 * die App unveraendert an.
 */

import Foundation

/// Was ein Fehler von PostgREST mitbringt (PostgresLikeError).
struct PostgresFehler: Equatable, Sendable, Decodable {
    var code: String?
    var message: String?
    var details: String?
    var hint: String?
}

enum DbFehler {
    /// Die Reihenfolge zaehlt: der erste Treffer gewinnt, wie bei Object.entries in errors.ts.
    static let constraintTexte: [(String, String)] = [
        ("bookings_no_overlap", "Dieser Platz ist zu der Zeit bereits belegt."),
        ("bookings_slot_half_open", "Der Zeitraum der Buchung ist ungültig."),
        ("bookings_owner_present", "Der Buchung fehlt ein Mitglied oder ein Titel."),
        ("booking_players_member_xor_guest", "Ein Mitspieler ist entweder Mitglied oder Gast, nicht beides."),
        ("booking_players_unique_member", "Dieses Mitglied ist bereits als Mitspieler eingetragen."),
        ("charges_one_per_member_kind_period", "Für diesen Zeitraum gibt es bereits eine Forderung."),
        ("debit_items_one_active_per_charge", "Diese Forderung ist bereits in einem Lastschriftlauf enthalten."),
        ("members_email_key", "Diese E-Mail-Adresse wird bereits verwendet."),
        ("members_email_pflicht", "Jedes Mitglied braucht eine E-Mail-Adresse."),
        ("members_login_pflicht", "Jedes Mitglied braucht einen Login. Ohne Login sind nur archivierte Mitglieder."),
        ("memberships_number_key", "Diese Mitgliedsnummer ist bereits vergeben."),
        ("memberships_one_open_per_member", "Dieses Mitglied hat bereits eine laufende Mitgliedschaft."),
        ("drink_items_name_unique", "Ein Artikel mit diesem Namen existiert bereits."),
        ("sepa_mandates_used_after_signed", "Ein Mandat kann nicht vor seiner Unterschrift benutzt worden sein."),
        ("sepa_mandates_reference_unique_for_app", "Diese Mandatsreferenz ist bereits vergeben."),
        ("members_nuliga_id_key", "Diese nuLiga-Id ist bereits einem anderen Mitglied zugeordnet."),
        ("members_nationality_code_format", "Die Nationalität wird als zwei Großbuchstaben angegeben, zum Beispiel DE."),
        ("members_emergency_contact_paarweise", "Zur Notfallnummer gehört auch ein Name."),
        ("teams_name_lower_key", "Eine Mannschaft mit diesem Namen gibt es schon."),
        ("members_one_captain_per_team", "Diese Mannschaft hat schon einen Mannschaftsführer."),
        ("members_captain_needs_team", "Mannschaftsführer geht nur mit Mannschaft."),
    ]

    static let codeTexte: [String: String] = [
        "23P01": "Dieser Platz ist zu der Zeit bereits belegt.",
        "23505": "Dieser Eintrag existiert bereits.",
        "23503": "Ein verknüpfter Datensatz fehlt oder wird noch verwendet.",
        "23514": "Die Eingabe verletzt eine Regel.",
        "42501": "Dafür fehlt dir die Berechtigung.",
        "22023": "Die Eingabe ist ungültig.",
        "P0002": "Der gesuchte Datensatz wurde nicht gefunden.",
    ]

    /// Kein Netz oder der Server antwortet nicht - je nach Laufzeit anders formuliert.
    static let verbindung =
        "fetch failed|failed to fetch|networkerror|network request failed|load failed|econnrefused|econnreset|enotfound|etimedout|socket hang up"

    static let verbindungsfehlerText =
        "Keine Verbindung zum Server. Bitte prüfe die Internetverbindung und versuche es erneut."

    /// Was uebrig bleibt, wenn keine Regel greift: kein englischer Rohtext.
    static let allgemeinerFehlerText = "Das hat nicht geklappt. Bitte versuche es erneut."

    static func isNetworkError(_ fehler: PostgresFehler?) -> Bool {
        guard let fehler else { return false }
        let text = "\(fehler.message ?? "") \(fehler.details ?? "")"
        return text.range(of: verbindung, options: [.regularExpression, .caseInsensitive]) != nil
    }

    static func translateDbError(_ fehler: PostgresFehler?) -> String {
        guard let fehler else { return "Unbekannter Fehler." }
        if isNetworkError(fehler) { return verbindungsfehlerText }

        let heuhaufen = "\(fehler.message ?? "") \(fehler.details ?? "")"
        for (constraint, text) in constraintTexte where heuhaufen.contains(constraint) {
            return text
        }

        // Meldungen aus den RPCs sind fuer Menschen geschrieben und enden auf einen Punkt.
        let message = fehler.message?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if let letztes = message.last, ".!?".contains(letztes), !message.contains("violates") {
            return message
        }

        if let code = fehler.code, let text = codeTexte[code] { return text }

        return message.isEmpty ? "Unbekannter Fehler." : allgemeinerFehlerText
    }
}
