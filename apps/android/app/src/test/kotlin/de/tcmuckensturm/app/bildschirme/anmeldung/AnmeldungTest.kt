package de.tcmuckensturm.app.bildschirme.anmeldung

import androidx.compose.foundation.text.input.TextFieldState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.UriHandler
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performImeAction
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import de.tcmuckensturm.app.bildschirme.keinzugang.KeinZugangInhalt
import de.tcmuckensturm.app.daten.Antwort
import de.tcmuckensturm.app.start.LocalSitzung
import de.tcmuckensturm.app.start.PasswortTexte
import de.tcmuckensturm.app.start.Testsitzung
import de.tcmuckensturm.app.start.bis
import de.tcmuckensturm.app.start.bisText
import de.tcmuckensturm.app.theme.TcmTheme
import de.tcmuckensturm.kern.Anmeldefehler
import de.tcmuckensturm.kern.ZugangsGrund
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Die Anmeldeseiten bedient: Felder, "Anzeigen" am Passwort, Knoepfe und
 * Verweise - erst ohne Sitzung (nur die Ansicht), dann der ganze Bildschirm
 * mit Sitzung gegen nachgebaute Antworten von Supabase Auth.
 */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w412dp-h1200dp-xxhdpi")
class AnmeldungTest {
    @get:Rule val compose = createComposeRule()

    private val geoeffnet = mutableListOf<String>()
    private val links = object : UriHandler {
        override fun openUri(uri: String) {
            geoeffnet += uri
        }
    }
    private var test: Testsitzung? = null

    @After
    fun schliessen() {
        test?.schliessen()
    }

    private fun zeige(inhalt: @Composable () -> Unit) {
        compose.setContent {
            TcmTheme(dunkel = false) { CompositionLocalProvider(LocalUriHandler provides links) { inhalt() } }
        }
    }

    // ---- Anmelden: die Ansicht ----------------------------------------------------

    @Test
    fun anmeldenFelderUndKnoepfe() {
        val email = TextFieldState()
        val passwort = TextFieldState()
        var angemeldet = 0
        var vergessen = 0
        zeige {
            AnmeldenInhalt(email, passwort, fehler = null, laeuft = false, antrag = "https://tcm.test/antrag",
                beimVergessen = { vergessen++ }, beimAnmelden = { angemeldet++ })
        }
        compose.onNodeWithText("TC MUCKENSTURM").assertIsDisplayed()
        compose.onNodeWithText("Willkommen zurück auf dem Platz.").assertIsDisplayed()

        compose.onNodeWithContentDescription("E-Mail").performTextInput("max@tcm.local")
        compose.onNodeWithContentDescription("Passwort").performTextInput("geheim123")
        assertEquals("max@tcm.local", email.text.toString())
        assertEquals("geheim123", passwort.text.toString())

        compose.onNodeWithText("Anmelden").performClick()
        assertEquals(1, angemeldet)
        // "Los" auf der Tastatur im Passwortfeld meldet ebenfalls an.
        compose.onNodeWithContentDescription("Passwort").performImeAction()
        assertEquals(2, angemeldet)
        compose.onNodeWithText("Passwort vergessen?").performClick()
        assertEquals(1, vergessen)

        compose.onNodeWithText("Noch kein Mitglied?").assertIsDisplayed()
        compose.onNodeWithText("Antrag stellen").performClick()
        assertEquals(listOf("https://tcm.test/antrag"), geoeffnet)
    }

