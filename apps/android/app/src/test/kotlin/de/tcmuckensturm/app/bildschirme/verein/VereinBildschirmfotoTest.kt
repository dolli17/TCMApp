package de.tcmuckensturm.app.bildschirme.verein

import androidx.compose.runtime.Composable
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.github.takahirom.roborazzi.captureRoboImage
import de.tcmuckensturm.app.bildschirme.nachrichten.GlockeKnopf
import de.tcmuckensturm.app.daten.EigenesGetraenk
import de.tcmuckensturm.app.daten.MeinName
import de.tcmuckensturm.app.daten.Getraenk
import de.tcmuckensturm.app.daten.VeranstaltungDetail
import de.tcmuckensturm.app.daten.Vereinsdaten
import de.tcmuckensturm.app.theme.TcmTheme
import de.tcmuckensturm.kern.MitgliedEvent
import de.tcmuckensturm.kern.Zeit
import java.time.Instant
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Bildschirmfotos des Tabs Verein mit Beispieldaten, ohne Netz und ohne Geraet
 * (wie BildschirmfotoTest). Gezeichnet werden die zustandslosen Seiten
 * (GetraenkeSeite, VeranstaltungenSeite, VeranstaltungSeite); die PNGs nach
 * apps/android/docs schreibt `./gradlew :app:recordRoborazziLokalDebug`.
 */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w412dp-h915dp-xxhdpi")
class VereinBildschirmfotoTest {
    @get:Rule val compose = createComposeRule()

    private fun foto(name: String, dunkel: Boolean, inhalt: @Composable () -> Unit) {
        compose.setContent { TcmTheme(dunkel = dunkel) { inhalt() } }
        compose.onRoot().captureRoboImage("../docs/$name.png")
    }

    // ---- Getraenke ----

    @Composable
    private fun Getraenke(korb: Map<String, Int>, meldung: Meldungstext? = null) = GetraenkeSeite(
        stand = GetraenkeStand(
            inhalt = GetraenkeInhalt(Beispiele.karte, Beispiele.buchungen, stornoFenster = 15),
            laedt = false,
            meldung = meldung,
        ),
        korb = korb,
        jetzt = Beispiele.jetzt,
        kopf = { VereinKopf(VereinReiter.GETRAENKE, Beispiele.name, {}) { GlockeKnopf(2) {} } },
        aktionen = GetraenkeAktionen(),
    )

    @Test
    fun getraenkeHell() = foto("verein-getraenke-hell", dunkel = false) { Getraenke(mapOf("bier" to 2, "apfelschorle" to 1)) }

    @Test
    fun getraenkeDunkel() = foto("verein-getraenke-dunkel", dunkel = true) { Getraenke(mapOf("bier" to 2, "apfelschorle" to 1)) }

    /** Die ganze Seite mit "Zuletzt" und der Meldung nach dem Eintragen. */
    @Test
    @Config(qualifiers = "w412dp-h1600dp-xxhdpi")
    fun getraenkeZuletzt() = foto("verein-getraenke-zuletzt", dunkel = false) {
        Getraenke(emptyMap(), Meldungstext(true, "Eingetragen: 2× Bier, 1× Apfelschorle."))
    }

    // ---- Veranstaltungen ----

    @Composable
    private fun Liste() = VeranstaltungenSeite(
        stand = VeranstaltungenStand(events = Beispiele.events, laedt = false),
        jetzt = Beispiele.jetzt,
        vergangen = false,
        kopf = { VereinKopf(VereinReiter.VERANSTALTUNGEN, Beispiele.name, {}) { GlockeKnopf(2) {} } },
        nachladen = {},
        umschalten = {},
        oeffne = {},
    )

    /** Schrift 200 %: Kopf, Segmente und Karten ohne abgeschnittene Texte. */
    @Test
    @Config(qualifiers = "w412dp-h1800dp-xxhdpi", fontScale = 2f)
    fun veranstaltungenSchrift200() = foto("verein-schrift-200", dunkel = false) { Liste() }

    @Test
    fun veranstaltungenHell() = foto("verein-veranstaltungen-hell", dunkel = false) { Liste() }

    @Test
    fun veranstaltungenDunkel() = foto("verein-veranstaltungen-dunkel", dunkel = true) { Liste() }

    // ---- Detail ----

    @Composable
    private fun Detail(e: MitgliedEvent, wartePlatz: Int? = null, meldung: Vereinsdaten.Ergebnis? = null) = VeranstaltungSeite(
        stand = VeranstaltungStand(detail = VeranstaltungDetail(e, wartePlatz), laedt = false, meldung = meldung),
        jetzt = Beispiele.jetzt,
        aktionen = VeranstaltungAktionen(),
    )

