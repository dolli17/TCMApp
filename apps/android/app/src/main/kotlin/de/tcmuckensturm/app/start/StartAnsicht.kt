/*
 * Zeigt den Bildschirm, den die Weiche gewaehlt hat
 *
 * Wie StartAnsicht in App/TCMuckensturmApp.swift der iOS-App. Ein offener
 * Link aus der E-Mail geht vor, bis das Passwort steht. Die Sitzung steht den
 * Bildschirmen ueber LocalSitzung zur Verfuegung.
 */

package de.tcmuckensturm.app.start

import androidx.compose.animation.Crossfade
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import de.tcmuckensturm.app.bildschirme.anmeldung.AnmeldenBildschirm
import de.tcmuckensturm.app.bildschirme.anmeldung.PasswortSetzenBildschirm
import de.tcmuckensturm.app.bildschirme.keinzugang.KeinZugangBildschirm
import de.tcmuckensturm.app.bildschirme.onboarding.OnboardingBildschirm
import de.tcmuckensturm.app.navigation.HauptTabs
import de.tcmuckensturm.app.theme.Erscheinungsbild
import de.tcmuckensturm.app.theme.ErscheinungsbildSpeicher
import de.tcmuckensturm.app.theme.TcmSchrift
import de.tcmuckensturm.app.theme.TcmTheme
import de.tcmuckensturm.app.ui.tokens.Abstand
import de.tcmuckensturm.app.ui.tokens.Schrift

/** Die Sitzung fuer alle Bildschirme unter der Weiche. */
val LocalSitzung = staticCompositionLocalOf<Sitzung> { error("Keine Sitzung - nur unter StartAnsicht verfuegbar") }

@Composable
fun StartAnsicht(sitzung: Sitzung) {
    val context = LocalContext.current
    val speicher = remember { ErscheinungsbildSpeicher.fuer(context) }
    val erscheinungsbild by speicher.wahl.collectAsStateWithLifecycle(Erscheinungsbild.SYSTEM)
    val ziel by sitzung.ziel.collectAsStateWithLifecycle()
    val passwort by sitzung.passwort.collectAsState()

    CompositionLocalProvider(LocalSitzung provides sitzung) {
        TcmTheme(dunkel = erscheinungsbild.dunkel(isSystemInDarkTheme())) {
            val offen = passwort
            if (offen != null) {
                PasswortSetzenBildschirm(offen)
            } else {
                Crossfade(targetState = ziel, label = "Weiche") { aktuell ->
                    when (aktuell) {
                        // Derselbe Grund wie beim Start (Theme.TCM), damit nichts aufblitzt.
                        StartZiel.Laden -> Box(
                            Modifier.fillMaxSize().background(TcmTheme.farben.brand),
                            contentAlignment = Alignment.Center,
                        ) {
                            CircularProgressIndicator(color = TcmTheme.farben.gold)
                        }
                        StartZiel.Anmelden -> AnmeldenBildschirm()
                        is StartZiel.KeinZugang -> KeinZugangBildschirm(aktuell.grund)
                        StartZiel.Onboarding -> OnboardingBildschirm()
                        StartZiel.Tabs -> HauptTabs()
                    }
                }
            }
        }
    }
}

/** Statt eines Absturzes: welcher Wert fehlt und wie man ihn setzt. */
@Composable
fun KonfigurationFehlt(fehler: Throwable?) {
    val beschreibung = when (fehler) {
        is Umgebung.Fehler.Fehlt -> "In der Build-Konfiguration fehlt ${fehler.schluessel}."
        is Umgebung.Fehler.Ungueltig -> "${fehler.schluessel} in der Build-Konfiguration ist keine gültige Adresse."
        else -> "Die Umgebung ließ sich nicht lesen."
    }
    Column(
        Modifier
            .fillMaxSize()
            .background(TcmTheme.farben.bg)
            .safeDrawingPadding()
            .padding(Abstand.rand),
        verticalArrangement = Arrangement.spacedBy(Abstand.m, Alignment.CenterVertically),
    ) {
        Text("Konfiguration fehlt", style = TcmSchrift.text(Schrift.gewichtExtrafett, 28.sp), color = TcmTheme.farben.ink)
        Text(beschreibung, style = TcmSchrift.text(Schrift.gewichtNormal, 16.sp), color = TcmTheme.farben.ink)
        Text(
            "Für „lokal“: apps/android/lokal.properties aus lokal.properties.example anlegen und neu bauen (siehe apps/android/README.md).",
            style = TcmSchrift.text(Schrift.gewichtNormal, 14.sp),
            color = TcmTheme.farben.ink2,
        )
    }
}
