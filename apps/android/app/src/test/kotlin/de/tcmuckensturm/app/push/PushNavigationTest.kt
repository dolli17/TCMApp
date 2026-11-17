package de.tcmuckensturm.app.push

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.NavHostController
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import de.tcmuckensturm.app.TcmApp
import de.tcmuckensturm.app.bildschirme.home.HomeStart
import de.tcmuckensturm.app.bildschirme.home.Nachrichten
import de.tcmuckensturm.app.bildschirme.konto.KontoMannschaft
import de.tcmuckensturm.app.bildschirme.konto.KontoStart
import de.tcmuckensturm.app.bildschirme.plaetze.PlaetzeStart
import de.tcmuckensturm.app.bildschirme.verein.VeranstaltungZiel
import de.tcmuckensturm.app.bildschirme.verein.VereinStart
import de.tcmuckensturm.app.bildschirme.verwaltung.VerwaltungStart
import de.tcmuckensturm.app.navigation.HauptTabsInhalt
import de.tcmuckensturm.app.start.LocalSitzung
import de.tcmuckensturm.app.start.Testsitzung
import de.tcmuckensturm.app.start.bis
import de.tcmuckensturm.app.theme.TcmTheme
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Eine angetippte Mitteilung fuehrt in den Tabs an ihr Ziel
 * (PushZieleOeffnen) - mit den echten Navigationsgraphen der Tabs und einer
 * Sitzung gegen den nachgebauten Server.
 */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w412dp-h1200dp-xxhdpi")
class PushNavigationTest {
    @get:Rule val compose = createComposeRule()

    private val test by lazy { Testsitzung().also { it.sonstLeer() } }
    private val push by lazy { TcmApp.aus(ApplicationProvider.getApplicationContext()).push }
    private lateinit var nav: NavHostController

    @After
    fun schliessen() = test.schliessen()

    private fun zeige(verwaltung: Boolean = false) {
        compose.setContent {
            nav = rememberNavController()
            TcmTheme(dunkel = false) {
                CompositionLocalProvider(LocalSitzung provides test.sitzung) {
                    HauptTabsInhalt(verwaltungSichtbar = verwaltung, nav = nav, push = push)
                }
            }
        }
        compose.bis("Start im Tab Home") { steht<HomeStart>() }
    }

    private inline fun <reified T : Any> steht() = nav.currentBackStackEntry?.destination?.hasRoute<T>() == true

    private inline fun <reified T : Any> wartetAuf() {
        compose.bis("Bildschirm ${T::class.simpleName}, ist ${nav.currentBackStackEntry?.destination?.route}") { steht<T>() }
        // Jedes Ziel wird nur einmal geoeffnet.
        compose.bis("Ziel abgehakt") { push.offenesZiel.value == null }
    }

    @Test
    fun neuigkeiten() {
        zeige()
        push.geoeffnet(mapOf("ziel" to "/nachrichten", "kind" to "booking_cancelled"))
        wartetAuf<Nachrichten>()
        // Zurueck fuehrt auf Home.
        nav.popBackStack()
        compose.bis("zurück auf Home") { steht<HomeStart>() }
    }

    @Test
    fun veranstaltung() {
        zeige()
        val id = "0b7e1c52-3f1a-4a52-9a53-1f2f6f6f0a11"
        push.geoeffnet(mapOf("ziel" to "/verein/veranstaltung/$id"))
        wartetAuf<VeranstaltungZiel>()
        assertEquals(id, nav.currentBackStackEntry!!.toRoute<VeranstaltungZiel>().id)
        compose.bis("fragt die Veranstaltung") { test.server.anfragen.any { it.text.contains(id) } }
    }

    /** Ohne Pfad zaehlt die Kennung der Veranstaltung. */
    @Test
    fun veranstaltungUeberKennung() {
        zeige()
        val id = "0b7e1c52-3f1a-4a52-9a53-1f2f6f6f0a12"
        push.geoeffnet(mapOf("event_id" to id, "kind" to "event_published"))
        wartetAuf<VeranstaltungZiel>()
        assertEquals(id, nav.currentBackStackEntry!!.toRoute<VeranstaltungZiel>().id)
    }

    @Test
    fun mannschaft() {
        zeige()
        push.geoeffnet(mapOf("kind" to "team_invited", "ziel" to "/nachrichten"))
        wartetAuf<KontoMannschaft>()
        nav.popBackStack()
        compose.bis("zurück im Konto") { steht<KontoStart>() }
    }

    @Test
    fun tabs() {
        zeige(verwaltung = true)
        push.geoeffnet(mapOf("ziel" to "/plaetze"))
        wartetAuf<PlaetzeStart>()
        push.geoeffnet(mapOf("ziel" to "/verein"))
        wartetAuf<VereinStart>()
        push.geoeffnet(mapOf("ziel" to "/konto"))
        wartetAuf<KontoStart>()
        push.geoeffnet(mapOf("ziel" to "/home"))
        wartetAuf<HomeStart>()
        // Die Verwaltung hat kein Push-Ziel; ihr Graph haengt trotzdem an den Tabs.
        nav.navigate(de.tcmuckensturm.app.navigation.HauptTab.VERWALTUNG.graph)
        compose.bis("Verwaltung") { steht<VerwaltungStart>() }
    }

    /** Kaltstart: das Ziel wartet schon, bevor die Tabs stehen. */
    @Test
    fun zielWartetBisDieTabsStehen() {
        push.geoeffnet(mapOf("ziel" to "/konto/mannschaft"))
        assertEquals(PushZiel.Mannschaft, push.offenesZiel.value)
        compose.setContent {
            nav = rememberNavController()
            TcmTheme(dunkel = false) {
                CompositionLocalProvider(LocalSitzung provides test.sitzung) {
                    HauptTabsInhalt(verwaltungSichtbar = false, nav = nav, push = push)
                }
            }
        }
        wartetAuf<KontoMannschaft>()
    }

    /** Eine Nachricht ohne Ziel oder mit fremder Adresse oeffnet nichts. */
    @Test
    fun ohneZiel() {
        zeige()
        push.geoeffnet(emptyMap())
        push.geoeffnet(mapOf("ziel" to "https://boese.example/konto"))
        assertNull(push.offenesZiel.value)
        compose.waitForIdle()
        assertEquals(true, steht<HomeStart>())
    }
}
