package de.tcmuckensturm.kern.golden

import de.tcmuckensturm.kern.BookingTypeInfo
import de.tcmuckensturm.kern.BuchungsSlot
import de.tcmuckensturm.kern.CourtStatus
import de.tcmuckensturm.kern.FreeGap
import de.tcmuckensturm.kern.OffeneSpiele
import de.tcmuckensturm.kern.PlanSlot
import de.tcmuckensturm.kern.Platzplan
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import org.junit.jupiter.api.TestFactory

/**
 * Belegungsplan, Buchungsblatt und offene Spiele gegen jeden Fall der Golden
 * Files - wie PlatzplanGoldenTests der iOS-App. canStartAt, freeCourtsNow und
 * occupancyKind prueft StartseiteGoldenTest.
 */
class PlatzplanGoldenTest {
    /**
     * Eine Belegung, wie die Golden Files sie schreiben (CourtSlot, UmsetzBuchung).
     * Das JSON bleibt erhalten: Kommt die Belegung im Ergebnis zurueck, wird sie
     * genau so verglichen.
     */
    data class Slot(val roh: JsonObject) : PlanSlot, BuchungsSlot {
        override val bookingId get() = roh.text("booking_id") ?: ""
        override val courtId get() = roh.text("court_id") ?: ""
        override val startsAt get() = roh.text("starts_at") ?: ""
        override val endsAt get() = roh.text("ends_at") ?: ""
        override val kind get() = roh.text("kind")
        override val isOwn get() = (roh["is_own"] as? JsonPrimitive)?.booleanOrNull
        override val partnerWanted get() = (roh["partner_wanted"] as? JsonPrimitive)?.booleanOrNull
        override val frei get() = (roh["frei"] as? JsonPrimitive)?.intOrNull
        override val seriesId get() = roh.text("series_id")
        override val title get() = roh.text("title")
        override val typeName get() = roh.text("type_name")
        override val ownerName get() = roh.text("owner_name")
    }

    private fun JsonObject.slots(name: String) = getValue(name).jsonArray.map { Slot(it.jsonObject) }

    private fun JsonObject.slot(name: String) = Slot(getValue(name).jsonObject)

    private fun JsonObject.zahlOderNull(name: String) = (this[name] as? JsonPrimitive)?.intOrNull

    private fun JsonObject.wahrOderNull(name: String) = (this[name] as? JsonPrimitive)?.booleanOrNull

    private fun JsonObject.texte(name: String) = getValue(name).jsonArray.map { it.jsonPrimitive.content }

    private fun JsonObject.art(name: String = "type"): BookingTypeInfo {
        val t = getValue(name).jsonObject
        return BookingTypeInfo(
            code = t.text("code")!!,
            name = t.text("name")!!,
            durationMinutes = t.zahl("durationMinutes"),
            minPlayers = t.zahl("minPlayers"),
            maxPlayers = t.zahl("maxPlayers"),
            requiresPartner = t.getValue("requiresPartner").jsonPrimitive.booleanOrNull!!,
        )
    }

    private fun status(s: CourtStatus<Slot>): JsonObject = buildJsonObject {
        put("art", s.art.wert)
        put("text", s.text)
        s.belegung?.let { put("belegung", it.roh) }
    }

    private fun liste(werte: List<JsonElement>) = JsonArray(werte)

    // ---- Freie Zeiten -----------------------------------------------------------

    @TestFactory
    fun courtStatusAt() = Golden.pruefen("courtStatusAt") { i ->
        status(
            Platzplan.courtStatusAt(
                i.text("day")!!, i.text("courtId")!!, i.zahl("minute"), i.zahl("durationMinutes"),
                i.zahl("closingMinutes"), i.slots("occupied"), i.zahlOderNull("leadDays"), i.zeitpunkt("now"),
            ),
        )
    }

    @TestFactory
    fun freeSlotsOfDay() = Golden.pruefen("freeSlotsOfDay") { i ->
        val zeilen = Platzplan.freeSlotsOfDay(
            i.text("day")!!, i.texte("courtIds"), i.zahl("openingMinutes"), i.zahl("closingMinutes"),
            i.zahl("slotMinutes"), i.zahl("durationMinutes"), i.slots("occupied"),
            leadDays = i.zahlOderNull("leadDays"), now = i.zeitpunkt("now"),
        )
        liste(
            zeilen.map { z ->
                buildJsonObject {
                    put("minute", z.minute)
                    put(
                        "courts",
                        liste(
                            z.courts.map { c ->
                                buildJsonObject {
                                    put("courtId", c.courtId)
                                    put("status", status(c.status))
                                }
                            },
                        ),
                    )
                    put("free", z.free)
                }
            },
        )
    }

