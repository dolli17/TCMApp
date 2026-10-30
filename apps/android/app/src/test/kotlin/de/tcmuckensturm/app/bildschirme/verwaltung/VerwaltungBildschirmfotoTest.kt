package de.tcmuckensturm.app.bildschirme.verwaltung

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.github.takahirom.roborazzi.captureRoboImage
import de.tcmuckensturm.app.bildschirme.nachrichten.GlockeKnopf
import de.tcmuckensturm.app.navigation.HauptTab
import de.tcmuckensturm.app.navigation.LocalZuTab
import de.tcmuckensturm.app.theme.TcmTheme
import de.tcmuckensturm.app.ui.tokens.Radius
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Bildschirmfotos der Verwaltung ohne Geraet und ohne Netz (Robolectric +
 * Roborazzi, Beispieldaten aus VerwaltungAttrappe), hell und dunkel.
 * Die Blaetter erscheinen ohne ModalBottomSheet (eigenes Fenster), als
 * Flaeche mit runden Ecken oben. Dazu: Tippen auf eine Sperrung fuehrt in
 * den Tab Plaetze, der Web-Hinweis oeffnet den Link je nach Rechten.
 * `./gradlew :app:recordRoborazziLokalDebug` schreibt die PNGs nach apps/android/docs.
 */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w412dp-h915dp-xxhdpi")
class VerwaltungBildschirmfotoTest {
    @get:Rule val compose = createComposeRule()

    private val web: (String) -> String? = { "https://dev.tennisclub-muckensturm.de$it" }

    private fun modell(quelle: VerwaltungAttrappe = VerwaltungAttrappe(), ansicht: VerwaltungAnsicht = VerwaltungAnsicht.PLAETZE) =
        VerwaltungModell(quelle, uhr = { VerwaltungAttrappe.JETZT }).also {
            runBlocking {
                it.ladeIch()
                it.laden()
            }
            it.waehle(ansicht)
        }

    private fun setze(dunkel: Boolean, inhalt: @Composable () -> Unit) {
        compose.setContent { TcmTheme(dunkel = dunkel) { inhalt() } }
        compose.waitForIdle()
    }

    private fun foto(name: String) = compose.onRoot().captureRoboImage("../docs/$name.png")

    @Composable
    private fun Seite(m: VerwaltungModell, oeffnen: (String) -> Unit = {}) =
        VerwaltungInhalt(m, webLink = web, oeffnen = oeffnen, glocke = { GlockeKnopf(1) {} })

    /** Das Blatt, wie es ueber der Seite liegt. */
    @Composable
    private fun Blatt(m: VerwaltungModell, blatt: VerwaltungBlatt) {
        val f = TcmTheme.farben
        Box(Modifier.fillMaxSize().background(f.ink.copy(alpha = 0.32f)).background(f.bg.copy(alpha = 0.5f))) {
            Column(
                Modifier
                    .padding(top = 24.dp)
                    .fillMaxSize()
                    .clip(RoundedCornerShape(topStart = Radius.blatt, topEnd = Radius.blatt))
                    .background(f.bg),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(Modifier.padding(vertical = 14.dp).size(32.dp, 4.dp).background(f.line2, RoundedCornerShape(2.dp)))
                Box(Modifier.fillMaxWidth()) { VerwaltungBlattInhalt(m, blatt) {} }
            }
        }
    }

    // ---- Seite --------------------------------------------------------------------------

    @Test
    fun plaetzeHell() {
        setze(dunkel = false) { Seite(modell()) }
        foto("verwaltung-plaetze-hell")
    }

    @Test
    fun plaetzeDunkel() {
        setze(dunkel = true) { Seite(modell()) }
        foto("verwaltung-plaetze-dunkel")
    }

    @Test
    fun serienHell() {
        setze(dunkel = false) { Seite(modell(VerwaltungAttrappe(admin = true), VerwaltungAnsicht.SERIEN)) }
        foto("verwaltung-serien-hell")
    }

    @Test
    fun serienDunkel() {
        setze(dunkel = true) { Seite(modell(VerwaltungAttrappe(admin = true), VerwaltungAnsicht.SERIEN)) }
        foto("verwaltung-serien-dunkel")
    }

