/*
 * Tab Konto: Navigationsgraph und Einstieg
 *
 * Zwei Ziele: die Seite KontoBildschirm und darunter Mannschaft
 * (MannschaftBildschirm). Die Formulare (Meine Daten,
 * Notfallkontakt, Einwilligungen, Mandat, Passwort, Kuendigung) sind Bottom
 * Sheets darueber, keine eigenen Ziele - wie die Blaetter in iOS und Expo.
 */

package de.tcmuckensturm.app.bildschirme.konto

import androidx.compose.runtime.staticCompositionLocalOf
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

/** Konto -> Mannschaft: Kader, Einladungen, MF-Funktionen. */
@Serializable
data object KontoMannschaft

/**
 * Oeffnet von ueberall den Bildschirm Mannschaft (Tab Konto) - fuer die
 * Glocke und die Neuigkeiten; HauptTabs stellt es bereit. null in Tests.
 */
val LocalZuMannschaft = staticCompositionLocalOf<(() -> Unit)?> { null }

fun NavGraphBuilder.kontoGraph(nav: NavHostController) {
    navigation<KontoGraph>(startDestination = KontoStart) {
        composable<KontoStart> {
            KontoBildschirm(zuMannschaft = { nav.navigate(KontoMannschaft) { launchSingleTop = true } })
        }
        composable<KontoMannschaft> { MannschaftBildschirm(zurueck = { nav.popBackStack() }) }
    }
}
