/*
 * Zeit in Europe/Berlin
 *
 * Portierung aus packages/core/src/booking.ts (berlinTime, localMinutes,
 * minutesOf, minutesToTime, timeToMinutes) und home.ts (berlinDay, Abstand in
 * Kalendertagen), wie Kern/Zeit.swift der iOS-App. Gerechnet wird immer in
 * Berliner Zeit, nie in der Zeitzone des Geraets. Gepruefte Faelle:
 * packages/core/golden/<funktion>.json (KernGoldenTest).
 *
 * Zeitpunkte bleiben in den Modellen Text wie in der Expo-App; `datum` liest
 * sie, egal ob PostgREST "+00:00" oder JavaScript "Z" schreibt.
 */

package de.tcmuckensturm.kern

import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeFormatterBuilder
import java.time.temporal.ChronoField
import java.time.temporal.ChronoUnit
import kotlin.math.floor

object Zeit {
    val berlinZone: ZoneId = ZoneId.of("Europe/Berlin")

    // Feste Namen statt DateTimeFormatter: dieselben Woerter auf jedem Geraet,
    // egal welche Sprache eingestellt ist. Index 0 ist Sonntag wie in JavaScript.
    val wochentageLang = listOf("Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag")
    val wochentageKurz = listOf("So", "Mo", "Di", "Mi", "Do", "Fr", "Sa")
    val monateLang = listOf(
        "Januar", "Februar", "März", "April", "Mai", "Juni",
        "Juli", "August", "September", "Oktober", "November", "Dezember",
    )

    /** Wie Intl "short", ohne den Punkt (eventDatumKachel) */
    val monateKurz = listOf("Jan", "Feb", "März", "Apr", "Mai", "Juni", "Juli", "Aug", "Sept", "Okt", "Nov", "Dez")

    // ---- Lesen und Schreiben ------------------------------------------------

    /** Datum und Uhrzeit, dahinter die Zone als "Z", "+02:00", "+0200" oder "+02" (oder keine: UTC). */
    private val lesen: DateTimeFormatter = DateTimeFormatterBuilder()
        .append(DateTimeFormatter.ISO_LOCAL_DATE)
        .appendLiteral('T')
        .appendValue(ChronoField.HOUR_OF_DAY, 2)
        .appendLiteral(':')
        .appendValue(ChronoField.MINUTE_OF_HOUR, 2)
        .optionalStart().appendLiteral(':').appendValue(ChronoField.SECOND_OF_MINUTE, 2).optionalEnd()
        .optionalStart().appendFraction(ChronoField.NANO_OF_SECOND, 0, 9, true).optionalEnd()
        .optionalStart().appendOffset("+HH:MM", "Z").optionalEnd()
        .optionalStart().appendOffset("+HHMM", "Z").optionalEnd()
        .optionalStart().appendOffset("+HH", "Z").optionalEnd()
        .toFormatter()

