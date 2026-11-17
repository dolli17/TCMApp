package de.tcmuckensturm.app.bildschirme.nachrichten

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import de.tcmuckensturm.app.daten.Antwort
import de.tcmuckensturm.app.start.LocalSitzung
import de.tcmuckensturm.app.start.Testsitzung
import de.tcmuckensturm.app.start.bis
import de.tcmuckensturm.app.start.bisText
import de.tcmuckensturm.app.start.zeigt
import de.tcmuckensturm.app.theme.TcmTheme
import de.tcmuckensturm.kern.DbFehler
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Der Bildschirm Neuigkeiten gegen den nachgebauten Server: laden, einmal
 * als gelesen abhaken, "Alle als gelesen", Fehler und erneuter Versuch.
 */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w412dp-h1400dp-xxhdpi")
class NachrichtenBildschirmTest {
    @get:Rule val compose = createComposeRule()

    private val test by lazy { Testsitzung() }
    private val veranstaltungen = mutableListOf<String>()
    private var zurueck = 0

    private val ungelesen = """{"id":"n1","kind":"event_published","title":"Sommerfest","body":"Jetzt anmelden","event_id":"e1","created_at":"2026-01-10T09:00:00+00:00","read_at":null}"""
    private val gelesen = """{"id":"n2","kind":"charge_created","title":"Neue Forderung","body":"Beitrag 2026","event_id":null,"created_at":"2026-01-05T09:00:00+00:00","read_at":"2026-01-06T09:00:00+00:00"}"""

    @After
    fun schliessen() = test.schliessen()

    private fun zeige() {
        compose.setContent {
            TcmTheme(dunkel = false) {
                CompositionLocalProvider(LocalSitzung provides test.sitzung) {
                    NachrichtenBildschirm(zurueck = { zurueck++ }, zuVeranstaltung = { veranstaltungen += it })
                }
            }
        }
    }

    private fun neu() = compose.onAllNodes(hasContentDescription("Neu:", substring = true)).fetchSemanticsNodes().size

    @Test
    fun ladenAbhakenUndAlleGelesen() {
        test.server.rpc("my_notifications", "[$ungelesen,$gelesen]")
        test.server.rpc("mark_notifications_read", "1")
        zeige()
        compose.bisText("FRÜHER")
        compose.onNodeWithText("Neuigkeiten").assertIsDisplayed()
        assertEquals(1, neu())
        // Beim Oeffnen einmal abhaken - die Hervorhebung bleibt, bis man geht oder "Alle als gelesen" tippt.
        compose.bis("abgehakt") { test.server.rpcs("mark_notifications_read").size == 1 }

        compose.onNodeWithText("Alle als gelesen").performClick()
        compose.bis("nichts mehr neu") { neu() == 0 && !compose.zeigt("Alle als gelesen") }
        assertEquals(1, test.server.rpcs("mark_notifications_read").size)

        compose.onNode(hasContentDescription("Sommerfest", substring = true)).performClick()
        assertEquals(listOf("e1"), veranstaltungen)
        compose.onNodeWithContentDescription("Zurück").performClick()
        assertEquals(1, zurueck)
    }

    /** Ist alles gelesen, wird nichts abgehakt und der Knopf fehlt. */
    @Test
    fun allesGelesen() {
        test.server.rpc("my_notifications", "[$gelesen]")
        zeige()
        compose.bisText("FRÜHER")
        compose.onNodeWithText("Alle als gelesen").assertDoesNotExist()
        assertEquals(0, neu())
        assertEquals(emptyList<Any>(), test.server.rpcs("mark_notifications_read"))
    }

    @Test
    fun leer() {
        test.server.rpc("my_notifications", "[]")
        zeige()
        compose.bisText("Keine Neuigkeiten.")
    }

    /** Scheitert das Abhaken, steht die Liste trotzdem. */
    @Test
    fun abhakenScheitertStill() {
        test.server.rpc("my_notifications", "[$ungelesen]")
        test.server.rpc("mark_notifications_read", Antwort.SITZUNG_ABGELAUFEN)
        zeige()
        compose.bisText("FRÜHER")
        compose.bis("Versuch abzuhaken") { test.server.rpcs("mark_notifications_read").size == 1 }
        compose.waitForIdle()
        assertEquals(1, neu())
        compose.onNodeWithText(DbFehler.ALLGEMEINER_FEHLER_TEXT).assertDoesNotExist()
    }

    @Test
    fun fehlerUndErneutVersuchen() {
        test.server.ohneNetz = true
        zeige()
        compose.bisText(DbFehler.VERBINDUNGSFEHLER_TEXT)
        test.server.ohneNetz = false
        test.server.rpc("my_notifications", "[$gelesen]")
        compose.onNodeWithText("Erneut versuchen").performClick()
        compose.bisText("FRÜHER")
        compose.onNodeWithText(DbFehler.VERBINDUNGSFEHLER_TEXT).assertDoesNotExist()
        assertEquals(2, test.server.rpcs("my_notifications").size)
    }
}
