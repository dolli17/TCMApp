/*
 * Veranstaltungen fuer Mitglieder
 *
 * Portierung aus packages/core/src/veranstaltungen-mitglieder.ts und
 * veranstaltungen.ts, wie Kern/Veranstaltungen.swift der iOS-App: die
 * naechsten zwei fuer "Demnächst im Verein", die Liste nach Monat, die Texte
 * der Karte (Datumskachel, Zeit und Ort, fette Zeile, eigener Stand) und das
 * Detail (Eckdaten, Belegung, Knoepfe, Hinweise). Ob eine Anmeldung klappt,
 * entscheiden die RPCs; hier steht nur, was die Oberflaeche anbietet und wie
 * sie es sagt. Gepruefte Faelle: packages/core/golden/event*.json
 * (VereinGoldenTest).
 */

package de.tcmuckensturm.kern

import java.time.Instant
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Eine Zeile aus events_fuer_mitglied. Optional ist, was nicht offensichtlich Pflicht ist (app-api.md). */
@Serializable
data class MitgliedEvent(
    val id: String,
    val kind: String? = null,
    val status: String? = null,
    val title: String? = null,
    val description: String? = null,
    val location: String? = null,
    @SerialName("starts_at") val startsAt: String,
    @SerialName("ends_at") val endsAt: String? = null,
    @SerialName("registration_enabled") val registrationEnabled: Boolean? = null,
    @SerialName("registration_deadline") val registrationDeadline: String? = null,
    @SerialName("max_participants") val maxParticipants: Int? = null,
    @SerialName("companions_allowed") val companionsAllowed: Boolean? = null,
    @SerialName("fee_cents") val feeCents: Int? = null,
    /** numeric kommt als Zahl, manche Wege liefern Text - wie Number(z.work_hours) in daten.ts */
    @Serializable(with = ZahlOderText::class)
    @SerialName("work_hours") val workHours: Double? = null,
    val personen: Int? = null,
    val warteliste: Int? = null,
    @SerialName("mein_status") val meinStatus: String? = null,
    @SerialName("meine_begleitpersonen") val meineBegleitpersonen: Int? = null,
    @SerialName("meine_bemerkung") val meineBemerkung: String? = null,
    /** Die eigene, nicht erlassene Forderung zur Anmeldung, sonst null (seit Phase A in events_fuer_mitglied). */
    @SerialName("meine_forderung_cents") val meineForderungCents: Int? = null,
    @SerialName("meine_forderung_status") val meineForderungStatus: String? = null,
)

enum class EventTon { GELB, GRUEN, BLAU, GRAU, ROT;

    /** Der Name wie in @tcm/core ("gelb", "gruen" ...). */
    val wert: String get() = name.lowercase()
}

data class MeineMarke(val text: String, val ton: EventTon)

/** Kommende bzw. vergangene Veranstaltungen eines Monats. */
data class EventMonat(
    /** "2026-11" */
    val schluessel: String,
    /** "November 2026" */
    val titel: String,
    val events: List<MitgliedEvent>,
)

/** Datumskachel der Karte: ("06", "Nov"). */
data class DatumKachel(val tag: String, val monat: String)

object Veranstaltungen {
    val kindLabel = mapOf("arbeitsdienst" to "Arbeitsdienst", "fest" to "Fest", "termin" to "Termin")
    val kindTon = mapOf("arbeitsdienst" to EventTon.GRAU, "fest" to EventTon.GELB, "termin" to EventTon.BLAU)

    private fun zeit(e: MitgliedEvent): Instant = Zeit.datum(e.startsAt) ?: Instant.MAX

    /** Vorbei ist eine Veranstaltung mit ihrem Ende, ohne Ende mit dem Beginn. */
    fun eventVorbei(e: MitgliedEvent, now: Instant): Boolean {
        val ende = Zeit.datum(e.endsAt ?: e.startsAt) ?: return false
        return ende < now
    }

    /** Ab wann die Anmeldung feststeht: Anmeldeschluss, sonst Beginn. */
    fun eventSchluss(e: MitgliedEvent): String = e.registrationDeadline ?: e.startsAt

    fun eventSchlussVorbei(e: MitgliedEvent, now: Instant): Boolean {
        val schluss = Zeit.datum(eventSchluss(e)) ?: return false
        return schluss <= now
    }

    fun eventBegonnen(e: MitgliedEvent, now: Instant): Boolean {
        val beginn = Zeit.datum(e.startsAt) ?: return false
        return beginn <= now
    }

    fun eventIchDabei(e: MitgliedEvent): Boolean = e.meinStatus == "registered" || e.meinStatus == "waitlisted"

