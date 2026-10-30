package de.tcmuckensturm.app.bildschirme

import androidx.compose.foundation.text.input.TextFieldState
import androidx.compose.runtime.Composable
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.github.takahirom.roborazzi.captureRoboImage
import de.tcmuckensturm.app.bildschirme.anmeldung.AnmeldenInhalt
import de.tcmuckensturm.app.bildschirme.anmeldung.PasswortSetzenInhalt
import de.tcmuckensturm.app.bildschirme.anmeldung.PasswortVergessenInhalt
import de.tcmuckensturm.app.bildschirme.keinzugang.KeinZugangInhalt
import de.tcmuckensturm.app.navigation.HauptTabsInhalt
import de.tcmuckensturm.app.start.PasswortTexte
import de.tcmuckensturm.app.start.PasswortZustand
import de.tcmuckensturm.app.theme.TcmTheme
import de.tcmuckensturm.kern.Anmeldefehler
import de.tcmuckensturm.kern.ZugangsGrund
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Bildschirmfotos ohne Geraet (Robolectric + Roborazzi), Pixel-Format.
 *
 * `./gradlew test` zeichnet nur (prueft, dass nichts wirft). Die PNGs nach
 * apps/android/docs schreibt `./gradlew :app:recordRoborazziLokalDebug`.
 * Die Anmeldeseiten sind immer dunkel; "hell" zeigt, dass ein helles System
 * daran nichts aendert.
 */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w412dp-h915dp-xxhdpi")
class BildschirmfotoTest {
    @get:Rule val compose = createComposeRule()

    private fun foto(name: String, dunkel: Boolean, inhalt: @Composable () -> Unit) {
        compose.setContent { TcmTheme(dunkel = dunkel) { inhalt() } }
        compose.onRoot().captureRoboImage("../docs/$name.png")
    }

    @Composable
    private fun Anmelden() = AnmeldenInhalt(
        email = TextFieldState("mitglied@tcm.local"),
        passwort = TextFieldState("geheim123"),
        fehler = null,
        laeuft = false,
        antrag = "https://dev.tennisclub-muckensturm.de/antrag",
        beimVergessen = {},
        beimAnmelden = {},
    )

    @Test
    fun anmeldenHell() = foto("anmelden-hell", dunkel = false) { Anmelden() }

    @Test
    fun anmeldenDunkel() = foto("anmelden-dunkel", dunkel = true) { Anmelden() }

    @Test
    fun anmeldenMitFehler() = foto("anmelden-fehler", dunkel = true) {
        AnmeldenInhalt(
            email = TextFieldState("mitglied@tcm.local"),
            passwort = TextFieldState("falsch"),
            fehler = Anmeldefehler.ANMELDEDATEN_FALSCH,
            laeuft = false,
            antrag = null,
            beimVergessen = {},
            beimAnmelden = {},
        )
    }

    @Test
    fun keinZugang() = foto("kein-zugang", dunkel = false) {
        KeinZugangInhalt(ZugangsGrund.AUSGETRETEN, kontakt = "https://dev.tennisclub-muckensturm.de/impressum#kontakt") {}
    }

    @Test
    fun passwortVergessen() = foto("passwort-vergessen", dunkel = true) {
        PasswortVergessenInhalt(
            email = TextFieldState("mitglied@tcm.local"),
            meldung = PasswortTexte.UNTERWEGS,
            fehler = null,
            laeuft = false,
            zurueck = {},
            absenden = {},
        )
    }

    @Test
    fun passwortSetzen() = foto("passwort-setzen", dunkel = true) {
        PasswortSetzenInhalt(
            zustand = PasswortZustand.Bereit("mitglied@tcm.local"),
            passwort = TextFieldState("neues-passwort"),
            wiederholung = TextFieldState("neues-passwort"),
            fehler = null,
            laeuft = false,
            neuerLink = {},
            schliessen = {},
            fortfahren = {},
            speichern = {},
        )
    }

    @Test
    fun tabsHell() = foto("tabs-hell", dunkel = false) { HauptTabsInhalt(verwaltungSichtbar = true) }

    @Test
    fun tabsDunkel() = foto("tabs-dunkel", dunkel = true) { HauptTabsInhalt(verwaltungSichtbar = true) }
}
