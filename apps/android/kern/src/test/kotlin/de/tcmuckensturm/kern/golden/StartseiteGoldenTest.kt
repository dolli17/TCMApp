package de.tcmuckensturm.kern.golden

import de.tcmuckensturm.kern.BelegterSlot
import de.tcmuckensturm.kern.Belegung
import de.tcmuckensturm.kern.Belegungsmerkmale
import de.tcmuckensturm.kern.Geld
import de.tcmuckensturm.kern.Getraenkekauf
import de.tcmuckensturm.kern.Startseite
import de.tcmuckensturm.kern.Zeitraum
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.TestFactory

/** Home: Termine, freie Plaetze, Belegungsart, Getraenke und Geld gegen jeden Fall der Golden Files. */
class StartseiteGoldenTest {
    @Serializable
    data class Termin(
        @SerialName("starts_at") override val startsAt: String,
        @SerialName("ends_at") override val endsAt: String,
    ) : Zeitraum

    @Serializable
    data class Slot(
        @SerialName("court_id") override val courtId: String,
        @SerialName("starts_at") override val startsAt: String,
        @SerialName("ends_at") override val endsAt: String,
    ) : BelegterSlot

    @Serializable
    data class Merkmale(
        override val kind: String? = null,
        @SerialName("is_own") override val isOwn: Boolean? = null,
        @SerialName("partner_wanted") override val partnerWanted: Boolean? = null,
        override val frei: Int? = null,
        @SerialName("series_id") override val seriesId: String? = null,
    ) : Belegungsmerkmale

    @Serializable
    data class Kauf(
        @SerialName("total_cents") override val totalCents: Int? = null,
        @SerialName("voided_at") override val voidedAt: String? = null,
    ) : Getraenkekauf

    @Serializable
    data class Fenster(val courtId: String, val fromMinute: Int, val untilMinute: Int)

    private inline fun <reified T> JsonObject.liste(name: String): List<T> =
        Golden.json.decodeFromJsonElement(ListSerializer(kotlinx.serialization.serializer<T>()), getValue(name))

    private fun JsonObject.zahlOderNull(name: String): Int? = (this[name] as? JsonPrimitive)?.intOrNull

    @TestFactory
    fun upcomingBookings() = Golden.pruefen("upcomingBookings") { input ->
        val termine = Startseite.upcomingBookings(input.liste<Termin>("termine"), input.zeitpunkt("now"))
        Golden.json.encodeToJsonElement(termine)
    }

    @TestFactory
    fun canStartAt() = Golden.pruefen("canStartAt") { input ->
        JsonPrimitive(
            Belegung.canStartAt(
                day = input.text("day")!!,
                courtId = input.text("courtId")!!,
                minute = input.zahl("minute"),
                durationMinutes = input.zahl("durationMinutes"),
                closingMinutes = input.zahl("closingMinutes"),
                occupied = input.liste<Slot>("occupied"),
                leadDays = input.zahlOderNull("leadDays"),
                now = input.zeitpunkt("now"),
            ),
        )
    }

    @TestFactory
    fun freeCourtsNow() = Golden.pruefen("freeCourtsNow") { input ->
        val fenster = Belegung.freeCourtsNow(
            day = input.text("day")!!,
            courtIds = (input.getValue("courtIds") as JsonArray).map { it.jsonPrimitive.content },
            openingMinutes = input.zahl("openingMinutes"),
            closingMinutes = input.zahl("closingMinutes"),
            slotMinutes = input.zahl("slotMinutes"),
            durationMinutes = input.zahl("durationMinutes"),
            occupied = input.liste<Slot>("occupied"),
            leadDays = input.zahlOderNull("leadDays"),
            now = input.zeitpunkt("now"),
        )
        Golden.json.encodeToJsonElement(fenster.map { Fenster(it.courtId, it.fromMinute, it.untilMinute) })
    }

    @TestFactory
    fun occupancyKind() = Golden.pruefen("occupancyKind") { input ->
        val b = Golden.json.decodeFromJsonElement<Merkmale>(input.getValue("b"))
        JsonPrimitive(Startseite.occupancyKind(b).wert)
    }

    @TestFactory
    fun sumOpenDrinks() = Golden.pruefen("sumOpenDrinks") { input ->
        JsonPrimitive(Startseite.sumOpenDrinks(input.liste<Kauf>("kaeufe")))
    }

    @TestFactory
    fun formatCents() = Golden.pruefen("formatCents") { input ->
        JsonPrimitive(Geld.formatCents(input.zahl("cents")))
    }
}
