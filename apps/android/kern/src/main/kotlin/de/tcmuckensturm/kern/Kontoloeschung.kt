/*
 * Mitgliedschaft kuendigen beantragen (O9; U44)
 *
 * Portierung von packages/core/src/kontoloeschung.ts, wie
 * Kern/Kontoloeschung.swift der iOS-App: dieselben Saetze wie im Web unter
 * /konto/loeschen und in der Expo-App, dieselbe Pruefung. Geloescht wird
 * nicht sofort: konto_loeschung_beantragen meldet den Antrag an Vorstand
 * und Admins.
 */

package de.tcmuckensturm.kern

object Kontoloeschung {
    /** Grenze der RPC fuer die freiwillige Nachricht. */
    const val NACHRICHT_MAX = 1000

    const val TITEL = "Mitgliedschaft kündigen beantragen"
    val erklaerung = listOf(
        "Dein Antrag geht an den Vorstand. Er kümmert sich um die Kündigung deiner Mitgliedschaft und löscht dabei auch dein Konto samt Login für App und Web – oder anonymisiert es. Falls noch etwas zu klären ist, meldet er sich bei dir.",
        "Daten, die der Verein aufbewahren muss – etwa Beiträge und Lastschriften –, bleiben so lange wie vorgeschrieben erhalten.",
    )
    const val NACHRICHT_LABEL = "Nachricht an den Vorstand (freiwillig)"
    const val ABSENDEN = "Kündigung beantragen"
    const val BESTAETIGUNG_FRAGE =
        "Möchtest du die Kündigung deiner Mitgliedschaft und die Löschung deines Kontos wirklich beantragen?"
    const val BESTAETIGEN = "Ja, beantragen"
    const val ABBRECHEN = "Abbrechen"
    const val EINGEGANGEN = "Dein Antrag ist eingegangen. Der Vorstand meldet sich bei dir."
    const val LIEGT_VOR = "Dein Antrag liegt schon vor. Der Vorstand kümmert sich darum."

    sealed interface Eingabe {
        /** null heisst: keine Nachricht. */
        data class Ok(val nachricht: String?) : Eingabe

        data class Fehler(val text: String) : Eingabe
    }

    /** Leer heisst: keine Nachricht. Zu lang meldet sich vor dem Absenden. */
    fun pruefen(nachricht: String?): Eingabe {
        val text = Profil.trim(nachricht ?: "")
        if (text.length > NACHRICHT_MAX) {
            return Eingabe.Fehler("Die Nachricht ist zu lang (höchstens $NACHRICHT_MAX Zeichen).")
        }
        return Eingabe.Ok(text.ifEmpty { null })
    }

    /** true: neu eingegangen; false: aus den letzten 24 Stunden liegt schon einer vor. */
    fun meldung(neu: Boolean): String = if (neu) EINGEGANGEN else LIEGT_VOR
}
