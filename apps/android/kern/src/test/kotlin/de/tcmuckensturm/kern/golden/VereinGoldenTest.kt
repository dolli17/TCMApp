package de.tcmuckensturm.kern.golden

import de.tcmuckensturm.kern.EintragErgebnis
import de.tcmuckensturm.kern.Geld
import de.tcmuckensturm.kern.Getraenke
import de.tcmuckensturm.kern.Getraenkekauf
import de.tcmuckensturm.kern.Korbartikel
import de.tcmuckensturm.kern.MitgliedEvent
import de.tcmuckensturm.kern.Startseite
import de.tcmuckensturm.kern.Veranstaltungen
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.int
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import org.junit.jupiter.api.TestFactory

/**
 * Der Kern des Tabs Verein (Veranstaltungen, Getraenke, Geld, Forderungsarten,
 * sumOpenDrinks) gegen jeden Fall der Golden Files - wie VereinGoldenTests der iOS-App.
 */
class VereinGoldenTest {
    /** Die Events in den Golden Files tragen nicht jede Spalte, aber keine, die MitgliedEvent nicht kennt. */
    private val json = Json { ignoreUnknownKeys = false }

    private fun event(input: JsonObject, name: String = "e"): MitgliedEvent =
        json.decodeFromJsonElement(input.getValue(name))

    private fun JsonObject.zahlOderNull(name: String): Int? = (this[name] as? JsonPrimitive)?.intOrNull

    private fun korb(element: JsonElement): Map<String, Int> =
        element.jsonObject.mapValues { it.value.jsonPrimitive.int }

    private fun Map<String, Int>.alsJson(): JsonObject = JsonObject(mapValues { JsonPrimitive(it.value) })

    private fun ergebnisse(input: JsonObject): List<EintragErgebnis> = input.getValue("results").jsonArray.map {
        val r = it.jsonObject
        val name = r.text("name")!!
        EintragErgebnis(
            id = r.text("id") ?: name,
            name = name,
            quantity = r.zahl("quantity"),
            ok = r.getValue("ok").jsonPrimitive.booleanOrNull!!,
            message = r.text("message"),
        )
    }

    /** Ein `null` in output liest der Lader als fehlend (Fall.output ist JsonElement?) - also auch hier null. */
    private fun text(wert: String?): JsonElement? = wert?.let(::JsonPrimitive)

    // ---- Veranstaltungen ------------------------------------------------------

    @TestFactory
    fun eventMonatsGruppen() = Golden.pruefen("eventMonatsGruppen") { input ->
        val roh = input.getValue("liste").jsonArray.map { it.jsonObject }
        val liste = roh.map { json.decodeFromJsonElement<MitgliedEvent>(it) }
        val vergangen = (input["vergangen"] as? JsonPrimitive)?.booleanOrNull ?: false
        val gruppen = Veranstaltungen.eventMonatsGruppen(liste, input.zeitpunkt("now"), vergangen)
        // Die Events kommen unveraendert zurueck - verglichen wird mit ihrem JSON aus der Eingabe.
        JsonArray(
            gruppen.map { g ->
                buildJsonObject {
                    put("schluessel", g.schluessel)
                    put("titel", g.titel)
                    put("events", JsonArray(g.events.map { e -> roh.first { it.text("id") == e.id } }))
                }
            },
        )
    }

    @TestFactory
    fun eventLangeZeit() = Golden.pruefen("eventLangeZeit") { input ->
        JsonPrimitive(Veranstaltungen.eventLangeZeit(input.text("startsAt")!!, input.text("endsAt")))
    }

    @TestFactory
    fun eventZeitText() = Golden.pruefen("eventZeitText") { input ->
        JsonPrimitive(Veranstaltungen.eventZeitText(input.text("startsAt")!!, input.text("endsAt")))
    }

    @TestFactory
    fun eventStatusMarke() = Golden.pruefen("eventStatusMarke") { input ->
        val m = Veranstaltungen.eventStatusMarke(event(input), input.zeitpunkt("now"))
        buildJsonObject {
            put("text", m.text)
            put("ton", m.ton.wert)
        }
    }

    @TestFactory
    fun eventBelegungText() = Golden.pruefen("eventBelegungText") { input ->
        JsonPrimitive(Veranstaltungen.eventBelegungText(event(input)))
    }

    @TestFactory
    fun eventAenderbar() = Golden.pruefen("eventAenderbar") { input ->
        JsonPrimitive(Veranstaltungen.eventAenderbar(event(input), input.zeitpunkt("now")))
    }

