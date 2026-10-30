package de.tcmuckensturm.app.daten

import de.tcmuckensturm.app.bildschirme.home.HomeLogik
import de.tcmuckensturm.kern.Startseite
import de.tcmuckensturm.kern.TimelineKind
import de.tcmuckensturm.kern.Zeit
import kotlinx.serialization.decodeFromString
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Decoding der Home-Modelle mit Beispiel-JSON, wie PostgREST es liefert
 * (Zeitpunkte mit "+00:00", numeric als Zahl oder Text, fehlende und
 * null-Spalten) - wie StartdatenTests.swift. Gelesen wird mit demselben
 * Json wie der Client (SupabaseVerbindung.json).
 */
class StartdatenTest {
    private inline fun <reified T> lies(json: String): T = SupabaseVerbindung.json.decodeFromString(json)

    @Test
    fun meineBuchung() {
        val b: List<MeineBuchung> = lies(
            """
            [{"booking_id":"b1","starts_at":"2026-10-29T15:00:00+00:00","ends_at":"2026-10-29T16:00:00+00:00",
              "court_name":"Platz 1","kind":"booking","type_code":"einzel","type_name":"Einzel","title":null,
              "owner_name":"Max Muster","bin_bucher":true,"players":["Max Muster",null,"Erika"]},
             {"booking_id":"b2","starts_at":"2026-10-30T15:00:00+00:00","ends_at":"2026-10-30T16:00:00+00:00","neu":1}]
            """,
        )
        assertEquals(2, b.size)
        assertEquals("Platz 1", b[0].courtName)
        assertEquals("mit Erika", HomeLogik.mitText(b[0]))
        assertNull(b[1].players)
        assertNull(b[1].binBucher)
        assertEquals(16 * 60, Zeit.minutesOf(b[0].startsAt))
    }

    @Test
    fun offenesSpielUndBelegung() {
        val o: List<OffenesSpiel> = lies(
            """
            [{"booking_id":"o1","starts_at":"2026-10-29T15:00:00+00:00","ends_at":"2026-10-29T16:30:00+00:00",
              "court_name":"Platz 2","type_name":"Doppel","owner_name":"Erika","frei":2,"bin_dabei":false,"players":["Erika"]}]
            """,
        )
        assertEquals("Doppel · sucht 2", HomeLogik.offenesSpielTitel(o[0]))
        assertEquals("Platz 2 · Erika", HomeLogik.offenesSpielZeile(o[0]))

        val t: List<TagesBelegung> = lies(
            """
            [{"booking_id":"t1","court_id":"c1","starts_at":"2026-10-29T15:00:00+00:00","ends_at":"2026-10-29T16:00:00+00:00",
              "kind":"blocking","series_id":"s1","is_own":false,"partner_wanted":false,"frei":0,
              "players":[],"player_member_ids":[],"guest_names":null}]
            """,
        )
        assertEquals(TimelineKind.SERIE, Startseite.occupancyKind(t[0]))
    }

    @Test
    fun einstellungenArtenPlaetze() {
        val e: List<Buchungseinstellungen> = lies(
            """
            [{"opening_time":"08:00:00","closing_time":"21:00:00","slot_minutes":30,"lead_days":7,
              "max_open_bookings":2,"display_minutes":15,"guest_fee_cents":500}]
            """,
        )
        assertEquals(480, Zeit.timeToMinutes(e[0].openingTime ?: ""))
        val a: List<Buchungsart> = lies(
            """
            [{"code":"einzel","name":"Einzel","duration_minutes":60,"requires_partner":false,"min_players":2,
              "max_players":2,"sort_order":1},{"code":"neu"}]
            """,
        )
        assertEquals(60, a.first().durationMinutes)
        assertEquals(1, a.first().sortOrder)
        assertNull(a[1].durationMinutes)
        val p: List<AktiverPlatz> = lies("""[{"id":"c1","name":"Platz 1","short_name":"P1","position":1},{"id":"c2"}]""")
        assertEquals("P1", p.first().shortName)
        assertEquals(1, p.first().position)
        assertNull(p[1].name)
    }

    @Test
    fun benachrichtigungGetraenkDienst() {
        val n: List<Benachrichtigung> = lies(
            """
            [{"id":"n1","kind":"booking_cancelled","title":"Storniert","body":"Platz 1",
              "created_at":"2026-10-29T10:00:00.123456+00:00","read_at":null,"event_id":null}]
            """,
        )
        assertNull(n[0].readAt)
        assertNotNull(Zeit.datum(n[0].createdAt))

        val g: List<EigenesGetraenk> = lies(
            """
            [{"id":"g1","item_name":"Wasser","quantity":2,"unit_price_cents":150,"total_cents":300,
              "created_at":"2026-10-28T18:00:00+00:00","voided_at":null,"source":"app"},
             {"id":"g2","total_cents":250,"voided_at":"2026-10-28T18:05:00+00:00"}]
            """,
        )
        assertEquals(300, Startseite.sumOpenDrinks(g))

        val zahl: List<Arbeitsdienst> =
            lies("""[{"year":2026,"required_hours":10,"completed_hours":"2.5","missing_hours":7.5}]""")
        assertEquals(2.5, zahl.first().completedHours!!, 0.0)
        assertEquals(10.0, zahl.first().requiredHours!!, 0.0)
        val leer: List<Arbeitsdienst> = lies("""[{"year":2026,"required_hours":null}]""")
        assertNull(leer.first().requiredHours)
        assertNull(leer.first().completedHours)
    }

    @Test
    fun ichUndName() {
        val ich: List<Ich> = lies(
            """
            [{"member_id":"m1","first_name":"Max","last_name":null,"roles":["vorstand"],"admin":true,
              "platz_rechte":true,"kiosk":false,"zugang":true,"grund":null,"onboarding_offen":false}]
            """,
        )
        assertEquals(MeinName("Max", ""), ich.first().name)
        // Ohne Zugang oder Kiosk: member_id und Name null
        val ohne: List<Ich> = lies("""[{"member_id":null,"first_name":null,"kiosk":true}]""")
        assertNull(ohne.first().name)
    }
}
