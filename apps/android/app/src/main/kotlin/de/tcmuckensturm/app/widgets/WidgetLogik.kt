/*
 * Was die Widgets zeigen und wann sie neu laden, als reine Funktionen
 *
 * Wie TCMWidgets/Gemeinsam/WidgetLogik.swift der iOS-App, ohne Glance und
 * ohne Netz, damit sich alles in JUnit pruefen laesst (WidgetLogikTest).
 * Gerechnet wird mit dem Kern (Startseite, Belegung, Platzplan) in
 * Europe/Berlin - dieselben Saetze wie auf Home.
 */

package de.tcmuckensturm.app.widgets

import de.tcmuckensturm.app.bildschirme.home.HomeLogik
import de.tcmuckensturm.kern.Belegung
import de.tcmuckensturm.kern.FreeGap
import de.tcmuckensturm.kern.FreeWindow
import de.tcmuckensturm.kern.Platzplan
import de.tcmuckensturm.kern.Startseite
import de.tcmuckensturm.kern.TimelineKind
import de.tcmuckensturm.kern.TimelineSegment
import de.tcmuckensturm.kern.Zeit
import de.tcmuckensturm.kern.Zeitraum
import java.net.URI
import java.time.Duration
import java.time.Instant
import kotlin.math.roundToInt

// ---- Zustand und Groessen ------------------------------------------------------

/** Was ein Widget gerade zeigen kann. */
sealed interface WidgetZustand {
    data class Daten(val schnappschuss: WidgetSchnappschuss) : WidgetZustand

    /** Keine Sitzung (oder kein Zugang) */
    data object Abgemeldet : WidgetZustand

    /** Angemeldet, aber noch nichts geladen (oder kein Netz beim ersten Mal) */
    data object KeineDaten : WidgetZustand

    companion object {
        fun aus(schnappschuss: WidgetSchnappschuss?, sitzungVorhanden: Boolean): WidgetZustand = when {
            schnappschuss != null -> Daten(schnappschuss)
            sitzungVorhanden -> KeineDaten
            else -> Abgemeldet
        }
    }
}

/** Die Groessen der Widgets, wie systemSmall, systemMedium und systemLarge in iOS. */
enum class WidgetFamilie { KLEIN, MITTEL, GROSS }

object WidgetGroesse {
    /** Ab dieser Breite (dp) ist ein Widget mittel, ab dieser Hoehe gross - etwa 2×2, 4×2 und 4×4 Zellen. */
    const val MITTEL_AB_BREITE = 220
    const val GROSS_AB_HOEHE = 220

    fun familie(breite: Float, hoehe: Float): WidgetFamilie = when {
        breite >= MITTEL_AB_BREITE && hoehe >= GROSS_AB_HOEHE -> WidgetFamilie.GROSS
        breite >= MITTEL_AB_BREITE -> WidgetFamilie.MITTEL
        else -> WidgetFamilie.KLEIN
    }
}

/** Wohin ein Tippen auf das Widget fuehrt, als Pfad fuer WidgetLink. */
object WidgetZiele {
    fun spiele(zustand: WidgetZustand): String = if (zustand is WidgetZustand.Abgemeldet) WidgetLink.HOME else WidgetLink.PLAETZE

    fun plaetze(zustand: WidgetZustand): String = spiele(zustand)

    fun veranstaltung(zustand: WidgetZustand, jetzt: Instant): String {
        if (zustand !is WidgetZustand.Daten) return WidgetLink.HOME
        val v = WidgetInhalt.veranstaltung(zustand.schnappschuss.veranstaltungen.orEmpty(), jetzt) ?: return WidgetLink.VEREIN
        return WidgetLink.veranstaltung(v.id)
    }
}

// ---- Zeitplan -----------------------------------------------------------------

object WidgetZeitplan {
    /**
     * Spaetestens so oft laedt die WidgetArbeit neu. Anders als in iOS (Plaetze
     * 30, Termine 60 Minuten) gibt es eine Arbeit fuer alle drei Widgets.
     */
    val TAKT: Duration = Duration.ofMinutes(30)

    /** Juenger als das: nicht noch einmal laden - die App hat gerade abgelegt. */
    val FRISCH: Duration = Duration.ofMinutes(5)

    /** Die naechste Mitternacht in Berlin nach `jetzt` (auch an den Tagen mit 23 oder 25 Stunden). */
    fun naechsteMitternacht(nach: Instant): Instant =
        nach.atZone(Zeit.berlinZone).toLocalDate().plusDays(1).atStartOfDay(Zeit.berlinZone).toInstant()