    @Test
    fun ladefehler() {
        setze(dunkel = false) { Seite(modell(VerwaltungAttrappe(fehler = "Die Plätze konnten nicht geladen werden. (Keine Verbindung zum Server.)"))) }
        foto("verwaltung-fehler")
    }

    /** Doppelte Schriftgroesse: die Zeilen wachsen mit, nichts wird abgeschnitten. */
    @Test
    @Config(fontScale = 2.0f)
    fun grosseSchrift() {
        setze(dunkel = false) { Seite(modell()) }
        foto("verwaltung-plaetze-schrift-200")
    }

    // ---- Wege ---------------------------------------------------------------------------

    @Test
    fun sperrungFuehrtInDenTabPlaetze() {
        var ziel: HauptTab? = null
        setze(dunkel = false) {
            CompositionLocalProvider(LocalZuTab provides { ziel = it }) { Seite(modell()) }
        }
        compose.onNode(hasText("gesperrt bis 14:00")).performClick()
        assertEquals(HauptTab.PLAETZE, ziel)
        // Eine laufende Serie ist nicht tippbar.
        ziel = null
        compose.onNode(hasText("Serie bis 13:00")).performClick()
        assertEquals(null, ziel)
    }

    @Test
    fun webHinweisFuehrtJeNachRechten() {
        val geoeffnet = mutableListOf<String>()
        setze(dunkel = false) { Seite(modell(), oeffnen = { geoeffnet += it }) }
        compose.onNode(hasText("Plätze & Serien am PC")).performClick()
        assertEquals(listOf("https://dev.tennisclub-muckensturm.de/admin/plaetze"), geoeffnet)
    }

    @Test
    fun webHinweisFuerAdmins() {
        val geoeffnet = mutableListOf<String>()
        setze(dunkel = false) { Seite(modell(VerwaltungAttrappe(admin = true)), oeffnen = { geoeffnet += it }) }
        compose.onNode(hasText("Weitere Verwaltung am PC")).performClick()
        assertEquals(listOf("https://dev.tennisclub-muckensturm.de/admin"), geoeffnet)
    }

    // ---- Blaetter -----------------------------------------------------------------------

    private fun sperren(name: String, dunkel: Boolean) {
        val q = VerwaltungAttrappe(sperrKollisionen = 3)
        val m = modell(q)
        setze(dunkel) { Blatt(m, VerwaltungBlatt.Sperren) }
        // Alle Plaetze waehlen und sperren: die Datenbank meldet Buchungen im Weg.
        compose.onNode(hasText("Alle")).performClick()
        compose.onNode(hasText("Sperren")).performClick()
        compose.waitForIdle()
        assertEquals(listOf("sperre p1,p2,p3,p4 29.10.2026 08:00-21:00 platzpflege verdraengen=false"), q.aufrufe)
        foto(name)
    }

    @Test
    fun sperrenHell() = sperren("verwaltung-sperren-hell", dunkel = false)

    @Test
    fun sperrenDunkel() = sperren("verwaltung-sperren-dunkel", dunkel = true)

    private fun serieAnlegen(name: String, dunkel: Boolean) {
        val q = VerwaltungAttrappe()
        val m = modell(q, VerwaltungAnsicht.SERIEN)
        setze(dunkel) { Blatt(m, VerwaltungBlatt.SerieAnlegen) }
        compose.onNode(hasContentDescription("Titel")).performTextInput("Training Herren 40")
        compose.onNode(hasText("Vorschau")).performClick()
        compose.waitForIdle()
        assertTrue(q.aufrufe.single().startsWith("vorschau p1"))
        foto(name)
    }

    @Test
    fun serieAnlegenHell() = serieAnlegen("verwaltung-serie-anlegen-hell", dunkel = false)

    @Test
    fun serieAnlegenDunkel() = serieAnlegen("verwaltung-serie-anlegen-dunkel", dunkel = true)

    @Test
    fun serieAendern() {
        val m = modell(ansicht = VerwaltungAnsicht.SERIEN)
        setze(dunkel = false) { Blatt(m, VerwaltungBlatt.SerieAendern(VerwaltungAttrappe.SERIEN.first())) }
        compose.onNode(hasText("Serie beenden")).performClick()
        compose.waitForIdle()
        foto("verwaltung-serie-hell")
    }
}
