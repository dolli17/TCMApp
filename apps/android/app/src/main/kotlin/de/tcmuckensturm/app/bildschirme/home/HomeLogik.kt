/*
 * Was Home zeigt, als reine Funktionen
 *
 * Texte und Auswahl wie apps/mobile/app/(tabs)/home.tsx und HomeLogik.swift
 * der iOS-App, ohne Compose - damit sich jeder Satz ohne Geraet und ohne Netz
 * pruefen laesst (HomeLogikTest). Die Bildschirme setzen nur noch zusammen.
 */

package de.tcmuckensturm.app.bildschirme.home

import de.tcmuckensturm.app.daten.AktiverPlatz
import de.tcmuckensturm.app.daten.Benachrichtigung
import de.tcmuckensturm.app.daten.Buchungseinstellungen
import de.tcmuckensturm.app.daten.MeinName
import de.tcmuckensturm.app.daten.MeineBuchung
import de.tcmuckensturm.app.daten.Meldung
import de.tcmuckensturm.app.daten.OffenesSpiel
import de.tcmuckensturm.app.daten.TagesBelegung
import de.tcmuckensturm.kern.Belegung
import de.tcmuckensturm.kern.MitgliedEvent
import de.tcmuckensturm.kern.Startseite
import de.tcmuckensturm.kern.TimelineSegment
import de.tcmuckensturm.kern.Zeit
import de.tcmuckensturm.kern.Zeitraum
import java.time.Instant
import kotlin.coroutines.cancellation.CancellationException

/**
 * Ergebnis eines Abschnitts, der fuer sich laedt: ein Wert oder ein Fehlertext.
 * Schlaegt einer fehl, steht dort der Fehler, und der Rest bleibt gefuellt.
 */
sealed interface Abschnitt<out T> {
    val wert: T?
    val fehler: String?

    data class Wert<out T>(override val wert: T) : Abschnitt<T> {
        override val fehler: String? get() = null
    }

    data class Fehler(override val fehler: String) : Abschnitt<Nothing> {
        override val wert: Nothing? get() = null
    }

    companion object {
        suspend fun <T> von(laden: suspend () -> T): Abschnitt<T> = try {
            Wert(laden())
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Fehler(Meldung.aus(e).text)
        }
    }
}

/** Was "Jetzt frei" braucht - vier Quellen; fehlt eine, fehlt der Abschnitt. */
data class FreiDaten(
    val heute: String,
    val plaetze: List<AktiverPlatz>,
    val belegung: List<TagesBelegung>,
    val einstellungen: Buchungseinstellungen?,
    val dauer: Int,
)

data class HomeInhalt(
    val name: MeinName?,
    val termine: Abschnitt<List<MeineBuchung>>,
    val frei: Abschnitt<FreiDaten>,
    val offen: Abschnitt<List<OffenesSpiel>>,
    val events: Abschnitt<List<MitgliedEvent>>,
)

data class FreiKarte(
    val id: String,
    val name: String,
    val bis: String,
    val segmente: List<TimelineSegment>,
    /** Marke fuer jetzt, in Prozent */
    val jetzt: Double,
)

object HomeLogik {
    fun titel(vorname: String?): String = if (!vorname.isNullOrEmpty()) "Hallo, $vorname" else "Hallo"

    /** "17:00 – 18:00" in Berliner Zeit */
    fun zeitSpanne(t: Zeitraum): String =
        "${Zeit.minutesToTime(Zeit.minutesOf(t.startsAt))} – ${Zeit.minutesToTime(Zeit.minutesOf(t.endsAt))}"

    /** Zeile unten auf der Terminkarte: "mit A, B", "Du hast gebucht" oder "von X". */
    fun mitText(t: MeineBuchung): String {
        val mit = t.players.orEmpty().filterNotNull().filter { it.isNotEmpty() && it != t.ownerName }
        if (mit.isNotEmpty()) return "mit ${mit.joinToString(", ")}"
        if (t.binBucher == true) return "Du hast gebucht"
        return "von ${t.ownerName ?: ""}"
    }

    fun terminLabel(t: MeineBuchung, jetzt: Instant): String =
        "${Startseite.bookingKicker(t.startsAt, t.endsAt, jetzt)}, ${zeitSpanne(t)}, ${t.courtName ?: ""}, Details"

