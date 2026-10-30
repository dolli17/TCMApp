package de.tcmuckensturm.app.bildschirme.onboarding

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.github.takahirom.roborazzi.captureRoboImage
import de.tcmuckensturm.app.bildschirme.konto.KontoGruppe
import de.tcmuckensturm.app.daten.Abschluss
import de.tcmuckensturm.app.daten.Ergebnis
import de.tcmuckensturm.app.daten.OnboardingZustand
import de.tcmuckensturm.app.push.PushSchalterAnsicht
import de.tcmuckensturm.app.push.PushZentrale
import de.tcmuckensturm.app.theme.TcmTheme
import de.tcmuckensturm.app.ui.tokens.Abstand
import de.tcmuckensturm.kern.OnboardingSchrittKey
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Beispieldaten fuer die Bildschirmfotos - kein Netz. */
object OnboardingBeispiel {
    /** Kian, 12, aus dem lokalen Stack; Passwort gesetzt, sonst alles offen. */
    val kind = OnboardingZustand.aus(OnboardingLogikTest.BEISPIEL)!!

    /** Nora, erwachsen, mit zugestimmter Satzung und Erziehungsberechtigten-freiem Ablauf. */
    val erwachsen = kind.copy(
        minderjaehrig = false,
        stammdaten = kind.stammdaten.copy(firstName = "Nora", birthday = "1992-09-19", gender = "female", phone = "0711 123456"),
        dokumente = kind.dokumente.mapIndexed { i, d -> if (i == 0) d.copy(zugestimmtAm = "2026-10-29T10:00:00Z") else d },
        merkmale = kind.merkmale + OnboardingZustand.Merkmal(
            "mannschaft_interesse", "Mannschaft", "Die Person möchte in einer Mannschaft spielen. Der Sportwart meldet sich.", true,
        ),
        status = kind.status + mapOf("stammdaten" to true, "rechtliches" to true, "notfallkontakt" to true),
        einstellungen = OnboardingZustand.Einstellungen("alle"),
    )

    val aktionen = object : OnboardingAktionen {
        override suspend fun laden(): OnboardingZustand? = kind
        override suspend fun schliesseAb() = Abschluss(Ergebnis.erfolg("Dein Konto ist freigeschaltet."))
        override suspend fun speichereStammdaten(werte: Map<String, String>) = Ergebnis.erfolg("")
        override suspend fun akzeptiereDokumente(codes: List<String>) = Ergebnis.erfolg("")
        override suspend fun speichereErziehungsberechtigte(name: String, email: String, telefon: String, zustimmung: Boolean) = Ergebnis.erfolg("")
        override suspend fun speichereNotfallkontakt(name: String, telefon: String, verhaeltnis: String) = Ergebnis.erfolg("")
        override suspend fun erteileMandat(iban: String, kontoinhaber: String, bestaetigt: Boolean) = Ergebnis.erfolg("")
        override suspend fun speichereTennis(lk: String, nuligaId: String, mannschaftInteresse: Boolean) = Ergebnis.erfolg("")
        override suspend fun setzeMerkmal(code: String, option: String) = Ergebnis.erfolg("")
        override suspend fun entferneMerkmal(code: String) = Ergebnis.erfolg("")
        override suspend fun passwortSpeichern(neu: String): String? = null
    }
}

/**
 * Bildschirmfotos des Onboardings ohne Geraet (Robolectric + Roborazzi), je
 * Schritt, hell und dunkel. `./gradlew :app:recordRoborazziLokalDebug`
 * schreibt die PNGs nach apps/android/docs.
 */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w412dp-h915dp-xxhdpi")
class OnboardingBildfotoTest {
    @get:Rule val compose = createComposeRule()

    private fun foto(name: String, dunkel: Boolean, inhalt: @Composable () -> Unit) {
        compose.setContent { TcmTheme(dunkel = dunkel) { inhalt() } }
        compose.onRoot().captureRoboImage("../docs/$name.png")
    }

    @Composable
    private fun Assistent(
        zustand: OnboardingZustand,
        schritt: OnboardingSchrittKey?,
        freigeschaltet: Boolean = false,
        hinweis: Ergebnis? = null,
        laden: OnboardingLaden = OnboardingLaden.Da(zustand),
    ) = OnboardingAnsicht(
        stand = OnboardingStand(laden, schritt, freigeschaltet, hinweis),
        aktionen = OnboardingBeispiel.aktionen,
        weiter = { Ergebnis.erfolg("") },
        zurueck = {},
        erneut = {},
        webLink = { "https://dev.tennisclub-muckensturm.de$it" },
        abmelden = {},
        pushSchalter = { PushSchalterAnsicht(an = false, beschreibung = it) },
    )

