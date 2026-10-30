package de.tcmuckensturm.app.widgets

import de.tcmuckensturm.app.daten.AktiverPlatz
import de.tcmuckensturm.app.daten.Buchungsart
import de.tcmuckensturm.app.daten.Buchungseinstellungen
import de.tcmuckensturm.app.daten.MeineBuchung
import de.tcmuckensturm.app.daten.TagesBelegung
import de.tcmuckensturm.app.start.StartZiel
import de.tcmuckensturm.app.widgets.WidgetBeispiel.JETZT
import de.tcmuckensturm.kern.MitgliedEvent
import de.tcmuckensturm.kern.ZugangsGrund
import java.io.File
import java.nio.file.Files
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Ablage, Laden und ein Lauf der WidgetArbeit - gegen eine Attrappe, ohne Netz. */
class WidgetLadenTest {
    private val ordner: File = Files.createTempDirectory("widget-test").toFile()
    private val datei = File(ordner, WidgetAblage.DATEINAME)

    @After
    fun aufraeumen() {
        ordner.deleteRecursively()
    }

    /** Liefert, was eingestellt ist; `kaputt` wirft bei den genannten Aufrufen. */
    private class Attrappe(
        var angemeldet: Boolean = true,
        var zugang: StartZiel = StartZiel.Tabs,
        val kaputt: Set<String> = emptySet(),
    ) : WidgetQuelle {
        var aufrufe = 0

        private fun <T> wert(name: String, w: T): T {
            aufrufe += 1
            if (name in kaputt) error("kein Netz")
            return w
        }

        override suspend fun angemeldet() = wert("angemeldet", angemeldet)

        override suspend fun zugang() = wert("zugang", zugang)

        override suspend fun meineBuchungen() = wert(
            "meineBuchungen",
            listOf(MeineBuchung("b1", "2026-09-28T16:00:00Z", "2026-09-28T17:00:00Z", courtName = "Platz 1", binBucher = true)),
        )

        override suspend fun plaetze() = wert("plaetze", listOf(AktiverPlatz("c1", "Platz 1")))

        override suspend fun tagesplan(tag: String) = wert("tagesplan", emptyList<TagesBelegung>())

        override suspend fun buchungseinstellungen(): Buchungseinstellungen? = wert("buchungseinstellungen", null)

        override suspend fun buchungsarten() = wert("buchungsarten", listOf(Buchungsart("einzel", durationMinutes = 90)))

        override suspend fun veranstaltungen() = wert(
            "veranstaltungen",
            listOf(MitgliedEvent(id = "e1", status = "published", title = "Fest", startsAt = "2026-10-02T17:00:00Z")),
        )
    }

    @Test
    fun ablage() = runTest {
        val ablage = WidgetAblage(datei)
        assertNull(ablage.lesen())

        val s = WidgetBeispiel.schnappschuss()
        ablage.speichern(s)
        assertEquals(s, ablage.lesen())
        assertEquals(s, WidgetAblage(datei).lesen())
        assertEquals(s, ablage.stand.value)

        // Ein Teil fehlt beim naechsten Laden: der alte bleibt.
        val gesamt = ablage.speichern(WidgetSchnappschuss(stand = JETZT, termine = null, plan = null, veranstaltungen = emptyList()))
        assertEquals(s.termine, gesamt.termine)
        assertEquals(emptyList<WidgetVeranstaltung>(), gesamt.veranstaltungen)
        assertEquals(gesamt, WidgetAblage(datei).lesen())
        assertFalse("keine Zwischendatei", File(ordner, "${WidgetAblage.DATEINAME}.neu").exists())

        ablage.loeschen()
        assertNull(ablage.lesen())
        assertFalse(datei.exists())
        assertNull(ablage.stand.value)
    }

    @Test
    fun kaputteDateiGiltAlsLeer() = runTest {
        datei.writeText("kaputt")
        assertNull(WidgetAblage(datei).lesen())
    }

    @Test
    fun ladenWieHome() = runTest {
        val e = WidgetLaden.laden(Attrappe(), JETZT)
        val s = (e as WidgetLaden.Ergebnis.Geladen).schnappschuss
        assertEquals(JETZT, s.stand)
        assertEquals(listOf("b1"), s.termine?.map { it.id })
        // Ohne booking_settings die Rueckfaelle von Home, Dauer der ersten Buchungsart
        assertEquals("2026-09-28", s.plan?.tag)
        assertEquals(480, s.plan?.oeffnung)
        assertEquals(90, s.plan?.dauer)
        assertEquals(listOf("e1"), s.veranstaltungen?.map { it.id })
    }

