/*
 * Was die Mannschaft zeigt, als reine Funktionen
 *
 * Texte und Entscheidungen fuer den Bildschirm Mannschaft und den Eintrag im
 * Konto (Vertrag "Mannschaftsfuehrer laedt in seine Mannschaft ein"), ohne
 * Compose - geprueft in MannschaftLogikTest. Wer was darf, entscheidet die
 * Datenbank; hier steht nur, was die App deshalb anbietet.
 */

package de.tcmuckensturm.app.bildschirme.konto

import de.tcmuckensturm.app.bildschirme.onboarding.OnboardingLogik
import de.tcmuckensturm.app.daten.Kandidat
import de.tcmuckensturm.app.daten.MeineEinladung
import de.tcmuckensturm.app.daten.MeineMannschaft
import de.tcmuckensturm.kern.Zeit

object MannschaftLogik {
    const val TITEL = "Mannschaft"
    const val TELEFON_SCHALTER = "Mannschaftsführer darf meine Telefonnummer sehen"
    const val TELEFON_ERKLAERUNG = "Nur er sieht dann deine Mobilnummer, ohne Mobilnummer deine Telefonnummer."
    const val HINZUFUEGEN = "Spieler hinzufügen"
    const val AUSTRETEN = "Aus Mannschaft austreten"
    const val LEER = "Du bist in keiner Mannschaft und hast keine offenen Einladungen."
    const val SUCHE_LABEL = "Name suchen"
    const val KEINE_KANDIDATEN = "Niemand gefunden."

    /** Die kinds aus notifications, die zur Mannschaft fuehren. */
    val nachrichtenArten = setOf("team_invited", "team_invitation_answered", "team_removed", "team_left")

    fun istMannschaftsNachricht(kind: String?): Boolean = kind != null && kind in nachrichtenArten

    /** Der Eintrag im Konto erscheint mit Mannschaft oder mit offener Einladung. */
    fun zeigeEintrag(mannschaft: MeineMannschaft?, einladungen: List<MeineEinladung>?): Boolean =
        mannschaft != null || !einladungen.isNullOrEmpty()

    /** "Damen 30 · Mannschaftsführer", "Herren 40 · 1 Einladung", "2 Einladungen". */
    fun eintragUntertitel(mannschaft: MeineMannschaft?, einladungen: List<MeineEinladung>?): String? {
        val teile = buildList {
            if (mannschaft != null) {
                add(mannschaft.name)
                if (mannschaft.ichBinMf) add("Mannschaftsführer")
            }
            val n = einladungen?.size ?: 0
            if (n > 0) add(if (n == 1) "1 Einladung" else "$n Einladungen")
        }.filter { it.isNotEmpty() }
        return teile.takeIf { it.isNotEmpty() }?.joinToString(" · ")
    }

    fun name(vorname: String?, nachname: String?): String =
        listOfNotNull(vorname?.trim(), nachname?.trim()).filter { it.isNotEmpty() }.joinToString(" ").ifEmpty { "Unbekannt" }

    /** Die LK so, wie sie im Konto steht ("LK14,5"); ohne LK null. */
    fun lk(wert: String?): String? {
        val t = wert?.trim().orEmpty()
        if (t.isEmpty()) return null
        return (OnboardingLogik.lkNormalisieren(t) as? OnboardingLogik.LkEingabe.Ok)?.wert ?: t
    }

    /** Unter dem Namen im Kader: "LK14,5 · Mannschaftsführer", ohne alles null. */
    fun spielerZeile(s: MeineMannschaft.Spieler): String? =
        listOfNotNull(lk(s.tennisLk), "Mannschaftsführer".takeIf { s.isTeamCaptain })
            .takeIf { it.isNotEmpty() }?.joinToString(" · ")

    /** Den MF selbst traegt niemand hier aus - das geht nur ueber den Vorstand. */
    fun darfAustragen(m: MeineMannschaft, s: MeineMannschaft.Spieler): Boolean = m.ichBinMf && !s.isTeamCaptain

    /** Austreten koennen Spieler, ein MF nicht. */
    fun darfAustreten(m: MeineMannschaft): Boolean = !m.ichBinMf

