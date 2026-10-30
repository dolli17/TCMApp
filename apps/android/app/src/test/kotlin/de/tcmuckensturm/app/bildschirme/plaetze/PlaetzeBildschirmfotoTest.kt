package de.tcmuckensturm.app.bildschirme.plaetze

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.github.takahirom.roborazzi.captureRoboImage
import de.tcmuckensturm.app.bildschirme.nachrichten.GlockeKnopf
import de.tcmuckensturm.app.theme.TcmTheme
import de.tcmuckensturm.app.ui.tokens.Radius
import kotlinx.coroutines.runBlocking
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Bildschirmfotos des Tabs Plaetze ohne Geraet und ohne Netz (Robolectric +
 * Roborazzi, Beispieldaten aus PlatzAttrappe), hell und dunkel.
 *
 * `./gradlew test` zeichnet nur; die PNGs nach apps/android/docs schreibt
 * `./gradlew :app:recordRoborazziLokalDebug`. Das Blatt erscheint ohne
 * ModalBottomSheet (eigenes Fenster), als Flaeche mit runden Ecken oben.
 */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w412dp-h915dp-xxhdpi")
class PlaetzeBildschirmfotoTest {
    @get:Rule val compose = createComposeRule()

    private fun modell(ansicht: Ansicht, platzrechte: Boolean = false) = PlaetzeModell(
        quelle = PlatzAttrappe(platzrechte = platzrechte),
        uhr = { PlatzAttrappe.JETZT },
        live = false,
        ansichtAnfang = ansicht,
    ).also { runBlocking { it.laden() } }

    private fun foto(name: String, dunkel: Boolean, inhalt: @Composable () -> Unit) {
        compose.setContent { TcmTheme(dunkel = dunkel) { inhalt() } }
        compose.waitForIdle()
        compose.onRoot().captureRoboImage("../docs/$name.png")
    }

    /** Das Blatt, wie es ueber dem Plan liegt. */
    @Composable
    private fun Blatt(m: PlaetzeModell, fenster: Fenster) {
        val f = TcmTheme.farben
        Box(Modifier.fillMaxSize().background(f.ink.copy(alpha = 0.32f)).background(f.bg.copy(alpha = 0.5f))) {
            Column(
                Modifier
                    .padding(top = 24.dp)
                    .fillMaxSize()
                    .clip(RoundedCornerShape(topStart = Radius.blatt, topEnd = Radius.blatt))
                    .background(f.surf),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(Modifier.padding(vertical = 14.dp).size(32.dp, 4.dp).background(f.line2, RoundedCornerShape(2.dp)))
                Box(Modifier.fillMaxWidth()) { BuchungsblattInhalt(m, fenster) {} }
            }
        }
    }

    // ---- Plan ---------------------------------------------------------------------------------

    private fun freieZeiten(name: String, dunkel: Boolean) {
        val m = modell(Ansicht.FREIE_ZEITEN)
        compose.setContent { TcmTheme(dunkel = dunkel) { PlaetzeInhalt(m, glocke = { GlockeKnopf(2) {} }) } }
        // Die Zeile um 18:00 aufklappen: freie Plaetze und das Spiel, das Mitspieler sucht.
        compose.onNode(hasContentDescription("18:00 Uhr", substring = true)).performClick()
        compose.waitForIdle()
        compose.onRoot().captureRoboImage("../docs/$name.png")
    }

    @Test
    fun freieZeitenHell() = freieZeiten("plaetze-freie-zeiten-hell", dunkel = false)

    @Test
    fun freieZeitenDunkel() = freieZeiten("plaetze-freie-zeiten-dunkel", dunkel = true)

    private fun raster(dunkel: Boolean): PlaetzeModell = modell(Ansicht.UEBERSICHT).also {
        it.auswahl = Auswahl("p2", 17 * 60 + 30, 21 * 60)
    }

    /** Schrift 200 %: Kopf, Tagwahl und freie Zeiten ohne abgeschnittene Texte. */
    @Test
    @Config(qualifiers = "w412dp-h1600dp-xxhdpi", fontScale = 2f)
    fun freieZeitenSchrift200() = freieZeiten("plaetze-schrift-200", dunkel = false)

    @Test
    fun rasterHell() = raster(false).let { m -> foto("plaetze-raster-hell", dunkel = false) { PlaetzeInhalt(m, glocke = { GlockeKnopf(2) {} }) } }

    @Test
    fun rasterDunkel() = raster(true).let { m -> foto("plaetze-raster-dunkel", dunkel = true) { PlaetzeInhalt(m, glocke = { GlockeKnopf(2) {} }) } }

    // ---- Blatt --------------------------------------------------------------------------------

    private val buchen = Fenster.Buchen("p2", "Platz 2", PlatzAttrappe.TAG, stunde = 17 * 60, startzeiten = listOf(1020, 1050), start = 1020)

    @Test
    fun buchenHell() = modell(Ansicht.FREIE_ZEITEN, platzrechte = true).let { m ->
        foto("plaetze-buchen-hell", dunkel = false) { Blatt(m, buchen) }
    }

    @Test
    fun buchenDunkel() = modell(Ansicht.FREIE_ZEITEN, platzrechte = true).let { m ->
        foto("plaetze-buchen-dunkel", dunkel = true) { Blatt(m, buchen) }
    }

    private val eigene = Fenster.Bestehend(PlatzAttrappe.EIGENE, "Platz 1", PlatzAttrappe.TAG)

    @Test
    fun eigeneBuchungHell() = modell(Ansicht.FREIE_ZEITEN).let { m ->
        foto("plaetze-eigene-buchung-hell", dunkel = false) { Blatt(m, eigene) }
    }

    @Test
    fun eigeneBuchungDunkel() = modell(Ansicht.FREIE_ZEITEN).let { m ->
        foto("plaetze-eigene-buchung-dunkel", dunkel = true) { Blatt(m, eigene) }
    }

    @Test
    fun mitspielen() = modell(Ansicht.FREIE_ZEITEN).let { m ->
        foto("plaetze-mitspielen", dunkel = true) { Blatt(m, Fenster.Bestehend(PlatzAttrappe.SUCHT, "Platz 4", PlatzAttrappe.TAG)) }
    }

    @Test
    fun sperrung() = modell(Ansicht.FREIE_ZEITEN, platzrechte = true).let { m ->
        foto("plaetze-sperrung", dunkel = false) { Blatt(m, Fenster.Bestehend(PlatzAttrappe.SPERRE, "Platz 3", PlatzAttrappe.TAG)) }
    }
}
