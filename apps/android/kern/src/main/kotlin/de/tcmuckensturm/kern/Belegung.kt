/*
 * Freie Plaetze
 *
 * Portierung aus packages/core/src/booking.ts (canStartAt, nextSlotMinute,
 * latestStart, freeCourtsNow), wie Kern/Belegung.swift der iOS-App - fuer
 * "Jetzt frei" auf Home. Durchgesetzt wird die Regel weiterhin nur in
 * create_booking; die App blendet nur aus, was die Datenbank ohnehin
 * ablehnen wuerde.
 */

package de.tcmuckensturm.kern

import java.time.Duration
import java.time.Instant
import kotlin.math.ceil

/** Eine Belegung, wie day_schedule sie liefert - nur was die Frei-Rechnung braucht. */
interface BelegterSlot : Zeitraum {
    val courtId: String
}

data class FreeWindow(
    val courtId: String,
    /** Erste Startzeit im Raster ab jetzt, in Minuten seit Mitternacht */
    val fromMinute: Int,
    /** Beginn der naechsten Belegung auf diesem Platz, sonst Schluss */
    val untilMinute: Int,
)

object Belegung {
    /** Der spaeteste Beginn, den create_booking jetzt noch annimmt: now() plus lead_days Tage. */
    fun latestStart(leadDays: Int, now: Instant = Instant.now()): Instant = now.plus(Duration.ofDays(leadDays.toLong()))

    /** Kann auf diesem Platz um genau diese Minute eine Buchung beginnen? (gegen die volle Dauer) */
    fun canStartAt(
        day: String,
        courtId: String,
        minute: Int,
        durationMinutes: Int,
        closingMinutes: Int,
        occupied: List<BelegterSlot>,
        leadDays: Int? = null,
        now: Instant = Instant.now(),
    ): Boolean {
        val beginn = Zeit.berlinTime(day, minute)
        if (beginn < now) return false
        if (leadDays != null && beginn > latestStart(leadDays, now)) return false
        if (minute + durationMinutes > closingMinutes) return false
        return occupied.none { b ->
            b.courtId == courtId &&
                Zeit.minutesOf(b.startsAt) < minute + durationMinutes &&
                Zeit.minutesOf(b.endsAt) > minute
        }
    }

    /** Die naechste Startzeit im Raster ab jetzt - vor der Oeffnung die Oeffnung. */
    fun nextSlotMinute(openingMinutes: Int, slotMinutes: Int, now: Instant = Instant.now()): Int {
        // Angebrochene Minuten zaehlen als vorbei: um 13:30:20 ist 13:30 schon Vergangenheit.
        val angebrochen = if (now.toEpochMilli() % 60_000 != 0L) 1 else 0
        val jetzt = Zeit.localMinutes(now) + angebrochen
        if (jetzt <= openingMinutes) return openingMinutes
        val schritte = ceil((jetzt - openingMinutes).toDouble() / slotMinutes).toInt()
        return openingMinutes + schritte * slotMinutes
    }

    /**
     * Welche Plaetze sind ab jetzt frei - und bis wann? Ab der naechsten
     * Startzeit im Raster muss die volle Dauer frei sein; "bis" ist der Beginn
     * der naechsten Belegung oder der Schluss. Die laengste Luecke zuerst.
     */
    fun freeCourtsNow(
        day: String,
        courtIds: List<String>,
        openingMinutes: Int,
        closingMinutes: Int,
        slotMinutes: Int,
        durationMinutes: Int,
        occupied: List<BelegterSlot>,
        leadDays: Int? = null,
        now: Instant = Instant.now(),
    ): List<FreeWindow> {
        val ab = nextSlotMinute(openingMinutes, slotMinutes, now)

        val out = courtIds.filter { courtId ->
            canStartAt(day, courtId, ab, durationMinutes, closingMinutes, occupied, leadDays, now)
        }.map { courtId ->
            val naechste = occupied
                .filter { it.courtId == courtId && Zeit.minutesOf(it.endsAt) > ab }
                .map { Zeit.minutesOf(it.startsAt) }
            FreeWindow(courtId, ab, (naechste + closingMinutes).min())
        }
        // sortedByDescending ist stabil wie Array.prototype.sort.
        return out.sortedByDescending { it.untilMinute }
    }
}
