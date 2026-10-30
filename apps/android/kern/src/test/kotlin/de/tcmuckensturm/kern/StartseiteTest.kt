package de.tcmuckensturm.kern

import java.time.Duration
import java.time.Instant
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Was der Kern ueber die Golden Files hinaus fuer Home braucht - wie
 * KernTests.swift der iOS-App, Faelle aus packages/core/src/home.test.ts.
 * JETZT ist Montag, 28.09.2026, 14:00 in Berlin.
 */
class StartseiteTest {
    private val jetzt = Zeit.datum("2026-09-28T12:00:00Z")!!

    private fun um(tag: String, uhr: String): String = Zeit.iso(Zeit.berlinTime(tag, Zeit.timeToMinutes(uhr)))

    @Test
    fun bookingKicker() {
        fun k(tag: String, von: String, bis: String) = Startseite.bookingKicker(um(tag, von), um(tag, bis), jetzt)
        assertEquals("Heute · in 3 Stunden", k("2026-09-28", "17:00", "18:00"))
        assertEquals("Heute · in 1 Stunde", k("2026-09-28", "15:00", "16:00"))
        assertEquals("Heute · in 30 Minuten", k("2026-09-28", "14:30", "15:30"))
        assertEquals("Heute · in 1 Minute", k("2026-09-28", "14:01", "15:00"))
        assertEquals("Heute · läuft gerade", k("2026-09-28", "13:30", "14:30"))
        assertEquals("Heute", k("2026-09-28", "10:00", "11:00"))
        assertEquals("Morgen", k("2026-09-29", "09:00", "10:00"))
        assertEquals("Mittwoch · 30.09.", k("2026-09-30", "18:00", "19:00"))
        assertEquals("", Startseite.bookingKicker("kaputt", "kaputt", jetzt))
    }

    @Test
    fun relativeTimeLabel() {
        fun vor(minuten: Long) = Zeit.iso(jetzt.minus(Duration.ofMinutes(minuten)))
        assertEquals("gerade eben", Startseite.relativeTimeLabel(vor(0), jetzt))
        assertEquals("vor 5 Min.", Startseite.relativeTimeLabel(vor(5), jetzt))
        assertEquals("vor 2 Std.", Startseite.relativeTimeLabel(vor(125), jetzt))
        assertEquals("gestern", Startseite.relativeTimeLabel(um("2026-09-27", "20:00"), jetzt))
        assertEquals("Sa", Startseite.relativeTimeLabel(um("2026-09-26", "10:00"), jetzt))
        assertEquals("10.09.", Startseite.relativeTimeLabel(um("2026-09-10", "10:00"), jetzt))
    }

    data class N(val id: String, override val createdAt: String, override val readAt: String?) : Benachrichtigungsdaten

    @Test
    fun startseitenNeuigkeiten() {
        fun n(id: String, tage: Double, gelesen: Boolean) = N(
            id,
            Zeit.iso(jetzt.minusMillis((tage * 86_400_000).toLong())),
            if (gelesen) "2026-09-28T12:00:00Z" else null,
        )
        fun ids(liste: List<N>) = Startseite.startseitenNeuigkeiten(liste, jetzt).map { it.id }
        assertEquals(listOf("frisch", "grenze"), ids(listOf(n("frisch", 1.0, true), n("grenze", 7.0, true), n("alt", 7.01, true))))
        assertEquals(listOf("uralt"), ids(listOf(n("uralt", 40.0, false))))
        assertEquals(listOf("a", "b", "c"), ids(listOf("a", "b", "c", "d").map { n(it, 0.0, false) }))
        assertEquals(emptyList<String>(), ids(listOf(n("alt", 8.0, true))))
    }

    @Test
    fun groupNotifications() {
        val jetzt = Zeit.datum("2026-09-28T08:00:00Z")!!
        val liste = listOf(
            "2026-09-28T07:00:00Z", "2026-09-27T22:30:00Z", "2026-09-27T10:00:00Z",
            "2026-09-23T10:00:00Z", "2026-09-10T10:00:00Z",
        ).map { N(it, it, null) }
        val g = Startseite.groupNotifications(liste, jetzt)
        assertEquals(listOf("Heute", "Gestern", "Diese Woche", "Früher"), g.map { it.label })
        assertEquals(listOf(2, 1, 1, 1), g.map { it.items.size })
        assertTrue(Startseite.groupNotifications(emptyList<N>(), jetzt).isEmpty())
    }

    data class B(
        override val startsAt: String,
        override val endsAt: String,
        override val kind: String? = "booking",
        override val isOwn: Boolean? = null,
        override val partnerWanted: Boolean? = null,
        override val frei: Int? = null,
        override val seriesId: String? = null,
    ) : Zeitraum, Belegungsmerkmale

    @Test
    fun timelineSegmenteUndPosition() {
        fun b(von: String, bis: String) = B(um("2026-09-28", von), um("2026-09-28", bis))
        val s = Startseite.timelineSegments(listOf(b("08:00", "09:00")), 480, 1260)
        assertEquals(0.0, s.first().left)
        assertEquals(100.0 / 13, s.first().width, 0.0001)
        val rand = Startseite.timelineSegments(listOf(b("20:30", "22:00")), 480, 1260)
        assertEquals(100.0, rand.first().left + rand.first().width, 0.0001)
        val serie = b("16:00", "19:00").copy(seriesId = "s1", isOwn = true)
        assertEquals(TimelineKind.SERIE, Startseite.timelineSegments(listOf(serie), 480, 1260).first().art)
        assertTrue(Startseite.timelineSegments(listOf(b("06:00", "07:00")), 480, 1260).isEmpty())
        assertEquals(0.0, Startseite.timelinePosition(360, 480, 1260))
        assertEquals(50.0, Startseite.timelinePosition(870, 480, 1260))
        assertEquals(100.0, Startseite.timelinePosition(1320, 480, 1260))
    }

    @Test
    fun notificationSymbolUndZiel() {
        assertEquals(NotificationSymbol.STORNO, Startseite.notificationSymbol("booking_cancelled"))
        assertEquals(NotificationSymbol.PLATZ, Startseite.notificationSymbol("booking_created"))
        assertEquals(NotificationSymbol.PLATZ, Startseite.notificationSymbol("player_left"))
        assertEquals(NotificationSymbol.GELD, Startseite.notificationSymbol("charge_created"))
        assertEquals(NotificationSymbol.PERSON, Startseite.notificationSymbol("application_new"))
        assertEquals(NotificationSymbol.STORNO, Startseite.notificationSymbol("event_cancelled"))
        assertEquals(NotificationSymbol.GLOCKE, Startseite.notificationSymbol("sonstwas"))
        assertNull(Startseite.notificationZiel(null))
        assertNull(Startseite.notificationZiel(""))
        assertEquals("/verein/veranstaltung/e1", Startseite.notificationZiel("e1")?.app)
    }

    @Test
    fun formatCentsMitTausenderpunktUndMinus() {
        assertEquals("123.456,70 €", Geld.formatCents(12_345_670))
        assertEquals("-2,50 €", Geld.formatCents(-250))
    }

    @Test
    fun nextSlotMinute() {
        // 13:30:20 Berlin (Sommerzeit): 13:30 ist schon vorbei.
        assertEquals(840, Belegung.nextSlotMinute(480, 30, Instant.parse("2026-06-15T11:30:20Z")))
        assertEquals(810, Belegung.nextSlotMinute(480, 30, Instant.parse("2026-06-15T11:30:00Z")))
        assertEquals(480, Belegung.nextSlotMinute(480, 30, Instant.parse("2026-06-15T04:00:00Z")))
    }
}
