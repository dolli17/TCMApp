package de.tcmuckensturm.app.bildschirme.konto

import androidx.compose.runtime.Composable
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.github.takahirom.roborazzi.captureRoboImage
import de.tcmuckensturm.app.bildschirme.home.Abschnitt
import de.tcmuckensturm.app.daten.Kandidat
import de.tcmuckensturm.app.daten.MeineEinladung
import de.tcmuckensturm.app.daten.MeineMannschaft
import de.tcmuckensturm.app.theme.TcmTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Beispieldaten fuer die Mannschaft - kein Netz. */
object MannschaftBeispiel {
    private fun spieler(id: String, vor: String, nach: String, lk: String?, mf: Boolean = false, telefon: String? = null) =
        MeineMannschaft.Spieler(id, vor, nach, lk, mf, telefon)

    /** Anna ist MF der Damen 30: sie sieht Telefonnummern (wo freigegeben) und offene Einladungen. */
    val mf = MeineMannschaft(
        teamId = "t1",
        name = "Damen 30",
        ichBinMf = true,
        telefonSichtbar = true,
        kader = listOf(
            spieler("m1", "Anna", "Meier", "LK14,5", mf = true, telefon = "0170 1234567"),
            spieler("m2", "Julia", "Becker", "LK9,8", telefon = "0171 2223334"),
            spieler("m3", "Sabine", "Wolf", "LK12,0"),
            spieler("m4", "Petra", "Schäfer", "LK17,3", telefon = "07144 55667"),
            spieler("m5", "Claudia", "Hofmann", null),
        ),
        offeneEinladungen = listOf(
            MeineMannschaft.OffeneEinladung(
                "i1", "m9", "Lena", "Krause",
                createdAt = "2026-10-28T10:00:00Z", expiresAt = "2026-11-27T10:00:00Z",
            ),
        ),
    )

    /** Tim spielt in Herren 40 und hat eine Einladung in die Herren; Telefon sieht er nicht. */
    val spieler = MeineMannschaft(
        teamId = "t2",
        name = "Herren 40",
        ichBinMf = false,
        kader = listOf(
            spieler("h1", "Markus", "Weber", "LK11,2", mf = true),
            spieler("h2", "Tim", "Braun", "LK15,0"),
            spieler("h3", "Stefan", "Klein", "LK16,4"),
        ),
    )

    val einladung = MeineEinladung(
        id = "e1", teamId = "t3", teamName = "Herren",
        eingeladenVon = "Thomas Fischer",
        createdAt = "2026-11-01T09:00:00Z", expiresAt = "2026-12-01T09:00:00Z",
        wechselVon = "Herren 40", annehmenMoeglich = true,
    )

    val kandidaten = listOf(
        Kandidat("k1", "Lena", "Krause", "LK13,1", mannschaftInteresse = true, eingeladen = true),
        Kandidat("k2", "Nina", "Albrecht", "LK18,0", mannschaftInteresse = true),
        Kandidat("k3", "Eva", "Schulz", "LK10,4", aktuelleMannschaft = "Damen 40"),
        Kandidat("k4", "Maria", "Vogel", null),
    )
}

/**
 * Der Bildschirm Mannschaft ohne Geraet (Robolectric + Roborazzi), hell und
 * dunkel: die Sicht des Mannschaftsfuehrers und die eines Spielers mit
 * Einladung. `./gradlew :app:recordRoborazziLokalDebug` schreibt die PNGs nach apps/android/docs.
 */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w412dp-h1400dp-xxhdpi")
class MannschaftBildfotoTest {
    @get:Rule val compose = createComposeRule()

    private fun foto(name: String, dunkel: Boolean, inhalt: @Composable () -> Unit) {
        compose.setContent { TcmTheme(dunkel = dunkel) { inhalt() } }
        compose.onRoot().captureRoboImage("../docs/$name.png")
    }

    @Composable
    private fun Seite(m: MeineMannschaft?, einladungen: List<MeineEinladung> = emptyList(), annehmenOffen: String? = null) =
        MannschaftAnsicht(
            zustand = MannschaftZustand(mannschaft = Abschnitt.Wert(m), einladungen = Abschnitt.Wert(einladungen), laedt = false),
            handlungen = MannschaftHandlungen(),
            annehmenOffen = annehmenOffen,
        )

    @Test
    fun mfHell() = foto("mannschaft-mf-hell", dunkel = false) { Seite(MannschaftBeispiel.mf) }

    @Test
    fun mfDunkel() = foto("mannschaft-mf-dunkel", dunkel = true) { Seite(MannschaftBeispiel.mf) }

    @Test
    fun spielerEinladungHell() = foto("mannschaft-einladung-hell", dunkel = false) {
        Seite(MannschaftBeispiel.spieler, listOf(MannschaftBeispiel.einladung))
    }

    @Test
    fun spielerEinladungDunkel() = foto("mannschaft-einladung-dunkel", dunkel = true) {
        Seite(MannschaftBeispiel.spieler, listOf(MannschaftBeispiel.einladung))
    }

    /** Nach "Annehmen": die Freigabe der Nummer und "Beitreten". */
    @Test
    fun annehmen() = foto("mannschaft-annehmen-hell", dunkel = false) {
        Seite(MannschaftBeispiel.spieler, listOf(MannschaftBeispiel.einladung), annehmenOffen = "e1")
    }

    /** Ein MF kann nicht wechseln: Annehmen ist gesperrt, Ablehnen geht. */
    @Test
    fun mfGesperrt() = foto("mannschaft-gesperrt-dunkel", dunkel = true) {
        Seite(
            MannschaftBeispiel.mf,
            listOf(MannschaftBeispiel.einladung.copy(teamName = "Damen 40", wechselVon = "Damen 30", annehmenMoeglich = false)),
        )
    }

    @Test
    @Config(qualifiers = "w412dp-h915dp-xxhdpi")
    fun sucheHell() = foto("mannschaft-suche-hell", dunkel = false) {
        SpielerSucheInhalt("", {}, MannschaftBeispiel.kandidaten, null, gesperrt = false, einladen = {}, zu = {})
    }

    @Test
    @Config(qualifiers = "w412dp-h915dp-xxhdpi")
    fun sucheDunkel() = foto("mannschaft-suche-dunkel", dunkel = true) {
        SpielerSucheInhalt("", {}, MannschaftBeispiel.kandidaten, null, gesperrt = false, einladen = {}, zu = {})
    }
}
