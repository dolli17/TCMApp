/*
 * Was der Tab Verein zeigt, als reine Funktionen
 *
 * Wie Bildschirme/Verein/VereinLogik.swift der iOS-App, Texte wie
 * apps/mobile/app/(tabs)/verein/ (getraenke.tsx, veranstaltung/[id].tsx),
 * ohne Compose - damit sich jeder Satz ohne Geraet pruefen laesst
 * (VereinLogikTest). Die Regeln selbst stehen im Kern (Getraenke,
 * Veranstaltungen); hier nur, was die Bildschirme daraus zusammensetzen.
 */

package de.tcmuckensturm.app.bildschirme.verein

import de.tcmuckensturm.app.daten.EigenesGetraenk
import de.tcmuckensturm.app.daten.Getraenk
import de.tcmuckensturm.kern.EventTon
import de.tcmuckensturm.kern.Geld
import de.tcmuckensturm.kern.Getraenke
import de.tcmuckensturm.kern.MeineMarke
import de.tcmuckensturm.kern.MitgliedEvent
import de.tcmuckensturm.kern.Veranstaltungen
import de.tcmuckensturm.kern.Zeit
import de.tcmuckensturm.kern.formatiert
import java.time.Instant

enum class VereinReiter(val wert: String, val label: String) {
    GETRAENKE("getraenke", "Getränke"),
    VERANSTALTUNGEN("veranstaltungen", "Veranstaltungen"),
    ;

    companion object {
        /** Unbekanntes oder nichts gemerkt: die Getraenke. */
        fun aus(wert: String?): VereinReiter = entries.firstOrNull { it.wert == wert } ?: GETRAENKE
    }
}

object VereinLogik {
    // ---- Getraenke ----

    private val quelle = mapOf("kiosk" to "Theke", "bar_duty" to "Thekendienst", "app" to "App")

    /** Woher eine Entnahme kommt; Unbekanntes gilt als App. */
    fun quelleText(source: String?): String = quelle[source ?: ""] ?: "App"

    /** "Do., 29.10., 18:05" wie Intl.DateTimeFormat("de-DE", {weekday: "short", day, month, hour, minute}) */
    fun zeitpunkt(iso: String?): String {
        val d = iso?.let(Zeit::datum) ?: return ""
        val z = d.atZone(Zeit.berlinZone)
        return "${Zeit.kurzerWochentag(d)}., " +
            "%02d.%02d., %02d:%02d".formatiert(z.dayOfMonth, z.monthValue, z.hour, z.minute)
    }

    /** Die Unterzeile in "Zuletzt": "Do., 29.10., 18:05 · App · zurückgenommen" */
    fun entnahmeZeile(g: EigenesGetraenk): String {
        val zurueck = if (g.voidedAt != null) " · zurückgenommen" else ""
        return "${zeitpunkt(g.createdAt)} · ${quelleText(g.source)}$zurueck"
    }

    /** "2× Bier", eins ohne Zahl */
    fun entnahmeTitel(g: EigenesGetraenk): String {
        val menge = g.quantity ?: 1
        return "${if (menge > 1) "$menge× " else ""}${g.itemName ?: ""}"
    }

    /** Kicker der Monatskarte: "Oktober · läuft noch" */
    fun monatKicker(jetzt: Instant): String = "${Zeit.monatLang(jetzt)} · läuft noch"

    /** "3 Entnahmen · wird mit der Monatsabrechnung eingezogen" */
    fun entnahmenText(anzahl: Int): String =
        "$anzahl ${if (anzahl == 1) "Entnahme" else "Entnahmen"} · wird mit der Monatsabrechnung eingezogen"

    /** Unterzeile einer Kachel: "2,50 € · 0,5 l" */
    fun artikelZeile(a: Getraenk): String {
        val preis = Geld.formatCents(a.priceCents ?: 0)
        val d = a.description
        return if (d.isNullOrEmpty()) preis else "$preis · $d"
    }

    /** Die Eintragen-Leiste: "3 Getränke · 7,50 €" */
    fun korbZeile(stueck: Int, betrag: Int): String =
        "$stueck ${if (stueck == 1) "Getränk" else "Getränke"} · ${Geld.formatCents(betrag)}"

    /** Die Rueckfrage beim Verlassen mit vollem Korb. */
    fun erinnerung(stueck: Int, betrag: Int): String =
        "${Getraenke.basketReminder(stueck, betrag)} Gebucht wird erst mit „Eintragen“ – die Auswahl bleibt gemerkt."