    @Test
    fun ohneEineQuelleFehltNurDerTeil() = runTest {
        val s = (WidgetLaden.laden(Attrappe(kaputt = setOf("tagesplan")), JETZT) as WidgetLaden.Ergebnis.Geladen).schnappschuss
        assertNull("vier Quellen, fehlt eine, fehlt der Plan", s.plan)
        assertNotNull(s.termine)
        assertNotNull(s.veranstaltungen)
    }

    @Test
    fun ohneSitzungOderZugangAbgemeldet() = runTest {
        assertEquals(WidgetLaden.Ergebnis.Abgemeldet, WidgetLaden.laden(Attrappe(angemeldet = false), JETZT))
        assertEquals(
            WidgetLaden.Ergebnis.Abgemeldet,
            WidgetLaden.laden(Attrappe(zugang = StartZiel.KeinZugang(ZugangsGrund.AUSGETRETEN)), JETZT),
        )
        // Faellt mein_zugang aus, geht es weiter wie in der StartLogik
        assertTrue(WidgetLaden.laden(Attrappe(kaputt = setOf("zugang")), JETZT) is WidgetLaden.Ergebnis.Geladen)
    }

    @Test
    fun nichtsGingIstEinFehler() = runTest {
        val alles = setOf("meineBuchungen", "plaetze", "veranstaltungen")
        assertEquals(WidgetLaden.Ergebnis.Fehler, WidgetLaden.laden(Attrappe(kaputt = alles), JETZT))
        assertEquals(WidgetLaden.Ergebnis.Fehler, WidgetLaden.laden(Attrappe(kaputt = setOf("angemeldet")), JETZT))
    }

    @Test
    fun laufLaedtUndPlant() = runTest {
        val ablage = WidgetAblage(datei)
        val lauf = WidgetLaden.lauf(ablage, Attrappe(), JETZT)
        assertEquals(JETZT, lauf.schnappschuss?.stand)
        assertEquals(lauf.schnappschuss, ablage.lesen())
        // Der Takt (14:30) kommt vor dem Ende des Spiels (19:01)
        assertEquals(WidgetBeispiel.berlin("14:30"), lauf.naechster)
    }

    @Test
    fun laufNachFrischemAblegenOhneNetz() = runTest {
        val ablage = WidgetAblage(datei)
        ablage.speichern(WidgetBeispiel.schnappschuss())
        val quelle = Attrappe()
        val lauf = WidgetLaden.lauf(ablage, quelle, JETZT.plusSeconds(60))
        assertEquals("gerade erst abgelegt: nicht noch einmal laden", 0, quelle.aufrufe)
        assertEquals(WidgetBeispiel.schnappschuss(), lauf.schnappschuss)
        assertNotNull(lauf.naechster)
    }

    @Test
    fun laufBeiFehlerBehaeltDenAlten() = runTest {
        val ablage = WidgetAblage(datei)
        val alt = ablage.speichern(WidgetBeispiel.schnappschuss())
        val spaeter = JETZT.plusSeconds(3600)
        val lauf = WidgetLaden.lauf(ablage, Attrappe(kaputt = setOf("angemeldet")), spaeter)
        assertEquals(alt, lauf.schnappschuss)
        assertNotNull(lauf.naechster)
    }

    @Test
    fun laufOhneSitzungLoeschtUndPlantNichts() = runTest {
        val ablage = WidgetAblage(datei)
        ablage.speichern(WidgetBeispiel.schnappschuss())
        val lauf = WidgetLaden.lauf(ablage, Attrappe(angemeldet = false), JETZT.plusSeconds(3600))
        assertNull(lauf.schnappschuss)
        assertNull(lauf.naechster)
        assertFalse(datei.exists())
        // Ohne Konfiguration (keine Sitzung in der App): nur zeigen, was liegt
        assertEquals(WidgetLaden.Lauf(null, null), WidgetLaden.lauf(ablage, null, JETZT))
    }
}