    fun eventAnmeldbar(e: MitgliedEvent, now: Instant): Boolean =
        e.status == "published" && e.registrationEnabled == true && !eventSchlussVorbei(e, now) && !eventIchDabei(e)

    /** Die naechsten n veroeffentlichten Veranstaltungen fuer die Startseite. */
    fun eventDemnaechst(liste: List<MitgliedEvent>, now: Instant, n: Int = 2): List<MitgliedEvent> =
        liste.filter { it.status == "published" && !eventVorbei(it, now) }
            // sortedBy ist stabil: gleiche Zeiten bleiben in der Reihenfolge der Liste
            .sortedBy(::zeit)
            .take(n)

    /** "19:00" -> "19", "23:30" bleibt (Intl mit zweistelliger Stunde, also "09"). */
    fun uhr(d: Instant): String {
        val z = d.atZone(Zeit.berlinZone)
        val h = "%02d".formatiert(z.hour)
        return if (z.minute == 0) h else "$h:${"%02d".formatiert(z.minute)}"
    }

    fun uhrSpanne(startsAt: String, endsAt: String?): String {
        val a = Zeit.datum(startsAt) ?: return ""
        val b = endsAt?.let(Zeit::datum) ?: return "${uhr(a)} Uhr"
        if (Zeit.berlinDay(a) != Zeit.berlinDay(b)) return "ab ${uhr(a)} Uhr"
        return "${uhr(a)}–${uhr(b)} Uhr"
    }

    /** "Fr 19 Uhr · Clubhaus", "Sa 09–13 Uhr · Anlage" */
    fun eventKartenZeit(e: MitgliedEvent): String {
        val a = Zeit.datum(e.startsAt) ?: return ""
        val zeit = "${Zeit.kurzerWochentag(a)} ${uhrSpanne(e.startsAt, e.endsAt)}"
        val ort = e.location
        return if (!ort.isNullOrEmpty()) "$zeit · $ort" else zeit
    }

    /** Datumskachel: Tag zweistellig und Monat kurz ("06", "Nov") */
    fun eventDatumKachel(startsAt: String): DatumKachel {
        val d = Zeit.datum(startsAt) ?: return DatumKachel("", "")
        val z = d.atZone(Zeit.berlinZone)
        return DatumKachel("%02d".formatiert(z.dayOfMonth), Zeit.monateKurz[z.monthValue - 1])
    }

    /** Stunden deutsch: 3 -> "3", 2.5 -> "2,5". */
    fun stundenText(h: Double): String {
        val gerundet = Math.round(h * 100) / 100.0
        if (gerundet == Math.rint(gerundet)) return gerundet.toLong().toString()
        return gerundet.toString().replace('.', ',')
    }

    /** Freie Plaetze, ohne Grenze null. */
    fun eventFrei(e: MitgliedEvent): Int? {
        val max = e.maxParticipants ?: return null
        return maxOf(0, max - (e.personen ?: 0))
    }

    private fun plaetzeFreiText(frei: Int): String {
        if (frei == 0) return "ausgebucht · Warteliste"
        return "noch $frei ${if (frei == 1) "Platz" else "Plätze"} frei"
    }

    /** Die fette Zeile der Karte ("18,00 € p. P. · noch 18 Plätze frei", "Ohne Anmeldung" ...). */
    fun eventKartenZeile(e: MitgliedEvent, now: Instant): String {
        if (e.status == "cancelled") return "Abgesagt"
        val vorbei = eventVorbei(e, now)
        val personen = e.personen ?: 0

        val h = e.workHours
        if (e.kind == "arbeitsdienst" && h != null && h != 0.0) {
            val stunden = "${stundenText(h)} Std. Arbeitsdienst"
            if (e.registrationEnabled != true) return stunden
            val belegt = e.maxParticipants?.let { "$personen von $it Plätzen" } ?: "$personen angemeldet"
            return "$stunden · $belegt"
        }

        if (e.registrationEnabled != true) return "Ohne Anmeldung"
        val teile = mutableListOf<String>()
        val fee = e.feeCents
        if (fee != null && fee != 0) teile += "${Geld.formatCents(fee)} p. P."
        val frei = eventFrei(e)
        val schluss = e.registrationDeadline?.let(Zeit::datum)
        teile += when {
            vorbei -> if (personen == 1) "1 Person war dabei" else "$personen Personen waren dabei"
            eventSchlussVorbei(e, now) -> "Anmeldung geschlossen"
            frei != null -> plaetzeFreiText(frei)
            schluss != null -> "Anmeldung bis ${Zeit.tagMonat(schluss)}"
            else -> "Anmeldung offen"
        }
        return teile.joinToString(" · ")
    }

