package de.tcmuckensturm.app.daten

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Startdaten gegen nachgebaute Antworten: welche RPC mit welchen Parametern
 * gefragt wird, was aus den Zeilen wird und was bei Fehlern passiert. Das
 * Lesen der einzelnen Spalten prueft StartdatenTest.
 */
class StartdatenServerTest : ServerTest() {
    private val daten by lazy { Startdaten(client) }

    @Test
    fun meineBuchungenUndOffeneSpiele() = runBlocking {
        server.rpc(
            "my_bookings",
            """[{"booking_id":"b1","starts_at":"2026-10-29T15:00:00+00:00","ends_at":"2026-10-29T16:00:00+00:00","court_name":"Platz 1"}]""",
        )
        server.rpc(
            "open_matches",
            """[{"booking_id":"o1","starts_at":"2026-10-29T15:00:00+00:00","ends_at":"2026-10-29T16:00:00+00:00","frei":1,"lk_bis":"16.5","fuer":"female"}]""",
        )
        assertEquals("Platz 1", daten.meineBuchungen().single().courtName)
        assertEquals("bis LK 16,5 · Damen", daten.offeneSpiele().single().suchfilter.zusatz)
        assertEquals("{}", server.rpcAnfrage("my_bookings").parameter)
        assertEquals(listOf("my_bookings", "open_matches"), server.gefragt)
    }

    @Test
    fun tagesplanFragtDenTag() = runBlocking {
        server.rpc(
            "day_schedule",
            """[{"booking_id":"t1","court_id":"c1","starts_at":"2026-10-29T15:00:00+00:00","ends_at":"2026-10-29T16:00:00+00:00","kind":"booking"}]""",
        )
        assertEquals("c1", daten.tagesplan("2026-10-29").single().courtId)
        assertEquals("""{"p_date":"2026-10-29"}""", server.rpcAnfrage("day_schedule").parameter)
    }

    @Test
    fun einstellungenArtenPlaetze() = runBlocking {
        server.rpc("booking_settings", """[{"opening_time":"08:00:00","closing_time":"21:00:00","slot_minutes":30}]""")
        server.rpc("booking_types_aktiv", """[{"code":"einzel","name":"Einzel"},{"code":"doppel","name":"Doppel"}]""")
        server.rpc("courts_aktiv", """[{"id":"c1","name":"Platz 1","short_name":"P1","position":1}]""")
        assertEquals("21:00:00", daten.buchungseinstellungen()?.closingTime)
        assertEquals(listOf("einzel", "doppel"), daten.buchungsarten().map { it.code })
        assertEquals("P1", daten.plaetze().single().shortName)
        // Home und Plaetze wollen nur die Arten zum Buchen, nicht die der Sperrungen.
        assertEquals("""{"p_applies_to":"booking"}""", server.rpcAnfrage("booking_types_aktiv").parameter)

        // Ohne Zeile gibt es keine Einstellungen.
        server.rpc("booking_settings", "[]")
        assertNull(daten.buchungseinstellungen())
    }

    @Test
    fun getraenkeDienstVeranstaltungen() = runBlocking {
        server.rpc("my_drink_purchases", """[{"id":"g1","item_name":"Wasser","total_cents":300}]""")
        server.rpc("my_work_duty", """[{"year":2026,"required_hours":"10","completed_hours":2.5}]""")
        server.rpc("events_fuer_mitglied", """[{"id":"e1","title":"Sommerfest","starts_at":"2026-07-04T16:00:00+00:00","work_hours":"1.5"}]""")
        assertEquals(300, daten.eigeneGetraenke().single().totalCents)
        assertEquals(10.0, daten.arbeitsdienst()!!.requiredHours!!, 0.0)
        assertEquals(1.5, daten.veranstaltungen().single().workHours!!, 0.0)

        server.rpc("my_work_duty", "[]")
        assertNull(daten.arbeitsdienst())
    }

