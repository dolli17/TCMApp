package de.tcmuckensturm.app

import android.content.Intent
import android.net.Uri
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import de.tcmuckensturm.app.navigation.HauptTab
import de.tcmuckensturm.app.push.PushZiel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Die Activity und die Application unter Robolectric: ohne Konfiguration
 * (lokal ohne lokal.properties, CI) der Hinweis statt eines Absturzes, und
 * eine angetippte Mitteilung landet als Ziel in der PushZentrale.
 */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w412dp-h915dp-xxhdpi")
class HauptActivityTest {
    @get:Rule val compose = createEmptyComposeRule()

    private val app: TcmApp get() = TcmApp.aus(ApplicationProvider.getApplicationContext())

    private fun absicht(aendern: Intent.() -> Unit = {}) =
        Intent(ApplicationProvider.getApplicationContext(), HauptActivity::class.java).apply(aendern)

    @Test
    fun ohneKonfigurationDerHinweis() {
        assumeTrue(app.sitzung == null)
        ActivityScenario.launch<HauptActivity>(absicht()).use {
            compose.onNodeWithText("Konfiguration fehlt").assertIsDisplayed()
            assertNull(app.push.offenesZiel.value)
        }
    }

    /** Ohne Firebase-Werte bleibt Push aus, der Rest laeuft. */
    @Test
    fun pushOhneFirebase() {
        assumeTrue(de.tcmuckensturm.app.push.FirebaseWerte.ausBuildConfig() == null)
        assertFalse(app.push.verfuegbar)
    }

    /** Kaltstart ueber eine Mitteilung: `data` steht in den Extras. */
    @Test
    fun angetippteMitteilungBeimStart() {
        ActivityScenario.launch<HauptActivity>(
            absicht {
                putExtra("ziel", "/plaetze")
                putExtra("fremd", "x")
            },
        ).use {
            assertEquals(PushZiel.Tab(HauptTab.PLAETZE), app.push.offenesZiel.value)
        }
    }

    /** Die App laeuft schon (singleTask): das Ziel kommt ueber onNewIntent. */
    @Test
    fun angetippteMitteilungImBetrieb() {
        val activity = Robolectric.buildActivity(HauptActivity::class.java, absicht()).setup()
        assertNull(app.push.offenesZiel.value)
        activity.newIntent(absicht { putExtra("kind", "team_invited") })
        assertEquals(PushZiel.Mannschaft, app.push.offenesZiel.value)
        activity.pause().stop().destroy()
    }

    /** Ohne Sitzung fuehrt ein Link mit dem eigenen Schema nirgendwohin - und stuerzt nicht ab. */
    @Test
    fun linkOhneSitzung() {
        assumeTrue(app.sitzung == null)
        ActivityScenario.launch<HauptActivity>(
            absicht {
                action = Intent.ACTION_VIEW
                data = Uri.parse("tcmlokal://plaetze")
            },
        ).use {
            assertNull(app.push.offenesZiel.value)
            compose.onNodeWithText("Konfiguration fehlt").assertIsDisplayed()
        }
    }
}
