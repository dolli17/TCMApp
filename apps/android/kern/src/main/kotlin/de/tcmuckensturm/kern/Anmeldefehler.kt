/*
 * Fehler beim Anmelden
 *
 * Entspricht packages/core/src/anmeldefehler.ts (Texte wortgleich), wie
 * Daten/Anmeldefehler.swift der iOS-App. Supabase Auth meldet auf Englisch,
 * und nicht jeder Fehler ist ein falsches Passwort. Wer kein Netz hat oder zu
 * oft probiert hat, soll das lesen - nicht "Passwort stimmt nicht" und dann
 * noch einmal probieren.
 *
 * Zweistufig: die App macht aus einer Ausnahme von supabase-kt die Form, die
 * auch auth-js liefert (AuthFehlerForm, in app/daten/AuthFehler.kt), und
 * diese Funktionen ordnen sie zu - so laesst sich die Zuordnung ohne Netz testen.
 */

package de.tcmuckensturm.kern

/** Die Felder, nach denen zugeordnet wird - wie AuthLikeError in @tcm/core. */
data class AuthFehlerForm(
    val code: String? = null,
    val status: Int? = null,
    val nachricht: String? = null,
    /** Keine Antwort vom Server (in auth-js: AuthRetryableFetchError). */
    val ohneAntwort: Boolean = false,
)

object Anmeldefehler {
    const val ANMELDEDATEN_FALSCH = "E-Mail-Adresse oder Passwort stimmt nicht."
    const val ZU_VIELE_VERSUCHE =
        "Zu viele Versuche in kurzer Zeit. Bitte warte ein paar Minuten und versuche es dann erneut."
    const val SERVER = "Der Server ist gerade nicht erreichbar. Bitte versuche es in ein paar Minuten erneut."

    /** VERBINDUNGSFEHLER_TEXT aus packages/core/src/errors.ts */
    const val VERBINDUNG = DbFehler.VERBINDUNGSFEHLER_TEXT
    const val GESPERRT = "Dieser Zugang ist gesperrt. Bitte melde dich beim Verein."
    const val NICHT_BESTAETIGT =
        "Die E-Mail-Adresse ist noch nicht bestätigt. Bitte nutze den Link aus der Einladung."

    /** Im Konto gibt es keinen Link, der ablaufen koennte - dort ist die Sitzung weg. */
    const val NEU_ANMELDEN = "Bitte melde dich neu an und versuch es dann noch einmal."

    /**
     * Eine Stoerung statt einer Antwort in der Sache: keine Verbindung, Server
     * gestoert, zu viele Versuche. Nichts davon verraet, ob es eine Adresse gibt.
     */
    fun stoerungText(fehler: AuthFehlerForm?): String? {
        if (fehler == null) return null
        val status = fehler.status
        if (fehler.ohneAntwort) {
            return if (status != null && status >= 500) SERVER else VERBINDUNG
        }
        if (fehler.nachricht != null && DbFehler.klingtNachVerbindung(fehler.nachricht)) return VERBINDUNG
        if (status == 429 || fehler.code == "over_request_rate_limit" || fehler.code == "over_email_send_rate_limit") {
            return ZU_VIELE_VERSUCHE
        }
        if (status != null && status >= 500) return SERVER
        return null
    }

    /**
     * Falsche Adresse und falsches Passwort bleiben ein Satz - sonst liesse sich
     * herausfinden, wer im Verein ist.
     */
    fun anmeldeFehlerText(fehler: AuthFehlerForm?): String {
        if (fehler == null) return ANMELDEDATEN_FALSCH
        stoerungText(fehler)?.let { return it }
        return when (fehler.code) {
            "user_banned" -> GESPERRT
            "email_not_confirmed" -> NICHT_BESTAETIGT
            else -> ANMELDEDATEN_FALSCH
        }
    }

    /**
     * Wie passwortFehlerText in @tcm/core: beim Speichern eines neuen
     * Passworts, nie englischer Rohtext. `imKonto`: aus dem Konto heraus
     * statt aus dem Mail-Link, dann heisst eine fehlende Sitzung "neu anmelden".
     */
    fun passwortFehlerText(fehler: AuthFehlerForm?, imKonto: Boolean = false): String {
        if (fehler == null) return "Das Passwort ließ sich nicht speichern."
        stoerungText(fehler)?.let { return it }
        val ohneSitzung = if (imKonto) NEU_ANMELDEN else "Der Link ist abgelaufen. Bitte fordere einen neuen an."
        return when (fehler.code) {
            "same_password" -> "Das neue Passwort muss sich vom bisherigen unterscheiden."
            "weak_password" -> "Das Passwort ist zu schwach. Bitte wähle ein längeres."
            "session_not_found", "session_expired" -> ohneSitzung
            else -> if (fehler.status == 401) ohneSitzung else "Das Passwort ließ sich nicht speichern. Bitte versuche es erneut."
        }
    }
}
