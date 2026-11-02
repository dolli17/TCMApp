package de.tcmuckensturm.app.bildschirme.konto

import de.tcmuckensturm.app.daten.Kandidat
import de.tcmuckensturm.app.daten.MeineEinladung
import de.tcmuckensturm.app.daten.MeineMannschaft
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MannschaftLogikTest {
    private val mf = MannschaftBeispiel.mf
    private val spieler = MannschaftBeispiel.spieler
    private val einladung = MannschaftBeispiel.einladung

    @Test
    fun eintragNurMitMannschaftOderEinladung() {
        assertFalse(MannschaftLogik.zeigeEintrag(null, null))
        assertFalse(MannschaftLogik.zeigeEintrag(null, emptyList()))
        assertTrue(MannschaftLogik.zeigeEintrag(spieler, emptyList()))
        assertTrue(MannschaftLogik.zeigeEintrag(null, listOf(einladung)))
    }

    @Test
    fun eintragUntertitel() {
        assertEquals("Damen 30 · Mannschaftsführer", MannschaftLogik.eintragUntertitel(mf, emptyList()))
        assertEquals("Herren 40 · 1 Einladung", MannschaftLogik.eintragUntertitel(spieler, listOf(einladung)))
        assertEquals("2 Einladungen", MannschaftLogik.eintragUntertitel(null, listOf(einladung, einladung.copy(id = "e2"))))
        assertNull(MannschaftLogik.eintragUntertitel(null, null))
    }

    @Test
    fun kinds() {
        for (k in listOf("team_invited", "team_invitation_answered", "team_removed", "team_left")) {
            assertTrue(k, MannschaftLogik.istMannschaftsNachricht(k))
        }
        assertFalse(MannschaftLogik.istMannschaftsNachricht("booking_cancelled"))
        assertFalse(MannschaftLogik.istMannschaftsNachricht(null))
    }

    @Test
    fun rechte() {
        val ich = mf.kader.first()
        val julia = mf.kader[1]
        assertFalse("Den MF selbst traegt niemand aus", MannschaftLogik.darfAustragen(mf, ich))
        assertTrue(MannschaftLogik.darfAustragen(mf, julia))
        assertFalse("Spieler tragen niemanden aus", MannschaftLogik.darfAustragen(spieler, spieler.kader[2]))
        assertFalse("Ein MF tritt nicht aus", MannschaftLogik.darfAustreten(mf))
        assertTrue(MannschaftLogik.darfAustreten(spieler))
    }

    @Test
    fun zeilen() {
        assertEquals("LK14,5 · Mannschaftsführer", MannschaftLogik.spielerZeile(mf.kader[0]))
        assertEquals("LK9,8", MannschaftLogik.spielerZeile(mf.kader[1]))
        assertNull(MannschaftLogik.spielerZeile(mf.kader[4]))
        assertEquals("LK12,0", MannschaftLogik.lk("12"))
        assertEquals("Unbekannt", MannschaftLogik.name(null, " "))
        assertEquals("Lena Krause", MannschaftLogik.name("Lena", "Krause"))
    }

    @Test
    fun telefon() {
        assertEquals("tel:01701234567", MannschaftLogik.telefonLink("0170 1234567"))
        assertEquals("tel:+497144556677", MannschaftLogik.telefonLink("+49 (7144) 55-66 77"))
        assertNull(MannschaftLogik.telefonLink(null))
        assertNull(MannschaftLogik.telefonLink("–"))
    }

    @Test
    fun datum() {
        // 01.12. 09:00 UTC ist in Berlin 10:00 am selben Tag.
        assertEquals("Thomas Fischer lädt dich ein · gültig bis 01.12.", MannschaftLogik.einladungZeile(einladung))
        assertEquals("eingeladen am 28.10. · gültig bis 27.11.", MannschaftLogik.offeneEinladungZeile(mf.offeneEinladungen.first()))
        assertNull(MannschaftLogik.gueltigBis(null))
        // Spaet abends UTC ist in Berlin schon der naechste Tag.
        assertEquals("gültig bis 02.12.", MannschaftLogik.gueltigBis("2026-12-01T23:30:00Z"))
    }

    @Test
    fun hinweisVorDemAnnehmen() {
        assertEquals("Du wechselst damit aus Herren 40 in Herren.", MannschaftLogik.einladungHinweis(einladung))
        assertNull(MannschaftLogik.einladungHinweis(einladung.copy(wechselVon = null)))
        assertEquals(
            "Du bist Mannschaftsführer von Damen 30. Das kann nur der Vorstand ändern.",
            MannschaftLogik.einladungHinweis(einladung.copy(wechselVon = "Damen 30", annehmenMoeglich = false)),
        )
        // Ein Satz der Datenbank geht vor.
        assertEquals("Anders.", MannschaftLogik.einladungHinweis(einladung.copy(hinweis = "Anders.", annehmenMoeglich = false)))
        assertEquals("Du kannst diese Einladung gerade nicht annehmen.", MannschaftLogik.einladungHinweis(MeineEinladung("x", "t", "X", annehmenMoeglich = false)))
    }

    @Test
    fun kandidaten() {
        val (lena, nina, eva, maria) = MannschaftBeispiel.kandidaten
        assertEquals(listOf("eingeladen", "Interesse"), MannschaftLogik.kandidatMarken(lena))
        assertEquals(listOf("Interesse"), MannschaftLogik.kandidatMarken(nina))
        assertEquals(listOf("spielt in Damen 40"), MannschaftLogik.kandidatMarken(eva))
        assertEquals(emptyList<String>(), MannschaftLogik.kandidatMarken(maria))
        assertEquals("Lena Krause ist eingeladen.", MannschaftLogik.eingeladen(lena))
        assertEquals(emptyList<String>(), MannschaftLogik.kandidatMarken(Kandidat("x", aktuelleMannschaft = " ")))
    }

    @Test
    fun antwortAusDerDatenbank() {
        assertNull(MeineMannschaft.aus("null"))
        assertNull(MeineMannschaft.aus(" "))
        val m = MeineMannschaft.aus(
            """
            {"team_id":"t1","name":"Damen 30","ich_bin_mf":true,"telefon_sichtbar":false,
             "kader":[{"member_id":"m1","first_name":"Anna","last_name":"Meier","tennis_lk":"LK14,5","is_team_captain":true,"telefon":null}],
             "offene_einladungen":[{"id":"i1","member_id":"m9","first_name":"Lena","last_name":"Krause",
               "created_at":"2026-10-28T10:00:00+00:00","expires_at":"2026-11-27T10:00:00+00:00"}],
             "neu":"egal"}
            """.trimIndent(),
        )!!
        assertEquals("Damen 30", m.name)
        assertTrue(m.ichBinMf)
        assertNull(m.kader.single().telefon)
        assertEquals("Lena", m.offeneEinladungen.single().firstName)
        // Fuer Spieler fehlt offene_einladungen
        val s = MeineMannschaft.aus("""{"team_id":"t2","name":"Herren 40","ich_bin_mf":false,"telefon_sichtbar":true,"kader":[]}""")!!
        assertTrue(s.offeneEinladungen.isEmpty())
        assertTrue(s.telefonSichtbar)
    }
}
