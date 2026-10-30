/*
 * Belegungsplan und Buchungsblatt
 *
 * Portierung aus packages/core/src: courtStatus.ts (courtStatusAt),
 * freeSlots.ts (freeSlotsOfDay, freeGaps, startInGap, occupancyLabel),
 * home.ts (blockingLabel) und booking.ts (bookingActions, checkPlayers,
 * missingPlayers, otherPlayersLabel, umsetzZiele), wie Kern/Platzplan.swift
 * der iOS-App. Gerechnet wird in Europe/Berlin (Zeit). Gepruefte Faelle:
 * packages/core/golden/<funktion>.json (PlatzplanGoldenTest).
 *
 * Wie ueberall gilt: Durchgesetzt werden die Regeln nur in den RPCs. Die App
 * blendet nur aus, was die Datenbank ohnehin ablehnen wuerde.
 */

package de.tcmuckensturm.kern

import java.time.Duration
import java.time.Instant
import kotlin.math.ceil
import kotlin.math.floor

/** Eine Belegung mit allem, was Status und Beschriftung brauchen (CourtSlot). */
interface PlanSlot : BelegterSlot, Belegungsmerkmale {
    val title: String?
    val typeName: String?
    val ownerName: String?
}

/** Eine Belegung mit Kennung - fuers Umsetzen (UmsetzBuchung). */
interface BuchungsSlot : BelegterSlot {
    val bookingId: String
}

/** `wert` wie in TypeScript (CourtStatusKind). */
enum class CourtStatusKind(val wert: String) {
    FREI("frei"),
    EIGEN("eigen"),
    SUCHT("sucht"),
    BELEGT("belegt"),
    SERIE("serie"),
    GESPERRT("gesperrt"),

    /** Um diese Zeit ist nichts, aber eine volle Stunde passt nicht mehr hinein. */
    KNAPP("knapp"),

    /** Die Zeit ist schon vorbei. */
    VORBEI("vorbei"),

    /** Eine volle Stunde endete nach Schluss. */
    SCHLUSS("schluss"),

    /** Liegt hinter dem Buchungsvorlauf, ist also noch nicht buchbar. */
    VORLAUF("vorlauf"),
}

data class CourtStatus<T>(
    val art: CourtStatusKind,
    val text: String,
    /** Die Belegung, um die es geht - zum Oeffnen im Blatt. */
    val belegung: T? = null,
)

data class PlatzStatus<T>(val courtId: String, val status: CourtStatus<T>)

data class FreeSlotRow<T>(
    /** Startzeit in Minuten seit Mitternacht */
    val minute: Int,
    /** Ein Eintrag je Platz, in der Reihenfolge der courtIds */
    val courts: List<PlatzStatus<T>>,
    /** Wie viele Plaetze zu dieser Zeit frei sind */
    val free: Int,
)

data class FreeGap(
    val courtId: String,
    /** Fruehester Beginn im Raster, der canStartAt besteht */
    val from: Int,
    /** Beginn der naechsten Belegung, sonst Schluss */
    val until: Int,
)

data class OccupancyLabel(
    val art: TimelineKind,
    /** Erste Zeile im Block, fett */
    val title: String,
    /** Zweite Zeile */
    val detail: String,
    /** Fuer TalkBack, ohne Platz */
    val spoken: String,
)

/** Kategorie und Grund einer Sperrung; der Grund ist freiwillig. */
data class BlockingLabel(val kategorie: String, val grund: String?)

/** Was der Betrachter an einer Buchung tun darf. */
data class BookingActions(
    /** Stornieren (cancel_booking) */
    val cancel: Boolean,
    /** Mitspieler aendern (update_booking_players) */
    val editPlayers: Boolean,
    /** Sich als Mitspieler austragen (leave_booking) */
    val leave: Boolean,
    /** Sich als Mitspieler eintragen (join_booking) */
    val join: Boolean,
)

/** Eine Spielform, wie die Besetzungsregeln sie brauchen (BookingTypeInfo). */
data class BookingTypeInfo(
    val code: String,
    val name: String,
    val durationMinutes: Int,
    val minPlayers: Int,
    val maxPlayers: Int,
    val requiresPartner: Boolean,
)

data class UmsetzZiel(
    val courtId: String,
    /** Startzeit in Minuten seit Mitternacht (Berlin) */
    val minute: Int,
)

