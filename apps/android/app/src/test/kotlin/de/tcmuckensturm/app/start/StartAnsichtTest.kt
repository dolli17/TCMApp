package de.tcmuckensturm.app.start

import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import de.tcmuckensturm.app.daten.Antwort
import de.tcmuckensturm.app.theme.TcmTheme
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Die Weiche auf dem Bildschirm: was StartAnsicht je nach Stand der Sitzung
 * zeigt - Anmeldung, kein Zugang, Onboarding, Tabs, Passwort setzen. Die
 * Sitzung ist echt, der Server nachgebaut.
 */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w412dp-h1200dp-xxhdpi")
class StartAnsichtTest {
    @get:Rule val compose = createComposeRule()

    private val test by lazy { Testsitzung() }

    @After
    fun schliessen() = test.schliessen()

    private fun zeige() {
        test.sonstLeer()
        compose.setContent { StartAnsicht(test.sitzung) }
    }

    private fun anmelden() {
        compose.bisText("Willkommen zurück auf dem Platz.")
        compose.onNodeWithContentDescription("E-Mail").performTextInput("max@tcm.local")
        compose.onNodeWithContentDescription("Passwort").performTextInput("geheim123")
        compose.onNodeWithText("Anmelden").performClick()
    }

    private fun tab(titel: String) = compose.onNode(
        hasText(titel) and SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Tab),
        useUnmergedTree = false,
    )

    private fun tabDa(titel: String) =
        compose.onAllNodes(hasText(titel) and SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Tab)).fetchSemanticsNodes().isNotEmpty()

    @Test
    fun ohneSitzungDieAnmeldung() {
        zeige()
        compose.bisText("Willkommen zurück auf dem Platz.")
        assertEquals(StartZiel.Anmelden, test.sitzung.ziel.value)
        // Vor der Anmeldung fragt die App nichts aus der Datenbank.
        assertEquals(emptyList<String>(), test.server.gefragt)
    }

    @Test
    fun angemeldetDieTabs() {
        test.anmeldungGelingt()
        zeige()
        anmelden()
        compose.bis("Tabs") { tabDa("Home") }
        assertEquals(StartZiel.Tabs, test.sitzung.ziel.value)
        tab("Home").assertIsSelected()
        for (titel in listOf("Plätze", "Verein", "Konto", "Home")) {
            tab(titel).performClick()
            compose.bis("Tab $titel gewählt") {
                compose.onAllNodes(hasText(titel) and SemanticsMatcher.expectValue(SemanticsProperties.Selected, true))
                    .fetchSemanticsNodes().isNotEmpty()
            }
        }
        // Ohne Rolle im Verein gibt es keinen Tab Verwaltung.
        assertTrue(!tabDa("Verwaltung"))
    }

    /** ich() nennt den Vorstand: der fuenfte Tab erscheint. */
    @Test
    fun verwaltungFuerDenVorstand() {
        test.anmeldungGelingt()
        test.server.rpc(
            "ich",
            """[{"member_id":"m1","first_name":"Max","last_name":"Muster","roles":["vorstand"],"admin":true,"platz_rechte":true}]""",
        )
        zeige()
        anmelden()
        compose.bis("Tab Verwaltung") { tabDa("Verwaltung") }
        tab("Verwaltung").performClick()
        compose.bis("Verwaltung gewählt") {
            compose.onAllNodes(hasText("Verwaltung") and SemanticsMatcher.expectValue(SemanticsProperties.Selected, true))
                .fetchSemanticsNodes().isNotEmpty()
        }
    }

    @Test
    fun keinZugang() {
        test.anmeldungGelingt("""[{"zugang":false,"grund":"gesperrt","onboarding_offen":false}]""")
        zeige()
        anmelden()
        compose.bisText("Kein Zugang mehr")
        compose.onNodeWithText("Der Verein hat deinen Zugang gesperrt.").assertIsDisplayed()
        // Lokal ohne Webadresse: der Knopf fuehrt zurueck zur Anmeldung.
        compose.onNodeWithText("Zur Anmeldung").performClick()
        compose.bisText("Willkommen zurück auf dem Platz.")
        assertEquals(StartZiel.Anmelden, test.sitzung.ziel.value)
    }

    @Test
    fun offenesOnboarding() {
        test.anmeldungGelingt("""[{"zugang":true,"grund":null,"onboarding_offen":true}]""")
        zeige()
        anmelden()
        compose.bis("Onboarding") { test.sitzung.ziel.value == StartZiel.Onboarding && !compose.zeigt("Willkommen zurück auf dem Platz.") }
        assertTrue(!tabDa("Home"))
        // Das Onboarding liest seinen Stand selbst.
        compose.bis("Onboarding fragt den Server") { test.server.gefragt.any { it != "mein_zugang" } }
    }

    /** Der Link aus der E-Mail legt "Passwort setzen" ueber alles andere. */
    @Test
    fun passwortLink() {
        test.server.rpc("mein_zugang", """[{"zugang":true,"grund":null,"onboarding_offen":false}]""")
        test.server.auth("verify") { Antwort.sitzung("at-link", "erika@tcm.local") }
        test.server.auth("user") { Antwort(200, Antwort.nutzer("erika@tcm.local")) }
        zeige()
        compose.bisText("Willkommen zurück auf dem Platz.")
        assertTrue(test.sitzung.linkOeffnen("tcmlokal://passwort-setzen?token_hash=abc123&type=recovery"))
        compose.bis("Passwort setzen") {
            compose.onAllNodes(androidx.compose.ui.test.hasContentDescription("Neues Passwort")).fetchSemanticsNodes().isNotEmpty()
        }
        compose.onNodeWithContentDescription("Passwort wiederholen").assertIsDisplayed()
    }

    @Test
    fun konfigurationFehlt() {
        var fehler by androidx.compose.runtime.mutableStateOf<Throwable?>(Umgebung.Fehler.Fehlt("SUPABASE_URL"))
        compose.setContent { TcmTheme(dunkel = false) { KonfigurationFehlt(fehler) } }
        compose.onNodeWithText("Konfiguration fehlt").assertIsDisplayed()
        compose.onNodeWithText("In der Build-Konfiguration fehlt SUPABASE_URL.").assertIsDisplayed()
        fehler = Umgebung.Fehler.Ungueltig("SITE_URL")
        compose.onNodeWithText("SITE_URL in der Build-Konfiguration ist keine gültige Adresse.").assertIsDisplayed()
        fehler = null
        compose.onNodeWithText("Die Umgebung ließ sich nicht lesen.").assertIsDisplayed()
    }
}
