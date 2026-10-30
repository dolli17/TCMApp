/*
 * Die Logik der Verwaltung als reine Funktionen
 *
 * Wie Bildschirme/Verwaltung/VerwaltungLogik.swift der iOS-App, Portierung
 * aus apps/mobile/src/lib/verwaltung/plaetze.ts und gemeinsam.ts (normZeit,
 * deutschZuIso, isoZuDeutsch, zustandJetzt, pruefeSerie und die Meldungen
 * von sperre, legeSerieAn, aendereSerie, beendeSerie). Die Faelle stehen in
 * VerwaltungLogikTest, dieselben wie in VerwaltungTests.swift und
 * plaetze.test.ts. Die Meldungen sind wortgleich mit dem Web und der Expo-App.
 *
 * Getippt wird wie in der Expo-App: Uhrzeiten als HH:MM, Daten deutsch
 * (TT.MM.JJJJ). Gerechnet wird in Europe/Berlin (kern/Zeit.kt).
 */

package de.tcmuckensturm.app.bildschirme.verwaltung

import de.tcmuckensturm.app.bildschirme.plaetze.PlaetzeLogik
import de.tcmuckensturm.app.daten.Ich
import de.tcmuckensturm.app.daten.Meldung
import de.tcmuckensturm.app.daten.TagesBelegung
import de.tcmuckensturm.kern.Startseite
import de.tcmuckensturm.kern.TimelineKind
import de.tcmuckensturm.kern.Zeit
import de.tcmuckensturm.kern.formatiert
import java.time.DateTimeException
import java.time.Instant
import java.time.LocalDate

/** Was gerade auf einem Platz liegt: Sperrung oder Serie, mit Ende. */
data class PlatzJetzt(val art: Art, val text: String) {
    enum class Art { GESPERRT, SERIE }
}

/** Ton des Hinweises rechts in der Platzzeile (hinweisTon in Liste.tsx). */
enum class HinweisTon { LEISE, ROT, GOLD, GRUEN }

/** Das Formular "Serie anlegen", so wie es getippt wurde. */
data class SerienEingabe(
    val courtId: String,
    val bookingTypeCode: String,
    /** 0 = Sonntag wie in der Datenbank */
    val weekday: Int,
    val startTime: String,
    val endTime: String,
    /** Deutsch getippt */
    val validFrom: String,
    val validTo: String,
    val title: String,
)

/** Ein geprueftes Serienformular mit den Werten, die die RPCs brauchen. */
data class SerienWerte(
    val courtId: String,
    val bookingTypeCode: String,
    val weekday: Int,
    /** HH:MM */
    val startTime: String,
    val endTime: String,
    /** JJJJ-MM-TT */
    val validFrom: String,
    val validTo: String,
    val title: String,
)

/** Beginn und Ende einer Sperrung als Zeitpunkte. */
data class Sperrzeit(val von: Instant, val bis: Instant)

object VerwaltungLogik {
    const val KEINE_ZEIT = "Uhrzeit als HH:MM angeben."
    const val KEIN_DATUM = "Das Datum bitte als TT.MM.JJJJ angeben."

    // ---- Sichtbarkeit -----------------------------------------------------------

    /**
     * Den Tab gibt es nur mit Platzrechten (Vorstand, App Admin, Platzwart).
     * Wie im Web nur die Oberflaeche: die RPCs pruefen private.darf_plaetze() selbst.
     */
    fun sichtbar(ich: Ich?): Boolean = ich?.platzRechte == true || ich?.admin == true

    // ---- Eingaben ---------------------------------------------------------------

    private val zeitMuster = Regex("""^\d{1,2}[:.]\d{2}$""")

    /** "8:00", "08.00" oder "08:00" -> "08:00". Ungueltiges gibt null. */
    fun normZeit(text: String): String? {
        val t = text.trim()
        if (!zeitMuster.matches(t)) return null
        val teile = t.split(':', '.')
        val h = teile[0].toInt()
        val min = teile[1].toInt()
        if (h > 24 || min > 59 || (h == 24 && min > 0)) return null
        return "%02d:%s".formatiert(h, teile[1])
    }

