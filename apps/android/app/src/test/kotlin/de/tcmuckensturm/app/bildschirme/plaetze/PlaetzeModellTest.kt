package de.tcmuckensturm.app.bildschirme.plaetze

import de.tcmuckensturm.app.daten.Kontingent
import de.tcmuckensturm.app.daten.PlatzErgebnis
import de.tcmuckensturm.kern.Zeit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Laden, Blatt und Aktionen des Tabs Plaetze gegen die Attrappe - ohne Netz.
 * Die Zeit steht auf Donnerstag, 29.10.2026, 15:00 Berlin.
 */
class PlaetzeModellTest {
    private fun modell(quelle: PlatzAttrappe, bereich: CoroutineScope) =
        PlaetzeModell(quelle = quelle, uhr = { PlatzAttrappe.JETZT }, live = false, bereich = bereich)

    private fun TestScope.geladen(quelle: PlatzAttrappe = PlatzAttrappe()): PlaetzeModell {
        val m = modell(quelle, backgroundScope)
        backgroundScope.launch { m.laden() }
        runCurrent()
        return m
    }

    @Test
    fun laedtDenTag() = runTest {
        val m = geladen(PlatzAttrappe(platzrechte = true))
        assertEquals(PlatzAttrappe.TAG, m.datum)
        assertEquals(PlatzAttrappe.TAG, m.geladenFuer)
        assertFalse(m.laedt)
        assertEquals(4, m.plaetze.size)
        assertEquals(6, m.belegung.size)
        assertTrue(m.darfPlaetze)
        assertEquals("ich", m.meineId)
        assertEquals(480, m.oeffnung)
        assertEquals(1260, m.schluss)
        assertEquals(8, m.tage.size)
        assertNull(m.ladeFehler)
    }

    @Test
    fun ladefehlerStehtOben() = runTest {
        val m = geladen(PlatzAttrappe(fehler = "Keine Verbindung zum Server."))
        assertEquals("Keine Verbindung zum Server.", m.ladeFehler)
        assertFalse(m.laedt)
        assertNull(m.geladenFuer)
    }

    @Test
    fun tagWechselnSetztAuswahlZurueck() = runTest {
        val m = geladen()
        m.auswahl = Auswahl("p1", 1020, 1140)
        m.waehleTag("2026-10-30")
        assertNull(m.auswahl)
        assertTrue(m.laedt)
        // Derselbe Tag noch einmal aendert nichts.
        m.waehleTag("2026-10-30")
        assertEquals("2026-10-30", m.datum)
    }

    @Test
    fun ansichtWirdGemerkt() = runTest {
        var gemerkt: Ansicht? = null
        val m = PlaetzeModell(PlatzAttrappe(), uhr = { PlatzAttrappe.JETZT }, live = false, ansichtMerken = { gemerkt = it }, bereich = backgroundScope)
        assertEquals(Ansicht.FREIE_ZEITEN, m.ansicht)
        m.waehleAnsicht(Ansicht.UEBERSICHT)
        assertEquals(Ansicht.UEBERSICHT, gemerkt)
        assertEquals(Ansicht.UEBERSICHT, Ansicht.aus("uebersicht"))
        assertEquals(Ansicht.FREIE_ZEITEN, Ansicht.aus(null))
    }

    @Test
    fun buchenOeffnetDasBlattMitStartzeiten() = runTest {
        val m = geladen()
        m.buchenAuf(m.platz("p1")!!, 17 * 60 + 30)
        val f = m.fenster as Fenster.Buchen
        assertEquals(17 * 60, f.stunde)
        assertEquals(listOf(1020, 1050), f.startzeiten)
        assertEquals(1050, f.start)
        assertEquals("Platz 1", f.platzName)
    }

