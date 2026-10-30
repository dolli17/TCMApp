/*
 * Tab Konto: Navigationsgraph und Einstieg
 *
 * Ein Ziel: die Seite KontoBildschirm. Die Formulare (Meine Daten,
 * Notfallkontakt, Einwilligungen, Mandat, Passwort, Kuendigung) sind Bottom
 * Sheets darueber, keine eigenen Ziele - wie die Blaetter in iOS und Expo.
 */

package de.tcmuckensturm.app.bildschirme.konto

import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.compose.composable
import androidx.navigation.compose.navigation
import kotlinx.serialization.Serializable

/** Der Graph des Tabs (HauptTab.graph). */
@Serializable
data object KontoGraph

/** Der erste Bildschirm im Tab. */
@Serializable
data object KontoStart

fun NavGraphBuilder.kontoGraph(@Suppress("UNUSED_PARAMETER") nav: NavHostController) {
    navigation<KontoGraph>(startDestination = KontoStart) {
        composable<KontoStart> { KontoBildschirm() }
    }
}
