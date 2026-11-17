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
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.github.takahirom.roborazzi.captureRoboImage
import de.tcmuckensturm.app.bildschirme.nachrichten.GlockeKnopf
import de.tcmuckensturm.app.theme.TcmTheme
import de.tcmuckensturm.app.ui.tokens.Radius
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertNotNull
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

    private fun modell(platzrechte: Boolean = false) = PlaetzeModell(
        quelle = PlatzAttrappe(platzrechte = platzrechte),
        uhr = { PlatzAttrappe.JETZT },
        live = false,
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

    /** Der Belegungsplan mit einer Auswahl - darunter die Leiste mit "Buchen". */
    private fun raster(): PlaetzeModell = modell().also {
        it.auswahl = Auswahl("p2", 17 * 60 + 30, 21 * 60)
    }

    @Composable
    private fun Plan(m: PlaetzeModell) = PlaetzeInhalt(m, glocke = { GlockeKnopf(2) {} })

    @Test
    @Config(qualifiers = "w412dp-h1300dp-xxhdpi")
    fun rasterHell() = raster().let { m -> foto("plaetze-raster-hell", dunkel = false) { Plan(m) } }

    @Test
    @Config(qualifiers = "w412dp-h1300dp-xxhdpi")
    fun rasterDunkel() = raster().let { m -> foto("plaetze-raster-dunkel", dunkel = true) { Plan(m) } }

    /** Wie auf dem Telefon: Kopf, Tagesleiste, Legende und der Anfang des Rasters. */
    @Test
    fun rasterTelefon() = modell().let { m -> foto("plaetze-raster-telefon", dunkel = false) { Plan(m) } }

    /** Schrift 200 %: Kopf, Tagesleiste und Legende ohne abgeschnittene Texte. */
    @Test
    @Config(qualifiers = "w412dp-h1600dp-xxhdpi", fontScale = 2f)
    fun rasterSchrift200() = modell().let { m -> foto("plaetze-schrift-200", dunkel = false) { Plan(m) } }

    /** Eine freie Flaeche antippen waehlt aus; das eigene Spiel oeffnet das Blatt. */
    @Test
    fun rasterTippen() {
        val m = modell()
        compose.setContent { TcmTheme(dunkel = false) { Plan(m) } }
        compose.waitForIdle()
        compose.onAllNodes(hasContentDescription("frei von", substring = true))[0].performSemanticsAction(SemanticsActions.OnClick)
        compose.waitForIdle()
        assertNotNull(m.auswahl)
        compose.onNode(hasContentDescription("deine Buchung", substring = true)).performScrollTo().performClick()
        compose.waitForIdle()
        assertNotNull(m.fenster)
    }

    // ---- Blatt --------------------------------------------------------------------------------

    private val buchen = Fenster.Buchen("p2", "Platz 2", PlatzAttrappe.TAG, stunde = 17 * 60, startzeiten = listOf(1020, 1050), start = 1020)

    @Test
    fun buchenHell() = modell(platzrechte = true).let { m ->
        foto("plaetze-buchen-hell", dunkel = false) { Blatt(m, buchen) }
    }

    @Test
    fun buchenDunkel() = modell(platzrechte = true).let { m ->
        foto("plaetze-buchen-dunkel", dunkel = true) { Blatt(m, buchen) }
    }

    private val eigene = Fenster.Bestehend(PlatzAttrappe.EIGENE, "Platz 1", PlatzAttrappe.TAG)

    @Test
    fun eigeneBuchungHell() = modell().let { m ->
        foto("plaetze-eigene-buchung-hell", dunkel = false) { Blatt(m, eigene) }
    }

    @Test
    fun eigeneBuchungDunkel() = modell().let { m ->
        foto("plaetze-eigene-buchung-dunkel", dunkel = true) { Blatt(m, eigene) }
    }

    @Test
    fun mitspielen() = modell().let { m ->
        foto("plaetze-mitspielen", dunkel = true) { Blatt(m, Fenster.Bestehend(PlatzAttrappe.SUCHT, "Platz 4", PlatzAttrappe.TAG)) }
    }

    @Test
    fun sperrung() = modell(platzrechte = true).let { m ->
        foto("plaetze-sperrung", dunkel = false) { Blatt(m, Fenster.Bestehend(PlatzAttrappe.SPERRE, "Platz 3", PlatzAttrappe.TAG)) }
    }

    // ---- Mitspielersuche mit Filter ------------------------------------------------------

    /** Zeichnet erst, dann wird im Blatt getippt, dann fotografiert. */
    private fun fotoNach(name: String, dunkel: Boolean, inhalt: @Composable () -> Unit, tippen: () -> Unit) {
        compose.setContent { TcmTheme(dunkel = dunkel) { inhalt() } }
        compose.waitForIdle()
        tippen()
        compose.waitForIdle()
        compose.onRoot().captureRoboImage("../docs/$name.png")
    }

    /** Die beiden Griffe des LK-Schiebers. */
    private fun lkSchieber(von: Float, bis: Float) {
        val griffe = compose.onAllNodes(SemanticsMatcher.keyIsDefined(SemanticsActions.SetProgress))
        griffe[0].performSemanticsAction(SemanticsActions.SetProgress) { it(von) }
        griffe[1].performSemanticsAction(SemanticsActions.SetProgress) { it(bis) }
    }

    private fun buchenMitFilter(name: String, dunkel: Boolean) = modell().let { m ->
        fotoNach(name, dunkel, { Blatt(m, buchen) }) {
            compose.onNodeWithText("Mitspieler gesucht").performClick()
            compose.waitForIdle()
            lkSchieber(100f, 160f)
            compose.onNodeWithText("Herren").performClick()
            compose.onNodeWithText("Für wen", ignoreCase = true).performScrollTo()
        }
    }

    @Test
    fun buchenMitFilterHell() = buchenMitFilter("plaetze-suchfilter-buchen-hell", dunkel = false)

    @Test
    fun buchenMitFilterDunkel() = buchenMitFilter("plaetze-suchfilter-buchen-dunkel", dunkel = true)

    /** Die eigene Buchung sucht schon, nur für Damen ab LK 12,5. */
    private val eigeneSucht = Fenster.Bestehend(
        PlatzAttrappe.EIGENE.copy(
            players = emptyList(), playerMemberIds = emptyList(), frei = 1, partnerWanted = true,
            partnerLkVon = 12.5, partnerFuer = "female",
        ),
        "Platz 1",
        PlatzAttrappe.TAG,
    )

    @Test
    fun eigeneSucheHell() = modell().let { m ->
        fotoNach("plaetze-suchfilter-eigene-hell", dunkel = false, { Blatt(m, eigeneSucht) }) {
            compose.onNodeWithText("Für wen", ignoreCase = true).performScrollTo()
        }
    }

    /** Geaendert: bis LK 18 - dann erscheint "Suche ändern". */
    @Test
    fun eigeneSucheAendernDunkel() = modell().let { m ->
        fotoNach("plaetze-suchfilter-aendern-dunkel", dunkel = true, { Blatt(m, eigeneSucht) }) {
            lkSchieber(125f, 180f)
            compose.onNodeWithText("Suche ändern").performScrollTo()
        }
    }
}
