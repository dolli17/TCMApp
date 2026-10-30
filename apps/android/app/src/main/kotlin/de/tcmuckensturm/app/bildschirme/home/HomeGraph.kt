/*
 * Tab Home: Navigationsgraph und Einstieg
 *
 * Start ist der Home-Bildschirm, dahinter "Neuigkeiten" (alle Nachrichten).
 * Andere Tabs fasst dieser Graph nicht an; Spruenge dorthin (Plaetze, Verein,
 * Konto) gehen ueber LocalZuTab.
 */

package de.tcmuckensturm.app.bildschirme.home

import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.compose.composable
import androidx.navigation.compose.navigation
import de.tcmuckensturm.app.bildschirme.nachrichten.NachrichtenBildschirm
import de.tcmuckensturm.app.bildschirme.verein.LocalZuVerein
import de.tcmuckensturm.app.bildschirme.verein.VereinZiel
import kotlinx.serialization.Serializable

/** Der Graph des Tabs (HauptTab.graph). */
@Serializable
data object HomeGraph

/** Der erste Bildschirm im Tab. */
@Serializable
data object HomeStart

/** Alle Neuigkeiten (app/nachrichten.tsx) */
@Serializable
data object Nachrichten

fun NavGraphBuilder.homeGraph(nav: NavHostController) {
    navigation<HomeGraph>(startDestination = HomeStart) {
        composable<HomeStart> {
            HomeBildschirm(zuNachrichten = { nav.navigate(Nachrichten) { launchSingleTop = true } })
        }
        composable<Nachrichten> {
            val zuVerein = LocalZuVerein.current
            NachrichtenBildschirm(
                zurueck = { nav.popBackStack() },
                zuVeranstaltung = { zuVerein(VereinZiel.Veranstaltung(it)) },
            )
        }
    }
}
