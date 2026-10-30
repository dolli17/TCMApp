/*
 * Das Ziel einer angetippten Push-Nachricht oeffnen
 *
 * Wie App/PushNavigation.swift der iOS-App und usePushZiel in
 * apps/mobile/src/lib/push.ts. Das Ziel wartet in der PushZentrale, bis die
 * Tabs stehen - auch beim Kaltstart, wenn das Tippen die App erst geoeffnet
 * hat und die Weiche noch laedt. Jedes Ziel wird nur einmal geoeffnet.
 *
 * Neuigkeiten oeffnen im Tab Home den Bildschirm "Neuigkeiten" (statt eines
 * Blatts wie in iOS - so fuehrt die Zurueck-Geste dorthin zurueck, wo man war).
 * Eine Veranstaltung oeffnet im Tab Verein ihr Detail (LocalZuVerein).
 */

package de.tcmuckensturm.app.push

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import de.tcmuckensturm.app.bildschirme.home.Nachrichten
import de.tcmuckensturm.app.bildschirme.verein.LocalZuVerein
import de.tcmuckensturm.app.bildschirme.verein.VereinZiel
import de.tcmuckensturm.app.navigation.HauptTab

/** In HauptTabs, nach dem NavHost und unter VereinTab. */
@Composable
fun PushZieleOeffnen(zentrale: PushZentrale, nav: NavHostController, zuTab: (HauptTab) -> Unit) {
    val zuVerein = LocalZuVerein.current
    val ziel by zentrale.offenesZiel.collectAsStateWithLifecycle()
    LaunchedEffect(ziel) {
        val z = ziel ?: return@LaunchedEffect
        zentrale.zielGeoeffnet(z)
        when (z) {
            PushZiel.Nachrichten -> {
                zuTab(HauptTab.HOME)
                nav.navigate(Nachrichten) { launchSingleTop = true }
            }
            is PushZiel.Veranstaltung -> zuVerein(VereinZiel.Veranstaltung(z.id))
            is PushZiel.Tab -> zuTab(z.tab)
        }
    }
}
