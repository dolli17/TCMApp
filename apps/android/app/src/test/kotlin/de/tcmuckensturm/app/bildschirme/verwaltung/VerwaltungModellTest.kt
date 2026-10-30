package de.tcmuckensturm.app.bildschirme.verwaltung

import de.tcmuckensturm.app.daten.PlatzErgebnis
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

/** Laden, Segment und Blatt der Verwaltung gegen die Attrappe - ohne Netz. */
class VerwaltungModellTest {
    private fun TestScope.geladen(quelle: VerwaltungAttrappe = VerwaltungAttrappe()): VerwaltungModell {
        val m = VerwaltungModell(quelle, uhr = { VerwaltungAttrappe.JETZT }, bereich = backgroundScope)
        backgroundScope.launch {
            m.ladeIch()
            m.laden()
        }
        runCurrent()
        return m
    }

    @Test
    fun laedtPlaetzeSerienUndZustand() = runTest {
        val m = geladen()
        assertFalse(m.laedt)
        assertNull(m.fehler)
        val s = m.stand!!
        assertEquals(5, s.plaetze.size)
        assertEquals(4, s.aktivePlaetze.size)
        assertEquals(3, s.serien.size)
        // Platz 2 gesperrt, Platz 3 Serie; die Buchung auf Platz 1 zaehlt nicht.
        assertEquals(setOf("p2", "p3", "p5"), s.zustand.keys)
        assertEquals("gesperrt bis 14:00", s.zustand["p2"]?.text)
        assertEquals("Serie bis 13:00", s.zustand["p3"]?.text)
        assertEquals("Paula", m.ich?.firstName)
    }

    @Test
    fun ladefehlerStehtObenUndErneutVersuchenLaedtNach() = runTest {
        val q = VerwaltungAttrappe(fehler = "Die Plätze konnten nicht geladen werden. (Keine Verbindung zum Server.)")
        val m = geladen(q)
        assertEquals("Die Plätze konnten nicht geladen werden. (Keine Verbindung zum Server.)", m.fehler)
        assertNull(m.stand)
        assertFalse(m.laedt)
        m.vonHand()
        runCurrent()
        assertEquals(2, q.ladeZaehler)
        assertFalse(m.aktualisiert)
    }

    @Test
    fun segmentWechselNimmtDieMeldungMit() = runTest {
        val m = geladen()
        m.blatt = VerwaltungBlatt.Sperren
        m.erledigt(PlatzErgebnis(true, "1 Platz gesperrt."))
        runCurrent()
        assertNull(m.blatt)
        assertEquals("1 Platz gesperrt.", m.meldung?.meldung)
        // Gleiches Segment: Meldung bleibt.
        m.waehle(VerwaltungAnsicht.PLAETZE)
        assertNotNull(m.meldung)
        m.waehle(VerwaltungAnsicht.SERIEN)
        assertEquals(VerwaltungAnsicht.SERIEN, m.ansicht)
        assertNull(m.meldung)
    }

    @Test
    fun erledigtLaedtNeu() = runTest {
        val q = VerwaltungAttrappe()
        val m = geladen(q)
        m.erledigt(PlatzErgebnis(true, "Serie beendet. Es standen keine Termine mehr aus."))
        runCurrent()
        assertEquals(2, q.ladeZaehler)
    }
}