    /** Der eigene Stand als Marke; mit aufforderung (Startseite) auch "Anmelden". */
    fun eventMeineMarke(e: MitgliedEvent, now: Instant, aufforderung: Boolean = false): MeineMarke? {
        if (e.status == "cancelled") return null
        if (e.meinStatus == "registered") {
            val b = e.meineBegleitpersonen ?: 0
            return MeineMarke(if (b > 0) "Angemeldet · ${1 + b}" else "Angemeldet", EventTon.GRUEN)
        }
        if (e.meinStatus == "waitlisted") return MeineMarke("Warteliste", EventTon.GELB)
        if (aufforderung && eventAnmeldbar(e, now)) return MeineMarke("Anmelden", EventTon.GELB)
        return null
    }

    // ---- Liste --------------------------------------------------------------

    /**
     * Kommende (bzw. mit vergangen: vergangene) Veranstaltungen nach Monat.
     * Kommendes der Reihe nach, Vergangenes neueste zuerst. Gleiche Zeiten
     * bleiben in der Reihenfolge der Liste (Array.sort in JavaScript ist stabil).
     */
    fun eventMonatsGruppen(liste: List<MitgliedEvent>, now: Instant, vergangen: Boolean = false): List<EventMonat> {
        val gefiltert = liste.filter { it.status != "draft" && eventVorbei(it, now) == vergangen }
        val auswahl = if (vergangen) gefiltert.sortedByDescending(::zeit) else gefiltert.sortedBy(::zeit)
        val gruppen = mutableListOf<EventMonat>()
        for (e in auswahl) {
            val d = Zeit.datum(e.startsAt) ?: continue
            val schluessel = Zeit.berlinDay(d).take(7)
            val letzte = gruppen.lastOrNull()
            if (letzte?.schluessel == schluessel) {
                gruppen[gruppen.lastIndex] = letzte.copy(events = letzte.events + e)
            } else {
                gruppen += EventMonat(schluessel, "${Zeit.monatLang(d)} ${Zeit.jahr(d)}", listOf(e))
            }
        }
        return gruppen
    }

    // ---- Detail -------------------------------------------------------------

    /** "06.11." */
    fun eventTagKurz(iso: String): String = Zeit.datum(iso)?.let(Zeit::tagMonat) ?: ""

    /** "Freitag, 6. November · 19–23:30 Uhr" */
    fun eventLangeZeit(startsAt: String, endsAt: String?): String {
        val a = Zeit.datum(startsAt) ?: return ""
        return "${Zeit.heuteLang(a)} · ${uhrSpanne(startsAt, endsAt)}"
    }

    /** "Fr 06.11.2026" */
    private fun tagMitJahr(d: Instant): String {
        val z = d.atZone(Zeit.berlinZone)
        return "${Zeit.kurzerWochentag(d)} ${"%02d.%02d.%04d".formatiert(z.dayOfMonth, z.monthValue, z.year)}"
    }

    /** "Fr 06.11.2026 · 19–23:30 Uhr", mehrtaegig "Fr 06.11.2026, 19 Uhr – Sa 07.11.2026, 02 Uhr". */
    fun eventZeitText(startsAt: String, endsAt: String?): String {
        val a = Zeit.datum(startsAt) ?: return ""
        val tagA = tagMitJahr(a)
        val b = endsAt?.let(Zeit::datum) ?: return "$tagA · ${uhr(a)} Uhr"
        if (Zeit.berlinDay(a) == Zeit.berlinDay(b)) return "$tagA · ${uhr(a)}–${uhr(b)} Uhr"
        return "$tagA, ${uhr(a)} Uhr – ${tagMitJahr(b)}, ${uhr(b)} Uhr"
    }

    /** Die Statusmarke: "Anmeldung offen", "Abgeschlossen", "Abgesagt" ... */
    fun eventStatusMarke(e: MitgliedEvent, now: Instant): MeineMarke = when {
        e.status == "draft" -> MeineMarke("Entwurf", EventTon.GRAU)
        e.status == "cancelled" -> MeineMarke("Abgesagt", EventTon.ROT)
        eventVorbei(e, now) -> MeineMarke("Abgeschlossen", EventTon.GRUEN)
        eventBegonnen(e, now) -> MeineMarke("Läuft", EventTon.GELB)
        e.registrationEnabled != true -> MeineMarke("Veröffentlicht", EventTon.GRAU)
        eventSchlussVorbei(e, now) -> MeineMarke("Anmeldung geschlossen", EventTon.GELB)
        else -> MeineMarke("Anmeldung offen", EventTon.BLAU)
    }

    /** Begleitpersonen und Bemerkung aendern geht bis zum Anmeldeschluss. */
    fun eventAenderbar(e: MitgliedEvent, now: Instant): Boolean =
        e.status == "published" && eventIchDabei(e) && !eventSchlussVorbei(e, now)

