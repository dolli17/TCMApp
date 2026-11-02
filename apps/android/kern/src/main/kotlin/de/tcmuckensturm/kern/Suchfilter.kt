/*
 * Mitspielersuche mit LK-Bereich und "fuer wen" (Vereinsentscheidung vom 02.11.2026)
 *
 * Wer "Mitspieler gesucht" einschaltet, kann die Suche auf einen LK-Bereich
 * (LK 1,0 = beste, LK 25,0 = schwaechste, Schritte 0,1) und auf Damen oder
 * Herren einschraenken. Durchgesetzt wird das in der Datenbank (open_matches,
 * join_booking); hier stehen nur Darstellung und die Werte fuer die RPCs:
 * create_booking (p_partner_lk_von/-bis/-fuer), set_partner_wanted
 * (p_lk_von/-bis, p_fuer), gelesen aus day_schedule (partner_lk_*) und
 * open_matches (lk_von, lk_bis, fuer).
 *
 * Die LK rechnet der Filter in Zehnteln (10 = LK 1,0, 250 = LK 25,0), damit
 * 0,1-Schritte ohne Rundungsfehler bleiben. An den Grenzen geht null an die
 * Datenbank: von = 1 und bis = 25 heissen "keine Einschraenkung".
 */

package de.tcmuckensturm.kern

import kotlin.math.roundToInt

/** Fuer wen die Suche gilt (bookings.partner_fuer). */
enum class SuchFuer(val code: String?, val label: String) {
    ALLE(null, "Alle"),
    DAMEN("female", "Damen"),
    HERREN("male", "Herren"),
    ;

    companion object {
        /** Unbekannte Werte zeigen wie "alle" - die Datenbank kennt nur female und male. */
        fun aus(code: String?): SuchFuer = entries.firstOrNull { it.code != null && it.code == code } ?: ALLE
    }
}

/** LK-Bereich in Zehnteln und fuer wen. Standard: keine Einschraenkung. */
data class Suchfilter(
    val von: Int = MIN,
    val bis: Int = MAX,
    val fuer: SuchFuer = SuchFuer.ALLE,
) {
    /** Schraenkt der Filter ueberhaupt etwas ein? */
    val eingeschraenkt: Boolean get() = von > MIN || bis < MAX || fuer != SuchFuer.ALLE

    /** Untergrenze fuer die RPC, null an der Grenze LK 1. */
    val lkVon: Double? get() = if (von <= MIN) null else von / 10.0

    /** Obergrenze fuer die RPC, null an der Grenze LK 25. */
    val lkBis: Double? get() = if (bis >= MAX) null else bis / 10.0

    /** Neue Untergrenze, nie ueber der Obergrenze. */
    fun mitVon(neu: Int): Suchfilter = copy(von = neu.coerceIn(MIN, bis))

    /** Neue Obergrenze, nie unter der Untergrenze. */
    fun mitBis(neu: Int): Suchfilter = copy(bis = neu.coerceIn(von, MAX))

    /** Der Bereich fuer das Blatt: "LK 1–25", "LK 10–16,5", "LK 12" */
    val bereichText: String
        get() = if (von == bis) "LK ${lkText(von)}" else "LK ${lkText(von)}–${lkText(bis)}"

    /**
     * Kurzer Zusatz fuer offene Spiele: "LK 10–16 · Herren", "bis LK 16",
     * "ab LK 10", "Damen". Null, wenn nichts eingeschraenkt ist.
     */
    val zusatz: String?
        get() {
            val lk = when {
                von > MIN && bis < MAX -> bereichText
                bis < MAX -> "bis LK ${lkText(bis)}"
                von > MIN -> "ab LK ${lkText(von)}"
                else -> null
            }
            val teile = listOfNotNull(lk, fuer.takeIf { it != SuchFuer.ALLE }?.label)
            return teile.joinToString(" · ").ifEmpty { null }
        }

    companion object {
        /** LK 1,0 in Zehnteln */
        const val MIN = 10

        /** LK 25,0 in Zehnteln */
        const val MAX = 250

        val OFFEN = Suchfilter()

        /** Aus den Spalten von day_schedule oder open_matches; fehlende Grenzen sind offen. */
        fun aus(lkVon: Double?, lkBis: Double?, fuer: String?): Suchfilter {
            val von = lkVon?.let(::zehntel) ?: MIN
            val bis = lkBis?.let(::zehntel) ?: MAX
            return Suchfilter(von = minOf(von, bis), bis = maxOf(von, bis), fuer = SuchFuer.aus(fuer))
        }

        /** 12.3 -> 123, auf 1–25 begrenzt */
        fun zehntel(lk: Double): Int = (lk * 10).roundToInt().coerceIn(MIN, MAX)

        /** 160 -> "16", 165 -> "16,5" */
        fun lkText(zehntel: Int): String =
            if (zehntel % 10 == 0) "${zehntel / 10}" else "${zehntel / 10},${zehntel % 10}"
    }
}
