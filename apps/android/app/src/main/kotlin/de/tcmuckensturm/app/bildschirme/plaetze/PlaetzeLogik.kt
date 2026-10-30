/*
 * Ansichtslogik des Tabs Plaetze als reine Funktionen
 *
 * Texte und Entscheidungen aus apps/mobile/app/(tabs)/plaetze/index.tsx und
 * src/components/BuchungsFenster.tsx, wie PlaetzeLogik.swift der iOS-App:
 * welche Tage waehlbar sind, wie sie heissen, was im Blatt angeboten wird und
 * was zum Buchen noch fehlt. Die Regeln selbst stehen im Kern (Platzplan,
 * Belegung); hier wird nur zusammengesetzt, was die Ansicht zeigt. Getestet in
 * PlaetzeLogikTest.
 */

package de.tcmuckensturm.app.bildschirme.plaetze

import de.tcmuckensturm.app.daten.Kontingent
import de.tcmuckensturm.app.daten.Mitglied
import de.tcmuckensturm.app.daten.TagesBelegung
import de.tcmuckensturm.kern.Belegung
import de.tcmuckensturm.kern.Belegungsmerkmale
import de.tcmuckensturm.kern.BookingTypeInfo
import de.tcmuckensturm.kern.Geld
import de.tcmuckensturm.kern.Platzplan
import de.tcmuckensturm.kern.Startseite
import de.tcmuckensturm.kern.TimelineKind
import de.tcmuckensturm.kern.Zeit
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import kotlin.math.floor

/** Die Datums-Kachel: "MO" und 28, heute "HEUTE". */
data class Kachel(val wochentag: String, val tag: Int)

/** Wer nach einem Wechsel der Spielform noch mitspielt. */
data class Besetzung(val mitglieder: List<String>, val gaeste: List<String>)

object PlaetzeLogik {
    // ---- Tage -------------------------------------------------------------------

    private fun tag(datum: String): LocalDate? = runCatching { LocalDate.parse(datum) }.getOrNull()

    /** "2026-10-29" plus n Tage, als Kalendertag gerechnet. */
    fun verschiebe(datum: String, tage: Int): String = tag(datum)?.plusDays(tage.toLong())?.toString() ?: datum

    /**
     * Die buchbaren Tage: heute und lead_days weitere - dieselbe Zahl, gegen
     * die create_booking prueft. Ein Kalender wuerde Tage anbieten, die die
     * Datenbank ohnehin abweist.
     */
    fun tage(heute: String, vorlauf: Int): List<String> = (0..maxOf(vorlauf, 0)).map { verschiebe(heute, it) }

    /** Wochentag des Kalendertags (0 = Sonntag), unabhaengig von der Zeitzone. */
    private fun wochentag(datum: String): Int = (tag(datum)?.dayOfWeek?.value ?: 0) % 7

    private fun tagMonat(datum: String): String = tag(datum)?.let { "%02d.%02d.".format(it.dayOfMonth, it.monthValue) } ?: ""

    /** Fuer die Tageszeile: "Heute, 13.10.", "Morgen, 14.10." oder "Do., 15.10." */
    fun tageszeile(datum: String, heute: String): String {
        val kurz = tagMonat(datum)
        if (datum == heute) return "Heute, $kurz"
        if (datum == verschiebe(heute, 1)) return "Morgen, $kurz"
        return "${Zeit.wochentageKurz[wochentag(datum)]}., $kurz"
    }

    /** Fuer TalkBack: "Donnerstag, 05. November" */
    fun lesbar(datum: String): String {
        val t = tag(datum) ?: return datum
        return "${Zeit.wochentageLang[wochentag(datum)]}, ${"%02d".format(t.dayOfMonth)}. ${Zeit.monateLang[t.monthValue - 1]}"
    }

    /** Kicker im Blatt: "Montag, 28.09." */
    fun tagText(datum: String): String = "${Zeit.wochentageLang[wochentag(datum)]}, ${tagMonat(datum)}"

    fun kachel(datum: String, heute: String? = null): Kachel = Kachel(
        wochentag = if (datum == heute) "HEUTE" else Zeit.wochentageKurz[wochentag(datum)].uppercase(),
        tag = tag(datum)?.dayOfMonth ?: 0,
    )

    // ---- Kontingent -------------------------------------------------------------

    /** 0 erlaubt heisst unbegrenzt - die Regel bleibt in der Datenbank, nur abgeschaltet. */
    fun unbegrenzt(k: Kontingent): Boolean = k.allowed <= 0

    fun kontingentAus(k: Kontingent): Boolean = !unbegrenzt(k) && k.used >= k.allowed

    fun kontingentText(k: Kontingent): String? =
        if (unbegrenzt(k)) {
            null
        } else {
            "Kontingent: ${k.used} von ${k.allowed} offenen Buchungen. Buchungen, bei denen du als Mitspieler eingetragen bist, zählen mit."
        }

    const val KONTINGENT_AUS_TEXT = "Dein Kontingent ist ausgeschöpft."

    // ---- Plan -------------------------------------------------------------------

