/*
 * Tab Plätze: Navigationsgraph und Einstieg
 *
 * Ein Ziel: der Belegungsplan (PlaetzeBildschirm). Buchen, Verwalten,
 * Sperren und Umsetzen laufen im Bottom Sheet darueber (Buchungsblatt), wie
 * in der iOS-App (Bildschirme/Plaetze/). Andere Tabs fasst dieser Graph nicht
 * an; Spruenge dorthin gehen ueber LocalZuTab.
 */

package de.tcmuckensturm.app.bildschirme.plaetze

import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.compose.composable
import androidx.navigation.compose.navigation
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