    // ---- Raster -----------------------------------------------------------------

    @TestFactory
    fun freeGaps() = Golden.pruefen("freeGaps") { i ->
        val luecken = Platzplan.freeGaps(
            i.text("day")!!, i.text("courtId")!!, i.zahl("openingMinutes"), i.zahl("closingMinutes"),
            i.zahl("slotMinutes"), i.zahl("durationMinutes"), i.slots("occupied"), i.zahlOderNull("leadDays"),
            i.zeitpunkt("now"),
        )
        liste(
            luecken.map {
                buildJsonObject {
                    put("courtId", it.courtId)
                    put("from", it.from)
                    put("until", it.until)
                }
            },
        )
    }

    @TestFactory
    fun startInGap() = Golden.pruefen("startInGap") { i ->
        val g = i.getValue("gap").jsonObject
        JsonPrimitive(
            Platzplan.startInGap(
                FreeGap(g.text("courtId")!!, g.zahl("from"), g.zahl("until")),
                i.zahl("minute"), i.zahl("slotMinutes"), i.zahl("durationMinutes"),
            ),
        )
    }

    @TestFactory
    fun occupancyLabel() = Golden.pruefen("occupancyLabel") { i ->
        val l = Platzplan.occupancyLabel(i.slot("b"))
        buildJsonObject {
            put("art", l.art.wert)
            put("title", l.title)
            put("detail", l.detail)
            put("spoken", l.spoken)
        }
    }

    @TestFactory
    fun blockingLabel() = Golden.pruefen("blockingLabel") { i ->
        val b = i.getValue("b").jsonObject
        val l = Platzplan.blockingLabel(b.text("title"), b.text("type_name"))
        buildJsonObject {
            put("kategorie", l.kategorie)
            put("grund", l.grund?.let(::JsonPrimitive) ?: JsonNull)
        }
    }

    // ---- Buchungsblatt ------------------------------------------------------------

    @TestFactory
    fun bookingActions() = Golden.pruefen("bookingActions") { i ->
        val a = Platzplan.bookingActions(
            i.text("startsAt")!!, i.wahrOderNull("own")!!, i.wahrOderNull("joined"), i.wahrOderNull("partnerWanted"),
            i.zahlOderNull("free"), i.wahrOderNull("managesCourts"), i.zeitpunkt("now"),
        )
        buildJsonObject {
            put("cancel", a.cancel)
            put("editPlayers", a.editPlayers)
            put("leave", a.leave)
            put("join", a.join)
        }
    }

    @TestFactory
    fun checkPlayers() = Golden.pruefen("checkPlayers") { i ->
        val grund = Platzplan.checkPlayers(
            i.art(), i.zahl("memberCount"), i.zahl("guestCount"), i.wahrOderNull("partnerWanted") ?: false,
        )
        buildJsonObject {
            put("ok", grund == null)
            // { ok: true } ohne reason, wie in TypeScript
            grund?.let { put("reason", it) }
        }
    }

    @TestFactory
    fun missingPlayers() = Golden.pruefen("missingPlayers") { i ->
        JsonPrimitive(Platzplan.missingPlayers(i.art(), i.zahl("memberCount"), i.zahl("guestCount")))
    }

    @TestFactory
    fun otherPlayersLabel() = Golden.pruefen("otherPlayersLabel") { i ->
        JsonPrimitive(Platzplan.otherPlayersLabel(i.art()))
    }

    @TestFactory
    fun umsetzZiele() = Golden.pruefen("umsetzZiele") { i ->
        val ziele = Platzplan.umsetzZiele(
            i.slot("booking"), i.text("day")!!, i.texte("courtIds"), i.zahl("openingMinutes"),
            i.zahl("closingMinutes"), i.zahl("slotMinutes"), i.slots("occupied"), i.zeitpunkt("now"),
        )
        liste(
            ziele.map {
                buildJsonObject {
                    put("courtId", it.courtId)
                    put("minute", it.minute)
                }
            },
        )
    }

    // ---- Offene Spiele ------------------------------------------------------------

    @TestFactory
    fun offenesSpielText() = Golden.pruefen("offenesSpielText") { i ->
        val spiel = i.getValue("spiel").jsonObject
        val t = OffeneSpiele.offenesSpielText(
            ownerName = spiel.text("owner_name"),
            players = spiel.getValue("players").jsonArray.map { (it as? JsonPrimitive)?.takeIf { p -> p.isString }?.content },
            frei = spiel.getValue("frei").jsonPrimitive.int,
            eigenes = i.wahrOderNull("eigenes") ?: false,
        )
        buildJsonObject {
            put("kopf", t.kopf)
            put("dabei", t.dabei?.let(::JsonPrimitive) ?: JsonNull)
        }
    }
}