    /**
     * Wann wieder geladen werden soll: kurz nach dem Ende des naechsten (oder
     * laufenden) eigenen Spiels, um Mitternacht in Berlin, spaetestens nach
     * `takt` - was zuerst kommt.
     */
    fun neuLaden(termine: List<Zeitraum>, jetzt: Instant, takt: Duration = TAKT): Instant {
        val kandidaten = mutableListOf(jetzt.plus(takt), naechsteMitternacht(jetzt))
        val ende = Startseite.upcomingBookings(termine, jetzt).firstOrNull()?.let { Zeit.datum(it.endsAt) }
        // Eine Minute Luft, damit das Spiel dann sicher vorbei ist.
        if (ende != null) kandidaten += ende.plusSeconds(60)
        return kandidaten.filter { it > jetzt }.minOrNull() ?: jetzt.plus(takt)
    }

    /**
     * Wann die WidgetArbeit das naechste Mal laeuft. Glance kennt keine Zeitleiste
     * mit Eintraegen wie WidgetKit: dafuer laeuft sie zusaetzlich zu Beginn eines
     * eigenen Spiels ("läuft gerade"). Sonst wie `neuLaden`.
     */
    fun naechsterLauf(termine: List<Zeitraum>, jetzt: Instant, takt: Duration = TAKT): Instant {
        val laden = neuLaden(termine, jetzt, takt)
        val beginn = termine.mapNotNull { Zeit.datum(it.startsAt) }.filter { it > jetzt }.minOrNull()
        return if (beginn != null && beginn < laden) beginn else laden
    }

    /** Ob der Schnappschuss so alt ist, dass die Arbeit neu laden soll. */
    fun mussLaden(stand: Instant?, jetzt: Instant): Boolean = stand == null || Duration.between(stand, jetzt) > FRISCH
}

// ---- Meine naechsten Spiele -----------------------------------------------------

data class SpielZeile(
    val id: String,
    /** "Heute · in 2 Stunden", "Morgen", "Mittwoch · 30.09." (bookingKicker) */
    val kicker: String,
    /** "17:00" */
    val beginn: String,
    /** "17:00 – 18:00" */
    val zeit: String,
    val platz: String,
    val art: String,
    val mit: String,
)

// ---- Plaetze jetzt --------------------------------------------------------------

/** Ein Stueck der Zeitleiste, in Prozent von Oeffnung bis Schluss. */
data class LeistenStueck(val left: Double, val width: Double)

data class PlatzZeile(
    val id: String,
    val name: String,
    /** "frei bis 19:00", "belegt bis 18:00", "frei ab 20:00", "heute belegt" */
    val status: String,
    val freiJetzt: Boolean,
    val belegt: List<TimelineSegment>,
    /** Wo heute noch eine volle Buchung passt */
    val frei: List<LeistenStueck>,
    /** "17:00–19:00, 20:00–21:00" oder "keine freie Zeit mehr" */
    val lueckenText: String,
)

data class PlaetzeLage(
    val zeilen: List<PlatzZeile>,
    /** "3 von 6 frei", nach Schluss "Für heute geschlossen" */
    val ueberschrift: String,
    val freiJetzt: Int,
    /** Marke fuer jetzt, in Prozent */
    val jetzt: Double,
    val geschlossen: Boolean,
)

// ---- Aufbereitung ---------------------------------------------------------------

object WidgetInhalt {
    fun spiele(termine: List<WidgetTermin>, jetzt: Instant, hoechstens: Int): List<SpielZeile> =
        Startseite.upcomingBookings(termine, jetzt).take(hoechstens).map { t ->
            SpielZeile(
                id = t.id,
                kicker = Startseite.bookingKicker(t.startsAt, t.endsAt, jetzt),
                beginn = Zeit.minutesToTime(Zeit.minutesOf(t.startsAt)),
                zeit = HomeLogik.zeitSpanne(t),
                platz = t.platz,
                art = t.art,
                mit = t.mit,
            )
        }

    /** "Stand 14:30", wenn der Schnappschuss aelter als eine Dreiviertelstunde ist (kein Netz), sonst null. */
    fun standText(stand: Instant, jetzt: Instant): String? {
        if (Duration.between(stand, jetzt) <= Duration.ofMinutes(45)) return null
        val tag = if (Zeit.tageZwischen(stand, jetzt) == 0) "" else "${Zeit.tagMonat(stand)} "
        return "Stand $tag${Zeit.minutesToTime(Zeit.localMinutes(stand))}"
    }