/** Beginn und Ende einer Sperrung in Minuten des Tages, an dem sie beginnt. */
data class SperrZeit(val von: Int, val bis: Int)

object Platzplan {
    // ---- courtStatus.ts -------------------------------------------------------

    /** Was ist auf einem Platz zu dieser Minute los? Die Statuszeile der Freien Zeiten. */
    fun <T : PlanSlot> courtStatusAt(
        day: String,
        courtId: String,
        minute: Int,
        durationMinutes: Int,
        closingMinutes: Int,
        occupied: List<T>,
        leadDays: Int? = null,
        now: Instant = Instant.now(),
    ): CourtStatus<T> {
        // sortedBy ist stabil wie Array.prototype.sort
        val eigene = occupied.filter { it.courtId == courtId }.sortedBy { it.startsAt }

        // Liegt zu dieser Minute etwas auf dem Platz?
        eigene.firstOrNull { Zeit.minutesOf(it.startsAt) <= minute && Zeit.minutesOf(it.endsAt) > minute }
            ?.let { return beschreibe(it) }

        val frei = Belegung.canStartAt(day, courtId, minute, durationMinutes, closingMinutes, occupied, leadDays, now)
        if (frei) {
            val naechste = eigene.firstOrNull { Zeit.minutesOf(it.startsAt) >= minute }
            val bis = naechste?.let { Zeit.minutesOf(it.startsAt) } ?: closingMinutes
            return CourtStatus(
                CourtStatusKind.FREI,
                if (bis >= closingMinutes) {
                    "frei bis ${Zeit.minutesToTime(closingMinutes)}"
                } else {
                    "frei ${Zeit.minutesToTime(minute)} – ${Zeit.minutesToTime(bis)}"
                },
            )
        }

        val beginn = Zeit.berlinTime(day, minute)
        if (beginn < now) return CourtStatus(CourtStatusKind.VORBEI, "vorbei")
        if (minute + durationMinutes > closingMinutes) {
            return CourtStatus(CourtStatusKind.SCHLUSS, "Schluss um ${Zeit.minutesToTime(closingMinutes)}")
        }
        if (leadDays != null && beginn > Belegung.latestStart(leadDays, now)) {
            // Frei wird die Zeit, sobald sie in den Vorlauf rutscht - am letzten
            // Vorlauftag also heute zur genannten Uhrzeit.
            val ab = beginn.minusSeconds(leadDays * 86_400L)
            return CourtStatus(
                CourtStatusKind.VORLAUF,
                if (Zeit.berlinDay(ab) == Zeit.berlinDay(now)) {
                    "buchbar ab ${Zeit.minutesToTime(Zeit.localMinutes(ab))}"
                } else {
                    "noch nicht buchbar"
                },
            )
        }
        val gleichDanach = eigene.firstOrNull {
            Zeit.minutesOf(it.startsAt) > minute && Zeit.minutesOf(it.startsAt) < minute + durationMinutes
        } ?: return CourtStatus(CourtStatusKind.KNAPP, "nicht frei")
        return CourtStatus(
            CourtStatusKind.KNAPP,
            "belegt ab ${Zeit.minutesToTime(Zeit.minutesOf(gleichDanach.startsAt))}",
            gleichDanach,
        )
    }

    private fun <T : PlanSlot> beschreibe(b: T): CourtStatus<T> {
        val von = Zeit.minutesToTime(Zeit.minutesOf(b.startsAt))
        val bis = Zeit.minutesToTime(Zeit.minutesOf(b.endsAt))
        return when (Startseite.occupancyKind(b)) {
            TimelineKind.GESPERRT -> {
                val l = blockingLabel(b.title, b.typeName)
                CourtStatus(CourtStatusKind.GESPERRT, "gesperrt · ${l.grund?.let { "${l.kategorie}, $it" } ?: l.kategorie}", b)
            }
            TimelineKind.SERIE ->
                CourtStatus(CourtStatusKind.SERIE, "${nichtLeer(b.title) ?: b.typeName ?: "Serie"} bis $bis", b)
            TimelineKind.EIGEN -> CourtStatus(CourtStatusKind.EIGEN, "Deine Buchung · $von", b)
            TimelineKind.SUCHT -> CourtStatus(CourtStatusKind.SUCHT, "${b.typeName ?: "Spiel"} sucht ${b.frei ?: 1} · $von", b)
            TimelineKind.BELEGT -> CourtStatus(CourtStatusKind.BELEGT, "belegt bis $bis", b)
        }
    }

