package de.tcmuckensturm.app.bildschirme.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.github.takahirom.roborazzi.captureRoboImage
import de.tcmuckensturm.app.bildschirme.nachrichten.GlockeKnopf
import de.tcmuckensturm.app.bildschirme.nachrichten.GlockenBlatt
import de.tcmuckensturm.app.bildschirme.nachrichten.GlockenBlattInhalt
import de.tcmuckensturm.app.bildschirme.nachrichten.NachrichtenInhalt
import de.tcmuckensturm.app.bildschirme.nachrichten.NachrichtenZustand
import de.tcmuckensturm.app.theme.TcmTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Bildschirmfotos von Home, Glocke und Neuigkeiten ohne Geraet und ohne Netz
 * (Robolectric + Roborazzi, Beispieldaten aus `Beispiele`). Home ist so hoch
 * gezeichnet, dass die ganze Seite aufs Bild passt.
 *
 * `./gradlew test` zeichnet nur; die PNGs nach apps/android/docs schreibt
 * `./gradlew :app:recordRoborazziLokalDebug`.
 */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class HomeBildschirmfotoTest {
    @get:Rule val compose = createComposeRule()

    private val ziele = HomeZiele(zuTab = {}, zuGetraenken = {}, zuVeranstaltung = {}, zuNachrichten = {})

    private fun foto(name: String, dunkel: Boolean, inhalt: @Composable () -> Unit) {
        compose.setContent { TcmTheme(dunkel = dunkel) { inhalt() } }
        compose.onRoot().captureRoboImage("../docs/$name.png")
    }

    @Composable
    private fun Home(inhalt: HomeInhalt?, ungelesen: Int = 2, laedt: Boolean = false) = HomeAnsicht(
        zustand = HomeZustand(inhalt = inhalt, laedt = laedt),
        ziele = ziele,
        nachladen = {},
        jetzt = Beispiele.jetzt,
        glocke = { GlockeKnopf(ungelesen) {} },
    )

    @Test
    @Config(qualifiers = "w412dp-h1800dp-xxhdpi")
    fun homeHell() = foto("home-hell", dunkel = false) { Home(Beispiele.voll) }

    @Test
    @Config(qualifiers = "w412dp-h1800dp-xxhdpi")
    fun homeDunkel() = foto("home-dunkel", dunkel = true) { Home(Beispiele.voll) }

    @Test
    @Config(qualifiers = "w412dp-h1300dp-xxhdpi")
    fun homeLeer() = foto("home-leer", dunkel = false) { Home(Beispiele.leer, ungelesen = 0) }

    @Test
    @Config(qualifiers = "w412dp-h1300dp-xxhdpi")
    fun homeFehler() = foto("home-fehler", dunkel = true) { Home(Beispiele.fehler, ungelesen = 12) }

    /** Schrift 200 %: nichts abgeschnitten, Schnellaktionen untereinander (U5). */
    @Test
    @Config(qualifiers = "w412dp-h3600dp-xxhdpi", fontScale = 2f)
    fun homeSchrift200() = foto("home-schrift-200", dunkel = false) { Home(Beispiele.voll) }

    @Test
    @Config(qualifiers = "w412dp-h915dp-xxhdpi")
    fun homeLaedt() = foto("home-laedt", dunkel = false) { Home(null, ungelesen = 0, laedt = true) }

    @Composable
    private fun Neuigkeiten(alleGesehen: Boolean = false) = NachrichtenInhalt(
        zustand = NachrichtenZustand(nachrichten = Beispiele.nachrichten, laedt = false, alleGesehen = alleGesehen),
        zurueck = {},
        nachladen = {},
        alleGelesen = {},
        zuVeranstaltung = {},
        jetzt = Beispiele.jetzt,
    )

    @Test
    @Config(qualifiers = "w412dp-h915dp-xxhdpi")
    fun neuigkeitenHell() = foto("neuigkeiten-hell", dunkel = false) { Neuigkeiten() }

    @Test
    @Config(qualifiers = "w412dp-h915dp-xxhdpi")
    fun neuigkeitenDunkel() = foto("neuigkeiten-dunkel", dunkel = true) { Neuigkeiten() }

    @Test
    @Config(qualifiers = "w412dp-h915dp-xxhdpi")
    fun neuigkeitenLeer() = foto("neuigkeiten-leer", dunkel = false) {
        NachrichtenInhalt(NachrichtenZustand(nachrichten = emptyList(), laedt = false), {}, {}, {}, {}, Beispiele.jetzt)
    }

    /** Das Blatt hinter der Glocke - ohne Bottom Sheet gezeichnet (eigenes Fenster in Robolectric). */
    @Composable
    private fun Blatt() = Box(
        Modifier
            .fillMaxSize()
            .background(TcmTheme.farben.bg)
            .padding(top = 24.dp),
    ) {
        GlockenBlattInhalt(GlockenBlatt(liste = Beispiele.nachrichten), alleGelesen = {}, schliessen = {}, zuVeranstaltung = {}, jetzt = Beispiele.jetzt)
    }

    @Test
    @Config(qualifiers = "w412dp-h915dp-xxhdpi")
    fun glockeHell() = foto("glocke-hell", dunkel = false) { Blatt() }

    @Test
    @Config(qualifiers = "w412dp-h915dp-xxhdpi")
    fun glockeDunkel() = foto("glocke-dunkel", dunkel = true) { Blatt() }
}