    /** Fuer das mittlere Widget: die jetzt freien Plaetze zuerst, sonst in der Reihenfolge der Plaetze. */
    fun mittelZeilen(zeilen: List<PlatzZeile>, hoechstens: Int): List<PlatzZeile> =
        (zeilen.filter { it.freiJetzt } + zeilen.filter { !it.freiJetzt }).take(hoechstens)

    /** Die naechste Veranstaltung, die noch nicht vorbei ist. */
    fun veranstaltung(liste: List<WidgetVeranstaltung>, jetzt: Instant): WidgetVeranstaltung? =
        liste.firstOrNull { e -> (Zeit.datum(e.endsAt ?: e.startsAt) ?: Instant.MIN) >= jetzt }

    /**
     * Die Belegung je Platz fuer jetzt. null, wenn der Plan nicht von heute
     * (Berlin) ist - dann muss erst neu geladen werden.
     */
    fun plaetze(plan: WidgetPlan?, jetzt: Instant): PlaetzeLage? {
        if (plan == null || plan.tag != Zeit.berlinDay(jetzt)) return null
        val minute = Zeit.localMinutes(jetzt)
        val geschlossen = minute >= plan.schluss
        val jetztFrei = Belegung.freeCourtsNow(
            day = plan.tag,
            courtIds = plan.plaetze.map { it.id },
            openingMinutes = plan.oeffnung,
            closingMinutes = plan.schluss,
            slotMinutes = plan.raster,
            durationMinutes = plan.dauer,
            occupied = plan.belegungen,
            leadDays = plan.vorlaufTage,
            now = jetzt,
        )
        val spanne = (plan.schluss - plan.oeffnung).toDouble()

        val zeilen = plan.plaetze.map { platz ->
            val eigene = plan.belegungen.filter { it.courtId == platz.id }
            val luecken = Platzplan.freeGaps(
                day = plan.tag,
                courtId = platz.id,
                openingMinutes = plan.oeffnung,
                closingMinutes = plan.schluss,
                slotMinutes = plan.raster,
                durationMinutes = plan.dauer,
                occupied = plan.belegungen,
                leadDays = plan.vorlaufTage,
                now = jetzt,
            )
            val fenster = jetztFrei.firstOrNull { it.courtId == platz.id }
            PlatzZeile(
                id = platz.id,
                name = platz.name,
                status = status(fenster, eigene, luecken, minute, geschlossen),
                freiJetzt = fenster != null,
                belegt = Startseite.timelineSegments(eigene, plan.oeffnung, plan.schluss),
                frei = if (spanne > 0) {
                    luecken.map { LeistenStueck((it.from - plan.oeffnung) / spanne * 100, (it.until - it.from) / spanne * 100) }
                } else {
                    emptyList()
                },
                lueckenText = if (luecken.isEmpty()) {
                    "keine freie Zeit mehr"
                } else {
                    luecken.joinToString(", ") { "${Zeit.minutesToTime(it.from)}–${Zeit.minutesToTime(it.until)}" }
                },
            )
        }

        return PlaetzeLage(
            zeilen = zeilen,
            ueberschrift = if (geschlossen) "Für heute geschlossen" else "${jetztFrei.size} von ${plan.plaetze.size} frei",
            freiJetzt = jetztFrei.size,
            jetzt = Startseite.timelinePosition(minute, plan.oeffnung, plan.schluss),
            geschlossen = geschlossen,
        )
    }

    private fun status(
        fenster: FreeWindow?,
        belegungen: List<WidgetBelegung>,
        luecken: List<FreeGap>,
        minute: Int,
        geschlossen: Boolean,
    ): String {
        if (geschlossen) return "geschlossen"
        if (fenster != null) return "frei bis ${Zeit.minutesToTime(fenster.untilMinute)}"
        // Laeuft gerade etwas? Dann bis zum Ende - auch ueber direkt anschliessende Belegungen.
        val zeiten = belegungen.map { Zeit.minutesOf(it.startsAt) to Zeit.minutesOf(it.endsAt) }
        var bis = zeiten.firstOrNull { (von, bis) -> von <= minute && bis > minute }?.second
        if (bis != null) {
            while (true) {
                val weiter = zeiten.firstOrNull { (von, b) -> von <= bis!! && b > bis!! } ?: break
                bis = weiter.second
            }
            return "belegt bis ${Zeit.minutesToTime(bis!!)}"
        }
        val naechste = luecken.firstOrNull()
        if (naechste != null) return "frei ab ${Zeit.minutesToTime(naechste.from)}"
        return "heute belegt"
    }
}

// ---- Zeitleiste -----------------------------------------------------------------

/** Was ein Abschnitt der Zeitleiste zeigt. */
enum class LeistenArt { LEER, FREI, BELEGT, EIGEN, SUCHT, GESPERRT }

