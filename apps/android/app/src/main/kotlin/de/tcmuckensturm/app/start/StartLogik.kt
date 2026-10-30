/*
 * Die Weiche
 *
 * Entspricht apps/mobile/app/index.tsx und App/StartLogik.swift der iOS-App:
 * ohne Sitzung zur Anmeldung; mit Sitzung entscheidet public.mein_zugang().
 * Hat das Konto keinen Zugang mehr (ausgetreten, archiviert, gesperrt), geht
 * es auf "Kein Zugang" statt auf leere Seiten (B22); ist das Onboarding offen,
 * aufs Onboarding; sonst in die Tabs. Als reine Funktion, damit sie ohne Netz
 * testbar ist.
 */

package de.tcmuckensturm.app.start

import de.tcmuckensturm.app.daten.Zugang
import de.tcmuckensturm.kern.ZugangsGrund

sealed interface StartZiel {
    /** Noch nicht entschieden - Ladekreis. */
    data object Laden : StartZiel
    data object Anmelden : StartZiel
    data class KeinZugang(val grund: ZugangsGrund) : StartZiel
    data object Onboarding : StartZiel
    data object Tabs : StartZiel
}

object StartLogik {
    /**
     * @param zugang die Zeile aus mein_zugang(); null, wenn das Lesen ausfiel
     *   oder keine Zeile kam. Dann geht es in die Tabs wie in der Expo-App:
     *   die Datenbank weist ein offenes Konto ohnehin selbst ab.
     */
    fun ziel(angemeldet: Boolean, zugang: Zugang?): StartZiel {
        if (!angemeldet) return StartZiel.Anmelden
        if (zugang == null) return StartZiel.Tabs
        if (!zugang.zugang) return StartZiel.KeinZugang(ZugangsGrund.aus(zugang.grund))
        return if (zugang.onboardingOffen) StartZiel.Onboarding else StartZiel.Tabs
    }

    /**
     * Wohin nach dem Abmelden. "Kein Zugang" meldet selbst ab und bleibt
     * stehen, bis man von dort zur Anmeldung geht - sonst verschwaende der
     * Hinweis sofort wieder.
     */
    fun nachAbmelden(aktuell: StartZiel): StartZiel =
        if (aktuell is StartZiel.KeinZugang) aktuell else StartZiel.Anmelden
}
