package de.tcmuckensturm.app.daten

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Die FCM-Marke in der Datenbank an- und abmelden (register_push_token, remove_push_token, push_token_aktiv). */
class PushdatenTest : ServerTest() {
    private val daten by lazy { Pushdaten(client) }

    @Test
    fun anmelden() = runBlocking {
        server.rpc("register_push_token", Antwort.LEER)
        assertEquals(Ergebnis.erfolg("Benachrichtigungen sind eingeschaltet."), daten.anmelden("fcm-1", "Pixel von Anna"))
        // Ohne Geraetenamen fehlt der Parameter, statt null oder leer zu sein.
        daten.anmelden("fcm-2", null)
        daten.anmelden("fcm-3", "  ")
        assertEquals(
            listOf(
                """{"p_device_name":"Pixel von Anna","p_platform":"android","p_provider":"fcm","p_token":"fcm-1"}""",
                """{"p_platform":"android","p_provider":"fcm","p_token":"fcm-2"}""",
                """{"p_platform":"android","p_provider":"fcm","p_token":"fcm-3"}""",
            ),
            server.rpcs("register_push_token").map { it.parameter },
        )
    }

    @Test
    fun abmelden() = runBlocking {
        server.rpc("remove_push_token", Antwort.LEER)
        assertEquals(Ergebnis.erfolg("Benachrichtigungen sind ausgeschaltet."), daten.abmelden("fcm-1"))
        assertEquals("""{"p_token":"fcm-1"}""", server.rpcAnfrage("remove_push_token").parameter)
    }

    @Test
    fun aktiv() = runBlocking {
        server.rpc("push_token_aktiv", "true")
        assertTrue(daten.aktiv("fcm-1"))
        server.rpc("push_token_aktiv", "false")
        assertFalse(daten.aktiv("fcm-1"))
        assertEquals("""{"p_token":"fcm-1"}""", server.rpcs("push_token_aktiv").first().parameter)
    }

    /** Ein Fehler steht als Satz im Ergebnis und haelt nichts auf; `aktiv` ist dann einfach false. */
    @Test
    fun fehler() = runBlocking {
        server.rpc("register_push_token", Antwort.dbFehler("Du bist nicht angemeldet."))
        assertEquals(Ergebnis.fehler("Du bist nicht angemeldet."), daten.anmelden("fcm-1", null))
        server.rpc("remove_push_token", Antwort.SITZUNG_ABGELAUFEN)
        assertEquals(Ergebnis.fehler(ALLGEMEIN), daten.abmelden("fcm-1"))
        server.rpc("push_token_aktiv", Antwort.SITZUNG_ABGELAUFEN)
        assertFalse(daten.aktiv("fcm-1"))
        server.rpc("push_token_aktiv", "null")
        assertFalse(daten.aktiv("fcm-1"))

        server.ohneNetz = true
        assertEquals(Ergebnis.fehler(KEINE_VERBINDUNG), daten.anmelden("fcm-1", null))
        assertEquals(Ergebnis.fehler(KEINE_VERBINDUNG), daten.abmelden("fcm-1"))
        assertFalse(daten.aktiv("fcm-1"))
    }
}
