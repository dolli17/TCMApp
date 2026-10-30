/*
 * Zahlen fuer die Anzeige, deutsch geschrieben
 *
 * Expo und iOS schreiben Stunden wie ein JavaScript-Template ("6.5 / 10 h").
 * Die Android-App schreibt sie deutsch mit Komma und Tausenderpunkt
 * (Locale.GERMANY), egal welche Sprache das Geraet hat: "6,5 / 10 h".
 * Geld schreibt Geld.formatCents, Tage und Uhrzeiten Zeit.
 */

package de.tcmuckensturm.kern

import java.math.RoundingMode
import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.util.Locale

object Zahlen {
    /** 3.0 -> "3", 6.5 -> "6,5", 1234.25 -> "1.234,25"; hoechstens zwei Nachkommastellen. */
    fun deutsch(d: Double): String {
        // DecimalFormat ist nicht threadsicher - je Aufruf ein eigenes.
        val format = DecimalFormat("#,##0.##", DecimalFormatSymbols.getInstance(Locale.GERMANY))
        format.roundingMode = RoundingMode.HALF_UP
        // -0 ("-0") wie 0 schreiben
        return format.format(if (d == 0.0) 0.0 else d)
    }
}
