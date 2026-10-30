/*
 * Tab Verein: Navigationsgraph und Einstieg (apps/mobile/app/(tabs)/verein/)
 *
 * Wie Bildschirme/Verein/VereinBildschirm.swift der iOS-App: zwei Reiter,
 * Getraenke und Veranstaltungen, unter dem grossen Kopf mit Segmenten;
 * darueber gestapelt eine Veranstaltung im Detail (VeranstaltungZiel), mit
 * Zurueck-Geste zur Liste. Der Tab oeffnet auf dem zuletzt gewaehlten Reiter
 * (VereinZustand), beim ersten Mal auf den Getraenken.
 *
 * Andere Tabs fasst diese Datei nicht an; Spruenge dorthin gehen ueber
 * LocalZuTab, Spruenge hierher ueber LocalZuVerein (VereinZustand.kt).
 */

package de.tcmuckensturm.app.bildschirme.verein

import androidx.compose.runtime.Composable
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.compose.composable
import androidx.navigation.compose.navigation
import androidx.navigation.toRoute
import de.tcmuckensturm.app.bildschirme.nachrichten.Glocke
import kotlinx.serialization.Serializable

/** Der Graph des Tabs (HauptTab.graph). */
@Serializable
data object VereinGraph

/** Der erste Bildschirm im Tab: die beiden Reiter. */
@Serializable
data object VereinStart

/** Eine Veranstaltung im Detail. */
@Serializable
data class VeranstaltungZiel(val id: String)

fun NavGraphBuilder.vereinGraph(nav: NavHostController) {
    navigation<VereinGraph>(startDestination = VereinStart) {
        composable<VereinStart> {
            VereinBildschirm(oeffne = { id -> nav.navigate(VeranstaltungZiel(id)) })
        }
        composable<VeranstaltungZiel> { eintrag ->
            VeranstaltungBildschirm(id = eintrag.toRoute<VeranstaltungZiel>().id, zurueck = { nav.popBackStack() })
        }
    }
}

@Composable
fun VereinBildschirm(oeffne: (String) -> Unit) {
    val zustand = LocalVereinZustand.current
    val zuVerein = LocalZuVerein.current
    val kopf: @Composable () -> Unit = {
        VereinKopf(zustand.reiter, zustand.name, zustand::wechsle) {
            Glocke()
        }
    }
    when (zustand.reiter) {
        VereinReiter.GETRAENKE -> GetraenkeAnsicht(kopf)
        VereinReiter.VERANSTALTUNGEN -> VeranstaltungenAnsicht(kopf, oeffne)
    }
}
