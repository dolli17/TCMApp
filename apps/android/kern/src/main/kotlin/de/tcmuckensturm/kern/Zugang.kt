/*
 * Kein Zugang mehr (B22)
 *
 * Entspricht packages/core/src/zugang.ts (Texte wortgleich), wie
 * Daten/Zugang.swift der iOS-App. Archivierte, gesperrte und ausgetretene
 * Mitglieder koennen sich anmelden, bekommen von der Datenbank aber nichts
 * mehr. Die App fragt deshalb public.mein_zugang() und zeigt statt leerer
 * Seiten einen Hinweis.
 */

package de.tcmuckensturm.kern

enum class ZugangsGrund(val wert: String) {
    ARCHIVIERT("archiviert"),
    GESPERRT("gesperrt"),
    AUSGETRETEN("ausgetreten"),
    UNBEKANNT("unbekannt"),
    ;

    companion object {
        /** zugangsGrund: was die Datenbank sonst liefert, wird zu "unbekannt" - der Satz bleibt dann allgemein. */
        fun aus(wert: String?): ZugangsGrund = entries.firstOrNull { it.wert == wert } ?: UNBEKANNT
    }
}

object KeinZugang {
    const val TITEL = "Kein Zugang mehr"

    /** Was man tun kann - fuer alle Gruende derselbe Weg. */
    const val KONTAKT = "Wenn das nicht stimmt oder du wieder einsteigen möchtest, melde dich beim Vorstand."

    /** Ein Satz, warum (keinZugangText). */
    fun text(grund: ZugangsGrund): String = when (grund) {
        ZugangsGrund.AUSGETRETEN, ZugangsGrund.ARCHIVIERT ->
            "Deine Mitgliedschaft ist beendet. Damit endet auch der Zugang zur App."
        ZugangsGrund.GESPERRT -> "Der Verein hat deinen Zugang gesperrt."
        ZugangsGrund.UNBEKANNT -> "Mit diesem Konto ist im Moment keine Anmeldung möglich."
    }
}