/** Ein Abschnitt von `von` bis `bis`, in Prozent. */
data class LeistenAbschnitt(val von: Double, val bis: Double, val art: LeistenArt)

/**
 * Die Zeitleiste fuer Glance. In iOS liegen Kapseln uebereinander; Glance kennt
 * weder Canvas noch Versatz - die Leiste ist eine Reihe von Kaestchen, also
 * lueckenlos und ohne Ueberlappung. Belegt liegt ueber frei, eine spaetere
 * Belegung ueber einer frueheren (wie die Reihenfolge der Ebenen in iOS).
 */
object WidgetLeiste {
    fun abschnitte(belegt: List<TimelineSegment>, frei: List<LeistenStueck>): List<LeistenAbschnitt> {
        fun Double.begrenzt() = coerceIn(0.0, 100.0)
        val stellen = (
            listOf(0.0, 100.0) +
                belegt.flatMap { listOf(it.left, it.left + it.width) } +
                frei.flatMap { listOf(it.left, it.left + it.width) }
            ).map { it.begrenzt() }.distinct().sorted()

        val roh = stellen.zipWithNext().filter { (a, b) -> b > a }.map { (a, b) ->
            val mitte = (a + b) / 2
            val art = belegt.lastOrNull { mitte > it.left && mitte < it.left + it.width }?.let { art(it.art) }
                ?: if (frei.any { mitte > it.left && mitte < it.left + it.width }) LeistenArt.FREI else LeistenArt.LEER
            LeistenAbschnitt(a, b, art)
        }
        // Gleiches nebeneinander zusammenfassen: weniger Kaestchen im RemoteViews.
        return roh.fold(mutableListOf()) { liste, s ->
            val letzte = liste.lastOrNull()
            if (letzte != null && letzte.art == s.art) liste[liste.lastIndex] = letzte.copy(bis = s.bis) else liste += s
            liste
        }
    }

    private fun art(k: TimelineKind): LeistenArt = when (k) {
        TimelineKind.BELEGT -> LeistenArt.BELEGT
        TimelineKind.EIGEN -> LeistenArt.EIGEN
        TimelineKind.SUCHT -> LeistenArt.SUCHT
        TimelineKind.GESPERRT, TimelineKind.SERIE -> LeistenArt.GESPERRT
    }

    /**
     * Breiten in ganzen dp, zusammen genau `gesamt`: gerundet wird an den Grenzen,
     * nicht je Abschnitt - sonst summieren sich die Rundungsfehler.
     */
    fun breiten(abschnitte: List<LeistenAbschnitt>, gesamt: Int): List<Int> =
        abschnitte.map { s ->
            (s.bis / 100 * gesamt).roundToInt() - (s.von / 100 * gesamt).roundToInt()
        }

    /** Wo die Marke fuer jetzt steht, in dp vom linken Rand; sie bleibt ganz in der Leiste. */
    fun marke(prozent: Double, gesamt: Int, breite: Int = 2): Int =
        (prozent / 100 * gesamt).roundToInt().coerceIn(0, maxOf(0, gesamt - breite))
}

// ---- Links ----------------------------------------------------------------------

/**
 * Wohin ein Tippen fuehrt: das eigene URL-Schema der Variante (tcm, tcmdev,
 * tcmlokal) mit einem Pfad der App, etwa tcm://verein/veranstaltung/<id>.
 * HauptActivity gibt den Pfad an die PushZentrale; PushZiel.ausPfad fuehrt hin
 * wie bei einer Push-Nachricht (wie in iOS).
 * App Links gingen auch, aber ohne Webadresse (lokal) nicht - das Schema immer.
 */
object WidgetLink {
    const val HOME = "/home"
    const val PLAETZE = "/plaetze"
    const val VEREIN = "/verein"

    fun veranstaltung(id: String): String = "/verein/veranstaltung/$id"

    fun url(pfad: String, schema: String?): String? {
        if (schema.isNullOrEmpty()) return null
        return "$schema://${pfad.removePrefix("/")}"
    }

    /** Der Pfad aus einem Widget-Link; null fuer fremde Schemata und den Passwort-Link. */
    fun pfad(aus: String, schema: String?): String? {
        if (schema.isNullOrEmpty()) return null
        val uri = runCatching { URI(aus) }.getOrNull() ?: return null
        if (!uri.scheme.equals(schema, ignoreCase = true)) return null
        val host = uri.host
        if (host.isNullOrEmpty() || host == "passwort-setzen") return null
        return "/$host${uri.path.orEmpty()}"
    }
}
