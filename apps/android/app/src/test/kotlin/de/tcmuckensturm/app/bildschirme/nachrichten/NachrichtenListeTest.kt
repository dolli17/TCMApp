package de.tcmuckensturm.app.bildschirme.nachrichten

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertHasNoClickAction
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import de.tcmuckensturm.app.bildschirme.konto.LocalZuMannschaft
import de.tcmuckensturm.app.daten.Benachrichtigung
import de.tcmuckensturm.app.theme.TcmTheme
import de.tcmuckensturm.kern.NotificationSymbol
import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Die Liste der Benachrichtigungen (Blatt hinter der Glocke und Bildschirm
 * Neuigkeiten): Gruppen nach Tagen, was TalkBack vorliest, wohin ein Tippen
 * fuehrt und was "Alle als gelesen" wegnimmt.
 */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w412dp-h1400dp-xxhdpi")
class NachrichtenListeTest {
    @get:Rule val compose = createComposeRule()

    /** Donnerstag, 29.10.2026, 12:00 in Berlin */
    private val jetzt = Instant.parse("2026-10-29T11:00:00Z")

    private val storno = Benachrichtigung(
        id = "n1", kind = "booking_cancelled", title = "Buchung storniert", body = "Platz 1, Fr 18:00",
        createdAt = "2026-10-29T10:55:00+00:00",
    )
    private val fest = Benachrichtigung(
        id = "n2", kind = "event_published", title = "Sommerfest", body = "Jetzt anmelden", eventId = "e1",
        createdAt = "2026-10-28T09:00:00+00:00", readAt = "2026-10-28T10:00:00+00:00",
    )
    private val einladung = Benachrichtigung(
        id = "n3", kind = "team_invited", title = "Einladung in die Herren 40", body = "Erik lädt dich ein",
        createdAt = "2026-10-26T09:00:00+00:00",
    )
    private val alt = Benachrichtigung(
        id = "n4", kind = "charge_created", title = "Neue Forderung", body = null,
        createdAt = "2026-09-01T09:00:00+00:00", readAt = "2026-09-02T09:00:00+00:00",
    )

    private val veranstaltungen = mutableListOf<String>()
    private var mannschaft = 0

    private fun zeige(mitMannschaft: Boolean = true, inhalt: @Composable () -> Unit) {
        val zuMannschaft: (() -> Unit)? = if (mitMannschaft) ({ mannschaft++ }) else null
        compose.setContent {
            TcmTheme(dunkel = false) {
                CompositionLocalProvider(LocalZuMannschaft provides zuMannschaft) { inhalt() }
            }
        }
    }

    private fun liste(nachrichten: List<Benachrichtigung>, alleGesehen: Boolean = false, mitMannschaft: Boolean = true) =
        zeige(mitMannschaft) { NachrichtenListe(nachrichten, alleGesehen, jetzt) { veranstaltungen += it } }

    @Test
    fun leer() {
        liste(emptyList())
        compose.onNodeWithText("Keine Neuigkeiten.").assertIsDisplayed()
    }

    @Test
    fun gruppenNachTagen() {
        liste(listOf(storno, fest, einladung, alt))
        // Die Kicker stehen in Grossbuchstaben und sind Ueberschriften.
        compose.onAllNodes(SemanticsMatcher.keyIsDefined(SemanticsProperties.Heading)).assertCountEquals(4)
        for (gruppe in listOf("HEUTE", "GESTERN", "DIESE WOCHE", "FRÜHER")) compose.onNodeWithText(gruppe).assertIsDisplayed()
    }

    /** Leere Gruppen fallen weg. */
    @Test
    fun nurEineGruppe() {
        liste(listOf(storno))
        compose.onNodeWithText("HEUTE").assertIsDisplayed()
        compose.onNodeWithText("GESTERN").assertDoesNotExist()
        compose.onNodeWithText("FRÜHER").assertDoesNotExist()
    }

