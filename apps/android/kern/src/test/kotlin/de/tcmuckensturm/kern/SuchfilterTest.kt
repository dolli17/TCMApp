package de.tcmuckensturm.kern

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class SuchfilterTest {
    @Test
    fun `ohne Einschraenkung gehen nur nulls an die Datenbank`() {
        val f = Suchfilter.OFFEN
        assertFalse(f.eingeschraenkt)
        assertNull(f.lkVon)
        assertNull(f.lkBis)
        assertNull(f.fuer.code)
        assertNull(f.zusatz)
        assertEquals("LK 1–25", f.bereichText)
    }

    @Test
    fun `Grenzen 1 und 25 werden zu null, alles dazwischen in Zehnteln genau`() {
        val f = Suchfilter(von = 101, bis = 165, fuer = SuchFuer.HERREN)
        assertTrue(f.eingeschraenkt)
        assertEquals(10.1, f.lkVon)
        assertEquals(16.5, f.lkBis)
        assertEquals("male", f.fuer.code)
        assertNull(Suchfilter(von = 10, bis = 250).lkVon)
        assertNull(Suchfilter(von = 10, bis = 250).lkBis)
        assertEquals(24.9, Suchfilter(bis = 249).lkBis)
    }

    @Test
    fun `Zusatz fuer offene Spiele wie im Vertrag`() {
        assertEquals("LK 10–16 · Herren", Suchfilter(100, 160, SuchFuer.HERREN).zusatz)
        assertEquals("bis LK 16", Suchfilter(bis = 160).zusatz)
        assertEquals("ab LK 10", Suchfilter(von = 100).zusatz)
        assertEquals("Damen", Suchfilter(fuer = SuchFuer.DAMEN).zusatz)
        assertEquals("LK 10,5–16,5", Suchfilter(105, 165).zusatz)
        assertEquals("LK 12 · Damen", Suchfilter(120, 120, SuchFuer.DAMEN).zusatz)
        assertEquals("ab LK 1,1", Suchfilter(von = 11).zusatz)
    }

    @Test
    fun `von bleibt unter bis und beide in 1 bis 25`() {
        val f = Suchfilter(von = 100, bis = 160)
        assertEquals(160, f.mitVon(170).von)
        assertEquals(100, f.mitBis(90).bis)
        assertEquals(10, f.mitVon(5).von)
        assertEquals(250, f.mitBis(300).bis)
        assertEquals(101, f.mitVon(101).von)
    }

    @Test
    fun `aus den Spalten der Datenbank lesen`() {
        assertEquals(Suchfilter.OFFEN, Suchfilter.aus(null, null, null))
        assertEquals(Suchfilter(100, 160, SuchFuer.HERREN), Suchfilter.aus(10.0, 16.0, "male"))
        assertEquals(Suchfilter(123, 250, SuchFuer.DAMEN), Suchfilter.aus(12.3, null, "female"))
        // Gleitkomma aus JSON: 16.499999 bleibt 16,5
        assertEquals(165, Suchfilter.aus(null, 16.499999, null).bis)
        // Unbekanntes "fuer" zeigt wie alle, vertauschte Grenzen werden sortiert
        assertEquals(SuchFuer.ALLE, Suchfilter.aus(null, null, "diverse").fuer)
        assertEquals(Suchfilter(100, 160), Suchfilter.aus(16.0, 10.0, null))
        // Ausserhalb 1–25 begrenzt
        assertEquals(Suchfilter.OFFEN, Suchfilter.aus(0.5, 30.0, null))
    }

    @Test
    fun `LK als Text mit deutschem Komma`() {
        assertEquals("1", Suchfilter.lkText(10))
        assertEquals("16,5", Suchfilter.lkText(165))
        assertEquals("25", Suchfilter.lkText(250))
        assertEquals(123, Suchfilter.zehntel(12.3))
    }
}