    // ---- freeSlots.ts ---------------------------------------------------------

    /**
     * Die Startzeiten eines Tages mit dem Status jedes Platzes (Freie Zeiten).
     * Heute zuerst die naechste Startzeit im Raster, danach volle Stunden bis
     * Schluss minus Dauer; an einem kommenden Tag ab der Oeffnung.
     */
    fun <T : PlanSlot> freeSlotsOfDay(
        day: String,
        courtIds: List<String>,
        openingMinutes: Int,
        closingMinutes: Int,
        slotMinutes: Int,
        durationMinutes: Int,
        occupied: List<T>,
        stepMinutes: Int = 60,
        leadDays: Int? = null,
        now: Instant = Instant.now(),
    ): List<FreeSlotRow<T>> {
        val letzte = closingMinutes - durationMinutes

        // Liegt der Schluss schon hinter uns, gibt es nichts mehr zu buchen.
        if (Zeit.berlinTime(day, closingMinutes) <= now) return emptyList()

        val heute = Zeit.berlinTime(day, 0) <= now
        val erste = if (heute) Belegung.nextSlotMinute(openingMinutes, slotMinutes, now) else openingMinutes

        val minuten = mutableListOf<Int>()
        if (erste <= letzte) minuten += erste
        var m = abrunden(erste, stepMinutes) * stepMinutes + stepMinutes
        while (m <= letzte) {
            minuten += m
            m += stepMinutes
        }

        return minuten.map { minute ->
            val courts = courtIds.map { courtId ->
                PlatzStatus(
                    courtId,
                    courtStatusAt(day, courtId, minute, durationMinutes, closingMinutes, occupied, leadDays, now),
                )
            }
            FreeSlotRow(minute, courts, courts.count { it.status.art == CourtStatusKind.FREI })
        }
    }

    /**
     * Die freien Flaechen eines Platzes, in die eine volle Buchung passt - im
     * Raster die Stellen, die sich antippen lassen.
     */
    fun freeGaps(
        day: String,
        courtId: String,
        openingMinutes: Int,
        closingMinutes: Int,
        slotMinutes: Int,
        durationMinutes: Int,
        occupied: List<BelegterSlot>,
        leadDays: Int? = null,
        now: Instant = Instant.now(),
    ): List<FreeGap> {
        val out = mutableListOf<FreeGap>()
        var m = openingMinutes
        while (m + durationMinutes <= closingMinutes) {
            val frei = Belegung.canStartAt(day, courtId, m, durationMinutes, closingMinutes, occupied, leadDays, now)
            if (frei) {
                val letzte = out.lastOrNull()
                if (letzte != null && m <= letzte.until - durationMinutes + slotMinutes) {
                    out[out.lastIndex] = letzte.copy(until = maxOf(letzte.until, m + durationMinutes))
                } else {
                    out += FreeGap(courtId, m, m + durationMinutes)
                }
            }
            m += slotMinutes
        }

        // Bis zur naechsten Belegung oder zum Schluss verlaengern - nicht aber
        // ueber den Vorlauf hinaus: dahinter laesst sich nichts antippen.
        val grenze = leadDays?.let { Belegung.latestStart(it, now) }
        return out.map { l ->
            if (grenze != null && Zeit.berlinTime(day, l.until - durationMinutes + slotMinutes) > grenze) return@map l
            val naechste = occupied
                .filter { it.courtId == courtId && Zeit.minutesOf(it.startsAt) >= l.until }
                .map { Zeit.minutesOf(it.startsAt) }
            l.copy(until = (naechste + closingMinutes).min())
        }
    }

    /** Die Startzeit fuer eine angetippte Minute: aufs Raster abgerundet, mit Platz fuer die volle Dauer. */
    fun startInGap(gap: FreeGap, minute: Int, slotMinutes: Int, durationMinutes: Int): Int {
        val spaetestens = gap.from + abrunden(gap.until - durationMinutes - gap.from, slotMinutes) * slotMinutes
        val gerastert = gap.from + abrunden(minute - gap.from, slotMinutes) * slotMinutes
        return minOf(spaetestens, maxOf(gap.from, gerastert))
    }

