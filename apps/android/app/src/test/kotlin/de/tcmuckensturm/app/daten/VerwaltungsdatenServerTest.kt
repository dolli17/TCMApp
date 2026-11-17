package de.tcmuckensturm.app.daten

import de.tcmuckensturm.app.bildschirme.verwaltung.PlatzJetzt
import de.tcmuckensturm.app.bildschirme.verwaltung.SerienEingabe
import java.time.Instant
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Der Tab Verwaltung gegen nachgebaute Antworten: Stand laden, sperren, Serien. */
class VerwaltungsdatenServerTest : ServerTest() {
    private val daten by lazy { Verwaltungsdaten(client) }

    /** 29.10.2026, 16:30 in Berlin */
    private val jetzt = Instant.parse("2026-10-29T15:30:00Z")

    private val serie = SerienEingabe(
        courtId = "c1", bookingTypeCode = "training", weekday = 2, startTime = "18.30", endTime = "20:00",
        validFrom = "6.10.2026", validTo = "27.10.2026", title = "Jugendtraining",
    )

    private fun stand() {
        server.rpc(
            "court_overview",
            """
            [{"id":"c1","name":"Platz 1","short_name":"P1","subline":"Sand","sort_position":1,"active":true,"offene_buchungen":4},
             {"id":"c2","name":"Platz 2","active":false},{"id":"c3"}]
            """,
        )
        server.rpc("booking_types_aktiv", """[{"code":"sperre","name":"Sperrung","sort_order":1}]""")
        server.rpc(
            "series_overview",
            """
            [{"id":"s1","court_name":"Platz 1","type_name":"Training","title":"Jugendtraining","weekday":2,
              "start_time":"18:30:00","end_time":"20:00:00","valid_from":"2026-10-06","valid_to":"2026-10-27","kuenftige":3}]
            """,
        )
        server.rpc(
            "day_schedule",
            """
            [{"booking_id":"t1","court_id":"c1","starts_at":"2026-10-29T15:00:00+00:00","ends_at":"2026-10-29T16:00:00+00:00","kind":"blocking"},
             {"booking_id":"t2","court_id":"c3","starts_at":"2026-10-29T17:00:00+00:00","ends_at":"2026-10-29T18:00:00+00:00","kind":"blocking"}]
            """,
        )
        server.rpc("booking_settings", """[{"opening_time":"07:30:00","closing_time":"22:00:00"}]""")
    }

    @Test
    fun laden() = runBlocking {
        stand()
        val s = daten.laden(jetzt)
        assertEquals(listOf("c1", "c2", "c3"), s.plaetze.map { it.id })
        // Ohne die Spalte gilt ein Platz als aktiv.
        assertEquals(listOf("c1", "c3"), s.aktivePlaetze.map { it.id })
        assertEquals(4, s.plaetze[0].offeneBuchungen)
        assertEquals("sperre", s.blockungsarten.single().code)
        assertEquals(3, s.serien.single().kuenftige)
        // Nur was gerade laeuft, zaehlt: c1 ist bis 17 Uhr gesperrt, c3 erst spaeter.
        assertEquals(mapOf("c1" to PlatzJetzt(PlatzJetzt.Art.GESPERRT, "gesperrt bis 17:00")), s.zustand)
        assertEquals("07:30", s.oeffnung)
        assertEquals("22:00", s.schluss)

        assertEquals("""{"p_date":"2026-10-29"}""", server.rpcAnfrage("day_schedule").parameter)
        assertEquals("""{"p_applies_to":"blocking"}""", server.rpcAnfrage("booking_types_aktiv").parameter)
    }

    /** Die Plaetze tragen die Seite; ohne Tagesplan fehlt nur "gesperrt bis", ohne Einstellungen gelten 8 bis 21 Uhr. */
    @Test
    fun ladenOhneTagesplanUndEinstellungen() = runBlocking {
        stand()
        server.rpc("day_schedule", VERBOTEN)
        server.rpc("booking_settings", "[]")
        val s = daten.laden(jetzt)
        assertEquals(3, s.plaetze.size)
        assertTrue(s.zustand.isEmpty())
        assertEquals("08:00", s.oeffnung)
        assertEquals("21:00", s.schluss)
    }

    @Test
    fun ladenFehler() = runBlocking {
        stand()
        server.rpc("court_overview", VERBOTEN)
        assertEquals("Die Plätze konnten nicht geladen werden. ($KEIN_RECHT)", meldung { daten.laden(jetzt) })

        stand()
        server.rpc("series_overview", Antwort.SITZUNG_ABGELAUFEN)
        assertEquals(ALLGEMEIN, meldung { daten.laden(jetzt) })

        stand()
        server.rpc("booking_types_aktiv", "kein json")
        assertEquals(ALLGEMEIN, meldung { daten.laden(jetzt) })

        server.ohneNetz = true
        assertEquals("Die Plätze konnten nicht geladen werden. ($KEINE_VERBINDUNG)", meldung { daten.laden(jetzt) })
    }