    /** Abmelden geht bis zum Beginn - nach dem Anmeldeschluss kostet es trotzdem. */
    fun eventAbmeldbar(e: MitgliedEvent, now: Instant): Boolean =
        e.status == "published" && eventIchDabei(e) && !eventBegonnen(e, now)

    /** Was eine Anmeldung kostet: Preis pro Person, Begleitpersonen eingerechnet. */
    fun eventGebuehrCents(feeCents: Int?, begleitpersonen: Int): Int =
        (feeCents ?: 0) * (1 + maxOf(0, begleitpersonen))

    /** Wuerde diese Gruppe nur noch auf die Warteliste passen? */
    fun eventNurWarteliste(e: MitgliedEvent, begleitpersonen: Int): Boolean {
        val max = e.maxParticipants ?: return false
        return (e.personen ?: 0) + 1 + maxOf(0, begleitpersonen) > max
    }

    /** "62 angemeldet · noch 18 frei", ohne Grenze "62 angemeldet". Nur Zahlen, keine Namen. */
    fun eventBelegungText(e: MitgliedEvent): String {
        val teile = mutableListOf("${e.personen ?: 0} angemeldet")
        eventFrei(e)?.let { frei -> teile += if (frei > 0) "noch $frei frei" else "ausgebucht" }
        val w = e.warteliste
        if (w != null && w > 0) teile += "$w auf der Warteliste"
        return teile.joinToString(" · ")
    }

    /** Fuellstand fuer den Balken (0..1), ohne Grenze null. */
    fun eventBelegungAnteil(e: MitgliedEvent): Double? {
        val max = e.maxParticipants?.takeIf { it != 0 } ?: return null
        return minOf(1.0, (e.personen ?: 0).toDouble() / max)
    }

    /** "Du allein", "Du + 1 Begleitperson", "Du + 2 Begleitpersonen". */
    fun eventPersonenText(begleitpersonen: Int): String {
        if (begleitpersonen <= 0) return "Du allein"
        return "Du + $begleitpersonen ${if (begleitpersonen == 1) "Begleitperson" else "Begleitpersonen"}"
    }

    /** Beschriftung des Anmeldeknopfs: "Verbindlich anmelden · 36,00 €", "Auf die Warteliste". */
    fun eventAnmeldenKnopf(e: MitgliedEvent, begleitpersonen: Int): String {
        if (eventNurWarteliste(e, begleitpersonen)) return "Auf die Warteliste"
        val fee = e.feeCents?.takeIf { it != 0 } ?: return "Anmelden"
        return "Verbindlich anmelden · ${Geld.formatCents(eventGebuehrCents(fee, begleitpersonen))}"
    }

    /** "Abmelden (bis 30.10. kostenlos)", nach dem Schluss "Abmelden (Gebühr bleibt)". */
    fun eventAbmeldenKnopf(e: MitgliedEvent, now: Instant): String {
        if ((e.feeCents ?: 0) == 0 || e.meinStatus == "waitlisted") return "Abmelden"
        return if (eventSchlussVorbei(e, now)) {
            "Abmelden (Gebühr bleibt)"
        } else {
            "Abmelden (bis ${eventTagKurz(eventSchluss(e))} kostenlos)"
        }
    }

    /**
     * Der Hinweis zur Gebuehr vor dem Anmelden. Die Forderung entsteht mit der
     * Anmeldung, steht im Konto unter Offen; nach dem Schluss kostet Abmelden
     * trotzdem.
     */
    fun eventGebuehrHinweis(e: MitgliedEvent): String? {
        val fee = e.feeCents?.takeIf { it != 0 } ?: return null
        val begleit = if (e.companionsAllowed == true) " – auch für jede Begleitperson" else ""
        return "${Geld.formatCents(fee)} pro Person$begleit. Mit der Anmeldung entsteht die Forderung, " +
            "sie steht in deinem Konto unter „Offen“ und wird per Lastschrift eingezogen. " +
            "Bis zum Anmeldeschluss am ${eventTagKurz(eventSchluss(e))} kannst du dich kostenlos abmelden, " +
            "danach kostet die Abmeldung trotzdem."
    }

    /** Der Stand auf der Warteliste: "Platz 2 von 3 auf der Warteliste. ..." */
    fun eventWartelisteText(platz: Int?, laenge: Int): String {
        val wo = platz?.let { "Platz $it von ${maxOf(it, laenge)}" } ?: "Du stehst"
        return "$wo auf der Warteliste. Wird ein Platz frei, rückst du bis zum Anmeldeschluss automatisch nach – " +
            "erst dann entsteht eine Forderung."
    }
}