    private val isoMuster = Regex("""^\d{4}-\d{2}-\d{2}$""")
    private val deutschMuster = Regex("""^\d{1,2}\.\d{1,2}\.(\d{2}|\d{4})$""")

    /**
     * 29.09.2026 (auch 29.9.26) -> 2026-09-29. ISO bleibt ISO. Ungueltiges
     * (31.02.) gibt null.
     */
    fun deutschZuIso(text: String): String? {
        val t = text.trim()
        if (isoMuster.matches(t)) return t
        if (!deutschMuster.matches(t)) return null
        val teile = t.split('.')
        val jahr = teile[2].toInt().let { if (teile[2].length == 2) 2000 + it else it }
        return try {
            LocalDate.of(jahr, teile[1].toInt(), teile[0].toInt()).toString()
        } catch (_: DateTimeException) {
            null
        }
    }

    /** 2026-09-29 -> 29.09.2026. Leer bleibt leer. */
    fun isoZuDeutsch(iso: String?): String {
        if (iso.isNullOrEmpty()) return ""
        val teile = iso.take(10).split('-')
        if (teile.size != 3) return iso
        return "${teile[2]}.${teile[1]}.${teile[0]}"
    }

    // ---- Zustand der Plaetze ----------------------------------------------------

    /**
     * Was jetzt gerade auf dem Platz liegt: Sperrung oder Serie aus dem
     * Tagesplan, eingeordnet wie im Belegungsplan (occupancyKind). Je Platz
     * zaehlt der erste laufende Eintrag; der Beginn zaehlt mit, das Ende nicht.
     */
    fun zustandJetzt(plan: List<TagesBelegung>, jetzt: Instant = Instant.now()): Map<String, PlatzJetzt> {
        val zustand = linkedMapOf<String, PlatzJetzt>()
        for (b in plan) {
            val art = when (Startseite.occupancyKind(b)) {
                TimelineKind.GESPERRT -> PlatzJetzt.Art.GESPERRT
                TimelineKind.SERIE -> PlatzJetzt.Art.SERIE
                else -> continue
            }
            if (b.courtId in zustand) continue
            val von = Zeit.datum(b.startsAt) ?: continue
            val bis = Zeit.datum(b.endsAt) ?: continue
            if (von > jetzt || jetzt >= bis) continue
            val ende = Zeit.minutesToTime(Zeit.minutesOf(b.endsAt))
            zustand[b.courtId] = PlatzJetzt(art, if (art == PlatzJetzt.Art.GESPERRT) "gesperrt bis $ende" else "Serie bis $ende")
        }
        return zustand
    }

    /** Hinweis und Ton rechts in der Platzzeile: stillgelegt, gesperrt/Serie bis …, sonst frei. */
    fun platzHinweis(aktiv: Boolean, jetzt: PlatzJetzt?): Pair<String, HinweisTon> = when {
        !aktiv -> "stillgelegt" to HinweisTon.LEISE
        jetzt == null -> "frei" to HinweisTon.GRUEN
        else -> jetzt.text to if (jetzt.art == PlatzJetzt.Art.GESPERRT) HinweisTon.ROT else HinweisTon.GOLD
    }

    /** Eine Sperrung wird im Platzplan bearbeitet und aufgehoben: nur die fuehrt dorthin. */
    fun fuehrtZuPlaetzen(jetzt: PlatzJetzt?): Boolean = jetzt?.art == PlatzJetzt.Art.GESPERRT

    // ---- Web --------------------------------------------------------------------

    /** Admins in die ganze Verwaltung, der Platzwart gleich zu den Plaetzen. */
    fun webPfad(admin: Boolean): String = if (admin) "/admin" else "/admin/plaetze"