    @TestFactory
    fun eventAbmeldbar() = Golden.pruefen("eventAbmeldbar") { input ->
        JsonPrimitive(Veranstaltungen.eventAbmeldbar(event(input), input.zeitpunkt("now")))
    }

    @TestFactory
    fun eventNurWarteliste() = Golden.pruefen("eventNurWarteliste") { input ->
        JsonPrimitive(Veranstaltungen.eventNurWarteliste(event(input), input.zahl("begleitpersonen")))
    }

    @TestFactory
    fun eventPersonenText() = Golden.pruefen("eventPersonenText") { input ->
        JsonPrimitive(Veranstaltungen.eventPersonenText(input.zahl("begleitpersonen")))
    }

    @TestFactory
    fun eventAnmeldenKnopf() = Golden.pruefen("eventAnmeldenKnopf") { input ->
        JsonPrimitive(Veranstaltungen.eventAnmeldenKnopf(event(input), input.zahl("begleitpersonen")))
    }

    @TestFactory
    fun eventAbmeldenKnopf() = Golden.pruefen("eventAbmeldenKnopf") { input ->
        JsonPrimitive(Veranstaltungen.eventAbmeldenKnopf(event(input), input.zeitpunkt("now")))
    }

    @TestFactory
    fun eventGebuehrHinweis() = Golden.pruefen("eventGebuehrHinweis") { input ->
        text(Veranstaltungen.eventGebuehrHinweis(event(input)))
    }

    @TestFactory
    fun eventWartelisteText() = Golden.pruefen("eventWartelisteText") { input ->
        JsonPrimitive(Veranstaltungen.eventWartelisteText(input.zahlOderNull("platz"), input.zahl("laenge")))
    }

    // ---- Getraenke ------------------------------------------------------------

    private data class Artikel(override val id: String, override val priceCents: Int?, val roh: JsonObject) : Korbartikel

    @TestFactory
    fun changeBasket() = Golden.pruefen("changeBasket") { input ->
        Getraenke.changeBasket(korb(input.getValue("basket")), input.text("itemId")!!, input.zahl("delta")).alsJson()
    }

    @TestFactory
    fun basketSummary() = Golden.pruefen("basketSummary") { input ->
        val karte = input.getValue("items").jsonArray.map {
            val o = it.jsonObject
            Artikel(o.text("id")!!, o.zahlOderNull("price_cents"), o)
        }
        val s = Getraenke.basketSummary(karte, korb(input.getValue("basket")))
        buildJsonObject {
            put("lines", JsonArray(s.lines.map { it.roh }))
            put("count", s.count)
            put("totalCents", s.totalCents)
        }
    }

    @TestFactory
    fun basketAfterBatch() = Golden.pruefen("basketAfterBatch") { input ->
        Getraenke.basketAfterBatch(ergebnisse(input)).alsJson()
    }

    @TestFactory
    fun basketReminder() = Golden.pruefen("basketReminder") { input ->
        JsonPrimitive(Getraenke.basketReminder(input.zahl("count"), input.zahl("totalCents")))
    }

    @TestFactory
    fun drinkBatchReport() = Golden.pruefen("drinkBatchReport") { input ->
        val r = Getraenke.drinkBatchReport(ergebnisse(input))
        buildJsonObject {
            put("ok", r.ok)
            put("text", r.text)
        }
    }

    @TestFactory
    fun canVoidSelf() = Golden.pruefen("canVoidSelf") { input ->
        val kauf = input.getValue("purchase").jsonObject
        JsonPrimitive(
            Getraenke.canVoidSelf(
                createdAt = kauf.text("createdAt"),
                voidedAt = kauf.text("voidedAt"),
                fensterMinuten = input.zahl("windowMinutes"),
                now = input.zeitpunkt("now"),
            ),
        )
    }

    private data class Kauf(override val totalCents: Int?, override val voidedAt: String?) : Getraenkekauf

    @TestFactory
    fun sumOpenDrinks() = Golden.pruefen("sumOpenDrinks") { input ->
        val kaeufe = input.getValue("kaeufe").jsonArray.map {
            val o = it.jsonObject
            Kauf(o.zahlOderNull("total_cents"), o.text("voided_at"))
        }
        JsonPrimitive(Startseite.sumOpenDrinks(kaeufe))
    }

    // ---- Geld (CHARGE_KIND_LABEL prueft KontoGoldenTest) ------------------------

    @TestFactory
    fun formatCents() = Golden.pruefen("formatCents") { input ->
        JsonPrimitive(Geld.formatCents(input.zahl("cents")))
    }
}
