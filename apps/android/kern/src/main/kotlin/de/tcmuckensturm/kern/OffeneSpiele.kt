/*
 * Texte eines offenen Spiels (Befund O22): wer sucht, wie viele fehlen noch
 * und wer ist schon eingetragen. Web und App zeigen dasselbe.
 *
 * Portierung aus packages/core/src/offeneSpiele.ts. Die Daten kommen aus
 * open_matches oder day_schedule: owner_name ist der Bucher, players nennt
 * die Mitspieler ohne ihn, frei die noch offenen Plaetze. Gepruefte Faelle:
 * packages/core/golden/offenesSpielText.json (PlatzplanGoldenTest).
 */

package de.tcmuckensturm.kern

data class OffenesSpielText(
    /** Kopfzeile, etwa "Robin Heinzler sucht einen Mitspieler" */
    val kopf: String,
    /** "Schon dabei: …" oder null, wenn noch niemand eingetragen ist */
    val dabei: String?,
)

object OffeneSpiele {
    /** "A", "A und B", "A, B und C" */
    fun aufzaehlung(namen: List<String>): String {
        if (namen.size <= 1) return namen.firstOrNull() ?: ""
        return "${namen.dropLast(1).joinToString(", ")} und ${namen.last()}"
    }

    /** @param eigenes die Buchung gehoert dem angemeldeten Mitglied */
    fun offenesSpielText(ownerName: String?, players: List<String?>, frei: Int, eigenes: Boolean = false): OffenesSpielText {
        val wer = if (eigenes) "Du suchst" else "${Platzplan.nichtLeer(ownerName) ?: "Jemand"} sucht"
        // "Mitspieler" lautet im Plural gleich; die Zahl traegt den Unterschied
        val anzahl = maxOf(frei, 0)
        val namen = players.mapNotNull { Platzplan.nichtLeer(it) }
        return OffenesSpielText(
            kopf = "$wer ${if (anzahl == 1) "einen" else "$anzahl"} Mitspieler",
            dabei = if (namen.isNotEmpty()) "Schon dabei: ${aufzaehlung(namen)}" else null,
        )
    }
}