    @Test
    fun ich() = runBlocking {
        server.rpc("ich", """[{"member_id":"m1","admin":true}]""")
        assertEquals(true, daten.ich()?.admin)
    }

    @Test
    fun sperren() = runBlocking {
        server.rpc("create_blocking", """[{"created_count":2,"displaced_count":0}]""")
        assertEquals(
            PlatzErgebnis(true, "2 Plätze gesperrt."),
            daten.sperre(listOf("c1", "c3"), "29.10.2026", "8:00", "10.00", "sperre", " Platzpflege ", verdraengen = false),
        )
        // Uhrzeiten in Berlin, als Zeitpunkte mit Zone.
        assertEquals(
            """{"p_bis":"2026-10-29T09:00:00.000Z","p_court_ids":["c1","c3"],"p_force":false,"p_title":"Platzpflege",""" +
                """"p_type_code":"sperre","p_von":"2026-10-29T07:00:00.000Z"}""",
            server.rpcAnfrage("create_blocking").parameter,
        )

        server.rpc("create_blocking", """[{"created_count":2,"displaced_count":3}]""")
        assertEquals(
            "2 Plätze gesperrt, 3 Buchungen verdrängt. Die Betroffenen wurden benachrichtigt.",
            daten.sperre(listOf("c1", "c3"), "29.10.2026", "08:00", "10:00", "sperre", "", verdraengen = true).meldung,
        )
        // Ohne Zeile in der Antwort stehen Nullen da, es wirft nichts.
        server.rpc("create_blocking", "[]")
        assertEquals("0 Plätze gesperrt.", daten.sperre(listOf("c1"), "29.10.2026", "08:00", "10:00", "sperre", "", false).meldung)
    }

    @Test
    fun sperrenPrueftUndMeldetKollisionen() = runBlocking {
        assertEquals(
            PlatzErgebnis(false, "Das Datum bitte als TT.MM.JJJJ angeben."),
            daten.sperre(listOf("c1"), "31.02.2026", "08:00", "10:00", "sperre", "", false),
        )
        assertEquals(
            PlatzErgebnis(false, "Uhrzeit als HH:MM angeben."),
            daten.sperre(listOf("c1"), "29.10.2026", "8 Uhr", "10:00", "sperre", "", false),
        )
        assertTrue(server.anfragen.isEmpty())

        server.rpc("create_blocking", Antwort.dbFehler("2 Buchungen liegen in diesem Zeitraum. Sollen sie abgesagt werden?"))
        assertEquals(
            PlatzErgebnis(false, "2 Buchungen liegen in diesem Zeitraum. Sollen sie abgesagt werden?", kollisionen = 2),
            daten.sperre(listOf("c1"), "29.10.2026", "08:00", "10:00", "sperre", "", false),
        )
        server.ohneNetz = true
        assertEquals(
            PlatzErgebnis(false, KEINE_VERBINDUNG),
            daten.sperre(listOf("c1"), "29.10.2026", "08:00", "10:00", "sperre", "", false),
        )
    }

    @Test
    fun vorschau() = runBlocking {
        server.rpc(
            "preview_series",
            """
            [{"starts_at":"2026-10-06T16:30:00+00:00","ends_at":"2026-10-06T18:00:00+00:00","conflict_booking_id":null},
             {"starts_at":"2026-10-13T16:30:00+00:00","ends_at":"2026-10-13T18:00:00+00:00","conflict_booking_id":"b9",
              "conflict_member_name":"Max Muster","conflict_kind":"booking"}]
            """,
        )
        val termine = daten.vorschau(serie).getOrThrow()
        assertEquals(2, termine.size)
        assertNull(termine[0].conflictBookingId)
        assertEquals("Max Muster", termine[1].conflictMemberName)
        // Uhrzeiten als HH:MM, Daten als JJJJ-MM-TT; Titel und Art braucht die Vorschau nicht.
        assertEquals(
            """{"p_court_id":"c1","p_end_time":"20:00","p_start_time":"18:30","p_valid_from":"2026-10-06",""" +
                """"p_valid_to":"2026-10-27","p_weekday":2}""",
            server.rpcAnfrage("preview_series").parameter,
        )
    }

