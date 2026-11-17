package de.tcmuckensturm.app.daten

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Getraenke und Veranstaltungen gegen nachgebaute Antworten. */
class VereinsdatenServerTest : ServerTest() {
    private val daten by lazy { Vereinsdaten(client) }

    private val sommerfest =
        """{"id":"e1","kind":"fest","status":"published","title":"Sommerfest","starts_at":"2026-07-04T16:00:00+00:00",
            "registration_enabled":true,"max_participants":40,"companions_allowed":true,"fee_cents":500,"work_hours":"1.5",
            "personen":40,"warteliste":2,"mein_status":"waitlisted","meine_begleitpersonen":1,
            "meine_forderung_cents":1000,"meine_forderung_status":"open"}"""

    @Test
    fun getraenke() = runBlocking {
        server.rpc(
            "drink_menu",
            """[{"id":"d1","name":"Wasser","category":"Alkoholfrei","description":null,"price_cents":150,"sort_order":1},{"id":"d2"}]""",
        )
        server.rpc("my_drink_purchases", """[{"id":"g1","item_name":"Wasser","quantity":2,"total_cents":300}]""")
        val karte = daten.getraenkekarte()
        assertEquals(150, karte[0].priceCents)
        assertNull(karte[1].priceCents)
        assertEquals(2, daten.eigeneGetraenke().single().quantity)
    }

    /** Ohne Einstellung, bei 0 oder bei einem Fehler gelten 15 Minuten. */
    @Test
    fun stornoFenster() = runBlocking {
        server.rpc("drink_void_window_minutes", "30")
        assertEquals(30, daten.stornoFenster())
        for (antwort in listOf(Antwort(200, "null"), Antwort(200, "0"), Antwort(200, "-5"), Antwort.SITZUNG_ABGELAUFEN, Antwort(200, "\"bald\""))) {
            server.rpc("drink_void_window_minutes", antwort)
            assertEquals(antwort.text, Vereinsdaten.STORNO_FENSTER_VORGABE, daten.stornoFenster())
        }
        server.ohneNetz = true
        assertEquals(15, daten.stornoFenster())
    }