    @Test
    fun benachrichtigungen() = runBlocking {
        server.rpc(
            "my_notifications",
            """[{"id":"n1","kind":"booking_cancelled","title":"Storniert","created_at":"2026-10-29T10:00:00+00:00","read_at":null}]""",
        )
        server.rpc("mark_notifications_read", "3")
        server.rpc("my_unread_notification_count", "7")

        assertEquals("Storniert", daten.benachrichtigungen().single().title)
        daten.benachrichtigungen(limit = 5)
        assertEquals(listOf("""{"p_limit":30}""", """{"p_limit":5}"""), server.rpcs("my_notifications").map { it.parameter })
        assertEquals(3, daten.markiereGelesen())
        // Ohne p_ids: alle.
        assertEquals("{}", server.rpcAnfrage("mark_notifications_read").parameter)
        assertEquals(7, daten.ungelesen())
    }

    /** Die Glocke bleibt bei jedem Fehler leer, statt etwas zu melden. */
    @Test
    fun ungelesenZaehltFehlerAlsNull() = runBlocking {
        server.rpc("my_unread_notification_count", Antwort.SITZUNG_ABGELAUFEN)
        assertEquals(0, daten.ungelesen())
        server.rpc("my_unread_notification_count", "\"viele\"")
        assertEquals(0, daten.ungelesen())
        server.ohneNetz = true
        assertEquals(0, daten.ungelesen())
    }

    @Test
    fun meinName() = runBlocking {
        server.rpc("ich", """[{"member_id":"m1","first_name":"Max","last_name":"Muster"}]""")
        assertEquals(MeinName("Max", "Muster"), daten.meinName())
        // Kiosk: eine Zeile ohne Mitglied.
        server.rpc("ich", """[{"member_id":null,"kiosk":true}]""")
        assertNull(daten.meinName())
        server.rpc("ich", "[]")
        assertNull(daten.meinName())
    }

    /** Jeder lesende Aufruf wirft den uebersetzten Satz, nie den Rohtext. */
    @Test
    fun fehlerWerdenUebersetzt() = runBlocking {
        val aufrufe: Map<String, suspend () -> Any?> = mapOf(
            "my_bookings" to { daten.meineBuchungen() },
            "open_matches" to { daten.offeneSpiele() },
            "day_schedule" to { daten.tagesplan("2026-10-29") },
            "booking_settings" to { daten.buchungseinstellungen() },
            "booking_types_aktiv" to { daten.buchungsarten() },
            "courts_aktiv" to { daten.plaetze() },
            "my_drink_purchases" to { daten.eigeneGetraenke() },
            "my_work_duty" to { daten.arbeitsdienst() },
            "events_fuer_mitglied" to { daten.veranstaltungen() },
            "my_notifications" to { daten.benachrichtigungen() },
            "mark_notifications_read" to { daten.markiereGelesen() },
            "ich" to { daten.meinName() },
        )
        for ((rpc, aufruf) in aufrufe) {
            server.rpc(rpc, VERBOTEN)
            assertEquals(rpc, KEIN_RECHT, meldung(aufruf))
            // Meldungen aus den RPCs sind fuer Menschen geschrieben und gehen unveraendert durch.
            server.rpc(rpc, Antwort.dbFehler("Du bist nicht angemeldet."))
            assertEquals(rpc, "Du bist nicht angemeldet.", meldung(aufruf))
            server.rpc(rpc, Antwort.SITZUNG_ABGELAUFEN)
            assertEquals(rpc, ALLGEMEIN, meldung(aufruf))
            // Ein Serverfehler ohne lesbaren Rumpf (Gateway)
            server.rpc(rpc, Antwort(502, "<html>Bad Gateway</html>"))
            assertEquals(rpc, ALLGEMEIN, meldung(aufruf))
            // Eine Antwort in der falschen Form
            server.rpc(rpc, """{"falsch":"geformt"}""")
            assertEquals(rpc, ALLGEMEIN, meldung(aufruf))
        }
        server.ohneNetz = true
        for ((rpc, aufruf) in aufrufe) assertEquals(rpc, KEINE_VERBINDUNG, meldung(aufruf))
    }
}
