package de.tcmuckensturm.app.daten

import de.tcmuckensturm.kern.DbFehler
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * mein_zugang() und ich() gegen nachgebaute Antworten: was gefragt wird, wie
 * die Zeilen gelesen werden und was bei Fehlern herauskommt.
 */
class ZugangsdatenTest : ServerTest() {
    private val daten by lazy { Zugangsdaten(client) }

    @Test
    fun meinZugangLiestDieZeile() = runBlocking {
        server.rpc("mein_zugang", """[{"zugang":false,"grund":"ausgetreten","onboarding_offen":false,"neu":1}]""")
        assertEquals(Zugang(zugang = false, grund = "ausgetreten"), daten.meinZugang())

        val anfrage = server.rpcAnfrage("mein_zugang")
        assertEquals("POST", anfrage.methode)
        assertEquals("{}", anfrage.parameter)
        // Ohne Sitzung fragt der Client mit dem oeffentlichen Schluessel.
        assertEquals(Serverattrappe.SCHLUESSEL, anfrage.kopf["apikey"])
        assertEquals("Bearer ${Serverattrappe.SCHLUESSEL}", anfrage.kopf["Authorization"])
    }

    @Test
    fun meinZugangOffenesOnboarding() = runBlocking {
        server.rpc("mein_zugang", """[{"zugang":true,"grund":null,"onboarding_offen":true}]""")
        assertEquals(Zugang(zugang = true, onboardingOffen = true), daten.meinZugang())
    }

    /** Kiosk-Konto ohne Mitglied: keine Zeile heisst Zugang ja, Onboarding nein. */
    @Test
    fun meinZugangOhneZeile() = runBlocking {
        server.rpc("mein_zugang", "[]")
        assertEquals(Zugang(), daten.meinZugang())
    }

    /** Faellt das Lesen aus, entscheidet die Weiche ohne Zeile (StartLogik) - es wirft nichts. */
    @Test
    fun meinZugangBeiFehlernNull() = runBlocking {
        server.rpc("mein_zugang", Antwort.SITZUNG_ABGELAUFEN)
        assertNull(daten.meinZugang())
        server.rpc("mein_zugang", "kein json")
        assertNull(daten.meinZugang())
        server.ohneNetz = true
        assertNull(daten.meinZugang())
    }

    @Test
    fun ichLiestDieZeile() = runBlocking {
        server.rpc(
            "ich",
            """
            [{"member_id":"m1","first_name":"Max","last_name":"Muster","roles":["vorstand","platzwart"],"admin":false,
              "platz_rechte":true,"kiosk":false,"zugang":true,"grund":null,"onboarding_offen":false}]
            """,
        )
        val ich = daten.ich()!!
        assertEquals("m1", ich.memberId)
        assertEquals(listOf("vorstand", "platzwart"), ich.roles)
        assertEquals(true, ich.platzRechte)
        assertEquals(MeinName("Max", "Muster"), ich.name)

        server.rpc("ich", "[]")
        assertNull(daten.ich())
    }

    @Test
    fun ichWirftDenUebersetztenSatz() = runBlocking {
        suspend fun meldung() = meldung { daten.ich() }

        server.rpc("ich", Antwort.dbFehler("permission denied for function ich", code = "42501", status = 403))
        assertEquals("Dafür fehlt dir die Berechtigung.", meldung())

        // Abgelaufene Sitzung: PostgREST meldet englisch - angezeigt wird der allgemeine Satz.
        server.rpc("ich", Antwort.SITZUNG_ABGELAUFEN)
        assertEquals(DbFehler.ALLGEMEINER_FEHLER_TEXT, meldung())

        // Eine Antwort, die sich nicht lesen laesst (Pflichtfeld fehlt, kein JSON): kein englischer Rohtext.
        server.rpc("ich", """{"unerwartet":true}""")
        assertEquals(DbFehler.ALLGEMEINER_FEHLER_TEXT, meldung())

        server.ohneNetz = true
        assertEquals(DbFehler.VERBINDUNGSFEHLER_TEXT, meldung())
        assertTrue(server.rpcs("ich").size == 4)
    }
}
