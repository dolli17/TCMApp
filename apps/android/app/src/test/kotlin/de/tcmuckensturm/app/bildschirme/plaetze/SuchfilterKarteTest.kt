package de.tcmuckensturm.app.bildschirme.plaetze

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performSemanticsAction
import androidx.test.ext.junit.runners.AndroidJUnit4
import de.tcmuckensturm.app.theme.TcmTheme
import de.tcmuckensturm.kern.SuchFuer
import de.tcmuckensturm.kern.Suchfilter
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Die Karte "Nur für …" unter "Mitspieler gesucht": was sie zeigt und was
 * Tippen und Schieben am Filter aendern. Ohne Geraet (Robolectric); der
 * Zustand liegt wie im Buchungsblatt ausserhalb der Karte.
 */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w412dp-h915dp-xxhdpi")
class SuchfilterKarteTest {
    @get:Rule val compose = createComposeRule()

    private var filter by mutableStateOf(Suchfilter())
    private val aenderungen = mutableListOf<Suchfilter>()

    private fun zeige(start: Suchfilter = Suchfilter(), deaktiviert: Boolean = false) {
        filter = start
        compose.setContent {
            TcmTheme(dunkel = false) {
                SuchfilterKarte(filter, deaktiviert) {
                    aenderungen += it
                    filter = it
                }
            }
        }
    }

    private val schieber = SemanticsMatcher.keyIsDefined(SemanticsActions.SetProgress)

    /** Die Pille einer Auswahl - der Zusatz oben rechts traegt denselben Text, ist aber keine Auswahl. */
    private fun pille(text: String) = compose.onNode(hasText(text) and SemanticsMatcher.keyIsDefined(SemanticsProperties.Selected))

    @Test
    fun ohneEinschraenkung() {
        zeige()
        compose.onNodeWithText("Nur für …").assertIsDisplayed()
        compose.onNodeWithText("alle").assertIsDisplayed()
        pille("Alle").assertIsSelected()
        pille("Damen").assertIsNotSelected()
        // Beim Einstellen immer mit Nachkommastelle, damit der 0,1-Schritt sichtbar ist.
        compose.onNodeWithContentDescription("Von LK 1,0").assertIsDisplayed()
        compose.onNodeWithContentDescription("Bis LK 25,0").assertIsDisplayed()
        compose.onNodeWithContentDescription("LK-Bereich LK 1–25").assertExists()
        // An den Grenzen geht es nicht weiter.
        compose.onNodeWithContentDescription("Von LK 0,1 niedriger").assertIsNotEnabled()
        compose.onNodeWithContentDescription("Von LK 0,1 höher").assertIsEnabled()
        compose.onNodeWithContentDescription("Bis LK 0,1 höher").assertIsNotEnabled()
        compose.onNodeWithContentDescription("Bis LK 0,1 niedriger").assertIsEnabled()
        // Der Hinweis fuer Mitglieder ohne LK erscheint erst mit einer Obergrenze.
        compose.onNodeWithText("Wer keine LK eingetragen hat", substring = true).assertDoesNotExist()
        compose.onNodeWithText("1 ist die beste, 25 die schwächste").assertIsDisplayed()
    }

    @Test
    fun fuerWen() {
        zeige()
        pille("Damen").performClick()
        assertEquals(Suchfilter(fuer = SuchFuer.DAMEN), filter)
        pille("Damen").assertIsSelected()
        pille("Alle").assertIsNotSelected()
        // Oben rechts steht jetzt der Zusatz statt "alle" (zweimal "Damen": Zusatz und Pille).
        compose.onNodeWithText("alle").assertDoesNotExist()

        pille("Herren").performClick()
        assertEquals(SuchFuer.HERREN, filter.fuer)
        pille("Alle").performClick()
        assertEquals(Suchfilter.OFFEN, filter)
        compose.onNodeWithText("alle").assertIsDisplayed()
    }

    @Test
    fun feineSchritte() {
        zeige()
        compose.onNodeWithContentDescription("Von LK 0,1 höher").performClick().performClick()
        assertEquals(12, filter.von)
        compose.onNodeWithContentDescription("Von LK 1,2").assertIsDisplayed()
        compose.onNodeWithText("ab LK 1,2").assertIsDisplayed()
        compose.onNodeWithContentDescription("Von LK 0,1 niedriger").assertIsEnabled().performClick()
        assertEquals(11, filter.von)

        compose.onNodeWithContentDescription("Bis LK 0,1 niedriger").performClick()
        assertEquals(249, filter.bis)
        compose.onNodeWithText("LK 1,1–24,9").assertIsDisplayed()
        compose.onNodeWithContentDescription("LK-Bereich LK 1,1–24,9").assertExists()
        compose.onNodeWithText("Wer keine LK eingetragen hat, sieht die Suche nur, wenn sie bis LK 25 reicht.").assertIsDisplayed()
        compose.onNodeWithContentDescription("Bis LK 0,1 höher").assertIsEnabled().performClick()
        assertEquals(Suchfilter(von = 11), filter)
    }

    /** Von und Bis koennen sich treffen, aber nicht kreuzen. */
    @Test
    fun grenzenKreuzenSichNicht() {
        zeige(Suchfilter(von = 120, bis = 120, fuer = SuchFuer.HERREN))
        compose.onNodeWithText("LK 12 · Herren").assertIsDisplayed()
        compose.onNodeWithContentDescription("Von LK 0,1 höher").assertIsNotEnabled()
        compose.onNodeWithContentDescription("Bis LK 0,1 niedriger").assertIsNotEnabled()
        compose.onNodeWithContentDescription("Von LK 0,1 niedriger").performClick()
        compose.onNodeWithContentDescription("Bis LK 0,1 höher").performClick()
        assertEquals(Suchfilter(von = 119, bis = 121, fuer = SuchFuer.HERREN), filter)
    }

    /** Der Schieber fuer grob: beide Griffe melden ihren Wert in Zehnteln. */
    @Test
    fun schieber() {
        zeige()
        compose.onAllNodes(schieber)[0].performSemanticsAction(SemanticsActions.SetProgress) { it(100f) }
        compose.waitForIdle()
        assertEquals(Suchfilter(von = 100), filter)
        compose.onAllNodes(schieber)[1].performSemanticsAction(SemanticsActions.SetProgress) { it(164.6f) }
        compose.waitForIdle()
        assertEquals(Suchfilter(von = 100, bis = 165), filter)
        compose.onNodeWithText("LK 10–16,5").assertIsDisplayed()
    }

    /** Solange gespeichert wird, ist die Karte stillgelegt. */
    @Test
    fun deaktiviert() {
        zeige(Suchfilter(von = 100, bis = 160), deaktiviert = true)
        pille("Damen").assertIsNotEnabled()
        for (knopf in listOf("Von LK 0,1 niedriger", "Von LK 0,1 höher", "Bis LK 0,1 niedriger", "Bis LK 0,1 höher")) {
            compose.onNodeWithContentDescription(knopf).assertIsNotEnabled()
        }
        compose.onAllNodes(schieber)[0].assertIsNotEnabled()
        assertEquals(emptyList<Suchfilter>(), aenderungen)
    }
}
