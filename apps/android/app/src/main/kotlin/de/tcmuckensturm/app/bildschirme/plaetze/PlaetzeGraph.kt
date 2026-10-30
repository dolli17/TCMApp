/*
 * Tab Plätze: Navigationsgraph und Einstieg
 *
 * Platzhalter aus dem Geruest (A1). Die Spur fuer diesen Tab baut hier ihre
 * Bildschirme (Vorlage: apps/ios/TCMuckensturm/Bildschirme/Plaetze/) und haengt
 * weitere Ziele in den Graphen. Andere Tabs fasst sie nicht an; Spruenge
 * dorthin gehen ueber LocalZuTab.
 */

package de.tcmuckensturm.app.bildschirme.plaetze

import androidx.compose.runtime.Composable
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.compose.composable
import androidx.navigation.compose.navigation
import de.tcmuckensturm.app.bildschirme.Platzhalter
import kotlinx.serialization.Serializable

/** Der Graph des Tabs (HauptTab.graph). */
@Serializable
data object PlaetzeGraph

/** Der erste Bildschirm im Tab. */
@Serializable
data object PlaetzeStart

fun NavGraphBuilder.plaetzeGraph(@Suppress("UNUSED_PARAMETER") nav: NavHostController) {
    navigation<PlaetzeGraph>(startDestination = PlaetzeStart) {
        composable<PlaetzeStart> { PlaetzeBildschirm() }
    }
}

@Composable
fun PlaetzeBildschirm() {
    Platzhalter(titel = "Plätze", text = "Hier kommt der Belegungsplan mit Buchen.")
}
