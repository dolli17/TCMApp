/*
 * Zahlen fuer die Anzeige, deutsch geschrieben
 *
 * Expo und iOS schreiben Stunden wie ein JavaScript-Template ("6.5 / 10 h").
 * Die Android-App schreibt sie deutsch mit Komma und Tausenderpunkt
 * (Locale.GERMANY), egal welche Sprache das Geraet hat: "6,5 / 10 h".
 * Geld schreibt Geld.formatCents, Tage und Uhrzeiten Zeit.
 *
 * Dazu der eine Leser fuer Postgres-numeric (ZahlOderText), den alle
 * Datenmodelle teilen.
 */

package de.tcmuckensturm.kern

import java.math.RoundingMode
import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.util.Locale
import kotlinx.serialization.KSerializer
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull

/**
 * String.format mit deutschen Ziffern und Zeichen, unabhaengig von der
 * Sprache des Geraets: "%02d".format(9) gaebe auf einem arabisch oder
 * persisch eingestellten Telefon "٠٩". Fuer Uhrzeiten und Daten.
 */
fun String.formatiert(vararg werte: Any?): String = String.format(Locale.GERMANY, this, *werte)

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

/**
 * Postgres numeric: kommt als JSON-Zahl oder als Text ("2.5"), je nach Weg.
 * Was keine Zahl ist, wird null statt die ganze Zeile scheitern zu lassen.
 */
object ZahlOderText : KSerializer<Double?> {
    override val descriptor = PrimitiveSerialDescriptor("de.tcmuckensturm.kern.ZahlOderText", PrimitiveKind.DOUBLE)

    override fun deserialize(decoder: Decoder): Double? {
        val wert = (decoder as? JsonDecoder)?.decodeJsonElement() ?: return decoder.decodeDouble()
        return (wert as? JsonPrimitive)?.let { it.doubleOrNull ?: it.content.toDoubleOrNull() }
    }

    override fun serialize(encoder: Encoder, value: Double?) {
        if (value == null) encoder.encodeNull() else encoder.encodeDouble(value)
    }
}