    /** Sperrungen lassen sich nur mit Platzrechten oeffnen, alles andere zum Ansehen oder Mitspielen. */
    fun oeffnebar(b: Belegungsmerkmale, darfPlaetze: Boolean): Boolean =
        if (Startseite.occupancyKind(b) == TimelineKind.GESPERRT) darfPlaetze else true

    /** Die Startzeiten im Anzeigeblock (bei 60 Minuten 17:00-18:00), die canStartAt bestehen. */
    fun startzeiten(
        tag: String,
        courtId: String,
        stunde: Int,
        anzeige: Int,
        raster: Int,
        dauer: Int,
        schluss: Int,
        belegung: List<TagesBelegung>,
        vorlauf: Int,
        jetzt: Instant,
    ): List<Int> = (stunde until stunde + anzeige step maxOf(raster, 1)).filter {
        Belegung.canStartAt(tag, courtId, it, dauer, schluss, belegung, vorlauf, jetzt)
    }

    /** Der Anzeigeblock, in dem eine Minute liegt: bei 60 Minuten Anzeige und 08:00 Oeffnung 17:30 -> 17:00. */
    fun stunde(minute: Int, oeffnung: Int, anzeige: Int): Int =
        oeffnung + floor((minute - oeffnung).toDouble() / maxOf(anzeige, 1)).toInt() * anzeige

    /** "Platz 3" -> "3"; andere Namen bleiben bei der Kurzform. */
    fun platzNummer(name: String?, kurz: String?): String {
        val n = name ?: ""
        if (n.lowercase().startsWith("platz ")) {
            val rest = n.drop(6).trim()
            if (rest.isNotEmpty()) return rest
        }
        return kurz ?: n
    }

    /** Hoechstens ein Nachladen je Sekunde: wie lange noch warten? Null heisst sofort. */
    fun drosselWartezeit(jetzt: Instant, letzte: Instant?, abstand: Duration = Duration.ofSeconds(1)): Duration {
        if (letzte == null) return Duration.ZERO
        val rest = abstand - Duration.between(letzte, jetzt)
        return if (rest.isNegative) Duration.ZERO else rest
    }

    // ---- Freie Zeiten -----------------------------------------------------------

    /** "n frei", "voll" */
    fun freiText(n: Int): String = if (n == 0) "voll" else "$n frei"

    fun freiLabel(n: Int): String = when (n) {
        0 -> "kein Platz frei"
        1 -> "1 Platz frei"
        else -> "$n Plätze frei"
    }

    // ---- Buchungsblatt ----------------------------------------------------------

    fun initialen(vor: String?, nach: String?): String {
        val k = "${(vor ?: "").take(1)}${(nach ?: "").take(1)}".uppercase()
        return k.ifEmpty { "?" }
    }

    /** Initialen aus einem ganzen Namen: erstes und letztes Wort. */
    fun initialenAusName(name: String?): String {
        val teile = (name ?: "").split(" ").filter { it.isNotEmpty() }
        return initialen(teile.firstOrNull(), if (teile.size > 1) teile.last() else null)
    }

    const val TREFFER_MAX = 6

    /** Mitspieler durch Tippen finden: Vor- oder Nachname zuerst, ohne die schon Gewaehlten. */
    fun treffer(suche: String, verzeichnis: List<Mitglied>, ohne: List<String>): List<Mitglied> {
        val q = suche.trim().lowercase()
        if (q.isEmpty()) return emptyList()
        return verzeichnis
            .asSequence()
            .filter { it.id !in ohne }
            .filter { m ->
                "${m.firstName ?: ""} ${m.lastName ?: ""}".lowercase().contains(q) ||
                    "${m.lastName ?: ""} ${m.firstName ?: ""}".lowercase().contains(q)
            }
            .take(TREFFER_MAX)
            .toList()
    }

    /**
     * Was zum Buchen noch fehlt - als naechster Schritt formuliert, nicht als
     * Regelverstoss. null heisst: buchbar.
     */
    fun buchenHinweis(art: BookingTypeInfo?, mitglieder: Int, gaeste: Int, sucht: Boolean): String? {
        if (art == null) return null
        val maxWeitere = maxOf(art.maxPlayers - 1, 0)
        val nochPlatz = mitglieder + gaeste < maxWeitere
        val suchtWirklich = sucht && nochPlatz
        val fehlen = if (suchtWirklich) 0 else Platzplan.missingPlayers(art, mitglieder, gaeste)
        if (fehlen > 0) {
            return "Noch $fehlen Mitspieler wählen${if (nochPlatz) " – oder „Mitspieler gesucht“ einschalten" else ""}."
        }
        return Platzplan.checkPlayers(art, mitglieder, gaeste, suchtWirklich)
    }

    /** Wer von Doppel auf Einzel wechselt, hat womoeglich zu viele eingetragen: die ueberzaehligen fallen hinten weg. */
    fun kuerze(mitglieder: List<String>, gaeste: List<String>, maxPlayers: Int): Besetzung {
        val max = maxOf(maxPlayers - 1, 0)
        val m = mitglieder.take(max)
        return Besetzung(m, gaeste.take(maxOf(0, max - m.size)))
    }

