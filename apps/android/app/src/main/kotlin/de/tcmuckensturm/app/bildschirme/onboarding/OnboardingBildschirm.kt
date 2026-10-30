/*
 * Onboarding (Platzhalter aus dem Geruest, A1)
 *
 * Die Weiche schickt hierher, wenn mein_zugang() onboarding_offen meldet.
 * Die Onboarding-Spur baut hier den Assistenten
 * (Vorlage: apps/ios/TCMuckensturm/Bildschirme/Onboarding/); fertig ruft er
 * Sitzung.onboardingVerlassen(). Bis dahin bleibt nur Abmelden.
 */

package de.tcmuckensturm.app.bildschirme.onboarding

import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import de.tcmuckensturm.app.bildschirme.Platzhalter
import de.tcmuckensturm.app.start.LocalSitzung
import kotlinx.coroutines.launch

@Composable
fun OnboardingBildschirm() {
    val sitzung = LocalSitzung.current
    val scope = rememberCoroutineScope()
    Platzhalter(
        titel = "Willkommen im Verein",
        text = "Bevor es losgeht, brauchen wir noch ein paar Angaben. Das geht bald direkt hier in der App.",
    ) {
        OutlinedButton(onClick = { scope.launch { sitzung.abmelden() } }) { Text("Abmelden") }
    }
}
