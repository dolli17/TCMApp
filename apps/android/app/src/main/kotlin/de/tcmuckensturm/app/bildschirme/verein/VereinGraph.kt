/*
 * Tab Verein: Navigationsgraph und Einstieg
 *
 * Platzhalter aus dem Geruest (A1). Die Spur fuer diesen Tab baut hier ihre
 * Bildschirme (Vorlage: apps/ios/TCMuckensturm/Bildschirme/Verein/) und haengt
 * weitere Ziele in den Graphen. Andere Tabs fasst sie nicht an; Spruenge
 * dorthin gehen ueber LocalZuTab.
 */

package de.tcmuckensturm.app.bildschirme.verein

import androidx.compose.runtime.Composable
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.compose.composable
import androidx.navigation.compose.navigation
import de.tcmuckensturm.app.bildschirme.Platzhalter
import kotlinx.serialization.Serializable

/** Der Graph des Tabs (HauptTab.graph). */
@Serializable
data object VereinGraph

/** Der erste Bildschirm im Tab. */
@Serializable
data object VereinStart

fun NavGraphBuilder.vereinGraph(@Suppress("UNUSED_PARAMETER") nav: NavHostController) {
    navigation<VereinGraph>(startDestination = VereinStart) {
        composable<VereinStart> { VereinBildschirm() }
    }
}

@Composable
fun VereinBildschirm() {
    Platzhalter(titel = "Verein", text = "Hier kommen Getränke und Veranstaltungen.")
}