    /** Math.floor(a / b) - auch fuer negative a. */
    private fun abrunden(a: Int, b: Int): Int = floor(a.toDouble() / b).toInt()

    /**
     * Wie eine Belegung im Raster beschriftet ist: "Du / Einzel",
     * "[Name] / Doppel", "sucht 2 / Doppel", "Training / bis 19:00",
     * "Platzpflege / Grund".
     */
    fun occupancyLabel(b: PlanSlot): OccupancyLabel {
        val von = Zeit.minutesToTime(Zeit.minutesOf(b.startsAt))
        val bis = Zeit.minutesToTime(Zeit.minutesOf(b.endsAt))
        val art = Startseite.occupancyKind(b)
        val typ = b.typeName ?: "Spiel"
        val zeit = "$von bis $bis Uhr"

        return when (art) {
            TimelineKind.EIGEN -> OccupancyLabel(art, "Du", typ, "$zeit, deine Buchung, $typ")
            TimelineKind.SUCHT -> {
                val frei = b.frei ?: 1
                OccupancyLabel(art, "sucht $frei", typ, "$zeit, $typ sucht noch $frei Mitspieler")
            }
            TimelineKind.SERIE -> {
                val name = nichtLeer(b.title) ?: b.typeName ?: "Serie"
                OccupancyLabel(art, name, "bis $bis", "$zeit, $name")
            }
            TimelineKind.GESPERRT -> {
                val l = blockingLabel(b.title, b.typeName)
                OccupancyLabel(
                    art, l.kategorie, l.grund ?: "",
                    "$zeit, gesperrt, ${l.kategorie}${l.grund?.let { ", $it" } ?: ""}",
                )
            }
            TimelineKind.BELEGT -> {
                val wer = nichtLeer(b.ownerName) ?: "belegt"
                OccupancyLabel(art, wer, typ, "$zeit, belegt von $wer, $typ")
            }
        }
    }

    // ---- home.ts --------------------------------------------------------------

    /** Kategorie und Grund einer Sperrung; der Grund ist freiwillig. */
    fun blockingLabel(title: String?, typeName: String?): BlockingLabel =
        BlockingLabel(nichtLeer(typeName) ?: "Gesperrt", nichtLeer(title))

    /** Getrimmt, leer wird null (wie `x?.trim() || …` in TypeScript). */
    fun nichtLeer(text: String?): String? = text?.trim()?.takeIf { it.isNotEmpty() }

    // ---- booking.ts -----------------------------------------------------------

    /**
     * Welche Knoepfe eine Buchung bekommt - abgelesen aus den RPCs. Begonnen
     * ist eine Buchung ab ihrem Beginn; danach duerfen nur noch Platzrechte
     * stornieren und die Besetzung aendern.
     */
    fun bookingActions(
        startsAt: String,
        own: Boolean,
        joined: Boolean? = null,
        partnerWanted: Boolean? = null,
        free: Int? = null,
        managesCourts: Boolean? = null,
        now: Instant = Instant.now(),
    ): BookingActions {
        val beginn = Zeit.datum(startsAt) ?: Instant.MIN
        val begonnen = beginn <= now
        val platzrechte = managesCourts == true
        val verwalten = (own || platzrechte) && (!begonnen || platzrechte)
        return BookingActions(
            cancel = verwalten,
            editPlayers = verwalten,
            leave = !own && joined == true && !begonnen,
            join = !own && joined != true && partnerWanted == true && (free ?: 0) > 0 && !begonnen,
        )
    }

    /** Wie viele Mitspieler fehlen noch bis zur Untergrenze? Der Bucher zaehlt mit. */
    fun missingPlayers(type: BookingTypeInfo, memberCount: Int, guestCount: Int): Int {
        val gesamt = 1 + memberCount + guestCount
        return maxOf(mindestens(type) - gesamt, 0)
    }

    private fun mindestens(type: BookingTypeInfo): Int = maxOf(type.minPlayers, if (type.requiresPartner) 2 else 1)

