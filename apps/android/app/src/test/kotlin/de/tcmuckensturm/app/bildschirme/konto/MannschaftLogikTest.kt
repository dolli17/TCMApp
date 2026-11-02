package de.tcmuckensturm.app.bildschirme.konto

import de.tcmuckensturm.app.daten.Kandidat
import de.tcmuckensturm.app.daten.MeineEinladung
import de.tcmuckensturm.app.daten.MeineMannschaft
import de.tcmuckensturm.app.daten.SupabaseVerbindung
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

    /** Antworten aus dem lokalen Stack (Migration 20261102190115), wie PostgREST sie liefert. */
    @Test
    fun echteAntwortenDesStacks() {
        val m = MeineMannschaft.aus(EchteAntworten.MEINE_MANNSCHAFT)!!
        assertTrue(m.ichBinMf)
        assertEquals(listOf("Noah", "Peter", "Emma", "Frieda"), m.kader.map { it.firstName })
        assertEquals("0171 555001", m.kader[1].telefon)
        assertEquals("eingeladen am 02.11. · gültig bis 02.12.", MannschaftLogik.offeneEinladungZeile(m.offeneEinladungen.first()))

        val e = SupabaseVerbindung.json.decodeFromString<List<MeineEinladung>>(EchteAntworten.EINLADUNGEN).single()
        assertEquals("Herren 30", e.teamName)
        assertNull(MannschaftLogik.einladungHinweis(e))
        assertEquals("Noah Brandt lädt dich ein · gültig bis 02.12.", MannschaftLogik.einladungZeile(e))

        val k = SupabaseVerbindung.json.decodeFromString<List<Kandidat>>(EchteAntworten.KANDIDATEN)
        // Die Datenbank speichert die LK ohne "LK"; die App zeigt sie wie im Konto.
        assertEquals("LK10,0", MannschaftLogik.kandidatZeile(k[0]))
        assertEquals(listOf("eingeladen", "Interesse"), MannschaftLogik.kandidatMarken(k[0]))
    }
}

object EchteAntworten {
    const val MEINE_MANNSCHAFT = """{"name": "Herren 30", "kader": [{"telefon": null, "last_name": "Brandt", "member_id": "e2e00000-0000-4000-8000-000000000002", "tennis_lk": null, "first_name": "Noah", "is_team_captain": true}, {"telefon": "0171 555001", "last_name": "Becker", "member_id": "c42f6eac-8ce9-99e3-25f5-49d453dbace9", "tennis_lk": null, "first_name": "Peter", "is_team_captain": false}, {"telefon": "0171 555002", "last_name": "Haas", "member_id": "2e74bb73-be91-e286-9861-0cc97525f6e1", "tennis_lk": null, "first_name": "Emma", "is_team_captain": false}, {"telefon": null, "last_name": "Peters", "member_id": "4a3aa298-807f-2dad-a1a1-4f11def1c82e", "tennis_lk": null, "first_name": "Frieda", "is_team_captain": false}], "team_id": "49d1d689-84e2-4552-b67f-077438d2ea5a", "ich_bin_mf": true, "telefon_sichtbar": false, "offene_einladungen": [{"id": "5c11d753-2a30-4904-8cce-4d459d080f70", "last_name": "Neumitglied", "member_id": "e2e00000-0000-4000-8000-000000000004", "created_at": "2026-11-02T19:33:54.130154+00:00", "expires_at": "2026-12-02T19:33:54.130154+00:00", "first_name": "Nora"}]}"""

    const val EINLADUNGEN = """[{"id":"8cdbaa14-0cb0-496d-a427-1cabf7ace550","team_id":"49d1d689-84e2-4552-b67f-077438d2ea5a","team_name":"Herren 30","eingeladen_von":"Noah Brandt","created_at":"2026-11-02T19:33:53.34776+00:00","expires_at":"2026-12-02T19:33:53.34776+00:00","wechsel_von":null,"annehmen_moeglich":true,"hinweis":null}]"""

    const val KANDIDATEN = """[{"member_id":"25c31169-2299-a28e-c06a-d4d6555fdcd6","first_name":"Christian","last_name":"Bauer","tennis_lk":"10,0","mannschaft_interesse":true,"aktuelle_mannschaft":null,"eingeladen":true}]"""
}
