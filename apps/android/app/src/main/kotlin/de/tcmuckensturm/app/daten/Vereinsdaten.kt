/*
 * Was der Tab Verein von Supabase liest und schreibt
 *
 * Wie Daten/Vereinsdaten.swift der iOS-App und apps/mobile/src/lib/daten.ts
 * (ladeGetraenkekarte, bucheGetraenk, storniereGetraenk, ladeStornoFenster,
 * ladeVeranstaltung, meldeZuVeranstaltungAn usw.), Vertrag:
 * docs/native/app-api.md, Abschnitt "Verein". Nur RPCs: das Stornofenster
 * kommt aus drink_void_window_minutes statt aus settings, die eigene
 * Forderung zur Veranstaltung aus events_fuer_mitglied (meine_forderung_*)
 * statt aus charges.
 *
 * Lesende Aufrufe werfen den uebersetzten Satz als `Meldung`, schreibende
 * geben ein `Ergebnis` zurueck, dessen Meldung als Snackbar oder Hinweis erscheint.
 */

package de.tcmuckensturm.app.daten

import de.tcmuckensturm.kern.Getraenkekauf
import de.tcmuckensturm.kern.Korbartikel
import de.tcmuckensturm.kern.MitgliedEvent
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

// ---- Modelle -----------------------------------------------------------------

/** Eine Zeile aus drink_menu. */
@Serializable
data class Getraenk(
    override val id: String,
    val name: String? = null,
    val category: String? = null,
    val description: String? = null,
    @SerialName("price_cents") override val priceCents: Int? = null,
    @SerialName("sort_order") val sortOrder: Int? = null,
) : Korbartikel

/** Eine Zeile aus my_drink_purchases (Home, Konto, Getraenke). */
@Serializable
data class EigenesGetraenk(
    val id: String,
    @SerialName("item_name") val itemName: String? = null,
    val quantity: Int? = null,
    @SerialName("unit_price_cents") val unitPriceCents: Int? = null,
    @SerialName("total_cents") override val totalCents: Int? = null,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("voided_at") override val voidedAt: String? = null,
    val source: String? = null,
) : Getraenkekauf

/** Eine Veranstaltung im Detail mit dem eigenen Platz auf der Warteliste. */
data class VeranstaltungDetail(
    val event: MitgliedEvent,
    /** Eigener Platz auf der Warteliste, sonst null */
    val wartePlatz: Int?,
)

// ---- Laden und Schreiben -----------------------------------------------------

class Vereinsdaten(val client: SupabaseClient) {
    /** Was ein schreibender Aufruf zurueckgibt: der Satz fuer die Anzeige und ob es geklappt hat. */
    data class Ergebnis(val ok: Boolean, val meldung: String)

    private suspend fun <T> uebersetzt(aufruf: suspend () -> T): T = try {
        aufruf()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        throw Meldung.aus(e)
    }

    private suspend fun schreiben(aufruf: suspend () -> String): Ergebnis = try {
        Ergebnis(true, aufruf())
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        Ergebnis(false, Meldung.aus(e).text)
    }

    // ---- Getraenke ----

    suspend fun getraenkekarte(): List<Getraenk> =
        uebersetzt { client.postgrest.rpc("drink_menu").decodeList<Getraenk>() }

    suspend fun eigeneGetraenke(): List<EigenesGetraenk> =
        uebersetzt { client.postgrest.rpc("my_drink_purchases").decodeList<EigenesGetraenk>() }

    /** Minuten; ohne Einstellung oder bei einem Fehler 15 wie ladeStornoFenster. */
    suspend fun stornoFenster(): Int {
        val minuten = try {
            client.postgrest.rpc("drink_void_window_minutes").decodeAs<Int?>()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            null
        }
        return minuten?.takeIf { it > 0 } ?: STORNO_FENSTER_VORGABE
    }

    /** Ein Artikel mit Menge (1 bis 50) - je Artikel ein Aufruf, es gibt keinen Sammelauftrag. */
    suspend fun bucheGetraenk(itemId: String, menge: Int): Ergebnis = schreiben {
        client.postgrest.rpc(
            "record_drink_purchase",
            buildJsonObject {
                put("p_item_id", itemId)
                put("p_quantity", menge)
            },
        )
        "Gebucht."
    }

    suspend fun storniereGetraenk(purchaseId: String): Ergebnis = schreiben {
        client.postgrest.rpc(
            "void_drink_purchase",
            buildJsonObject {
                put("p_purchase_id", purchaseId)
                put("p_reason", "Fehlbuchung")
            },
        )
        "Zurückgenommen."
    }

    // ---- Veranstaltungen ----

    suspend fun veranstaltungen(): List<MitgliedEvent> =
        uebersetzt { client.postgrest.rpc("events_fuer_mitglied").decodeList<MitgliedEvent>() }

    /** Ohne Treffer null. Der Platz auf der Warteliste ist Beiwerk: schlaegt er fehl, gibt es keinen. */
    suspend fun veranstaltung(id: String): VeranstaltungDetail? = coroutineScope {
        val platz = async {
            try {
                client.postgrest.rpc("event_mein_wartelistenplatz", buildJsonObject { put("p_event_id", id) })
                    .decodeAs<Int?>()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                null
            }
        }
        val zeilen = uebersetzt {
            client.postgrest.rpc("events_fuer_mitglied") { filter { eq("id", id) } }.decodeList<MitgliedEvent>()
        }
        val event = zeilen.firstOrNull()
        if (event == null) {
            platz.cancel()
            return@coroutineScope null
        }
        VeranstaltungDetail(event, platz.await())
    }

    private fun anmeldung(id: String, begleitpersonen: Int, bemerkung: String) = buildJsonObject {
        put("p_event_id", id)
        put("p_companions", begleitpersonen)
        put("p_note", bemerkung)
    }

    suspend fun meldeAn(id: String, begleitpersonen: Int, bemerkung: String): Ergebnis = schreiben {
        val stand = client.postgrest.rpc("event_anmelden", anmeldung(id, begleitpersonen, bemerkung)).decodeAs<String>()
        if (stand == "waitlisted") "Ausgebucht – du stehst auf der Warteliste." else "Du bist angemeldet."
    }

    suspend fun aendereAnmeldung(id: String, begleitpersonen: Int, bemerkung: String): Ergebnis = schreiben {
        val stand = client.postgrest.rpc("event_anmeldung_aendern", anmeldung(id, begleitpersonen, bemerkung))
            .decodeAs<String>()
        if (stand == "waitlisted") "Geändert – du stehst weiter auf der Warteliste." else "Deine Anmeldung ist geändert."
    }

    suspend fun meldeAb(id: String): Ergebnis = schreiben {
        client.postgrest.rpc("event_abmelden", buildJsonObject { put("p_event_id", id) })
        "Du bist abgemeldet."
    }

    /** Fuer den Avatar im Kopf (ich()). */
    suspend fun ich(): Ich? = Zugangsdaten(client).ich()

    companion object {
        /** Wie lange man eine Entnahme selbst zuruecknehmen darf, wenn nichts eingestellt ist. */
        const val STORNO_FENSTER_VORGABE = 15
    }
}
