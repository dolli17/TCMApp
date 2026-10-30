/*
 * Getraenke: der Korb, die Rueckmeldung nach dem Eintragen und das Stornofenster
 *
 * Portierung aus packages/core/src/drinks.ts (changeBasket, basketSummary,
 * basketAfterBatch, basketReminder, drinkBatchReport, canVoidSelf), wie
 * Kern/Getraenke.swift der iOS-App. Mit "+" waechst nur der Korb - gebucht
 * ist erst, was ueber "Eintragen" an die Datenbank gegangen ist (U17).
 * Gebucht wird je Artikel einzeln (record_drink_purchase), es gibt keinen
 * Sammelauftrag. Ob eine Ruecknahme noch geht, prueft die Datenbank ein
 * zweites Mal; hier wird nur der Knopf rechtzeitig ausgeblendet. Gepruefte
 * Faelle: packages/core/golden/ (VereinGoldenTest).
 */

package de.tcmuckensturm.kern

import java.time.Duration
import java.time.Instant

/** Ein Artikel der Karte, soweit der Korb ihn braucht. */
interface Korbartikel {
    val id: String
    val priceCents: Int?
}

/** Artikel-Id -> Menge, gesammelt und noch nicht eingetragen. */
typealias Getraenkekorb = Map<String, Int>

/** Was beim Eintragen eines Artikels herauskam (DrinkBatchResult). */
data class EintragErgebnis(
    val id: String,
    val name: String,
    val quantity: Int,
    val ok: Boolean,
    /** Grund aus der Datenbank, wenn es nicht geklappt hat */
    val message: String? = null,
)

/** Was im Korb liegt (basketSummary). */
data class Korbsumme<T : Korbartikel>(val lines: List<T>, val count: Int, val totalCents: Int)

/** Die Rueckmeldung nach dem Eintragen (drinkBatchReport). */
data class EintragBericht(val ok: Boolean, val text: String)

object Getraenke {
    /** Hoechstmenge je Artikel und Eintragung - dieselbe Grenze in App und Web. */
    const val MAX_MENGE = 50

    /** Eins mehr oder weniger, begrenzt auf 0 bis MAX_MENGE. Bei 0 faellt der Artikel heraus. */
    fun changeBasket(korb: Getraenkekorb, itemId: String, delta: Int): Getraenkekorb {
        val neu = ((korb[itemId] ?: 0) + delta).coerceIn(0, MAX_MENGE)
        return if (neu == 0) korb - itemId else korb + (itemId to neu)
    }

    /**
     * Was im Korb liegt, in der Reihenfolge der Karte. Nur Artikel, die noch
     * auf der Karte stehen, zaehlen mit.
     */
    fun <T : Korbartikel> basketSummary(karte: List<T>, korb: Getraenkekorb): Korbsumme<T> {
        val zeilen = karte.filter { (korb[it.id] ?: 0) > 0 }
        return Korbsumme(
            lines = zeilen,
            count = zeilen.sumOf { korb[it.id] ?: 0 },
            totalCents = zeilen.sumOf { (korb[it.id] ?: 0) * (it.priceCents ?: 0) },
        )
    }

    /** Nach dem Eintragen: was geklappt hat, verlaesst den Korb; was nicht, bleibt fuer einen neuen Versuch. */
    fun basketAfterBatch(ergebnisse: List<EintragErgebnis>): Getraenkekorb =
        ergebnisse.filter { !it.ok }.associate { it.id to it.quantity }

    /** "2 Getränke (5,00 €) sind noch nicht eingetragen." */
    fun basketReminder(count: Int, totalCents: Int): String {
        val was = if (count == 1) "1 Getränk" else "$count Getränke"
        return "$was (${Geld.formatCents(totalCents)}) ${if (count == 1) "ist" else "sind"} noch nicht eingetragen."
    }

    /**
     * Rueckmeldung nach dem gesammelten Eintragen: schlaegt einer fehl, muss
     * klar sein, welcher - und dass die anderen trotzdem stehen.
     */
    fun drinkBatchReport(ergebnisse: List<EintragErgebnis>): EintragBericht {
        fun teil(r: EintragErgebnis) = "${r.quantity}× ${r.name}"
        val gut = ergebnisse.filter { it.ok }
        val schlecht = ergebnisse.filter { !it.ok }

        if (schlecht.isEmpty()) {
            return EintragBericht(true, "Eingetragen: ${gut.joinToString(", ", transform = ::teil)}.")
        }
        val fehler = schlecht.joinToString(", ") { r ->
            val m = r.message
            if (m.isNullOrEmpty()) teil(r) else "${teil(r)} (${m.removeSuffix(".")})"
        }
        if (gut.isEmpty()) return EintragBericht(false, "Nicht eingetragen: $fehler.")
        return EintragBericht(
            false,
            "Nicht eingetragen: $fehler. Eingetragen: ${gut.joinToString(", ", transform = ::teil)}.",
        )
    }

    /**
     * Darf das Mitglied diese Buchung noch selbst zuruecknehmen? Genau auf der
     * Grenze noch ja. Ohne lesbaren Zeitpunkt nein - die Datenbank haette das
     * letzte Wort, der Knopf soll dann gar nicht erst erscheinen.
     */
    fun canVoidSelf(createdAt: String?, voidedAt: String?, fensterMinuten: Int, now: Instant): Boolean {
        if (!voidedAt.isNullOrEmpty()) return false
        val erstellt = createdAt?.let(Zeit::datum) ?: return false
        return Duration.between(erstellt, now) <= Duration.ofMinutes(fensterMinuten.toLong())
    }
}