    @Test
    fun passwort() = foto("onboarding-passwort-hell", dunkel = false) {
        Assistent(OnboardingBeispiel.kind.copy(status = OnboardingBeispiel.kind.status + ("passwort" to false)), OnboardingSchrittKey.PASSWORT)
    }

    @Test
    @Config(qualifiers = "w412dp-h2000dp-xxhdpi")
    fun stammdatenHell() = foto("onboarding-stammdaten-hell", dunkel = false) { Assistent(OnboardingBeispiel.kind, null) }

    @Test
    fun stammdatenDunkel() = foto("onboarding-stammdaten-dunkel", dunkel = true) { Assistent(OnboardingBeispiel.kind, null) }

    @Test
    @Config(qualifiers = "w412dp-h1200dp-xxhdpi")
    fun rechtlichesHell() = foto("onboarding-rechtliches-hell", dunkel = false) {
        Assistent(OnboardingBeispiel.erwachsen, OnboardingSchrittKey.RECHTLICHES)
    }

    @Test
    @Config(qualifiers = "w412dp-h1200dp-xxhdpi")
    fun rechtlichesDunkel() = foto("onboarding-rechtliches-dunkel", dunkel = true) {
        Assistent(OnboardingBeispiel.erwachsen, OnboardingSchrittKey.RECHTLICHES)
    }

    @Test
    fun erziehungsberechtigte() = foto("onboarding-erziehungsberechtigte-hell", dunkel = false) {
        Assistent(OnboardingBeispiel.kind, OnboardingSchrittKey.ERZIEHUNGSBERECHTIGTE)
    }

    @Test
    fun notfallkontakt() = foto("onboarding-notfall-dunkel", dunkel = true) {
        Assistent(OnboardingBeispiel.erwachsen, OnboardingSchrittKey.NOTFALLKONTAKT)
    }

    @Test
    @Config(qualifiers = "w412dp-h1400dp-xxhdpi")
    fun sepaHell() = foto("onboarding-sepa-hell", dunkel = false) { Assistent(OnboardingBeispiel.kind, OnboardingSchrittKey.SEPA) }

    @Test
    @Config(qualifiers = "w412dp-h1400dp-xxhdpi")
    fun sepaDunkel() = foto("onboarding-sepa-dunkel", dunkel = true) { Assistent(OnboardingBeispiel.kind, OnboardingSchrittKey.SEPA) }

    @Test
    fun sepaOhneGlaeubiger() = foto("onboarding-sepa-gesperrt-hell", dunkel = false) {
        val z = OnboardingBeispiel.kind
        Assistent(z.copy(mandat = z.mandat.copy(moeglich = false)), OnboardingSchrittKey.SEPA)
    }

    @Test
    fun einwilligungenFreigeschaltet() = foto("onboarding-einwilligungen-hell", dunkel = false) {
        Assistent(
            OnboardingBeispiel.erwachsen, OnboardingSchrittKey.EINWILLIGUNGEN,
            freigeschaltet = true, hinweis = Ergebnis.erfolg(OnboardingLogik.FREIGESCHALTET),
        )
    }

    @Test
    fun tennis() = foto("onboarding-tennis-dunkel", dunkel = true) {
        Assistent(OnboardingBeispiel.erwachsen, OnboardingSchrittKey.TENNIS, freigeschaltet = true)
    }

    @Test
    fun einstellungenHell() = foto("onboarding-einstellungen-hell", dunkel = false) {
        Assistent(OnboardingBeispiel.erwachsen, OnboardingSchrittKey.EINSTELLUNGEN, freigeschaltet = true)
    }

    @Test
    fun einstellungenDunkel() = foto("onboarding-einstellungen-dunkel", dunkel = true) {
        Assistent(OnboardingBeispiel.erwachsen, OnboardingSchrittKey.EINSTELLUNGEN, freigeschaltet = true)
    }

    @Test
    fun ladefehler() = foto("onboarding-fehler-hell", dunkel = false) {
        Assistent(OnboardingBeispiel.kind, null, laden = OnboardingLaden.Fehler("Keine Verbindung zum Server."))
    }

    /** Der Schalter im Konto: an, aus mit Fehler, ohne Firebase. */
    @Test
    @Config(qualifiers = "w412dp-h400dp-xxhdpi")
    fun pushSchalter() = foto("push-schalter-hell", dunkel = false) {
        Column(Modifier.fillMaxSize().background(TcmTheme.farben.bg).padding(Abstand.rand)) {
            KontoGruppe {
                PushSchalterAnsicht(an = true, symbol = true)
                PushSchalterAnsicht(an = false, symbol = true, meldung = PushZentrale.OHNE_ERLAUBNIS)
                PushSchalterAnsicht(an = false, symbol = true, gesperrt = true, meldung = PushZentrale.NICHT_EINGERICHTET)
            }
        }
    }
}