    @Test
    fun kontingentAusGibtNurDenHinweis() = runTest {
        val quelle = PlatzAttrappe().apply { kontingent = Kontingent(used = 3, allowed = 3) }
        val m = geladen(quelle)
        m.buchenAuf(m.platz("p1")!!, 17 * 60)
        assertNull(m.fenster)
        assertEquals(PlaetzeLogik.KONTINGENT_AUS_TEXT, m.meldung?.text)
        assertFalse(m.meldung!!.ok)
    }

    @Test
    fun gebuchtSchliesstDasBlattUndMarkiert() = runTest {
        val quelle = PlatzAttrappe()
        val m = geladen(quelle)
        m.buchenAuf(m.platz("p2")!!, 17 * 60)
        m.buchen("p2", PlatzAttrappe.TAG, 17 * 60, "einzel", listOf("m1"), emptyList(), sucht = false)
        runCurrent()
        assertNull(m.fenster)
        assertEquals("Platz gebucht.", m.meldung?.text)
        assertEquals(Markierung.Stelle("p2", Zeit.berlinTime(PlatzAttrappe.TAG, 17 * 60)), m.markiert)
        // Berliner Zeit, nicht die des Geraets: 17:00 im Winter ist 16:00 UTC.
        assertEquals("create_booking:p2@2026-10-29T16:00:00.000Z", quelle.geschrieben.last())
        assertFalse(m.laeuft)
    }

    @Test
    fun fehlerBleibtImBlatt() = runTest {
        val m = geladen()
        m.oeffne(PlatzAttrappe.EIGENE)
        m.stornieren("eigen", "")
        runCurrent()
        assertTrue(m.fenster is Fenster.Bestehend)
        assertEquals("Die Spielzeit hat schon begonnen.", m.fensterFehler)
        assertNull(m.meldung)
    }

    @Test
    fun sperrungNurMitPlatzrechtenOeffnen() = runTest {
        val ohne = geladen(PlatzAttrappe(platzrechte = false))
        ohne.oeffne(PlatzAttrappe.SPERRE)
        assertNull(ohne.fenster)
        val mit = geladen(PlatzAttrappe(platzrechte = true))
        mit.oeffne(PlatzAttrappe.SPERRE)
        assertEquals("Platz 3", mit.fenster?.platzName)
    }

    @Test
    fun sperrenFragtErstNach() = runTest {
        val quelle = PlatzAttrappe(platzrechte = true).apply {
            sperrAntwort = PlatzErgebnis(ok = false, meldung = "2 Buchungen liegen in diesem Zeitraum.", kollisionen = 2)
        }
        val m = geladen(quelle)
        m.buchenAuf(m.platz("p1")!!, 17 * 60)
        var kollisionen: Int? = -1
        m.sperren("p1", PlatzAttrappe.TAG, 1020, 1080, "platzpflege", "", verdraengen = false) { kollisionen = it }
        runCurrent()
        assertEquals(2, kollisionen)
        assertTrue(m.fenster is Fenster.Buchen)
        assertNull(m.fensterFehler)

        m.sperren("p1", PlatzAttrappe.TAG, 1020, 1080, "platzpflege", "", verdraengen = true) { kollisionen = it }
        runCurrent()
        assertNull(kollisionen)
        assertNull(m.fenster)
        assertEquals("Gesperrt.", m.meldung?.text)
    }

    @Test
    fun realtimeLaedtHoechstensEinmalJeSekunde() = runTest {
        val quelle = PlatzAttrappe()
        val m = geladen(quelle)
        val vorher = quelle.tagesplanAufrufe
        backgroundScope.launch { m.beobachte(PlatzAttrappe.TAG) }
        runCurrent()
        // Eine Serienanlage: viele Ereignisse in kurzer Zeit.
        repeat(20) { quelle.aenderungen.tryEmit(Unit) }
        runCurrent()
        // Sofort einmal ...
        assertEquals(vorher + 1, quelle.tagesplanAufrufe)
        // ... und nach der Wartezeit einmal fuer alle uebrigen.
        advanceTimeBy(1_500)
        runCurrent()
        assertEquals(vorher + 2, quelle.tagesplanAufrufe)
    }
}
