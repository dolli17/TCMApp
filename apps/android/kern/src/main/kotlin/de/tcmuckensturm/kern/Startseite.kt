/*
 * Aufbereitung fuer die Startseite
 *
 * Portierung aus packages/core/src/home.ts, wie Kern/Startseite.swift der
 * iOS-App: welche Termine noch kommen, wie ein Termin ueberschrieben wird,
 * wie alt eine Nachricht ist, was im Monat an Getraenken aufgelaufen ist und
 * wie eine Belegung auf der kleinen Zeitleiste liegt. Gerechnet wird in
 * Europe/Berlin (Zeit).
 */

package de.tcmuckensturm.kern

import java.time.Duration
import java.time.Instant
import kotlin.math.floor

/** Etwas mit Beginn und Ende als ISO-Text (Buchung, Belegung, offenes Spiel) */
interface Zeitraum {
    val startsAt: String
    val endsAt: String
}

/** Was eine Belegung ausmacht, soweit es fuer ihre Einordnung zaehlt (OccupancyFlags). */
interface Belegungsmerkmale {
    val kind: String?
    val isOwn: Boolean?
    val partnerWanted: Boolean?
    val frei: Int?
    val seriesId: String?
}

interface Benachrichtigungsdaten {
    val createdAt: String
    val readAt: String?
}

interface Getraenkekauf {
    val totalCents: Int?
    val voidedAt: String?
}

enum class TimelineKind(val wert: String) {
    BELEGT("belegt"),
    EIGEN("eigen"),
    SUCHT("sucht"),
    SERIE("serie"),
    GESPERRT("gesperrt"),
}

data class TimelineSegment(
    /** Anteil vom linken Rand, 0 bis 100 */
    val left: Double,
    /** Breite, 0 bis 100 */
    val width: Double,
    val art: TimelineKind,
)

enum class NotificationSymbol { PLATZ, STORNO, GELD, PERSON, GLOCKE }

/** Wohin eine Nachricht fuehrt. Nativ zaehlt die Kennung, die Pfade bleiben fuer Links. */
data class NotificationZiel(val eventId: String) {
    val web: String get() = "/verein/veranstaltungen/$eventId"
    val app: String get() = "/verein/veranstaltung/$eventId"
}

object Startseite {
    /** So viele Tage bleibt eine gelesene Nachricht auf der Startseite stehen. */
    const val NEUIGKEITEN_TAGE = 7

    /** Termine, die noch nicht vorbei sind, der naechste zuerst (stabil wie Array.prototype.sort). */
    fun <T : Zeitraum> upcomingBookings(termine: List<T>, now: Instant = Instant.now()): List<T> =
        termine
            .filter { t -> Zeit.datum(t.endsAt)?.isAfter(now) == true }
            .sortedBy { it.startsAt }

    /**
     * Die Zeile ueber der Uhrzeit einer Terminkarte: "Heute · in 3 Stunden",
     * "Heute · läuft gerade", "Morgen", "Mittwoch · 30.09.".
     */
    fun bookingKicker(startsAt: String, endsAt: String, now: Instant = Instant.now()): String {
        val beginn = Zeit.datum(startsAt) ?: return ""
        val tage = Zeit.tageZwischen(now, beginn)

        if (tage <= 0) {
            if (beginn <= now) {
                val ende = Zeit.datum(endsAt) ?: beginn
                return if (ende > now) "Heute · läuft gerade" else "Heute"
            }
            val minuten = jsRound(Duration.between(now, beginn).toMillis() / 60_000.0)
            if (minuten < 60) return "Heute · in $minuten ${if (minuten == 1) "Minute" else "Minuten"}"
            val stunden = jsRound(minuten / 60.0)
            return "Heute · in $stunden ${if (stunden == 1) "Stunde" else "Stunden"}"
        }
        if (tage == 1) return "Morgen"
        return "${Zeit.langerWochentag(beginn)} · ${Zeit.tagMonat(beginn)}"
    }

    /** "Heute", "Morgen", sonst "Donnerstag, 01.10." */
    fun dayLabel(startsAt: String, now: Instant = Instant.now()): String {
        val beginn = Zeit.datum(startsAt) ?: return ""
        val tage = Zeit.tageZwischen(now, beginn)
        if (tage == 0) return "Heute"
        if (tage == 1) return "Morgen"
        return "${Zeit.langerWochentag(beginn)}, ${Zeit.tagMonat(beginn)}"
    }

    /** Kurzer Tag fuer die Datumsmarke eines offenen Spiels: "HEUTE", "MORGEN", "MI". */
    fun dayTag(startsAt: String, now: Instant = Instant.now()): String {
        val beginn = Zeit.datum(startsAt) ?: return ""
        val tage = Zeit.tageZwischen(now, beginn)
        if (tage <= 0) return "HEUTE"
        if (tage == 1) return "MORGEN"
        return Zeit.kurzerWochentag(beginn).uppercase()
    }