    fun stornoHinweis(minuten: Int): String = "Eine Entnahme lässt sich $minuten Minuten lang selbst zurücknehmen."

    // ---- Veranstaltung im Detail ----

    /** Abgesagt ist abgesagt: dann zaehlt die Anmeldung nicht mehr, es gibt nur den Hinweis. */
    fun dabei(e: MitgliedEvent): Boolean = e.status != "cancelled" && Veranstaltungen.eventIchDabei(e)

    /** Steht die Forderung noch offen (oder kam zurueck) - oder ist sie schon im Einzug? */
    fun forderungText(status: String?): String =
        if (status in setOf("open", "notified", "returned")) "steht in deinem Konto unter „Offen“" else "ist im Einzug"

    /** Die Zeile "Preis" in den Eckdaten. */
    fun preisHinweis(e: MitgliedEvent): String =
        (if (e.companionsAllowed == true) "Auch für Begleitpersonen. " else "") +
            "Mit der Anmeldung steht der Betrag in deinem Konto und wird per Lastschrift eingezogen."

    /** Die Rueckfrage vor dem Abmelden. */
    fun abmeldenFrage(e: MitgliedEvent, now: Instant): String {
        if (e.meinStatus != "waitlisted" && (e.feeCents ?: 0) != 0 && Veranstaltungen.eventSchlussVorbei(e, now)) {
            return "Der Anmeldeschluss ist vorbei – die Gebühr bleibt trotzdem fällig. Wirklich abmelden?"
        }
        return "Wirklich abmelden?"
    }

    /** Der Knopf im Aenderungsformular, angemeldet mit Gebuehr mit dem neuen Betrag. */
    fun aenderungKnopf(e: MitgliedEvent, begleitpersonen: Int): String {
        val fee = e.feeCents
        if (fee == null || fee == 0 || e.meinStatus != "registered") return "Änderung sichern"
        return "Änderung sichern · ${Geld.formatCents(Veranstaltungen.eventGebuehrCents(fee, begleitpersonen))}"
    }

    /** Unter "Begleitpersonen": der Preis je Person oder wer gemeint ist. */
    fun begleitHinweis(e: MitgliedEvent): String {
        val fee = e.feeCents?.takeIf { it != 0 } ?: return "Familie, Freunde"
        return "je ${Geld.formatCents(fee)}"
    }

    /** Passt die Gruppe nicht mehr, sagt das Formular es vor dem Absenden. */
    fun wartelisteVorab(begleitpersonen: Int): String =
        "Für ${if (begleitpersonen > 0) "euch alle" else "dich"} ist gerade kein Platz frei – du kommst auf die Warteliste " +
            "und rückst automatisch nach, wenn etwas frei wird."

    /** Wenn es nichts zu tun gibt: warum nicht. */
    fun nichtsZuTun(e: MitgliedEvent, now: Instant): String = when {
        e.status == "cancelled" -> "Diese Veranstaltung ist abgesagt."
        Veranstaltungen.eventVorbei(e, now) -> "Diese Veranstaltung ist vorbei."
        e.registrationEnabled != true -> "Ohne Anmeldung – komm einfach vorbei."
        Veranstaltungen.eventBegonnen(e, now) -> "Die Veranstaltung läuft schon."
        else -> "Der Anmeldeschluss ist vorbei."
    }

    /** Die Marken unter dem Kopf: Art und - abgesagt oder vorbei - der Stand. */
    fun marken(e: MitgliedEvent, now: Instant): List<MeineMarke> {
        val art = e.kind ?: ""
        val liste = mutableListOf(
            MeineMarke(Veranstaltungen.kindLabel[art] ?: art, Veranstaltungen.kindTon[art] ?: EventTon.GRAU),
        )
        if (e.status == "cancelled" || Veranstaltungen.eventVorbei(e, now)) {
            liste += Veranstaltungen.eventStatusMarke(e, now)
        }
        return liste
    }

    /** Was der Screenreader zu einer Karte der Liste sagt: "Titel, Fr 19 Uhr · Clubhaus, Angemeldet". */
    fun kartenBeschreibung(e: MitgliedEvent, now: Instant, aufforderung: Boolean = false): String {
        val marke = Veranstaltungen.eventMeineMarke(e, now, aufforderung)?.let { ", ${it.text}" } ?: ""
        return "${e.title ?: ""}, ${Veranstaltungen.eventKartenZeit(e)}$marke"
    }
}
