/*
 * Tab Home: Navigationsgraph und Einstieg
 *
 * Platzhalter aus dem Geruest (A1). Die Spur fuer diesen Tab baut hier ihre
 * Bildschirme (Vorlage: apps/ios/TCMuckensturm/Bildschirme/Home/) und haengt
 * weitere Ziele in den Graphen. Andere Tabs fasst sie nicht an; Spruenge
 * dorthin gehen ueber LocalZuTab.
 */

package de.tcmuckensturm.app.bildschirme.home

import androidx.compose.runtime.Composable
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.compose.composable
import androidx.navigation.compose.navigation
import de.tcmuckensturm.app.bildschirme.Platzhalter
import kotlinx.serialization.Serializable

/** Der Graph des Tabs (HauptTab.graph). */
@Serializable
data object HomeGraph

/** Der erste Bildschirm im Tab. */
@Serializable
data object HomeStart

fun NavGraphBuilder.homeGraph(@Suppress("UNUSED_PARAMETER") nav: NavHostController) {
    navigation<HomeGraph>(startDestination = HomeStart) {
        composable<HomeStart> { HomeBildschirm() }
    }
}

@Composable
fun HomeBildschirm() {
    Platzhalter(titel = "Home", text = "Hier stehen bald deine nächsten Spiele, offene Spiele und Neuigkeiten.")
}
