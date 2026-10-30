/*
 * Tab Verwaltung: Navigationsgraph, Einstieg und wer ihn sieht
 *
 * Den Tab gibt es nur mit Platzrechten (`ich().platz_rechte` bzw. `admin`),
 * wie VerwaltungZugang in der iOS-App. Das ist wie im Web nur die
 * Oberflaeche - die RPCs pruefen selbst. Ein Ziel: VerwaltungBildschirm;
 * Sperren und Serien sind Bottom Sheets darueber, keine eigenen Ziele.
 */

package de.tcmuckensturm.app.bildschirme.verwaltung

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.compose.composable
import androidx.navigation.compose.navigation
import de.tcmuckensturm.app.daten.Zugangsdaten
import io.github.jan.supabase.SupabaseClient
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.serialization.Serializable

/** Der Graph des Tabs (HauptTab.graph). */
@Serializable
data object VerwaltungGraph

/** Der erste Bildschirm im Tab. */
@Serializable
data object VerwaltungStart

fun NavGraphBuilder.verwaltungGraph(@Suppress("UNUSED_PARAMETER") nav: NavHostController) {
    navigation<VerwaltungGraph>(startDestination = VerwaltungStart) {
        composable<VerwaltungStart> { VerwaltungBildschirm() }
    }
}

/** Fragt beim Oeffnen der Tabs einmal ich(); ein Fehler zaehlt als "keine Rechte". */
@Composable
fun rememberVerwaltungSichtbar(client: SupabaseClient): Boolean {
    var sichtbar by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(client) {
        sichtbar = VerwaltungLogik.sichtbar(
            try {
                Zugangsdaten(client).ich()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                null
            },
        )
    }
    return sichtbar
}