    /** "1 weitere Person", "2–3 weitere Personen", "bis zu 3 weitere Personen" */
    fun otherPlayersLabel(type: BookingTypeInfo): String {
        val bis = type.maxPlayers - 1
        if (bis <= 0) return ""
        val von = minOf(mindestens(type) - 1, bis)
        val zahl = when {
            von == bis -> "$bis"
            von == 0 -> "bis zu $bis"
            else -> "$von–$bis"
        }
        return "$zahl ${if (bis == 1) "weitere Person" else "weitere Personen"}"
    }

    /**
     * Passt die Besetzung zur Spielform? Dieselben Grenzen wie create_booking:
     * wer Mitspieler sucht, darf unterbesetzt buchen. null heisst: passt.
     */
    fun checkPlayers(type: BookingTypeInfo, memberCount: Int, guestCount: Int, partnerWanted: Boolean = false): String? {
        val gesamt = 1 + memberCount + guestCount
        val fehlen = if (partnerWanted) 0 else missingPlayers(type, memberCount, guestCount)
        if (fehlen > 0) {
            val rest = if (fehlen == 1) "es fehlt noch ein Mitspieler" else "es fehlen noch $fehlen Mitspieler"
            return "„${type.name}“ braucht mindestens ${mindestens(type)} Spieler – $rest."
        }
        if (gesamt > type.maxPlayers) return "„${type.name}“ erlaubt höchstens ${type.maxPlayers} Spieler."
        return null
    }

    /**
     * Wohin laesst sich eine Buchung umsetzen? Dieselbe Frei-Regel wie
     * canStartAt, ohne die Buchung selbst; die Dauer bleibt. Eine laufende
     * Buchung wechselt nur den Platz, eine vergangene hat keine Ziele. Den
     * Buchungsvorlauf gibt es beim Umsetzen nicht.
     */
    fun umsetzZiele(
        booking: BuchungsSlot,
        day: String,
        courtIds: List<String>,
        openingMinutes: Int,
        closingMinutes: Int,
        slotMinutes: Int,
        occupied: List<BuchungsSlot>,
        now: Instant = Instant.now(),
    ): List<UmsetzZiel> {
        val beginn = Zeit.datum(booking.startsAt) ?: return emptyList()
        val ende = Zeit.datum(booking.endsAt) ?: return emptyList()
        if (ende <= now) return emptyList()

        val dauer = jsRound(Duration.between(beginn, ende).toMillis() / 60_000.0)
        val andere = occupied.filter { it.bookingId != booking.bookingId }
        val out = mutableListOf<UmsetzZiel>()

        if (beginn <= now) {
            if (day != Zeit.berlinDay(beginn)) return emptyList()
            val minute = Zeit.minutesOf(booking.startsAt)
            for (courtId in courtIds) {
                if (courtId == booking.courtId) continue
                // Die Zeit steht schon fest: nur ob der Platz frei ist.
                val frei = Belegung.canStartAt(day, courtId, minute, dauer, Int.MAX_VALUE / 2, andere, now = beginn)
                if (frei) out += UmsetzZiel(courtId, minute)
            }
            return out
        }

        // Das Raster zaehlt wie in der Datenbank ab Mitternacht, nicht ab Oeffnung.
        val erste = ceil(openingMinutes.toDouble() / slotMinutes).toInt() * slotMinutes
        for (courtId in courtIds) {
            var minute = erste
            while (minute + dauer <= closingMinutes) {
                val dortSchon = courtId == booking.courtId && Zeit.berlinTime(day, minute) == beginn
                if (!dortSchon) {
                    val frei = Belegung.canStartAt(day, courtId, minute, dauer, closingMinutes, andere, now = now)
                    if (frei) out += UmsetzZiel(courtId, minute)
                }
                minute += slotMinutes
            }
        }
        return out
    }

    // ---- apps/mobile/src/lib/plan.ts ------------------------------------------

    /**
     * Beginn und Ende einer Sperrung in Minuten des Tages, an dem sie beginnt.
     * Endet sie um Mitternacht oder spaeter, steht das Ende auf 24:00.
     */
    fun sperrZeit(b: Zeitraum): SperrZeit {
        val von = Zeit.minutesOf(b.startsAt)
        val beginn = Zeit.datum(b.startsAt) ?: Instant.EPOCH
        val ende = Zeit.datum(b.endsAt) ?: Instant.EPOCH
        val dauer = Duration.between(beginn, ende).toMillis() / 60_000.0
        return SperrZeit(von, minOf(von + jsRound(dauer), 24 * 60))
    }
}
