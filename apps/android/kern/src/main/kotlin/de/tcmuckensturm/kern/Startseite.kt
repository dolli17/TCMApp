/*
 * Texte fuer Home: Tage relativ zu heute
 *
 * Portierung aus packages/core/src/home.ts, wie Kern/Startseite.swift der
 * iOS-App. Bisher nur dayLabel und dayTag; den Rest portiert die Home-Spur.
 */

package de.tcmuckensturm.kern

import java.time.Instant

object Startseite {
    /** "Heute", "Morgen", sonst "Donnerstag, 01.10." */
    fun dayLabel(startsAt: String, now: Instant = Instant.now()): String {
        val beginn = Zeit.datum(startsAt) ?: return ""
        val tage = Zeit.tageZwischen(now, beginn)
        if (tage == 0) return "Heute"
        if (tage == 1) return "Morgen"
        return "${Zeit.langerWochentag(beginn)}, ${Zeit.tagMonat(beginn)}"
    }

    /** Kurzer Tag fuer die Datumsmarke eines offenen Spiels: "HEUTE", "MORGEN", "MI". */
    fun dayTag(startsAt: String, now: Instant = Instant.now()): String {
        val beginn = Zeit.datum(startsAt) ?: return ""
        val tage = Zeit.tageZwischen(now, beginn)
        if (tage <= 0) return "HEUTE"
        if (tage == 1) return "MORGEN"
        return Zeit.kurzerWochentag(beginn).uppercase()
    }
}
