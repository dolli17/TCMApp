package de.tcmuckensturm.app.daten

import de.tcmuckensturm.kern.SuchFuer
import de.tcmuckensturm.kern.Suchfilter
import java.time.Instant
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Der Tab Plaetze gegen nachgebaute Antworten: Tagesplan, Buchen, Mitspieler, Sperren. */
class PlatzdatenServerTest : ServerTest() {
    private val daten by lazy { Platzdaten(client) }

    /** 29.10.2026, 10:00 in Berlin (Winterzeit) */
    private val zehnUhr = Instant.parse("2026-10-29T09:00:00Z")
    private val elfUhr = Instant.parse("2026-10-29T10:00:00Z")

    @Test
    fun lesen() = runBlocking {
        server.rpc("courts_aktiv", """[{"id":"c1","name":"Platz 1"}]""")
        server.rpc("day_schedule", "[]")
        server.rpc("my_booking_quota", """[{"used":2,"allowed":3}]""")
        server.rpc("booking_settings", """[{"lead_days":7,"guest_fee_cents":500}]""")
        server.rpc("booking_types_aktiv") { a ->
            Antwort(200, if (a.parameter.contains("blocking")) """[{"code":"sperre","name":"Sperrung"}]""" else """[{"code":"einzel","duration_minutes":60}]""")
        }
        server.rpc("member_directory", """[{"id":"m2","first_name":"Erika","last_name":"Muster"},{"id":"m3","first_name":null,"last_name":"Solo"}]""")
        server.rpc("ich", """[{"member_id":"m1","platz_rechte":true}]""")

        assertEquals("Platz 1", daten.plaetze().single().name)
        assertEquals(emptyList<TagesBelegung>(), daten.tagesplan("2026-10-29"))
        assertEquals(Kontingent(used = 2, allowed = 3), daten.kontingent())
        assertEquals(500, daten.buchungseinstellungen()?.guestFeeCents)
        assertEquals("einzel", daten.buchungsarten().single().code)
        assertEquals("sperre", daten.blockungsarten().single().code)
        assertEquals(listOf("Erika Muster", "Solo"), daten.verzeichnis().map { it.name })
        assertEquals(true, daten.ich()?.platzRechte)

        assertEquals(
            listOf("""{"p_applies_to":"booking"}""", """{"p_applies_to":"blocking"}"""),
            server.rpcs("booking_types_aktiv").map { it.parameter },
        )
        // Alle Mitglieder: gesucht wird in der App.
        assertEquals("""{"p_query":""}""", server.rpcAnfrage("member_directory").parameter)

        // Die Vorgaben der Spielform, wenn die Datenbank nichts nennt.
        val info = Buchungsart(code = "neu").info
        assertEquals("neu", info.name)
        assertEquals(60, info.durationMinutes)
        assertEquals(2, info.maxPlayers)
    }

    /** Ohne Zeile gilt {0, 0}: unbegrenzt. */
    @Test
    fun kontingentOhneZeile() = runBlocking {
        server.rpc("my_booking_quota", "[]")
        assertEquals(Kontingent.LEER, daten.kontingent())
        server.rpc("my_booking_quota", "[{}]")
        assertEquals(Kontingent.LEER, daten.kontingent())
    }

    @Test
    fun lesefehler() = runBlocking {
        val aufrufe: Map<String, suspend () -> Any?> = mapOf(
            "my_booking_quota" to { daten.kontingent() },
            "booking_types_aktiv" to { daten.blockungsarten() },
            "member_directory" to { daten.verzeichnis() },
            "ich" to { daten.ich() },
        )
        for ((rpc, aufruf) in aufrufe) {
            server.rpc(rpc, VERBOTEN)
            assertEquals(rpc, KEIN_RECHT, meldung(aufruf))
            server.rpc(rpc, Antwort.SITZUNG_ABGELAUFEN)
            assertEquals(rpc, ALLGEMEIN, meldung(aufruf))
            server.rpc(rpc, "kein json")
            assertEquals(rpc, ALLGEMEIN, meldung(aufruf))
        }
        server.ohneNetz = true
        for ((rpc, aufruf) in aufrufe) assertEquals(rpc, KEINE_VERBINDUNG, meldung(aufruf))
    }

