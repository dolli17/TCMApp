package de.tcmuckensturm.app.daten

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Kader, Einladungen und MF-Funktionen gegen nachgebaute Antworten. */
class MannschaftsdatenServerTest : ServerTest() {
    private val daten by lazy { Mannschaftsdaten(client) }

    @Test
    fun meineMannschaft() = runBlocking {
        server.rpc(
            "meine_mannschaft",
            """
            {"team_id":"t1","name":"Herren 40","ich_bin_mf":true,"telefon_sichtbar":true,
             "kader":[{"member_id":"m1","first_name":"Max","last_name":"Muster","tennis_lk":"12.3","is_team_captain":true,"telefon":"0170 1"},
                      {"member_id":"m2","first_name":"Erik","last_name":null}],
             "offene_einladungen":[{"id":"i1","member_id":"m3","first_name":"Jo","created_at":"2026-11-01T10:00:00+00:00",
                                    "expires_at":"2026-11-15T10:00:00+00:00"}],
             "neu":true}
            """,
        )
        val m = daten.meineMannschaft()!!
        assertEquals("Herren 40", m.name)
        assertTrue(m.ichBinMf)
        assertEquals(listOf("m1", "m2"), m.kader.map { it.memberId })
        assertTrue(m.kader[0].isTeamCaptain)
        assertFalse(m.kader[1].isTeamCaptain)
        assertNull(m.kader[1].telefon)
        assertEquals("m3", m.offeneEinladungen.single().memberId)
        assertEquals("{}", server.rpcAnfrage("meine_mannschaft").parameter)
    }

    /** Ohne Mannschaft antwortet die RPC mit null - das ist kein Fehler. */
    @Test
    fun ohneMannschaft() = runBlocking {
        server.rpc("meine_mannschaft", "null")
        assertNull(daten.meineMannschaft())
        server.rpc("meine_mannschaft", Antwort(200, ""))
        assertNull(daten.meineMannschaft())
        // Nur die Kennung ist Pflicht.
        server.rpc("meine_mannschaft", """{"team_id":"t1"}""")
        assertEquals(MeineMannschaft(teamId = "t1"), daten.meineMannschaft())
    }

    @Test
    fun einladungenUndKandidaten() = runBlocking {
        server.rpc(
            "meine_mannschaft_einladungen",
            """
            [{"id":"i1","team_id":"t2","team_name":"Herren 30","eingeladen_von":"Erik Beispiel",
              "wechsel_von":"Herren 40","annehmen_moeglich":false,"hinweis":"Du bist Mannschaftsführer der Herren 40."},
             {"id":"i2","team_id":"t3"}]
            """,
        )
        server.rpc(
            "mannschaft_kandidaten",
            """
            [{"member_id":"m5","first_name":"Jo","last_name":"Neu","tennis_lk":"15.0","mannschaft_interesse":true,
              "aktuelle_mannschaft":null,"eingeladen":true},{"member_id":"m6"}]
            """,
        )
        val einladungen = daten.einladungen()
        assertFalse(einladungen[0].annehmenMoeglich)
        assertEquals("Herren 40", einladungen[0].wechselVon)
        // Aeltere Datenbank ohne die Spalte: annehmen geht.
        assertTrue(einladungen[1].annehmenMoeglich)
        assertEquals("", einladungen[1].teamName)

        val kandidaten = daten.kandidaten("  Jo ")
        assertTrue(kandidaten[0].eingeladen)
        assertFalse(kandidaten[1].mannschaftInteresse)
        // Leere Suche heisst: kein Parameter, die ersten 50.
        daten.kandidaten("   ")
        assertEquals(listOf("""{"p_suche":"Jo"}""", "{}"), server.rpcs("mannschaft_kandidaten").map { it.parameter })
    }

    @Test
    fun schreibenSchicktDieParameter() = runBlocking {
        server.sonst = { Antwort.LEER }
        assertEquals(Ergebnis.erfolg("Eingeladen."), daten.einladen("m5", "Eingeladen."))
        assertEquals(Ergebnis.erfolg("Zurückgezogen."), daten.zurueckziehen("i1", "Zurückgezogen."))
        assertEquals(Ergebnis.erfolg("Angenommen."), daten.beantworten("i1", annehmen = true, telefonSichtbar = true, erfolg = "Angenommen."))
        // Wer ablehnt, gibt auch keine Nummer frei - egal, wie der Schalter stand.
        assertEquals(Ergebnis.erfolg("Abgelehnt."), daten.beantworten("i2", annehmen = false, telefonSichtbar = true, erfolg = "Abgelehnt."))
        assertEquals(Ergebnis.erfolg("Ausgetragen."), daten.austragen("m2", "Ausgetragen."))
        assertEquals(Ergebnis.erfolg("Sichtbar."), daten.telefonSichtbar(true, "Sichtbar."))

        assertEquals("""{"p_member_id":"m5"}""", server.rpcAnfrage("mannschaft_einladen").parameter)
        assertEquals("""{"p_invitation_id":"i1"}""", server.rpcAnfrage("mannschaft_einladung_zurueckziehen").parameter)
        assertEquals(
            listOf(
                """{"p_annehmen":true,"p_invitation_id":"i1","p_telefon_sichtbar":true}""",
                """{"p_annehmen":false,"p_invitation_id":"i2","p_telefon_sichtbar":false}""",
            ),
            server.rpcs("mannschaft_einladung_beantworten").map { it.parameter },
        )
        assertEquals("""{"p_member_id":"m2"}""", server.rpcAnfrage("mannschaft_austragen").parameter)
        assertEquals("""{"p_visible":true}""", server.rpcAnfrage("set_team_phone_visible").parameter)
    }

    @Test
    fun fehler() = runBlocking {
        // Der Satz der RPC geht unveraendert durch, der Constraint wird uebersetzt.
        server.rpc("mannschaft_einladen", Antwort.dbFehler("Nur der Mannschaftsführer kann einladen.", code = "42501"))
        assertEquals(Ergebnis.fehler("Nur der Mannschaftsführer kann einladen."), daten.einladen("m5", "ok"))
        server.rpc(
            "mannschaft_einladen",
            Antwort.dbFehler("""duplicate key value violates unique constraint "team_invitations_eine_offene"""", code = "23505", status = 409),
        )
        assertEquals(Ergebnis.fehler("Dieses Mitglied ist schon eingeladen."), daten.einladen("m5", "ok"))
        server.rpc("mannschaft_austragen", Antwort.SITZUNG_ABGELAUFEN)
        assertEquals(Ergebnis.fehler(ALLGEMEIN), daten.austragen("m2", "ok"))

        server.rpc("meine_mannschaft", VERBOTEN)
        assertEquals(KEIN_RECHT, meldung { daten.meineMannschaft() })
        server.rpc("meine_mannschaft", """{"name":"ohne Kennung"}""")
        assertEquals(ALLGEMEIN, meldung { daten.meineMannschaft() })
        server.rpc("meine_mannschaft_einladungen", VERBOTEN)
        assertEquals(KEIN_RECHT, meldung { daten.einladungen() })

        server.ohneNetz = true
        assertEquals(KEINE_VERBINDUNG, meldung { daten.kandidaten("") })
        assertEquals(Ergebnis.fehler(KEINE_VERBINDUNG), daten.telefonSichtbar(false, "ok"))
        assertEquals(Ergebnis.fehler(KEINE_VERBINDUNG), daten.beantworten("i1", true, false, "ok"))
        assertEquals(Ergebnis.fehler(KEINE_VERBINDUNG), daten.zurueckziehen("i1", "ok"))
    }
}