    /**
     * Wie alt ist eine Nachricht? "gerade eben", "vor 5 Min.", "vor 2 Std.",
     * "gestern", innerhalb einer Woche der Wochentag ("Sa"), danach das Datum.
     */
    fun relativeTimeLabel(iso: String, now: Instant = Instant.now()): String {
        val zeit = Zeit.datum(iso) ?: return ""
        val minuten = floor(Duration.between(zeit, now).toMillis() / 60_000.0).toInt()
        val tage = Zeit.tageZwischen(zeit, now)

        if (tage <= 0) {
            if (minuten < 1) return "gerade eben"
            if (minuten < 60) return "vor $minuten Min."
            return "vor ${minuten / 60} Std."
        }
        if (tage == 1) return "gestern"
        if (tage < 7) return Zeit.kurzerWochentag(zeit)
        return Zeit.tagMonat(zeit)
    }

    /**
     * Was die Startseite unter "Neuigkeiten" zeigt: Ungelesenes, egal wie alt,
     * und Gelesenes der letzten sieben Tage, hoechstens `max` Stueck. Die
     * Reihenfolge bleibt die der Liste.
     */
    fun <T : Benachrichtigungsdaten> startseitenNeuigkeiten(
        liste: List<T>,
        now: Instant = Instant.now(),
        max: Int = 3,
    ): List<T> {
        val grenze = now.minus(Duration.ofDays(NEUIGKEITEN_TAGE.toLong()))
        return liste
            .filter { n -> n.readAt == null || Zeit.datum(n.createdAt)?.let { it >= grenze } == true }
            .take(max)
    }

    /** Summe der Getraenke, die nicht zurueckgenommen wurden. */
    fun sumOpenDrinks(kaeufe: List<Getraenkekauf>): Int =
        kaeufe.sumOf { k -> if (k.voidedAt.isNullOrEmpty()) k.totalCents ?: 0 else 0 }

    /** Die Art einer Belegung; die Reihenfolge zaehlt (siehe home.ts). */
    fun occupancyKind(b: Belegungsmerkmale): TimelineKind = when {
        !b.seriesId.isNullOrEmpty() -> TimelineKind.SERIE
        b.kind == "blocking" -> TimelineKind.GESPERRT
        b.isOwn == true -> TimelineKind.EIGEN
        b.partnerWanted == true && (b.frei ?: 0) > 0 -> TimelineKind.SUCHT
        else -> TimelineKind.BELEGT
    }

    /** Wo eine Belegung auf der Zeitleiste von Oeffnung bis Schluss liegt, in Prozent. */
    fun <T> timelineSegments(
        belegungen: List<T>,
        openingMinutes: Int,
        closingMinutes: Int,
    ): List<TimelineSegment> where T : Zeitraum, T : Belegungsmerkmale {
        val spanne = closingMinutes - openingMinutes
        if (spanne <= 0) return emptyList()
        return belegungen.mapNotNull { b ->
            val von = maxOf(openingMinutes, Zeit.minutesOf(b.startsAt))
            val bis = minOf(closingMinutes, Zeit.minutesOf(b.endsAt))
            if (bis <= von) return@mapNotNull null
            TimelineSegment(
                left = (von - openingMinutes).toDouble() / spanne * 100,
                width = (bis - von).toDouble() / spanne * 100,
                art = occupancyKind(b),
            )
        }
    }

    /** Position einer Minute auf derselben Zeitleiste, in Prozent (0 bis 100). */
    fun timelinePosition(minute: Int, openingMinutes: Int, closingMinutes: Int): Double {
        val spanne = closingMinutes - openingMinutes
        if (spanne <= 0) return 0.0
        return ((minute - openingMinutes).toDouble() / spanne * 100).coerceIn(0.0, 100.0)
    }

    // ---- Benachrichtigungen -------------------------------------------------

    fun notificationSymbol(kind: String): NotificationSymbol = when {
        kind in setOf("booking_cancelled", "booking_displaced", "booking_removed") -> NotificationSymbol.STORNO
        kind == "event_cancelled" -> NotificationSymbol.STORNO
        kind.startsWith("booking_") || kind == "player_left" -> NotificationSymbol.PLATZ
        kind.startsWith("charge_") -> NotificationSymbol.GELD
        kind.startsWith("application_") -> NotificationSymbol.PERSON
        else -> NotificationSymbol.GLOCKE
    }

    /** Zur Veranstaltung, wenn die Nachricht eine nennt, sonst nirgends. */
    fun notificationZiel(eventId: String?): NotificationZiel? =
        eventId?.takeIf { it.isNotEmpty() }?.let(::NotificationZiel)

    data class Gruppe<T>(val label: String, val items: List<T>)

    /**
     * Nachrichten nach Tagen gruppiert (Berlin): Heute, Gestern, Diese Woche
     * (die letzten sieben Tage), Früher. Leere Gruppen fallen weg.
     */
    fun <T : Benachrichtigungsdaten> groupNotifications(liste: List<T>, now: Instant = Instant.now()): List<Gruppe<T>> {
        val labels = listOf("Heute", "Gestern", "Diese Woche", "Früher")
        val gruppen = List(labels.size) { mutableListOf<T>() }
        for (n in liste) {
            val tage = Zeit.datum(n.createdAt)?.let { Zeit.tageZwischen(it, now) } ?: 0
            val i = when {
                tage <= 0 -> 0
                tage == 1 -> 1
                tage < 7 -> 2
                else -> 3
            }
            gruppen[i] += n
        }
        return labels.indices.filter { gruppen[it].isNotEmpty() }.map { Gruppe(labels[it], gruppen[it]) }
    }
}