    @Test
    fun vorschauFehler() = runBlocking {
        fun text(r: Result<List<SerienTermin>>) = (r.exceptionOrNull() as Meldung).text

        assertEquals("Die Endzeit muss nach der Startzeit liegen.", text(daten.vorschau(serie.copy(endTime = "18:00"))))
        assertEquals("Titel fehlt.", text(daten.vorschau(serie.copy(title = "  "))))
        assertTrue(server.anfragen.isEmpty())

        server.rpc("preview_series", VERBOTEN)
        assertEquals(KEIN_RECHT, text(daten.vorschau(serie)))
        server.rpc("preview_series", """[{"ends_at":"ohne Beginn"}]""")
        assertEquals(ALLGEMEIN, text(daten.vorschau(serie)))
        server.ohneNetz = true
        assertEquals(KEINE_VERBINDUNG, text(daten.vorschau(serie)))
    }

    @Test
    fun serieAnlegen() = runBlocking {
        server.rpc("create_series", """[{"created_count":4,"displaced_count":0}]""")
        assertEquals(PlatzErgebnis(true, "Serie angelegt: 4 Termine."), daten.legeSerieAn(serie, verdraengen = false))
        assertEquals(
            """{"p_booking_type_code":"training","p_court_id":"c1","p_displace":false,"p_end_time":"20:00","p_start_time":"18:30",""" +
                """"p_title":"Jugendtraining","p_valid_from":"2026-10-06","p_valid_to":"2026-10-27","p_weekday":2}""",
            server.rpcAnfrage("create_series").parameter,
        )

        server.rpc("create_series", """[{"created_count":4,"displaced_count":2}]""")
        assertEquals(
            "Serie angelegt: 4 Termine, 2 bestehende Buchungen verdrängt und die Betroffenen benachrichtigt.",
            daten.legeSerieAn(serie, verdraengen = true).meldung,
        )

        assertEquals(
            PlatzErgebnis(false, "Das Enddatum darf nicht vor dem Startdatum liegen."),
            daten.legeSerieAn(serie.copy(validTo = "1.10.2026"), false),
        )
        assertEquals(2, server.anfragen.size)

        server.rpc("create_series", Antwort.dbFehler("Die Serie kollidiert mit 2 Buchungen."))
        assertEquals(PlatzErgebnis(false, "Die Serie kollidiert mit 2 Buchungen."), daten.legeSerieAn(serie, false))
    }

    @Test
    fun serieAendern() = runBlocking {
        server.rpc("update_series", """[{"created_count":1,"displaced_count":0}]""")
        assertEquals(
            PlatzErgebnis(true, "Serie geändert: 1 künftige Termin steht in der neuen Lage."),
            daten.aendereSerie("s1", "19.00", "20:30", "Training", "30.11.2026", verdraengen = false),
        )
        // Ein leeres Enddatum faellt weg: dann bleibt es, wie es ist.
        daten.aendereSerie("s1", "19:00", "20:30", "Training", " ", verdraengen = true)
        assertEquals(
            listOf(
                """{"p_displace":false,"p_end_time":"20:30","p_series_id":"s1","p_start_time":"19:00","p_title":"Training","p_valid_to":"2026-11-30"}""",
                """{"p_displace":true,"p_end_time":"20:30","p_series_id":"s1","p_start_time":"19:00","p_title":"Training"}""",
            ),
            server.rpcs("update_series").map { it.parameter },
        )

        assertEquals(PlatzErgebnis(false, "Uhrzeit als HH:MM angeben."), daten.aendereSerie("s1", "abends", "20:30", "T", "", false))
        assertEquals(
            PlatzErgebnis(false, "Das Datum bitte als TT.MM.JJJJ angeben."),
            daten.aendereSerie("s1", "19:00", "20:30", "T", "morgen", false),
        )
        assertEquals(2, server.anfragen.size)

        server.rpc("update_series", Antwort.dbFehler("2 Termine kollidieren mit bestehenden Buchungen."))
        assertEquals(
            PlatzErgebnis(false, "2 Termine kollidieren mit bestehenden Buchungen.", kollisionen = 2),
            daten.aendereSerie("s1", "19:00", "20:30", "T", "", false),
        )
    }

    @Test
    fun serieBeenden() = runBlocking {
        server.rpc("end_series", "3")
        assertEquals(PlatzErgebnis(true, "Serie beendet. 3 künftige Termine wurden abgesagt."), daten.beendeSerie("s1"))
        assertEquals("""{"p_series_id":"s1"}""", server.rpcAnfrage("end_series").parameter)
        server.rpc("end_series", "0")
        assertEquals("Serie beendet. Es standen keine Termine mehr aus.", daten.beendeSerie("s1").meldung)
        server.rpc("end_series", VERBOTEN)
        assertEquals(PlatzErgebnis(false, KEIN_RECHT), daten.beendeSerie("s1"))
    }
}
