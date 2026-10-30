/*
 * Tab Konto: Navigationsgraph und Einstieg
 *
 * Platzhalter aus dem Geruest (A1), schon mit "Abmelden" (Rueckfrage, dann
 * Sitzung.abmelden - die eine Stelle). Die Konto-Spur baut hier die
 * Bildschirme (Vorlage: apps/ios/TCMuckensturm/Bildschirme/Konto/), dazu die
 * Wahl des Erscheinungsbilds (theme/Erscheinungsbild.kt).
 */

package de.tcmuckensturm.app.bildschirme.konto

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.compose.composable
import androidx.navigation.compose.navigation
import de.tcmuckensturm.app.bildschirme.Platzhalter
import de.tcmuckensturm.app.start.LocalSitzung
import de.tcmuckensturm.app.theme.TcmTheme
import kotlinx.coroutines.launch
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

@Composable
fun KontoBildschirm() {
    val sitzung = LocalSitzung.current
    val scope = rememberCoroutineScope()
    var fragen by rememberSaveable { mutableStateOf(false) }

    Platzhalter(titel = "Konto", text = "Hier kommen deine Daten, die Abrechnung und die Einstellungen.") {
        OutlinedButton(onClick = { fragen = true }) { Text("Abmelden", color = TcmTheme.farben.redInk) }
    }

    if (fragen) {
        AlertDialog(
            onDismissRequest = { fragen = false },
            title = { Text("Abmelden?") },
            text = { Text("Du kannst dich jederzeit wieder anmelden.") },
            dismissButton = { TextButton(onClick = { fragen = false }) { Text("Abbrechen") } },
            confirmButton = {
                TextButton(onClick = {
                    fragen = false
                    scope.launch { sitzung.abmelden() }
                }) { Text("Abmelden", color = TcmTheme.farben.redInk) }
            },
        )
    }
}