    fun jetztFreiKarten(d: FreiDaten, jetzt: Instant): List<FreiKarte> {
        val auf = Zeit.timeToMinutes(d.einstellungen?.openingTime ?: "08:00")
        val zu = Zeit.timeToMinutes(d.einstellungen?.closingTime ?: "21:00")
        val marke = Startseite.timelinePosition(Zeit.localMinutes(jetzt), auf, zu)
        return Belegung.freeCourtsNow(
            day = d.heute,
            courtIds = d.plaetze.map { it.id },
            openingMinutes = auf,
            closingMinutes = zu,
            slotMinutes = d.einstellungen?.slotMinutes ?: 30,
            durationMinutes = d.dauer,
            occupied = d.belegung,
            leadDays = d.einstellungen?.leadDays,
            now = jetzt,
        ).map { f ->
            FreiKarte(
                id = f.courtId,
                name = d.plaetze.firstOrNull { it.id == f.courtId }?.name ?: "",
                bis = Zeit.minutesToTime(f.untilMinute),
                segmente = Startseite.timelineSegments(d.belegung.filter { it.courtId == f.courtId }, auf, zu),
                jetzt = marke,
            )
        }
    }

    /** Unter dem naechsten Termin: "und 1 weiterer Termin", "und 2 weitere Termine". */
    fun weitereTermine(n: Int): String = "und $n ${if (n == 1) "weiterer Termin" else "weitere Termine"}"

    /** Zaehler rechts neben "Jetzt frei": "1 Platz", "3 Plätze"; ohne freie Plaetze oder bei Fehler null. */
    fun freiZaehler(frei: Abschnitt<FreiDaten>, jetzt: Instant): String? {
        val n = frei.wert?.let { jetztFreiKarten(it, jetzt).size } ?: 0
        return if (n == 0) null else "$n ${if (n == 1) "Platz" else "Plätze"}"
    }

    /** "Heute, 17:00", "Morgen, 10:00", "Mi, 18:30" */
    fun offenesSpielWann(o: OffenesSpiel, jetzt: Instant): String {
        val tag = Startseite.dayTag(o.startsAt, jetzt)
        return "${tag.take(1)}${tag.drop(1).lowercase()}, ${Zeit.minutesToTime(Zeit.minutesOf(o.startsAt))}"
    }

    /** Hoechstens drei offene Spiele. */
    fun offeneSpiele(liste: List<OffenesSpiel>): List<OffenesSpiel> = liste.take(3)

    fun offenesSpielTitel(o: OffenesSpiel): String = "${o.typeName ?: ""} · sucht ${o.frei ?: 0}"

    fun offenesSpielZeile(o: OffenesSpiel): String = "${o.courtName ?: ""} · ${o.ownerName ?: ""}"

    /** An wen sich die Suche richtet: "LK 10–16 · Herren", "bis LK 16", "Damen"; ohne Einschraenkung null. */
    fun offenesSpielFilter(o: OffenesSpiel): String? = o.suchfilter.zusatz

    // ---- Nachrichten und Glocke ---------------------------------------------

    /** Fuer den Screenreader: "Neu: Titel. Text. vor 5 Min." */
    fun nachrichtLabel(n: Benachrichtigung, neu: Boolean, jetzt: Instant): String =
        "${if (neu) "Neu: " else ""}${n.title ?: ""}. ${n.body ?: ""}. ${Startseite.relativeTimeLabel(n.createdAt, jetzt)}"

    /** Die Zahl an der Glocke: ab zehn "9+". */
    fun glockenZahl(ungelesen: Int): String = if (ungelesen > 9) "9+" else ungelesen.toString()

    fun glockenLabel(ungelesen: Int): String =
        if (ungelesen > 0) "Benachrichtigungen, $ungelesen ungelesen" else "Benachrichtigungen"

    /** "Alle als gelesen" erscheint nur, solange etwas hervorgehoben ist. */
    fun zeigeAlleGelesen(liste: List<Benachrichtigung>?, alleGesehen: Boolean): Boolean =
        !alleGesehen && liste.orEmpty().any { it.readAt == null }

}
