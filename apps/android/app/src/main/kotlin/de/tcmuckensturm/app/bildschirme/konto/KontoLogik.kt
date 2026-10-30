/*
 * Was das Konto zeigt, als reine Funktionen
 *
 * Wie Bildschirme/Konto/KontoLogik.swift der iOS-App: Texte und Auswahl wie
 * apps/mobile/app/(tabs)/konto.tsx und die Blaetter dort
 * (Stammdatenformular, MerkmaleKarte, KontoloeschungFormular), ohne
 * Compose - geprueft in KontoLogikTest. `Abschnitt` kommt aus Home (HomeLogik.kt).
 */

package de.tcmuckensturm.app.bildschirme.konto

import de.tcmuckensturm.app.bildschirme.home.Abschnitt
import de.tcmuckensturm.app.daten.Arbeitsdienst
import de.tcmuckensturm.app.daten.EigenesGetraenk
import de.tcmuckensturm.app.daten.Forderung
import de.tcmuckensturm.app.daten.MeinMandat
import de.tcmuckensturm.app.daten.MeinProfil
import de.tcmuckensturm.app.daten.MerkmalZeile
import de.tcmuckensturm.kern.Forderungen
import de.tcmuckensturm.kern.Merkmaltexte
import de.tcmuckensturm.kern.Zahlen
import de.tcmuckensturm.kern.Zeit
import java.time.Instant
import kotlin.math.min

/** Alles, was der Konto-Tab laedt; jede Quelle fuer sich. */
data class KontoInhalt(
    val profil: Abschnitt<MeinProfil?>,
    val forderungen: Abschnitt<List<Forderung>>,
    val getraenke: Abschnitt<List<EigenesGetraenk>>,
    val dienst: Abschnitt<Arbeitsdienst?>,
    val mandat: Abschnitt<MeinMandat?>,
    val merkmale: Abschnitt<List<MerkmalZeile>>,
)

/** Ein Merkmal mit allen seinen Werten (buendeln in MerkmaleKarte.tsx). */
data class Merkmal(
    val code: String,
    val name: String,
    val beschreibung: String,
    val art: String,
    val multiple: Boolean,
    val darfIch: Boolean,
    val optionen: List<MerkmalZeile.Option>,
    val werte: List<Wert>,
) {
    data class Wert(val option: String?, val label: String?, val text: String?, val seit: String?)

    enum class Darstellung {
        /** Nur der Verein darf es aendern. */
        NUR_LESEN,
        JA_NEIN,

        /** Eine Liste mit genau einem Wert und 2-4 Optionen: eine Wahl untereinander (U71). */
        EINZELWAHL,

        /** Mehrere Werte als Marken mit "+ Option". */
        LISTE,

        /** Text, Datum oder Zahl mit Speichern. */
        EINGABE,
    }

    val gesetzt: Boolean get() = werte.isNotEmpty()

    val darstellung: Darstellung
        get() = when {
            !darfIch -> Darstellung.NUR_LESEN
            art == "boolean" -> Darstellung.JA_NEIN
            art == "list" && !multiple && optionen.size in 2..4 -> Darstellung.EINZELWAHL
            art == "list" -> Darstellung.LISTE
            else -> Darstellung.EINGABE
        }
}

/** Die Marke unter einer Forderung (Statusmarke in konto.tsx). */
data class Statusmarke(val text: String, val ton: Ton) {
    enum class Ton { GOLD, ROT, GRAU }
}

object KontoLogik {
    // ---- Profilkopf -----------------------------------------------------------

    fun initialen(vorname: String, nachname: String): String =
        (vorname.take(1) + nachname.take(1)).uppercase()

    /** "Mitglied seit 2019", die Mannschaft und "Mannschaftsführer", soweit vorhanden. */
    fun marken(p: MeinProfil?): List<String> {
        if (p == null) return emptyList()
        val liste = mutableListOf<String>()
        if (!p.memberSince.isNullOrEmpty()) liste += "Mitglied seit ${p.memberSince.take(4)}"
        if (!p.teamName.isNullOrEmpty()) {
            liste += p.teamName
            if (p.isTeamCaptain == true) liste += "Mannschaftsführer"
        }
        return liste
    }

    // ---- Abrechnung -----------------------------------------------------------

    /**
     * Offen ist, was noch eingezogen oder bezahlt werden muss. "returned"
     * zaehlt mit: eine zurueckgebuchte Lastschrift ist Geld, das der Verein
     * nicht bekommen hat.
     */
    fun offen(liste: List<Forderung>): List<Forderung> =
        liste.filter { it.status in setOf("open", "notified", "returned") }

    fun zurueckText(anzahl: Int): String? {
        if (anzahl <= 0) return null
        val anfang = if (anzahl == 1) "Eine Lastschrift kam zurück" else "$anzahl Lastschriften kamen zurück"
        return "$anfang – die Beträge sind wieder offen. Bitte melde dich beim Verein."
    }

    /** "Beitrag 2026" - unbekannte Arten mit ihrem Code. */
    fun forderungTitel(f: Forderung): String {
        val art = f.kind?.let { Forderungen.chargeKindLabel(it) ?: it } ?: ""
        return if (!f.periodLabel.isNullOrEmpty()) "$art ${f.periodLabel}" else art
    }

    /** Forderungen plus die Getraenke des laufenden Monats - die ehrliche Zahl. */
    fun summe(offen: List<Forderung>, getraenkeLaufend: Int): Int =
        offen.sumOf { it.amountCents ?: 0 } + getraenkeLaufend