    fun webTitel(admin: Boolean): String = if (admin) "Weitere Verwaltung am PC" else "Plätze & Serien am PC"

    fun webText(admin: Boolean): String =
        if (admin) {
            "Mitglieder, Kasse, Getränke, Plätze und Buchungsregeln pflegst du in der Verwaltung im Web."
        } else {
            "Sperren und Serien pflegst du bequemer in der Verwaltung im Web."
        }

    // ---- Einstellungen ----------------------------------------------------------

    /** "08:00:00" oder "08:00" -> "08:00"; ohne Wert die Vorgabe. */
    fun uhrzeit(wert: String?, ersatz: String): String = if (wert.isNullOrEmpty()) ersatz else wert.take(5)

    // ---- Sperren ----------------------------------------------------------------

    /** Was create_blocking braucht, oder die Meldung, warum nicht. */
    fun pruefeSperre(tag: String, von: String, bis: String): Result<Sperrzeit> {
        val iso = deutschZuIso(tag) ?: return Result.failure(Meldung(KEIN_DATUM))
        val v = normZeit(von)
        val b = normZeit(bis)
        if (v == null || b == null) return Result.failure(Meldung(KEINE_ZEIT))
        // Ueber berlinTime, nie als Zeitstempel ohne Zone: den laese Postgres als UTC.
        return Result.success(
            Sperrzeit(Zeit.berlinTime(iso, Zeit.timeToMinutes(v)), Zeit.berlinTime(iso, Zeit.timeToMinutes(b))),
        )
    }

    fun gesperrtMeldung(angelegt: Int, verdraengt: Int): String =
        if (verdraengt > 0) {
            "$angelegt Plätze gesperrt, $verdraengt Buchungen verdrängt. Die Betroffenen wurden benachrichtigt."
        } else {
            "$angelegt ${if (angelegt == 1) "Platz" else "Plätze"} gesperrt."
        }

    // ---- Serien -----------------------------------------------------------------

    /**
     * Prueft ein Serienformular wie seriesSchema in @tcm/core und gibt die
     * Werte so zurueck, wie die RPCs sie brauchen.
     */
    fun pruefeSerie(f: SerienEingabe): Result<SerienWerte> {
        val ab = deutschZuIso(f.validFrom)
        val bis = deutschZuIso(f.validTo)
        if (ab == null || bis == null) return Result.failure(Meldung(KEIN_DATUM))
        val start = normZeit(f.startTime)
        val ende = normZeit(f.endTime)
        if (start == null || ende == null) return Result.failure(Meldung(KEINE_ZEIT))
        val titel = f.title.trim()
        if (f.courtId.isEmpty() || f.bookingTypeCode.isEmpty() || f.weekday !in 0..6) {
            return Result.failure(Meldung("Die Angaben stimmen nicht."))
        }
        if (titel.isEmpty()) return Result.failure(Meldung("Titel fehlt."))
        if (titel.length > 200) return Result.failure(Meldung("Die Angaben stimmen nicht."))
        if (ende <= start) return Result.failure(Meldung("Die Endzeit muss nach der Startzeit liegen."))
        if (bis < ab) return Result.failure(Meldung("Das Enddatum darf nicht vor dem Startdatum liegen."))
        return Result.success(
            SerienWerte(
                courtId = f.courtId, bookingTypeCode = f.bookingTypeCode, weekday = f.weekday,
                startTime = start, endTime = ende, validFrom = ab, validTo = bis, title = f.title,
            ),
        )
    }

    /** "2 Termine kollidieren mit ..." - die Zahl fuer die Rueckfrage beim Aendern. */
    fun terminKollisionen(meldung: String): Int? =
        Regex("""^(\d+) Termine kollidieren""").find(meldung)?.groupValues?.get(1)?.toIntOrNull()

    fun serieAngelegtMeldung(angelegt: Int, verdraengt: Int): String =
        "Serie angelegt: $angelegt Termine" +
            if (verdraengt > 0) ", $verdraengt bestehende Buchungen verdrängt und die Betroffenen benachrichtigt." else "."