    /** Eine Zeile ist fuer TalkBack ein Satz: neu oder nicht, Titel, Text, Alter - und wohin das Tippen fuehrt. */
    @Test
    fun vorlesetexte() {
        liste(listOf(storno, fest, einladung, alt))
        compose.onNodeWithContentDescription("Neu: Buchung storniert. Platz 1, Fr 18:00. vor 5 Min.").assertHasNoClickAction()
        compose.onNodeWithContentDescription("Sommerfest. Jetzt anmelden. gestern. Öffnet die Veranstaltung").assertHasClickAction()
        compose.onNodeWithContentDescription("Neu: Einladung in die Herren 40. Erik lädt dich ein. Mo. Öffnet die Mannschaft")
            .assertHasClickAction()
        compose.onNodeWithContentDescription("Neue Forderung. . 01.09.").assertHasNoClickAction()
    }

    @Test
    fun tippenFuehrtZurVeranstaltungOderMannschaft() {
        liste(listOf(storno, fest, einladung))
        compose.onNode(hasContentDescription("Sommerfest", substring = true)).performClick()
        assertEquals(listOf("e1"), veranstaltungen)
        assertEquals(0, mannschaft)
        compose.onNode(hasContentDescription("Einladung in die Herren 40", substring = true)).performClick()
        assertEquals(1, mannschaft)
        assertEquals(listOf("e1"), veranstaltungen)
    }

    /** Nennt eine Mannschaftsnachricht eine Veranstaltung, geht die Veranstaltung vor. */
    @Test
    fun veranstaltungGehtVor() {
        liste(listOf(einladung.copy(eventId = "e7")))
        compose.onNode(hasContentDescription("Öffnet die Veranstaltung", substring = true)).performClick()
        assertEquals(listOf("e7"), veranstaltungen)
        assertEquals(0, mannschaft)
    }

    /** Ohne den Weg zur Mannschaft (etwa in einer Vorschau) ist die Zeile nicht tippbar. */
    @Test
    fun ohneWegZurMannschaft() {
        liste(listOf(einladung), mitMannschaft = false)
        compose.onNode(hasContentDescription("Einladung in die Herren 40", substring = true)).assertHasNoClickAction()
        compose.onNode(hasContentDescription("Öffnet die Mannschaft", substring = true)).assertDoesNotExist()
    }

    /** "Alle als gelesen" nimmt die Hervorhebung weg: nichts ist mehr "Neu". */
    @Test
    fun alleGesehen() {
        liste(listOf(storno, einladung), alleGesehen = true)
        compose.onNode(hasContentDescription("Neu:", substring = true)).assertDoesNotExist()
        compose.onNodeWithContentDescription("Buchung storniert. Platz 1, Fr 18:00. vor 5 Min.").assertIsDisplayed()
    }

    /** Auf Home steht die Zeile ohne Hervorhebung und gekuerzt; tippbar bleibt sie. */
    @Test
    fun zeileAufHome() {
        zeige {
            NachrichtZeile(fest.copy(readAt = null), neu = true, jetzt = jetzt, hervorheben = false, zeilen = 2) { veranstaltungen += it }
        }
        compose.onNodeWithContentDescription("Neu: Sommerfest. Jetzt anmelden. gestern. Öffnet die Veranstaltung").performClick()
        assertEquals(listOf("e1"), veranstaltungen)
    }

    /** Schrift 200 %: die Zeit steht unter dem Titel, der Inhalt bleibt derselbe. */
    @Test
    @Config(qualifiers = "w412dp-h1400dp-xxhdpi", fontScale = 2f)
    fun grosseSchrift() {
        liste(listOf(storno, fest))
        compose.onNodeWithContentDescription("Neu: Buchung storniert. Platz 1, Fr 18:00. vor 5 Min.").assertIsDisplayed()
        compose.onNode(hasContentDescription("Sommerfest", substring = true)).performClick()
        assertEquals(listOf("e1"), veranstaltungen)
    }

    @Test
    fun alleGelesenKnopf() {
        var getippt = 0
        zeige { AlleGelesenKnopf { getippt++ } }
        compose.onNodeWithText("Alle als gelesen").performClick()
        assertEquals(1, getippt)
    }

    @Test
    fun symbolJeArt() {
        val bilder = NotificationSymbol.entries.map(::symbolBild)
        assertEquals(NotificationSymbol.entries.size, bilder.distinct().size)
        assertNotEquals(symbolBild(NotificationSymbol.STORNO), symbolBild(NotificationSymbol.PLATZ))
    }
}