    @Test
    fun buchen() = runBlocking {
        server.rpc("create_booking", """"b1"""")
        val r = daten.bucheplatz(
            "c1", zehnUhr, "doppel", mitspieler = listOf("m2"), gaeste = listOf("Gast"),
            sucheMitspieler = true, filter = Suchfilter(von = 100, bis = 165, fuer = SuchFuer.DAMEN),
        )
        assertEquals(PlatzErgebnis(ok = true, meldung = "Platz gebucht."), r)
        // Ohne Suche geht auch kein Filter mit - der Aufruf bleibt wie vor dem Filter.
        daten.bucheplatz("c1", zehnUhr, "einzel", emptyList(), emptyList(), sucheMitspieler = false, filter = Suchfilter(von = 100))
        assertEquals(
            listOf(
                """{"p_booking_type_code":"doppel","p_court_id":"c1","p_guest_names":["Gast"],"p_partner_fuer":"female",""" +
                    """"p_partner_lk_bis":16.5,"p_partner_lk_von":10.0,"p_partner_wanted":true,"p_player_member_ids":["m2"],""" +
                    """"p_starts_at":"2026-10-29T09:00:00.000Z"}""",
                """{"p_booking_type_code":"einzel","p_court_id":"c1","p_guest_names":[],"p_partner_wanted":false,""" +
                    """"p_player_member_ids":[],"p_starts_at":"2026-10-29T09:00:00.000Z"}""",
            ),
            server.rpcs("create_booking").map { it.parameter },
        )
    }

    @Test
    fun buchenFehler() = runBlocking {
        suspend fun buche() = daten.bucheplatz("c1", zehnUhr, "einzel", emptyList(), emptyList(), false, Suchfilter.OFFEN)

        // Der Ausschluss-Constraint: jemand war schneller.
        server.rpc(
            "create_booking",
            Antwort.dbFehler("""conflicting key value violates exclusion constraint "bookings_no_overlap"""", code = "23P01", status = 409),
        )
        assertEquals(PlatzErgebnis(false, "Dieser Platz ist zu der Zeit bereits belegt."), buche())
        server.rpc("create_booking", Antwort.dbFehler("Du hast bereits 2 offene Buchungen."))
        assertEquals(PlatzErgebnis(false, "Du hast bereits 2 offene Buchungen."), buche())
        server.rpc("create_booking", Antwort.SITZUNG_ABGELAUFEN)
        assertEquals(PlatzErgebnis(false, ALLGEMEIN), buche())
        server.ohneNetz = true
        assertEquals(PlatzErgebnis(false, KEINE_VERBINDUNG), buche())
    }

    @Test
    fun mitspielerStornoAbsage() = runBlocking {
        server.sonst = { Antwort.LEER }
        assertEquals(
            PlatzErgebnis(true, "Mitspieler aktualisiert."),
            daten.aendereMitspieler("b1", listOf("m2", "m3"), listOf(" Gast ", "", "  ")),
        )
        assertEquals(PlatzErgebnis(true, "Buchung storniert."), daten.storniereBuchung("b1", " Regen "))
        assertEquals(PlatzErgebnis(true, "Buchung storniert."), daten.storniereBuchung("b2", "  "))
        assertEquals(PlatzErgebnis(true, "Der Termin ist abgesagt."), daten.sageSerienterminAb("b3", null))
        assertEquals(PlatzErgebnis(true, "Die Sperrung ist aufgehoben."), daten.hebeSperreAuf("b4"))

        // Leere Gastnamen fallen weg.
        assertEquals(
            """{"p_booking_id":"b1","p_guest_names":["Gast"],"p_member_ids":["m2","m3"]}""",
            server.rpcAnfrage("update_booking_players").parameter,
        )
        // Ohne Grund fehlt p_reason: dann nimmt die Funktion ihren Standardwert.
        assertEquals(
            listOf("""{"p_booking_id":"b1","p_reason":"Regen"}""", """{"p_booking_id":"b2"}""", """{"p_booking_id":"b4"}"""),
            server.rpcs("cancel_booking").map { it.parameter },
        )
        assertEquals("""{"p_booking_id":"b3"}""", server.rpcAnfrage("cancel_series_occurrence").parameter)
    }

    @Test
    fun mitspielen() = runBlocking {
        server.rpc("join_booking", Antwort.LEER)
        assertEquals(PlatzErgebnis(true, "Du bist eingetragen. Viel Spaß!"), daten.spieleMit("b1"))
        assertEquals("""{"p_booking_id":"b1"}""", server.rpcAnfrage("join_booking").parameter)

        // check_violation ohne eigenen Satz: lieber sagen, worum es geht.
        server.rpc(
            "join_booking",
            Antwort.dbFehler("""new row for relation "booking_players" violates check constraint "x"""", code = "23514"),
        )
        assertEquals(
            PlatzErgebnis(false, "Diese Suche richtet sich an andere Spieler (LK oder Damen/Herren)."),
            daten.spieleMit("b1"),
        )
        // Mit Satz der RPC bleibt der Satz.
        server.rpc("join_booking", Antwort.dbFehler("Das Spiel ist schon voll.", code = "23514"))
        assertEquals(PlatzErgebnis(false, "Das Spiel ist schon voll."), daten.spieleMit("b1"))
        server.ohneNetz = true
        assertEquals(PlatzErgebnis(false, KEINE_VERBINDUNG), daten.spieleMit("b1"))
    }

    @Test
    fun mitspielerSuche() = runBlocking {
        server.rpc("set_partner_wanted", Antwort.LEER)
        val filter = Suchfilter(bis = 160, fuer = SuchFuer.HERREN)
        assertEquals(
            PlatzErgebnis(true, "Die Buchung steht jetzt bei den offenen Spielen."),
            daten.sucheMitspieler("b1", gesucht = true, filter = filter, nurFilter = false),
        )
        assertEquals(
            PlatzErgebnis(true, "Die Suche ist geändert."),
            daten.sucheMitspieler("b1", gesucht = true, filter = Suchfilter.OFFEN, nurFilter = true),
        )
        assertEquals(
            PlatzErgebnis(true, "Die Buchung ist nicht mehr ausgeschrieben."),
            daten.sucheMitspieler("b1", gesucht = false, filter = filter, nurFilter = false),
        )
        // Offene Grenzen und ein abgeschalteter Filter fehlen: die Datenbank setzt sie auf null.
        assertEquals(
            listOf(
                """{"p_booking_id":"b1","p_fuer":"male","p_lk_bis":16.0,"p_wanted":true}""",
                """{"p_booking_id":"b1","p_wanted":true}""",
                """{"p_booking_id":"b1","p_wanted":false}""",
            ),
            server.rpcs("set_partner_wanted").map { it.parameter },
        )
    }

    @Test
    fun umsetzen() = runBlocking {
        server.rpc("move_booking", Antwort.LEER)
        assertEquals(PlatzErgebnis(true, "Die Buchung ist umgesetzt."), daten.setzeUm("b1", "c2", "2026-10-29", 10 * 60, " Turnier "))
        // Im Sommer zwei Stunden vor UTC: der Beginn ist ein Zeitpunkt in Berlin, nie in der Zone des Geraets.
        daten.setzeUm("b1", "c2", "2026-07-04", 18 * 60 + 30, null)
        assertEquals(
            listOf(
                """{"p_booking_id":"b1","p_court_id":"c2","p_reason":"Turnier","p_starts_at":"2026-10-29T09:00:00.000Z"}""",
                """{"p_booking_id":"b1","p_court_id":"c2","p_starts_at":"2026-07-04T16:30:00.000Z"}""",
            ),
            server.rpcs("move_booking").map { it.parameter },
        )
        server.rpc("move_booking", VERBOTEN)
        assertEquals(PlatzErgebnis(false, KEIN_RECHT), daten.setzeUm("b1", "c2", "2026-10-29", 600, null))
    }

    @Test
    fun sperren() = runBlocking {
        server.rpc("create_blocking", """[{"created_count":1,"displaced_count":0}]""")
        assertEquals(PlatzErgebnis(true, "Gesperrt."), daten.sperre("c1", zehnUhr, elfUhr, "sperre", " Platzpflege ", verdraengen = false))
        assertEquals(
            """{"p_bis":"2026-10-29T10:00:00.000Z","p_court_ids":["c1"],"p_force":false,"p_title":"Platzpflege",""" +
                """"p_type_code":"sperre","p_von":"2026-10-29T09:00:00.000Z"}""",
            server.rpcAnfrage("create_blocking").parameter,
        )
    }

    /** Zweistufig: liegen Buchungen im Weg, nennt die Datenbank ihre Zahl - dann fragt das Blatt nach. */
    @Test
    fun sperrenMitKollisionen() = runBlocking {
        server.rpc(
            "create_blocking",
            Antwort.dbFehler("3 Buchungen liegen in diesem Zeitraum. Sollen sie abgesagt werden?"),
        )
        assertEquals(
            PlatzErgebnis(false, "3 Buchungen liegen in diesem Zeitraum. Sollen sie abgesagt werden?", kollisionen = 3),
            daten.sperre("c1", zehnUhr, elfUhr, "sperre", "Pflege", verdraengen = false),
        )
        server.rpc("create_blocking", VERBOTEN)
        assertEquals(PlatzErgebnis(false, KEIN_RECHT), daten.sperre("c1", zehnUhr, elfUhr, "sperre", "Pflege", false))
        server.ohneNetz = true
        assertEquals(PlatzErgebnis(false, KEINE_VERBINDUNG), daten.sperre("c1", zehnUhr, elfUhr, "sperre", "Pflege", true))
    }

    @Test
    fun sperreAendern() = runBlocking {
        server.rpc("update_blocking", """[{"created_count":2,"displaced_count":2}]""")
        assertEquals(
            PlatzErgebnis(true, "Sperrung geändert, 2 Buchungen verdrängt."),
            daten.aendereSperre("b4", listOf("c1", "c2"), zehnUhr, elfUhr, "sperre", "Pflege", verdraengen = true),
        )
        assertEquals(
            """{"p_bis":"2026-10-29T10:00:00.000Z","p_booking_id":"b4","p_court_ids":["c1","c2"],"p_force":true,"p_title":"Pflege",""" +
                """"p_type_code":"sperre","p_von":"2026-10-29T09:00:00.000Z"}""",
            server.rpcAnfrage("update_blocking").parameter,
        )
        server.rpc("update_blocking", "[]")
        assertEquals(PlatzErgebnis(true, "Sperrung geändert."), daten.aendereSperre("b4", listOf("c1"), zehnUhr, elfUhr, "sperre", "", false))
        server.rpc("update_blocking", Antwort.dbFehler("1 Buchungen liegen in diesem Zeitraum."))
        assertEquals(1, daten.aendereSperre("b4", listOf("c1"), zehnUhr, elfUhr, "sperre", "", false).kollisionen)
    }

    /**
     * Gelingt das Abo auf den Kanal nicht (hier: kein WebSocket), kommt einfach
     * nichts - es stuerzt nichts ab, und das Sammeln laesst sich beenden.
     */
    @Test
    fun aenderungenOhneKanal() = runBlocking {
        assertNull(withTimeoutOrNull(500) { daten.aenderungen("2026-10-29").first() })
    }
}