    /** "Anzeigen" am Passwortfeld sagt TalkBack seinen Zustand und wechselt die Beschriftung. */
    @Test
    fun passwortAnzeigen() {
        zeige {
            AnmeldenInhalt(TextFieldState(), TextFieldState("geheim123"), null, false, antrag = null, beimVergessen = {}, beimAnmelden = {})
        }
        fun zustand(wert: String) = SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, wert)
        compose.onNodeWithContentDescription("Passwort anzeigen").assert(zustand("Aus"))
        compose.onNodeWithText("Anzeigen").assertIsDisplayed()
        compose.onNodeWithContentDescription("Passwort anzeigen").performClick()
        compose.onNodeWithContentDescription("Passwort anzeigen").assert(zustand("Ein"))
        compose.onNodeWithText("Verbergen").assertIsDisplayed()
        compose.onNodeWithContentDescription("Passwort anzeigen").performClick()
        compose.onNodeWithText("Anzeigen").assertIsDisplayed()
        // Ohne Webadresse (lokal) gibt es keine Zeile zum Mitgliedsantrag.
        compose.onNodeWithText("Antrag stellen").assertDoesNotExist()
    }

    @Test
    fun anmeldenFehlerUndLaufend() {
        var laeuft by mutableStateOf(false)
        var angemeldet = 0
        zeige {
            AnmeldenInhalt(TextFieldState(), TextFieldState(), Anmeldefehler.ANMELDEDATEN_FALSCH, laeuft, null, {}, { angemeldet++ })
        }
        compose.onNodeWithText(Anmeldefehler.ANMELDEDATEN_FALSCH).assertIsDisplayed()
        laeuft = true
        compose.onNodeWithText("Anmelden…").assertIsDisplayed().performClick()
        assertEquals(0, angemeldet)
    }

    // ---- Passwort vergessen: die Ansicht --------------------------------------------

    @Test
    fun passwortVergessenAnsicht() {
        val email = TextFieldState()
        var meldung by mutableStateOf<String?>(null)
        var fehler by mutableStateOf<String?>(null)
        var laeuft by mutableStateOf(false)
        var abgesendet = 0
        var zurueck = 0
        zeige { PasswortVergessenInhalt(email, meldung, fehler, laeuft, zurueck = { zurueck++ }, absenden = { abgesendet++ }) }

        compose.onNodeWithText(PasswortTexte.VERGESSEN_TITEL).assertIsDisplayed()
        compose.onNodeWithText(PasswortTexte.VERGESSEN_UNTERZEILE).assertIsDisplayed()
        compose.onNodeWithContentDescription("E-Mail").performTextInput("max@tcm.local")
        assertEquals("max@tcm.local", email.text.toString())
        compose.onNodeWithText("Link anfordern").performClick()
        compose.onNodeWithContentDescription("E-Mail").performImeAction()
        assertEquals(2, abgesendet)
        compose.onNodeWithText("Zurück zur Anmeldung").performClick()
        assertEquals(1, zurueck)

        // Dieselbe Meldung, ob es die Adresse gibt oder nicht - mit dem Hinweis auf den Spam-Ordner.
        meldung = PasswortTexte.UNTERWEGS
        compose.onNodeWithText("${PasswortTexte.UNTERWEGS} ${PasswortTexte.SPAM}").assertIsDisplayed()
        meldung = null
        fehler = Anmeldefehler.VERBINDUNG
        compose.onNodeWithText(Anmeldefehler.VERBINDUNG).assertIsDisplayed()
        laeuft = true
        compose.onNodeWithText("Wird gesendet…").assertIsDisplayed().performClick()
        assertEquals(2, abgesendet)
    }

    // ---- Kein Zugang ------------------------------------------------------------------

    @Test
    fun keinZugangMitUndOhneKontakt() {
        var kontakt by mutableStateOf<String?>("https://tcm.test/impressum#kontakt")
        var zurAnmeldung = 0
        zeige { KeinZugangInhalt(ZugangsGrund.GESPERRT, kontakt) { zurAnmeldung++ } }
        compose.onNodeWithText("Kein Zugang mehr").assertIsDisplayed()
        compose.onNodeWithText("Der Verein hat deinen Zugang gesperrt.").assertIsDisplayed()
        compose.onNodeWithText("Vorstand kontaktieren").performClick()
        assertEquals(listOf("https://tcm.test/impressum#kontakt"), geoeffnet)
        compose.onNodeWithText("Mit einem anderen Konto anmelden").performClick()
        assertEquals(1, zurAnmeldung)

        // Ohne Webadresse (lokal) fuehrt der Hauptknopf zur Anmeldung.
        kontakt = null
        compose.onNodeWithText("Vorstand kontaktieren").assertDoesNotExist()
        compose.onNodeWithText("Zur Anmeldung").performClick()
        assertEquals(2, zurAnmeldung)
    }

    // ---- Mit Sitzung ------------------------------------------------------------------

    private fun bildschirm(): Testsitzung {
        val t = Testsitzung().also { test = it }
        zeige { CompositionLocalProvider(LocalSitzung provides t.sitzung) { AnmeldenBildschirm() } }
        return t
    }

    private fun anmelden(email: String, passwort: String) {
        compose.onNodeWithContentDescription("E-Mail").performTextInput(email)
        compose.onNodeWithContentDescription("Passwort").performTextInput(passwort)
        compose.onNodeWithText("Anmelden").performClick()
    }

    @Test
    fun falscheAnmeldedaten() {
        val t = bildschirm()
        t.server.auth("token") { Antwort.authFehler(400, "invalid_credentials", "Invalid login credentials") }
        anmelden(" max@tcm.local ", "falsch")
        compose.bisText(Anmeldefehler.ANMELDEDATEN_FALSCH)
        val anfrage = t.server.auths("token").single()
        assertEquals("\"max@tcm.local\"", anfrage.json["email"].toString())
        assertEquals("\"falsch\"", anfrage.json["password"].toString())
        // Der Knopf ist wieder frei; ein zweiter Versuch ohne Netz nennt die Verbindung.
        t.server.ohneNetz = true
        compose.onNodeWithText("Anmelden").performClick()
        compose.bisText(Anmeldefehler.VERBINDUNG)
        compose.onNodeWithText(Anmeldefehler.ANMELDEDATEN_FALSCH).assertDoesNotExist()
    }

    @Test
    fun erfolgreicheAnmeldungZeigtKeinenFehler() {
        val t = bildschirm()
        t.anmeldungGelingt()
        anmelden("max@tcm.local", "geheim123")
        compose.bis("angemeldet") { t.server.rpcs("mein_zugang").isNotEmpty() }
        compose.bis("Knopf wieder frei") { compose.onAllNodes(hasText("Anmelden")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText(Anmeldefehler.ANMELDEDATEN_FALSCH).assertDoesNotExist()
    }

    /** "Passwort vergessen?" liegt ueber der Anmeldung: Link anfordern, Meldung lesen, zurueck. */
    @Test
    fun passwortVergessenMitSitzung() {
        val t = bildschirm()
        t.server.auth("recover") { Antwort(200, "{}") }
        compose.onNodeWithText("Passwort vergessen?").performClick()
        compose.onNodeWithText(PasswortTexte.VERGESSEN_TITEL).assertIsDisplayed()

        compose.onNodeWithContentDescription("E-Mail").performTextInput("max@tcm.local")
        compose.onNodeWithText("Link anfordern").performClick()
        compose.bisText(PasswortTexte.UNTERWEGS, teil = true)
        val anfrage = t.server.auths("recover").single()
        assertEquals("\"max@tcm.local\"", anfrage.json["email"].toString())
        assertEquals("tcmlokal://passwort-setzen", anfrage.abfrage["redirect_to"])

        // Eine Stoerung ersetzt die Erfolgsmeldung.
        t.server.ohneNetz = true
        compose.onNodeWithText("Link anfordern").performClick()
        compose.bisText(Anmeldefehler.VERBINDUNG)
        compose.onNodeWithText(PasswortTexte.UNTERWEGS, substring = true).assertDoesNotExist()

        compose.onNodeWithText("Zurück zur Anmeldung").performClick()
        compose.onNodeWithText("Willkommen zurück auf dem Platz.").assertIsDisplayed()
    }
}
