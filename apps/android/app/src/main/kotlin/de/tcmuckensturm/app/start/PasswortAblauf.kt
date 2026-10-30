/*
 * Passwort vergessen und setzen: Regeln, Texte und der Ablauf beim Oeffnen
 * eines Links
 *
 * Texte wie apps/mobile/app/passwort-vergessen.tsx und passwort-setzen.tsx,
 * Ablauf wie App/PasswortAblauf.swift der iOS-App. Als reine Funktionen,
 * damit sie ohne Netz testbar sind; das Netz spricht Sitzung.
 *
 * Sicherheitsvorgabe (Security-Audit, Login-CSRF): Ist beim Oeffnen eines
 * Links schon ein anderes Konto angemeldet, meldet die App nicht still ab und
 * loest ein. Sie fragt erst nach - sonst koennte jemand einem anderen einen
 * Link zum eigenen Konto unterschieben, und der gaebe danach dort seine Daten
 * ein.
 */

package de.tcmuckensturm.app.start

import de.tcmuckensturm.kern.Anmeldefehler
import de.tcmuckensturm.kern.AuthFehlerForm
import kotlin.time.Duration
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.withTimeout

object PasswortTexte {
    const val VERGESSEN_TITEL = "Passwort vergessen"
    const val VERGESSEN_UNTERZEILE = "Wir schicken dir einen Link zum Neusetzen."

    /** Dieselbe Meldung, ob es die Adresse gibt oder nicht (passwortLinkAnfordern in daten.ts). */
    const val UNTERWEGS = "Wenn es zu dieser Adresse ein Konto gibt, ist die E-Mail unterwegs."

    /** Die Mail landet bei manchen Anbietern im Spam (U31). */
    const val SPAM = "Schau auch im Spam-Ordner nach."

    const val SETZEN_TITEL = "Passwort festlegen"
    const val SETZEN_UNTERZEILE = "Mindestens acht Zeichen."
    const val ABGELAUFEN = "Dieser Link ist abgelaufen oder wurde schon benutzt."
    const val OHNE_TOKEN =
        "Dieser Link ist unvollständig. Öffne ihn bitte direkt aus der E-Mail oder fordere einen neuen an."
    const val KEIN_NETZ = "Keine Verbindung zum Server. Prüfe dein Internet und öffne den Link noch einmal."
    const val ZU_KURZ = "Das Passwort braucht mindestens acht Zeichen."
    const val UNGLEICH = "Die beiden Eingaben stimmen nicht überein."

    const val RUECKFRAGE_TITEL = "Anderes Konto"

    fun rueckfrage(email: String?): String {
        val wer = email?.let { "als $it" } ?: "mit einem anderen Konto"
        return "Du bist $wer angemeldet. Mit diesem Link meldest du dich ab und setzt das Passwort für ein anderes Konto. Fortfahren?"
    }
}

object PasswortRegeln {
    /** Wie Expo-App und Web (dort mit minLength=8). */
    const val MINDESTLAENGE = 8

    /** null, wenn das Passwort so gespeichert werden darf; sonst der Hinweis. */
    fun pruefen(passwort: String, wiederholung: String): String? {
        // String.length zaehlt UTF-16-Einheiten wie in JavaScript - dieselben Passwoerter gehen durch.
        if (passwort.length < MINDESTLAENGE) return PasswortTexte.ZU_KURZ
        if (passwort != wiederholung) return PasswortTexte.UNGLEICH
        return null
    }
}

/** Wer gerade angemeldet ist - so viel braucht die Rueckfrage. */
data class AngemeldetesKonto(
    /** Kleingeschrieben, wie im Token (sub). */
    val nutzerId: String,
    val email: String?,
)

object PasswortAblauf {
    sealed interface Schritt {
        /** Den Link einloesen; mit `abmelden` vorher die bisherige Sitzung beenden. */
        data class Einloesen(val abmelden: Boolean) : Schritt

        /** Erst fragen: ein anderes Konto ist angemeldet. */
        data class Rueckfrage(val email: String?) : Schritt

        /** Ohne Link, aber angemeldet: das eigene Passwort aendern. */
        data object EigenesKonto : Schritt

        data class Fehler(val text: String) : Schritt
    }

    /**
     * Was beim Oeffnen eines Links geschieht.
     *
     * Ein token_hash verraet nicht, zu welchem Konto er gehoert. Ist jemand
     * angemeldet, fragt die App deshalb immer. Beim Fragment steht die
     * Nutzer-ID im Token: gehoert es zum angemeldeten Konto, gibt es nichts zu
     * fragen und nichts abzumelden.
     */
    fun beimOeffnen(link: LinkInhalt, angemeldet: AngemeldetesKonto?): Schritt = when (link) {
        LinkInhalt.Ungueltig -> Schritt.Fehler(PasswortTexte.ABGELAUFEN)
        LinkInhalt.Ohne -> if (angemeldet == null) Schritt.Fehler(PasswortTexte.OHNE_TOKEN) else Schritt.EigenesKonto
        is LinkInhalt.Token ->
            if (angemeldet == null) Schritt.Einloesen(abmelden = false) else Schritt.Rueckfrage(angemeldet.email)
        is LinkInhalt.Fragment -> when {
            angemeldet == null -> Schritt.Einloesen(abmelden = false)
            Passwortlink.nutzerIdAusToken(link.accessToken) == angemeldet.nutzerId -> Schritt.Einloesen(abmelden = false)
            else -> Schritt.Rueckfrage(angemeldet.email)
        }
    }

    /** Nach "Fortfahren" in der Rueckfrage. */
    val nachBestaetigung: Schritt = Schritt.Einloesen(abmelden = true)

    /**
     * Text, wenn das Einloesen scheitert. Ohne Netz (oder nach der Frist) soll
     * niemand lesen, der Link sei abgelaufen - er gilt ja noch.
     */
    fun einloeseFehlerText(fehler: AuthFehlerForm?, zeitUeberschritten: Boolean = false): String {
        if (zeitUeberschritten) return PasswortTexte.KEIN_NETZ
        if (fehler == null) return PasswortTexte.ABGELAUFEN
        val stoerung = Anmeldefehler.stoerungText(fehler) ?: return PasswortTexte.ABGELAUFEN
        return if (stoerung == Anmeldefehler.VERBINDUNG) PasswortTexte.KEIN_NETZ else stoerung
    }
}

/** Die Frist ist abgelaufen, bevor das Netz geantwortet hat. */
class Zeitueberschreitung : Exception("Zeitüberschreitung")

/** Bricht ab, wenn das Netz nicht antwortet - sonst dreht der Ladekreis ewig (wie mitFrist in passwortlink.ts). */
suspend fun <T> mitFrist(frist: Duration, arbeit: suspend () -> T): T =
    try {
        withTimeout(frist) { arbeit() }
    } catch (e: TimeoutCancellationException) {
        throw Zeitueberschreitung()
    }