    fun statusmarke(status: String, faellig: String?): Statusmarke = when (status) {
        "notified" ->
            if (!faellig.isNullOrEmpty()) {
                Statusmarke("Einzug am ${tagDatum(faellig)}", Statusmarke.Ton.GOLD)
            } else {
                Statusmarke("angekündigt", Statusmarke.Ton.GOLD)
            }
        "returned" -> Statusmarke("zurückgebucht", Statusmarke.Ton.ROT)
        "laufend" -> Statusmarke("läuft noch", Statusmarke.Ton.GRAU)
        else -> Statusmarke("offen", Statusmarke.Ton.GRAU)
    }

    /** "Getränke Oktober" */
    fun getraenkeTitel(jetzt: Instant): String = "Getränke ${Zeit.monatLang(jetzt)}"

    // ---- Arbeitsdienst --------------------------------------------------------

    /** "6,5 / 10 h", ohne Soll "6,5 h" (deutsch, nicht "6.5" wie Expo und iOS) */
    fun dienstWert(d: Arbeitsdienst): String {
        val ist = d.completedHours ?: 0.0
        val soll = d.requiredHours ?: 0.0
        return if (soll > 0) "${Zahlen.deutsch(ist)} / ${Zahlen.deutsch(soll)} h" else "${Zahlen.deutsch(ist)} h"
    }

    fun dienstText(d: Arbeitsdienst): String {
        val ist = d.completedHours ?: 0.0
        val soll = d.requiredHours ?: 0.0
        if (soll == 0.0) return "Für dieses Jahr ist kein Arbeitsdienst vorgesehen."
        if (ist >= soll) return "Erledigt – danke für deinen Einsatz."
        return "Fehlende Stunden werden zum Jahresende als Ausgleich berechnet."
    }

    fun dienstAnteil(d: Arbeitsdienst): Double {
        val soll = d.requiredHours ?: 0.0
        return if (soll > 0) min(1.0, (d.completedHours ?: 0.0) / soll) else 0.0
    }

    /** Fuer TalkBack: "4 von 10 Stunden geleistet" */
    fun dienstBedienText(d: Arbeitsdienst): String =
        "${Zahlen.deutsch(d.completedHours ?: 0.0)} von ${Zahlen.deutsch(d.requiredHours ?: 0.0)} Stunden geleistet"

    // ---- Mandat ---------------------------------------------------------------

    /** Die Zeilen der Mandatsansicht. */
    fun mandatZeilen(m: MeinMandat): List<Pair<String, String>> {
        val iban = m.ibanLast4?.takeIf { it.isNotEmpty() }?.let { "•••• $it" } ?: "–"
        return listOf(
            "Kontoinhaber" to leerStrich(m.holder),
            "IBAN" to iban,
            "Bank" to leerStrich(m.bankName),
            "Mandatsreferenz" to (m.reference ?: ""),
            "Unterschrieben am" to (m.signedOn?.let(::tagDatum) ?: ""),
        )
    }

    private fun leerStrich(s: String?): String = if (s.isNullOrEmpty()) "–" else s

    // ---- Datum ----------------------------------------------------------------

    /**
     * "2026-11-01" -> "01.11.2026"; ein Zeitstempel wird erst in Berliner
     * Zeit zum Tag. Was sich nicht lesen laesst, bleibt, wie es ist.
     */
    fun tagDatum(wert: String): String {
        val tag = if (wert.length == 10) wert else Zeit.datum(wert)?.let(Zeit::berlinDay) ?: return wert
        val teile = tag.split("-")
        if (teile.size != 3) return wert
        return "${teile[2]}.${teile[1]}.${teile[0]}"
    }

    // ---- Einwilligungen -------------------------------------------------------

    /** Aus den Zeilen der RPC wird je Merkmal ein Eintrag; nur, was das Mitglied selbst pflegen darf. */
    fun merkmale(zeilen: List<MerkmalZeile>): List<Merkmal> {
        val liste = linkedMapOf<String, Merkmal>()
        for (z in zeilen) {
            val m = liste.getOrPut(z.code) {
                Merkmal(
                    code = z.code,
                    name = z.name ?: z.code,
                    beschreibung = Merkmaltexte.merkmalBeschreibung(z.code, z.description ?: "", Merkmaltexte.Sicht.MITGLIED),
                    art = z.valueKind ?: "text",
                    multiple = z.multiple ?: false,
                    darfIch = z.darfIch ?: false,
                    optionen = z.optionen ?: emptyList(),
                    werte = emptyList(),
                )
            }
            // Die RPC liefert auch Merkmale ohne Wert - dann bleibt die Liste leer.
            if (z.optionValue != null || z.textValue != null) {
                liste[z.code] = m.copy(werte = m.werte + Merkmal.Wert(z.optionValue, z.optionLabel, z.textValue, z.setAt))
            }
        }
        return liste.values.filter { m -> zeilen.any { it.code == m.code && it.selfEditable == true } }
    }

    /** Zeigt "Einwilligungen" in den Einstellungen nur, wenn es etwas zu pflegen gibt. */
    fun zeigeEinwilligungen(zeilen: List<MerkmalZeile>?): Boolean =
        zeilen.orEmpty().any { it.selfEditable == true }

    /** "gesetzt · nur der Verein kann das ändern" */
    fun nurLesenText(m: Merkmal): String {
        val wert = if (m.gesetzt) m.werte[0].label ?: m.werte[0].text ?: "gesetzt" else "nicht gesetzt"
        return "$wert · nur der Verein kann das ändern"
    }

    /** Die Optionen, die noch nicht gesetzt sind ("+ Option"). */
    fun freieOptionen(m: Merkmal): List<MerkmalZeile.Option> =
        m.optionen.filter { o -> m.werte.none { it.option == o.value } }
}