    /** Fuer den Waehler: nur Ziffern und ein fuehrendes Plus. Ohne Ziffern null. */
    fun telefonLink(telefon: String?): String? {
        val t = telefon?.trim().orEmpty()
        val ziffern = t.filter { it.isDigit() }
        if (ziffern.isEmpty()) return null
        return "tel:" + (if (t.startsWith("+")) "+" else "") + ziffern
    }

    /** "gültig bis 02.12."; ohne Datum null. */
    fun gueltigBis(expiresAt: String?): String? = expiresAt?.let(Zeit::datum)?.let { "gültig bis ${Zeit.tagMonat(it)}" }

    /** "eingeladen am 02.11. · gültig bis 02.12." */
    fun offeneEinladungZeile(e: MeineMannschaft.OffeneEinladung): String =
        listOfNotNull(
            e.createdAt?.let(Zeit::datum)?.let { "eingeladen am ${Zeit.tagMonat(it)}" },
            gueltigBis(e.expiresAt),
        ).joinToString(" · ").ifEmpty { "offen" }

    /** "Max Muster lädt dich ein · gültig bis 02.12." */
    fun einladungZeile(e: MeineEinladung): String =
        listOfNotNull(
            e.eingeladenVon?.trim()?.takeIf { it.isNotEmpty() }?.let { "$it lädt dich ein" },
            gueltigBis(e.expiresAt),
        ).joinToString(" · ")

    /**
     * Was vor dem Annehmen gesagt werden muss: die MF-Sperre oder der Wechsel.
     * Schickt die Datenbank einen eigenen Hinweis, gilt der.
     */
    fun einladungHinweis(e: MeineEinladung): String? {
        e.hinweis?.trim()?.takeIf { it.isNotEmpty() }?.let { return it }
        val alt = e.wechselVon?.trim()?.takeIf { it.isNotEmpty() }
        if (!e.annehmenMoeglich) {
            return if (alt != null) {
                "Du bist Mannschaftsführer von $alt. Das kann nur der Vorstand ändern."
            } else {
                "Du kannst diese Einladung gerade nicht annehmen."
            }
        }
        return alt?.let { "Du wechselst damit aus $it in ${e.teamName}." }
    }

    /** Marken in der Suche: "Interesse", "spielt in Herren 40", "eingeladen". */
    fun kandidatMarken(k: Kandidat): List<String> = listOfNotNull(
        "eingeladen".takeIf { k.eingeladen },
        "Interesse".takeIf { k.mannschaftInteresse },
        k.aktuelleMannschaft?.trim()?.takeIf { it.isNotEmpty() }?.let { "spielt in $it" },
    )

    fun kandidatZeile(k: Kandidat): String? = lk(k.tennisLk)

    // ---- Rueckfragen und Meldungen -----------------------------------------------

    fun austragenFrage(s: MeineMannschaft.Spieler, m: MeineMannschaft): String =
        "${name(s.firstName, s.lastName)} aus ${m.name} austragen?"

    const val AUSTRAGEN_ERKLAERUNG = "Die Person bekommt eine Nachricht. Du kannst sie später wieder einladen."

    fun austretenFrage(m: MeineMannschaft): String = "Aus ${m.name} austreten?"

    const val AUSTRETEN_ERKLAERUNG = "Der Mannschaftsführer bekommt eine Nachricht. Zurück geht es nur mit einer neuen Einladung."

    fun eingeladen(k: Kandidat): String = "${name(k.firstName, k.lastName)} ist eingeladen."
    fun zurueckgezogen(e: MeineMannschaft.OffeneEinladung): String = "Einladung an ${name(e.firstName, e.lastName)} zurückgezogen."
    fun ausgetragen(s: MeineMannschaft.Spieler): String = "${name(s.firstName, s.lastName)} ist nicht mehr im Kader."
    fun ausgetreten(m: MeineMannschaft): String = "Du bist aus ${m.name} ausgetreten."
    fun angenommen(e: MeineEinladung): String = "Willkommen in ${e.teamName}!"
    const val ABGELEHNT = "Einladung abgelehnt."
    const val TELEFON_AN = "Der Mannschaftsführer sieht jetzt deine Nummer."
    const val TELEFON_AUS = "Der Mannschaftsführer sieht deine Nummer nicht mehr."
}
