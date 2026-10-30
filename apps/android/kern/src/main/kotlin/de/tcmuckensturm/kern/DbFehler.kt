/*
 * Datenbankfehler in verstaendliche Saetze uebersetzen
 *
 * Portierung aus packages/core/src/errors.ts (translateDbError, Regeln in
 * docs/native/app-api.md, Abschnitt "Fehler"), wie Kern/DbFehler.swift der
 * iOS-App. Was hier herauskommt, zeigt die App unveraendert an.
 */

package de.tcmuckensturm.kern

import kotlinx.serialization.Serializable

/** Was ein Fehler von PostgREST mitbringt (PostgresLikeError). */
@Serializable
data class PostgresFehler(
    val code: String? = null,
    val message: String? = null,
    val details: String? = null,
    val hint: String? = null,
)

object DbFehler {
    /** Die Reihenfolge zaehlt: der erste Treffer gewinnt, wie bei Object.entries in errors.ts. */
    val constraintTexte: List<Pair<String, String>> = listOf(
        "bookings_no_overlap" to "Dieser Platz ist zu der Zeit bereits belegt.",
        "bookings_slot_half_open" to "Der Zeitraum der Buchung ist ungültig.",
        "bookings_owner_present" to "Der Buchung fehlt ein Mitglied oder ein Titel.",
        "booking_players_member_xor_guest" to "Ein Mitspieler ist entweder Mitglied oder Gast, nicht beides.",
        "booking_players_unique_member" to "Dieses Mitglied ist bereits als Mitspieler eingetragen.",
        "charges_one_per_member_kind_period" to "Für diesen Zeitraum gibt es bereits eine Forderung.",
        "debit_items_one_active_per_charge" to "Diese Forderung ist bereits in einem Lastschriftlauf enthalten.",
        "members_email_key" to "Diese E-Mail-Adresse wird bereits verwendet.",
        "members_email_pflicht" to "Jedes Mitglied braucht eine E-Mail-Adresse.",
        "members_login_pflicht" to "Jedes Mitglied braucht einen Login. Ohne Login sind nur archivierte Mitglieder.",
        "memberships_number_key" to "Diese Mitgliedsnummer ist bereits vergeben.",
        "memberships_one_open_per_member" to "Dieses Mitglied hat bereits eine laufende Mitgliedschaft.",
        "drink_items_name_unique" to "Ein Artikel mit diesem Namen existiert bereits.",
        "sepa_mandates_used_after_signed" to "Ein Mandat kann nicht vor seiner Unterschrift benutzt worden sein.",
        "sepa_mandates_reference_unique_for_app" to "Diese Mandatsreferenz ist bereits vergeben.",
        "members_nuliga_id_key" to "Diese nuLiga-Id ist bereits einem anderen Mitglied zugeordnet.",
        "members_nationality_code_format" to "Die Nationalität wird als zwei Großbuchstaben angegeben, zum Beispiel DE.",
        "members_emergency_contact_paarweise" to "Zur Notfallnummer gehört auch ein Name.",
        "teams_name_lower_key" to "Eine Mannschaft mit diesem Namen gibt es schon.",
        "members_one_captain_per_team" to "Diese Mannschaft hat schon einen Mannschaftsführer.",
        "members_captain_needs_team" to "Mannschaftsführer geht nur mit Mannschaft.",
    )

    val codeTexte: Map<String, String> = mapOf(
        "23P01" to "Dieser Platz ist zu der Zeit bereits belegt.",
        "23505" to "Dieser Eintrag existiert bereits.",
        "23503" to "Ein verknüpfter Datensatz fehlt oder wird noch verwendet.",
        "23514" to "Die Eingabe verletzt eine Regel.",
        "42501" to "Dafür fehlt dir die Berechtigung.",
        "22023" to "Die Eingabe ist ungültig.",
        "P0002" to "Der gesuchte Datensatz wurde nicht gefunden.",
    )

    /** Kein Netz oder der Server antwortet nicht - je nach Laufzeit anders formuliert (VERBINDUNG in errors.ts). */
    val verbindungsTeile = listOf(
        "fetch failed", "failed to fetch", "networkerror", "network request failed", "load failed",
        "econnrefused", "econnreset", "enotfound", "etimedout", "socket hang up",
    )

    const val VERBINDUNGSFEHLER_TEXT =
        "Keine Verbindung zum Server. Bitte prüfe die Internetverbindung und versuche es erneut."

    /** Was uebrig bleibt, wenn keine Regel greift: kein englischer Rohtext. */
    const val ALLGEMEINER_FEHLER_TEXT = "Das hat nicht geklappt. Bitte versuche es erneut."

    /** Klingt der Text nach fehlender Verbindung? Ohne Gross-/Kleinschreibung. */
    fun klingtNachVerbindung(text: String): Boolean {
        val klein = text.lowercase()
        return verbindungsTeile.any { klein.contains(it) }
    }

    fun isNetworkError(fehler: PostgresFehler?): Boolean {
        if (fehler == null) return false
        return klingtNachVerbindung("${fehler.message ?: ""} ${fehler.details ?: ""}")
    }

    fun translateDbError(fehler: PostgresFehler?): String {
        if (fehler == null) return "Unbekannter Fehler."
        if (isNetworkError(fehler)) return VERBINDUNGSFEHLER_TEXT

        val heuhaufen = "${fehler.message ?: ""} ${fehler.details ?: ""}"
        constraintTexte.firstOrNull { (constraint, _) -> heuhaufen.contains(constraint) }?.let { return it.second }

        // Meldungen aus den RPCs sind fuer Menschen geschrieben und enden auf einen Punkt.
        val message = fehler.message?.trim().orEmpty()
        if (message.isNotEmpty() && message.last() in ".!?" && !message.contains("violates")) return message

        fehler.code?.let { codeTexte[it] }?.let { return it }

        return if (message.isEmpty()) "Unbekannter Fehler." else ALLGEMEINER_FEHLER_TEXT
    }
}
