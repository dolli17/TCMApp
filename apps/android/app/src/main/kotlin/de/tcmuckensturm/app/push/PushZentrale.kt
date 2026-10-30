/*
 * Push auf Geraeteseite: Marke, Anmeldung in der Datenbank und das Tippen
 * auf eine Nachricht
 *
 * Wie App/PushAnmeldung.swift der iOS-App und apps/mobile/src/lib/push.ts.
 * Gefragt wird erst, wenn jemand den Schalter "Mitteilungen aufs Handy"
 * umlegt (Konto oder Onboarding, PushSchalter) - ein Erlaubnisdialog vor dem
 * Login erklaert sich nicht, und ohne Sitzung weist die RPC ohnehin ab. Eine
 * eigene Einwilligung in der Datenbank gibt es nicht: die Zustimmung ist die
 * Erlaubnis des Geraets plus die angemeldete Marke.
 *
 * Die Funktionen geben einen sprechenden Grund zurueck, statt zu werfen:
 * ein Fehler hier darf nichts anderes aufhalten.
 *
 * Die FCM-Marke kann sich aendern (onNewToken, Wiederherstellung). Die
 * zuletzt angemeldete steht deshalb in den Einstellungen; zum Abmelden und
 * Pruefen nimmt die App diese, und beim Start der Tabs frischt `auffrischen`
 * sie auf. Ohne Firebase-Werte im Build (`quelle` null) bleibt Push aus.
 */

package de.tcmuckensturm.app.push

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import de.tcmuckensturm.app.daten.Ergebnis
import de.tcmuckensturm.app.daten.Pushkonto
import kotlin.coroutines.cancellation.CancellationException
import kotlin.time.Duration.Companion.seconds
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeoutOrNull

/** Woher die Marke kommt - im Betrieb Firebase Messaging (FirebaseMarken), im Test ein Ersatz. */
interface Markenquelle {
    suspend fun marke(): String?

    /** Verwirft die Marke beim Dienst; die naechste ist eine neue. */
    suspend fun verwerfen()
}

class PushZentrale(
    private val speicher: DataStore<Preferences>,
    /** null: Firebase ist in diesem Build nicht eingerichtet. */
    private val quelle: Markenquelle?,
    /** Darf die App Mitteilungen zeigen (Erlaubnis, nicht abgeschaltet)? */
    private val erlaubt: () -> Boolean,
    private val geraet: String?,
) {
    private val schluessel = stringPreferencesKey(MARKE_SCHLUESSEL)

    /** Gibt es Push in diesem Build ueberhaupt? */
    val verfuegbar: Boolean get() = quelle != null

    /** Das Ziel der zuletzt angetippten Nachricht, bis die Tabs es oeffnen. */
    private val _offenesZiel = MutableStateFlow<PushZiel?>(null)
    val offenesZiel: StateFlow<PushZiel?> = _offenesZiel.asStateFlow()

    private suspend fun gespeicherteMarke(): String? = speicher.data.first()[schluessel]

    private suspend fun merken(marke: String?) {
        speicher.edit { if (marke == null) it.remove(schluessel) else it[schluessel] = marke }
    }

    private suspend fun neueMarkeHolen(q: Markenquelle): String? = try {
        withTimeoutOrNull(FRIST) { q.marke() }?.takeIf { it.isNotBlank() }
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        null
    }

    // ---- An- und Abmelden ---------------------------------------------------

    /** Marke besorgen und in der Datenbank anmelden. Die Erlaubnis holt vorher der PushSchalter. */
    suspend fun anmelden(konto: Pushkonto): Ergebnis {
        val q = quelle ?: return Ergebnis.fehler(NICHT_EINGERICHTET)
        if (!erlaubt()) return Ergebnis.fehler(OHNE_ERLAUBNIS)
        val marke = neueMarkeHolen(q) ?: return Ergebnis.fehler("Das Gerät hat keine Kennung geliefert.")
        val r = konto.anmelden(marke, geraet)
        if (r.ok) merken(marke)
        return r
    }

    /**
     * Vor dem Abmelden aufzurufen (Sitzung.abmelden). Bleibt die Marke stehen,
     * bekommt das Geraet weiter die Nachrichten des Vorbesitzers. Die Marke
     * wird auch bei FCM verworfen: kennt die Datenbank sie noch (kein Netz),
     * meldet FCM sie beim naechsten Versand als tot, und die Function legt sie still.
     */
    suspend fun abmelden(konto: Pushkonto): Ergebnis {
        val marke = gespeicherteMarke() ?: return Ergebnis.erfolg("")
        val r = konto.abmelden(marke)
        merken(null)
        try {
            withTimeoutOrNull(FRIST) { quelle?.verwerfen() }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // Ohne Netz bleibt sie bei FCM stehen; die Datenbank kennt sie dann schon nicht mehr.
        }
        return r
    }

    /** Ist auf diesem Geraet gerade ein Empfang angemeldet - und erlaubt das Geraet ihn noch? */
    suspend fun istAngemeldet(konto: Pushkonto): Boolean {
        if (quelle == null) return false
        val marke = gespeicherteMarke() ?: return false
        if (!erlaubt()) return false
        return konto.aktiv(marke)
    }

    /** War Push an und hat FCM inzwischen eine andere Marke vergeben, wird die neue angemeldet. */
    suspend fun auffrischen(konto: Pushkonto) {
        val q = quelle ?: return
        if (gespeicherteMarke() == null || !erlaubt()) return
        neueMarkeHolen(q)?.let { neueMarke(it, konto) }
    }

    /** Aus onNewToken (PushDienst) und `auffrischen`: nur wenn Push an war und die Marke wirklich neu ist. */
    suspend fun neueMarke(neu: String, konto: Pushkonto) {
        val alt = gespeicherteMarke() ?: return
        if (neu == alt) return
        if (konto.anmelden(neu, geraet).ok) {
            merken(neu)
            konto.abmelden(alt)
        }
    }

    // ---- Tippen auf eine Nachricht ------------------------------------------

    /** Aus HauptActivity: `data` der angetippten Nachricht. */
    fun geoeffnet(daten: Map<String, String>) {
        _offenesZiel.value = PushZiel.aus(daten) ?: return
    }

    /** Die Tabs haben das Ziel geoeffnet; jedes nur einmal. */
    fun zielGeoeffnet(ziel: PushZiel) {
        _offenesZiel.compareAndSet(ziel, null)
    }

    companion object {
        /** Laenger wartet niemand auf die Marke von FCM. */
        val FRIST = 15.seconds
        const val MARKE_SCHLUESSEL = "tcm-push-marke"

        const val OHNE_ERLAUBNIS = "Ohne Erlaubnis des Geräts geht es nicht."
        const val NICHT_EINGERICHTET = "In dieser Version der App sind Mitteilungen noch nicht eingerichtet."
    }
}