    @Test
    fun buchenUndStornieren() = runBlocking {
        server.rpc("record_drink_purchase", """"g7"""")
        server.rpc("void_drink_purchase", Antwort.LEER)
        assertEquals(Vereinsdaten.Ergebnis(true, "Gebucht."), daten.bucheGetraenk("d1", 3))
        assertEquals(Vereinsdaten.Ergebnis(true, "Zurückgenommen."), daten.storniereGetraenk("g7"))
        assertEquals("""{"p_item_id":"d1","p_quantity":3}""", server.rpcAnfrage("record_drink_purchase").parameter)
        assertEquals("""{"p_purchase_id":"g7","p_reason":"Fehlbuchung"}""", server.rpcAnfrage("void_drink_purchase").parameter)

        server.rpc("void_drink_purchase", Antwort.dbFehler("Die Entnahme lässt sich nicht mehr zurücknehmen."))
        assertEquals(Vereinsdaten.Ergebnis(false, "Die Entnahme lässt sich nicht mehr zurücknehmen."), daten.storniereGetraenk("g7"))
        server.ohneNetz = true
        assertEquals(Vereinsdaten.Ergebnis(false, KEINE_VERBINDUNG), daten.bucheGetraenk("d1", 1))
    }

    @Test
    fun veranstaltungMitWartelistenplatz() = runBlocking {
        server.rpc("events_fuer_mitglied", "[$sommerfest]")
        server.rpc("event_mein_wartelistenplatz", "2")
        val detail = daten.veranstaltung("e1")!!
        assertEquals("Sommerfest", detail.event.title)
        assertEquals(1.5, detail.event.workHours!!, 0.0)
        assertEquals(1000, detail.event.meineForderungCents)
        assertEquals(2, detail.wartePlatz)
        // Die eine Veranstaltung ueber den Filter von PostgREST, der Platz ueber die Kennung.
        assertEquals("eq.e1", server.rpcAnfrage("events_fuer_mitglied").abfrage["id"])
        assertEquals("""{"p_event_id":"e1"}""", server.rpcAnfrage("event_mein_wartelistenplatz").parameter)

        assertEquals("Sommerfest", daten.veranstaltungen().single().title)
    }

    /** Der Platz auf der Warteliste ist Beiwerk: ohne ihn steht die Veranstaltung trotzdem. */
    @Test
    fun veranstaltungOhneWartelistenplatz() = runBlocking {
        server.rpc("events_fuer_mitglied", "[$sommerfest]")
        server.rpc("event_mein_wartelistenplatz", "null")
        assertNull(daten.veranstaltung("e1")!!.wartePlatz)
        server.rpc("event_mein_wartelistenplatz", VERBOTEN)
        assertNull(daten.veranstaltung("e1")!!.wartePlatz)
    }

    @Test
    fun veranstaltungNichtGefundenOderFehler() = runBlocking {
        server.rpc("events_fuer_mitglied", "[]")
        server.rpc("event_mein_wartelistenplatz", "null")
        assertNull(daten.veranstaltung("e9"))

        server.rpc("events_fuer_mitglied", VERBOTEN)
        assertEquals(KEIN_RECHT, meldung { daten.veranstaltung("e1") })
        server.rpc("events_fuer_mitglied", """[{"id":"e1","title":"ohne Beginn"}]""")
        assertEquals(ALLGEMEIN, meldung { daten.veranstaltung("e1") })
        assertEquals(ALLGEMEIN, meldung { daten.veranstaltungen() })
        server.ohneNetz = true
        assertEquals(KEINE_VERBINDUNG, meldung { daten.veranstaltung("e1") })
        assertEquals(KEINE_VERBINDUNG, meldung { daten.getraenkekarte() })
    }

    @Test
    fun anmeldenAendernAbmelden() = runBlocking {
        server.rpc("event_anmelden", """"registered"""")
        server.rpc("event_anmeldung_aendern", """"registered"""")
        server.rpc("event_abmelden", Antwort.LEER)
        assertEquals(Vereinsdaten.Ergebnis(true, "Du bist angemeldet."), daten.meldeAn("e1", 2, "Vegetarisch"))
        assertEquals(Vereinsdaten.Ergebnis(true, "Deine Anmeldung ist geändert."), daten.aendereAnmeldung("e1", 0, ""))
        assertEquals(Vereinsdaten.Ergebnis(true, "Du bist abgemeldet."), daten.meldeAb("e1"))
        assertEquals("""{"p_companions":2,"p_event_id":"e1","p_note":"Vegetarisch"}""", server.rpcAnfrage("event_anmelden").parameter)
        assertEquals("""{"p_companions":0,"p_event_id":"e1","p_note":""}""", server.rpcAnfrage("event_anmeldung_aendern").parameter)
        assertEquals("""{"p_event_id":"e1"}""", server.rpcAnfrage("event_abmelden").parameter)

        // Ausgebucht: die Datenbank setzt auf die Warteliste, die Meldung sagt es.
        server.rpc("event_anmelden", """"waitlisted"""")
        server.rpc("event_anmeldung_aendern", """"waitlisted"""")
        assertEquals(Vereinsdaten.Ergebnis(true, "Ausgebucht – du stehst auf der Warteliste."), daten.meldeAn("e1", 0, ""))
        assertEquals(
            Vereinsdaten.Ergebnis(true, "Geändert – du stehst weiter auf der Warteliste."),
            daten.aendereAnmeldung("e1", 1, ""),
        )

        server.rpc("event_anmelden", Antwort.dbFehler("Die Anmeldefrist ist abgelaufen."))
        assertEquals(Vereinsdaten.Ergebnis(false, "Die Anmeldefrist ist abgelaufen."), daten.meldeAn("e1", 0, ""))
        server.rpc("event_abmelden", Antwort.SITZUNG_ABGELAUFEN)
        assertEquals(Vereinsdaten.Ergebnis(false, ALLGEMEIN), daten.meldeAb("e1"))
    }

    @Test
    fun meinName() = runBlocking {
        server.rpc("ich", """[{"member_id":"m1","first_name":"Max","last_name":"Muster"}]""")
        assertEquals(MeinName("Max", "Muster"), daten.meinName())
    }
}