    private val schreiben: DateTimeFormatter =
        DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC)

    /**
     * ISO-8601 mit Zone ("2026-07-15T16:30:00Z", "...+00:00", "...123456+02:00")
     * oder nur ein Tag ("2026-09-01", gilt als UTC-Mitternacht wie in JavaScript).
     * null, wenn der Text kein Zeitpunkt ist.
     */
    fun datum(text: String): Instant? {
        val t = text.trim().replace(' ', 'T')
        return runCatching {
            if (t.length == 10) {
                LocalDate.parse(t).atStartOfDay(ZoneOffset.UTC).toInstant()
            } else {
                val gelesen = lesen.parse(t.replace('z', 'Z'))
                val ortszeit = LocalDateTime.from(gelesen)
                val versatz = if (gelesen.isSupported(ChronoField.OFFSET_SECONDS)) {
                    ZoneOffset.ofTotalSeconds(gelesen.get(ChronoField.OFFSET_SECONDS))
                } else {
                    ZoneOffset.UTC
                }
                ortszeit.toInstant(versatz)
            }
        }.getOrNull()
    }

    /** "2026-10-25T09:00:00.000Z" wie Date.toISOString() - so gehen Zeitpunkte an die Datenbank. */
    fun iso(zeitpunkt: Instant): String = schreiben.format(zeitpunkt.truncatedTo(ChronoUnit.MILLIS))

    // ---- booking.ts ---------------------------------------------------------

    /** "08:30" -> 510 */
    fun timeToMinutes(wert: String): Int {
        val teile = wert.split(":")
        val h = teile.getOrNull(0)?.toIntOrNull() ?: 0
        val m = teile.getOrNull(1)?.toIntOrNull() ?: 0
        return h * 60 + m
    }

    /** 510 -> "08:30" */
    fun minutesToTime(minuten: Int): String = "%02d:%02d".format(minuten / 60, minuten % 60)

    /** Uhrzeit in Minuten seit Mitternacht, gerechnet in Europe/Berlin. */
    fun localMinutes(zeitpunkt: Instant): Int {
        val z = zeitpunkt.atZone(berlinZone)
        return z.hour * 60 + z.minute
    }

    /** Dasselbe fuer einen ISO-Zeitstempel aus der Datenbank. */
    fun minutesOf(iso: String): Int = datum(iso)?.let(::localMinutes) ?: 0

    /** Versatz der Berliner Wanduhr gegenueber UTC in Minuten (60 im Winter, 120 im Sommer). */
    private fun berlinOffsetMinutes(zeitpunkt: Instant): Long =
        berlinZone.rules.getOffset(zeitpunkt).totalSeconds / 60L

    /**
     * Aus Tag ("2026-10-25") und Minute den echten Zeitpunkt machen, in
     * Europe/Berlin. Wie in booking.ts wird der Versatz zweimal bestimmt;
     * in der doppelten Stunde gewinnt die erste.
     */
    fun berlinTime(day: String, minutes: Int): Instant {
        val mitternacht = runCatching { LocalDate.parse(day) }.getOrDefault(LocalDate.EPOCH)
            .atStartOfDay(ZoneOffset.UTC).toInstant()
        val naiv = mitternacht.plusSeconds(minutes * 60L)
        val ersterVersuch = naiv.minusSeconds(berlinOffsetMinutes(naiv) * 60)
        return naiv.minusSeconds(berlinOffsetMinutes(ersterVersuch) * 60)
    }

    // ---- home.ts ------------------------------------------------------------

    /** "2026-09-28" fuer diesen Zeitpunkt in Berlin */
    fun berlinDay(zeitpunkt: Instant): String = zeitpunkt.atZone(berlinZone).toLocalDate().toString()

    /** Abstand in Kalendertagen (Berlin) von a nach b */
    fun tageZwischen(a: Instant, b: Instant): Int =
        ChronoUnit.DAYS.between(a.atZone(berlinZone).toLocalDate(), b.atZone(berlinZone).toLocalDate()).toInt()

    /** 0 = Sonntag wie Date.getDay() */
    private fun wochentagIndex(zeitpunkt: Instant): Int = zeitpunkt.atZone(berlinZone).dayOfWeek.value % 7

    /** Wochentag ohne Punkt: "Mi" */
    fun kurzerWochentag(zeitpunkt: Instant): String = wochentageKurz[wochentagIndex(zeitpunkt)]

    fun langerWochentag(zeitpunkt: Instant): String = wochentageLang[wochentagIndex(zeitpunkt)]

    /** "30.09." in Berlin */
    fun tagMonat(zeitpunkt: Instant): String {
        val z = zeitpunkt.atZone(berlinZone)
        return "%02d.%02d.".format(z.dayOfMonth, z.monthValue)
    }

    /** "Donnerstag, 29. Oktober" - der Kicker ueber "Hallo" auf Home */
    fun heuteLang(zeitpunkt: Instant): String {
        val z = zeitpunkt.atZone(berlinZone)
        return "${langerWochentag(zeitpunkt)}, ${z.dayOfMonth}. ${monateLang[z.monthValue - 1]}"
    }

    /** "Oktober" */
    fun monatLang(zeitpunkt: Instant): String = monateLang[zeitpunkt.atZone(berlinZone).monthValue - 1]

    /** Das Jahr in Berlin */
    fun jahr(zeitpunkt: Instant): Int = zeitpunkt.atZone(berlinZone).year
}

/** Math.round aus JavaScript: .5 rundet zur groesseren Zahl. */
fun jsRound(x: Double): Int = floor(x + 0.5).toInt()
