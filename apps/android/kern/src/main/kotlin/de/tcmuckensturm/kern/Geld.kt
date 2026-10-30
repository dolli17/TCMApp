/*
 * Geldbetraege
 *
 * Portierung aus packages/core/src/money.ts, wie Kern/Geld.swift der iOS-App.
 * Gerechnet wird in ganzen Cent; formatCents schreibt wie
 * Intl.NumberFormat("de-DE", EUR): Tausenderpunkt, Komma, geschuetztes
 * Leerzeichen (U+00A0) vor dem Euro-Zeichen - auf jedem Geraet gleich, egal
 * welche Sprache eingestellt ist.
 */

package de.tcmuckensturm.kern

import kotlin.math.absoluteValue

object Geld {
    /** 1900 -> "19,00 €" */
    fun formatCents(cents: Int): String {
        val betrag = cents.toLong().absoluteValue
        val euro = (betrag / 100).toString().reversed().chunked(3).joinToString(".").reversed()
        val rest = betrag % 100
        val vorzeichen = if (cents < 0) "-" else ""
        return "$vorzeichen$euro,${if (rest < 10) "0" else ""}$rest €"
    }
}