    fun serieGeaendertMeldung(neu: Int, verdraengt: Int): String =
        if (verdraengt > 0) {
            "Serie geändert: $neu Termine neu angelegt, $verdraengt Buchungen verdrängt. Die Betroffenen wurden benachrichtigt."
        } else {
            "Serie geändert: $neu künftige ${if (neu == 1) "Termin steht" else "Termine stehen"} in der neuen Lage."
        }

    fun serieBeendetMeldung(weg: Int): String =
        if (weg > 0) {
            "Serie beendet. $weg künftige ${if (weg == 1) "Termin wurde" else "Termine wurden"} abgesagt."
        } else {
            "Serie beendet. Es standen keine Termine mehr aus."
        }

    /** Die Vorschau nach dem Pruefen: wie viele Termine und was im Weg liegt. */
    fun vorschauText(termine: Int, kollisionen: Int): String =
        if (kollisionen == 0) {
            "$termine Termine, nichts im Weg. Die Serie kann so angelegt werden."
        } else {
            PlaetzeLogik.imWegText(kollisionen)
        }

    /** Der gelbe Knopf nach der Vorschau. */
    fun anlegenText(termine: Int, kollisionen: Int): String =
        if (kollisionen == 0) "Serie anlegen · $termine Termine" else "Anlegen und ${PlaetzeLogik.verdraengenText(kollisionen)}"

    /** Eine Zeile der Vorschau: "• Di, 06.10., 18:30 · Max Muster" */
    fun kollisionsZeile(startsAt: String, mitglied: String?, art: String?): String {
        val wer = mitglied ?: if (art == "blocking") "andere Blockung" else "unbekannt"
        val d = Zeit.datum(startsAt) ?: return "• $wer"
        return "• ${Zeit.kurzerWochentag(d)}, ${Zeit.tagMonat(d)}, ${Zeit.minutesToTime(Zeit.localMinutes(d))} · $wer"
    }

    val kurzeWochentage = listOf("SO", "MO", "DI", "MI", "DO", "FR", "SA")

    /** Mo bis So, wie im Web - die Datenbank zaehlt ab Sonntag (0). */
    val wochentagWahl: List<Pair<Int, String>> =
        listOf(1 to "Mo", 2 to "Di", 3 to "Mi", 4 to "Do", 5 to "Fr", 6 to "Sa", 0 to "So")

    private fun wochentag(weekday: Int?): String = weekday?.takeIf { it in 0..6 }?.let { Zeit.wochentageLang[it] } ?: ""

    /** "Dienstag · 18:30 – 20:00" */
    fun serienZeit(weekday: Int?, start: String?, ende: String?): String =
        "${wochentag(weekday)} · ${(start ?: "").take(5)} – ${(ende ?: "").take(5)}"

    /** "Training · Platz 1 · bis 31.10.2026" */
    fun serienKontext(typ: String?, platz: String?, bis: String?): String =
        listOfNotNull(typ, platz, bis?.let { "bis ${isoZuDeutsch(it)}" }).filter { it.isNotEmpty() }.joinToString(" · ")

    /** "Platz 1 · Dienstag · Training" unter dem Titel des Serienblatts. */
    fun serienUnterzeile(platz: String?, weekday: Int?, typ: String?): String =
        listOfNotNull(platz, wochentag(weekday), typ).joinToString(" · ")

    /** "1" statt "P1" auf den Chips beim Sperren. */
    fun platzChip(kurz: String?): String = when {
        kurz == null -> ""
        kurz.startsWith("P") -> kurz.drop(1)
        else -> kurz
    }

    /** "1" statt "Platz 1" auf den Chips der Serie. */
    fun platzOhneWort(name: String?): String = name?.replace(Regex("""^[Pp][Ll][Aa][Tt][Zz]\s*"""), "") ?: ""
}