    fun gastText(gebuehrCents: Int): String = if (gebuehrCents > 0) "Gast · ${Geld.formatCents(gebuehrCents)}" else "Gast"

    fun gastHinweis(gebuehrCents: Int): String =
        "Für jeden Gast werden ${Geld.formatCents(gebuehrCents)} berechnet und mit der nächsten Lastschrift eingezogen."

    /** "3 Buchungen liegen in diesem Zeitraum ..." - die Zahl fuer die Rueckfrage. */
    fun kollisionen(meldung: String): Int? =
        Regex("""^(\d+) Buchungen liegen""").find(meldung)?.groupValues?.get(1)?.toIntOrNull()

    fun sperreGeaendert(verdraengt: Int): String =
        if (verdraengt > 0) {
            "Sperrung geändert, $verdraengt ${if (verdraengt == 1) "Buchung" else "Buchungen"} verdrängt."
        } else {
            "Sperrung geändert."
        }

    fun verdraengenText(n: Int): String = "$n ${if (n == 1) "Buchung" else "Buchungen"} verdrängen"

    fun imWegText(n: Int): String =
        if (n == 1) {
            "1 Buchung liegt im Weg. Sie wird abgesagt, die Mitglieder bekommen Bescheid."
        } else {
            "$n Buchungen liegen im Weg. Sie werden abgesagt, die Mitglieder bekommen Bescheid."
        }
}

/**
 * Was das Blatt an einer bestehenden Belegung anbietet (VerwaltenInhalt).
 *
 * Drei Rollen an demselben Blatt: der Bucher verwaltet, wer Platzrechte hat,
 * verwaltet fremd, und wer nur eingeladen ist, kann ausschliesslich
 * mitspielen. Ab Spielbeginn bleibt nur, wer Platzrechte hat - so eng wie
 * die RPCs (bookingActions).
 */
class Verwalten(b: TagesBelegung, darfPlaetze: Boolean, jetzt: Instant = Instant.now()) {
    /** Eine Sperrung (auch ein Serientermin): nur aufheben bzw. absagen. */
    val nurStorno: Boolean = b.kind == "blocking"

    /** Training einer Serie: faellt ueber cancel_series_occurrence aus. */
    val serientermin: Boolean = !b.seriesId.isNullOrEmpty()

    val laeuftSchon: Boolean = (Zeit.datum(b.startsAt) ?: Instant.MIN) <= jetzt

    /** Stornieren und Mitspieler aendern */
    val darfVerwalten: Boolean
    val kannMitspielen: Boolean
    val kannUmsetzen: Boolean
    val kannSperreAendern: Boolean

    /** Nur beim Storno einer fremden Buchung ist ein Grund Pflicht. */
    val grundNoetig: Boolean

    /** Die Zeile unter dem Titel: "Doppel · gebucht von dir", "Gesperrt · Platzpflege", "Training · Serientermin" */
    val untertitel: String

    init {
        val ende = Zeit.datum(b.endsAt) ?: Instant.MIN
        val darf = Platzplan.bookingActions(
            startsAt = b.startsAt,
            own = b.isOwn == true,
            joined = b.binDabei == true,
            partnerWanted = b.partnerWanted == true,
            free = b.frei,
            managesCourts = darfPlaetze,
            now = jetzt,
        )
        darfVerwalten = darf.cancel
        kannMitspielen = darf.join
        kannUmsetzen = darfPlaetze && b.kind == "booking" && !serientermin && ende > jetzt
        kannSperreAendern = darfPlaetze && nurStorno && !serientermin
        grundNoetig = darfPlaetze && b.isOwn != true && b.kind == "booking"
        untertitel = when {
            serientermin -> "${Platzplan.nichtLeer(b.title) ?: b.typeName ?: ""} · Serientermin"
            nurStorno -> "Gesperrt · ${Platzplan.blockingLabel(b.title, b.typeName).kategorie}"
            else -> "${b.typeName ?: ""} · gebucht von ${if (b.isOwn == true) "dir" else (b.ownerName ?: "unbekannt")}"
        }
    }

    /** Der rote Knopf, je nach Schritt: erst fragen, dann bestaetigen. */
    fun stornoText(bestaetigen: Boolean): String = when {
        bestaetigen && serientermin -> "Termin wirklich absagen"
        bestaetigen && nurStorno -> "Wirklich aufheben"
        bestaetigen -> "Wirklich stornieren"
        serientermin -> "Fällt diese Woche aus"
        nurStorno -> "Sperrung aufheben"
        else -> "Buchung stornieren"
    }

    /** Ein Grundfeld gibt es beim Absagen eines Serientermins und beim Stornieren einer Buchung. */
    val grundFeld: Boolean get() = serientermin || !nurStorno

    companion object {
        /** "Hier wird noch ein Mitspieler gesucht." bzw. "… werden noch 2 Mitspieler …" */
        fun suchtText(b: TagesBelegung): String? {
            val frei = b.frei ?: return null
            if (b.partnerWanted != true || frei <= 0) return null
            return "Hier ${if (frei == 1) "wird noch ein Mitspieler" else "werden noch $frei Mitspieler"} gesucht."
        }
    }
}