    @Test
    @Config(qualifiers = "w412dp-h1300dp-xxhdpi")
    fun veranstaltungAngemeldetHell() = foto("verein-veranstaltung-hell", dunkel = false) {
        Detail(Beispiele.fest, meldung = Vereinsdaten.Ergebnis(true, "Du bist angemeldet."))
    }

    @Test
    @Config(qualifiers = "w412dp-h1300dp-xxhdpi")
    fun veranstaltungAngemeldetDunkel() = foto("verein-veranstaltung-dunkel", dunkel = true) {
        Detail(Beispiele.fest, meldung = Vereinsdaten.Ergebnis(true, "Du bist angemeldet."))
    }

    @Test
    @Config(qualifiers = "w412dp-h1400dp-xxhdpi")
    fun veranstaltungAnmelden() = foto("verein-veranstaltung-anmelden", dunkel = false) {
        Detail(Beispiele.fest.copy(meinStatus = null, meineBegleitpersonen = null, meineBemerkung = null, meineForderungCents = null))
    }

    @Test
    @Config(qualifiers = "w412dp-h1300dp-xxhdpi")
    fun veranstaltungWarteliste() = foto("verein-veranstaltung-warteliste", dunkel = true) {
        Detail(
            Beispiele.fest.copy(personen = 80, warteliste = 3, meinStatus = "waitlisted", meineForderungCents = null),
            wartePlatz = 2,
        )
    }

    @Test
    fun arbeitsdienst() = foto("verein-arbeitsdienst", dunkel = false) { Detail(Beispiele.dienst) }

    // ---- Erinnerung ----

    @Test
    fun erinnerung() = foto("verein-erinnerung", dunkel = false) {
        Getraenke(mapOf("bier" to 2))
        Erinnerung(VereinLogik.erinnerung(2, 500), spaeter = {}, zuGetraenken = {})
    }
}

/** Beispieldaten wie im Seed (supabase/seed.sql), Stand 20.10.2026. */
private object Beispiele {
    val jetzt: Instant = Zeit.datum("2026-10-20T10:00:00Z")!!

    val name = MeinName("Lucas", "Dollmann")

    val karte = listOf(
        Getraenk("bier", "Bier", "bier", "0,5 l", 250, 1),
        Getraenk("radler", "Radler", "bier", "0,5 l", 250, 2),
        Getraenk("apfelschorle", "Apfelschorle", "alkoholfrei", "0,5 l", 200, 3),
        Getraenk("wasser", "Wasser", "alkoholfrei", "0,75 l", 150, 4),
        Getraenk("kaffee", "Kaffee", "heiss", null, 180, 5),
    )

    val buchungen = listOf(
        EigenesGetraenk("k3", "Bier", 2, 250, 500, "2026-10-20T09:52:00Z", null, "app"),
        EigenesGetraenk("k2", "Wasser", 1, 150, 150, "2026-10-17T16:10:00Z", "2026-10-17T16:11:00Z", "app"),
        EigenesGetraenk("k1", "Apfelschorle", 3, 200, 600, "2026-10-12T15:30:00Z", null, "kiosk"),
    )

    val fest = MitgliedEvent(
        id = "fest",
        kind = "fest",
        status = "published",
        title = "Saisonabschlussfest",
        description = "Wir feiern den Saisonabschluss mit Buffet und Musik im Clubhaus. Getränke gibt es an der Theke.",
        location = "Clubhaus",
        startsAt = "2026-11-06T18:00:00Z",
        endsAt = "2026-11-06T22:30:00Z",
        registrationEnabled = true,
        registrationDeadline = "2026-10-30T22:59:00Z",
        maxParticipants = 80,
        companionsAllowed = true,
        feeCents = 1800,
        personen = 62,
        warteliste = 0,
        meinStatus = "registered",
        meineBegleitpersonen = 1,
        meineBemerkung = "vegetarisch",
        meineForderungCents = 3600,
        meineForderungStatus = "open",
    )

    val dienst = MitgliedEvent(
        id = "dienst",
        kind = "arbeitsdienst",
        status = "published",
        title = "Arbeitsdienst: Plätze winterfest",
        location = "Anlage",
        startsAt = "2026-11-14T08:00:00Z",
        endsAt = "2026-11-14T12:00:00Z",
        registrationEnabled = true,
        registrationDeadline = "2026-11-13T12:00:00Z",
        maxParticipants = 12,
        workHours = 4.0,
        personen = 7,
    )

    val events = listOf(
        fest,
        dienst,
        MitgliedEvent(
            id = "termin",
            kind = "termin",
            status = "published",
            title = "Mitgliederversammlung",
            location = "Clubhaus",
            startsAt = "2026-12-04T18:30:00Z",
            registrationEnabled = false,
        ),
        MitgliedEvent(
            id = "abgesagt",
            kind = "fest",
            status = "cancelled",
            title = "Glühweinabend",
            location = "Terrasse",
            startsAt = "2026-12-11T17:00:00Z",
            registrationEnabled = true,
        ),
    )
}
