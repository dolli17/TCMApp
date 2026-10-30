/*
 * Wohin ein Tippen auf eine Push-Nachricht fuehrt
 *
 * Wie App/PushZiel.swift der iOS-App und usePushZiel in
 * apps/mobile/src/lib/push.ts. Die Edge Function notification-pushes legt bei
 * FCM in `data` die Texte `ziel` (Pfad wie in der Expo-App, aus pushZiel in
 * packages/core/src/pushvorlage.ts), `kind` und `event_id` ab - die letzten
 * beiden nur, wenn alle Posten dieselben haben (Funktion daten in index.ts).
 * Nativ wird daraus ein Tab oder Bildschirm.
 *
 * Als reine Funktion, damit sie ohne Geraet testbar ist. Nur Pfade der App
 * selbst zaehlen (sichererWeiterPfad), keine fremden Adressen.
 */

package de.tcmuckensturm.app.push

import android.os.Bundle
import de.tcmuckensturm.app.navigation.HauptTab
import de.tcmuckensturm.kern.Weiterleitung

sealed interface PushZiel {
    /** Neuigkeiten (/nachrichten) */
    data object Nachrichten : PushZiel

    /** Eine Veranstaltung (/verein/veranstaltung/<id>): ihr Detail im Tab Verein */
    data class Veranstaltung(val id: String) : PushZiel

    /** Ein anderer Pfad der App, der zu einem Tab gehoert */
    data class Tab(val tab: HauptTab) : PushZiel

    companion object {
        /** Die Schluessel aus `data`, die die App liest. */
        val schluessel = listOf("ziel", "kind", "event_id")

        /**
         * @param daten `data` der Nachricht, nur die Texte.
         * @return null, wenn die Nachricht kein Ziel nennt - dann oeffnet sich die App einfach.
         */
        fun aus(daten: Map<String, String>): PushZiel? {
            daten["ziel"]?.let(::ausPfad)?.let { return it }
            daten["event_id"]?.takeIf(::istKennung)?.let { return Veranstaltung(it) }
            val kind = daten["kind"]
            if (kind.isNullOrEmpty()) return null
            // Ohne Pfad: wie pushZiel - eine Veranstaltung ohne Kennung und alles andere stehen in den Nachrichten.
            return Nachrichten
        }

        /** Der Pfad aus `ziel`, wie expo-router ihn oeffnen wuerde. */
        fun ausPfad(pfad: String): PushZiel? {
            if (!istSichererPfad(pfad)) return null
            val ohneAbfrage = pfad.substringBefore('?').substringBefore('#')
            val teile = ohneAbfrage.split("/").filter { it.isNotEmpty() }
            return when (teile.firstOrNull()) {
                null, "home" -> Tab(HauptTab.HOME)
                "nachrichten" -> Nachrichten
                "plaetze" -> Tab(HauptTab.PLAETZE)
                "konto" -> Tab(HauptTab.KONTO)
                "verein" ->
                    if (teile.size == 3 && teile[1] == "veranstaltung" && istKennung(teile[2])) {
                        Veranstaltung(teile[2])
                    } else {
                        Tab(HauptTab.VEREIN)
                    }
                else -> null
            }
        }

        /** sichererWeiterPfad aus dem Kern: faellt er auf den Rueckfall, war der Pfad nicht sicher. */
        fun istSichererPfad(wert: String): Boolean =
            Weiterleitung.sichererWeiterPfad(wert, fallback = "") == wert && wert.isNotEmpty()

        /** Kennungen sind UUIDs; mehr als Buchstaben, Ziffern und Bindestrich laesst die App nicht durch. */
        fun istKennung(id: String): Boolean =
            id.isNotEmpty() && id.length <= 64 && id.all { it in 'a'..'z' || it in 'A'..'Z' || it in '0'..'9' || it == '-' }

        /** Aus den Extras eines Intents die Texte von `data` (FCM legt sie dort ab, wenn das System die Nachricht zeigt). */
        fun texte(extras: Bundle?): Map<String, String> {
            if (extras == null) return emptyMap()
            return buildMap {
                for (s in schluessel) extras.getString(s)?.let { put(s, it) }
            }
        }
    }
}
