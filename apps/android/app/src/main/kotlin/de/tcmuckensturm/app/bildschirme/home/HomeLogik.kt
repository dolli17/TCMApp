/*
 * Was Home zeigt, als reine Funktionen
 *
 * Texte und Auswahl wie apps/mobile/app/(tabs)/home.tsx und HomeLogik.swift
 * der iOS-App, ohne Compose - damit sich jeder Satz ohne Geraet und ohne Netz
 * pruefen laesst (HomeLogikTest). Die Bildschirme setzen nur noch zusammen.
 */

package de.tcmuckensturm.app.bildschirme.home

import de.tcmuckensturm.app.daten.AktiverPlatz
import de.tcmuckensturm.app.daten.Arbeitsdienst
import de.tcmuckensturm.app.daten.Benachrichtigung
import de.tcmuckensturm.app.daten.Buchungseinstellungen
import de.tcmuckensturm.app.daten.EigenesGetraenk
import de.tcmuckensturm.app.daten.MeinName
import de.tcmuckensturm.app.daten.MeineBuchung
import de.tcmuckensturm.app.daten.Meldung
import de.tcmuckensturm.app.daten.OffenesSpiel
import de.tcmuckensturm.app.daten.TagesBelegung
import de.tcmuckensturm.kern.Belegung
import de.tcmuckensturm.kern.Geld
import de.tcmuckensturm.kern.Startseite
import de.tcmuckensturm.kern.TimelineSegment
import de.tcmuckensturm.kern.Zeit
import de.tcmuckensturm.kern.Zeitraum
import java.time.Instant
import kotlin.coroutines.cancellation.CancellationException
import kotlin.math.abs

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
    val getraenke: Abschnitt<List<EigenesGetraenk>>,
    val dienst: Abschnitt<Arbeitsdienst?>,
    val neues: Abschnitt<List<Benachrichtigung>>,
)

data class FreiKarte(
    val id: String,
    val name: String,
    val bis: String,
    val segmente: List<TimelineSegment>,
    /** Marke fuer jetzt, in Prozent */
    val jetzt: Double,
)

/** Die zwei Kacheln unter "Dein Stand". */
data class DeinStand(
    val getraenkeTitel: String,
    val getraenkeWert: String?,
    val getraenkeFehler: String?,
    val getraenkeLabel: String,
    val dienstTitel: String,
    /** "4 / 10 h", null ohne Soll */
    val dienstWert: String?,
    val dienstAnteil: Double,
    val dienstFehler: String?,
    val dienstLabel: String,
)

object HomeLogik {
    fun titel(vorname: String?): String = if (!vorname.isNullOrEmpty()) "Hallo, $vorname" else "Hallo"

    /** Kicker ueber dem Titel: "Donnerstag, 29. Oktober" (die Ansicht schreibt ihn gross). */
    fun kicker(jetzt: Instant): String = Zeit.heuteLang(jetzt)

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

    /** Hoechstens drei offene Spiele. */
    fun offeneSpiele(liste: List<OffenesSpiel>): List<OffenesSpiel> = liste.take(3)

    fun offenesSpielTitel(o: OffenesSpiel): String = "${o.typeName ?: ""} · sucht ${o.frei ?: 0}"

    fun offenesSpielZeile(o: OffenesSpiel): String = "${o.courtName ?: ""} · ${o.ownerName ?: ""}"

    /** Zahl wie in einem JavaScript-Template: 3 -> "3", 2.5 -> "2.5". */
    fun jsZahl(d: Double): String =
        if (d == Math.rint(d) && abs(d) < 1e15) d.toLong().toString() else d.toString()

    fun deinStand(
        getraenke: Abschnitt<List<EigenesGetraenk>>,
        dienst: Abschnitt<Arbeitsdienst?>,
        jetzt: Instant,
    ): DeinStand {
        val monat = Zeit.monatLang(jetzt)
        val summe = Geld.formatCents(Startseite.sumOpenDrinks(getraenke.wert.orEmpty()))
        val werte = dienst.wert
        val ist = werte?.completedHours ?: 0.0
        val soll = werte?.requiredHours ?: 0.0
        // Der Arbeitsdienst zaehlt aufs Jahr, nicht auf den Monat (U55).
        val jahr = werte?.year ?: Zeit.jahr(jetzt)
        val mitSoll = werte != null && soll > 0

        val dienstFehler = dienst.fehler
        val dienstLabel = when {
            dienstFehler != null -> "Arbeitsdienst: $dienstFehler"
            soll > 0 -> "Arbeitsdienst $jahr: ${jsZahl(ist)} von ${jsZahl(soll)} Stunden. Zum Konto"
            else -> "Arbeitsdienst $jahr: kein Soll. Zum Konto"
        }

        return DeinStand(
            getraenkeTitel = "Getränke $monat",
            getraenkeWert = if (getraenke.fehler == null) summe else null,
            getraenkeFehler = getraenke.fehler,
            getraenkeLabel = getraenke.fehler?.let { "Getränke: $it" }
                ?: "Getränke im $monat: $summe, läuft noch. Zu den Getränken",
            dienstTitel = "Arbeitsdienst $jahr",
            dienstWert = if (mitSoll) "${jsZahl(ist)} / ${jsZahl(soll)} h" else null,
            dienstAnteil = if (soll > 0) minOf(1.0, ist / soll) else 0.0,
            dienstFehler = dienstFehler,
            dienstLabel = dienstLabel,
        )
    }

    /** Link "Alle" bei Neuigkeiten nur, wenn ueberhaupt etwas da ist. */
    fun zeigeAlleNeuigkeiten(neues: Abschnitt<List<Benachrichtigung>>): Boolean = !neues.wert.isNullOrEmpty()

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

    /** Initialen fuer den Avatar: "MM" */
    fun initialen(name: MeinName?): String {
        if (name == null) return ""
        return (name.vorname.take(1) + name.nachname.take(1)).uppercase()
    }
}
