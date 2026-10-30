/*
 * Was Home, Glocke und Neuigkeiten von Supabase lesen
 *
 * Wie apps/mobile/src/lib/daten.ts (ladeMeineBuchungen, ladeBenachrichtigungen
 * usw.) und Daten/Startdaten.swift der iOS-App, Vertrag:
 * docs/native/app-api.md. Jede Rueckgabespalte ist optional, die nicht
 * offensichtlich Pflicht ist (Kennungen, Zeitpunkte). Jeder Fehler geht durch
 * translateDbError (DbFehler); lesende Aufrufe werfen den uebersetzten Satz
 * als `Meldung`.
 */

package de.tcmuckensturm.app.daten

import de.tcmuckensturm.kern.Benachrichtigungsdaten
import de.tcmuckensturm.kern.BuchungsSlot
import de.tcmuckensturm.kern.Getraenkekauf
import de.tcmuckensturm.kern.MitgliedEvent
import de.tcmuckensturm.kern.PlanSlot
import de.tcmuckensturm.kern.ZahlOderText
import de.tcmuckensturm.kern.Zeitraum
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.PostgrestRequestBuilder
import io.github.jan.supabase.postgrest.result.PostgrestResult
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

// ---- Modelle ------------------------------------------------------------------

/** Eine Zeile aus my_bookings. */
@Serializable
data class MeineBuchung(
    @SerialName("booking_id") val bookingId: String,
    @SerialName("starts_at") override val startsAt: String,
    @SerialName("ends_at") override val endsAt: String,
    @SerialName("court_name") val courtName: String? = null,
    val kind: String? = null,
    @SerialName("type_code") val typeCode: String? = null,
    @SerialName("type_name") val typeName: String? = null,
    val title: String? = null,
    @SerialName("owner_name") val ownerName: String? = null,
    @SerialName("bin_bucher") val binBucher: Boolean? = null,
    val players: List<String?>? = null,
) : Zeitraum

/** Eine Zeile aus open_matches. */
@Serializable
data class OffenesSpiel(
    @SerialName("booking_id") val bookingId: String,
    @SerialName("starts_at") override val startsAt: String,
    @SerialName("ends_at") override val endsAt: String,
    @SerialName("court_name") val courtName: String? = null,
    @SerialName("type_code") val typeCode: String? = null,
    @SerialName("type_name") val typeName: String? = null,
    @SerialName("owner_member_id") val ownerMemberId: String? = null,
    @SerialName("owner_name") val ownerName: String? = null,
    val players: List<String?>? = null,
    val frei: Int? = null,
    @SerialName("bin_dabei") val binDabei: Boolean? = null,
) : Zeitraum

/** Eine Belegung aus day_schedule (Home und Plaetze). */
@Serializable
data class TagesBelegung(
    @SerialName("booking_id") override val bookingId: String,
    @SerialName("court_id") override val courtId: String,
    @SerialName("starts_at") override val startsAt: String,
    @SerialName("ends_at") override val endsAt: String,
    override val kind: String? = null,
    @SerialName("series_id") override val seriesId: String? = null,
    @SerialName("type_code") val typeCode: String? = null,
    @SerialName("type_name") override val typeName: String? = null,
    override val title: String? = null,
    @SerialName("owner_member_id") val ownerMemberId: String? = null,
    @SerialName("owner_name") override val ownerName: String? = null,
    @SerialName("is_own") override val isOwn: Boolean? = null,
    @SerialName("bin_dabei") val binDabei: Boolean? = null,
    @SerialName("partner_wanted") override val partnerWanted: Boolean? = null,
    override val frei: Int? = null,
    val players: List<String?>? = null,
    @SerialName("player_member_ids") val playerMemberIds: List<String?>? = null,
    @SerialName("guest_names") val guestNames: List<String?>? = null,
) : PlanSlot, BuchungsSlot

/** Die eine Zeile aus booking_settings. */
@Serializable
data class Buchungseinstellungen(
    @SerialName("opening_time") val openingTime: String? = null,
    @SerialName("closing_time") val closingTime: String? = null,
    @SerialName("slot_minutes") val slotMinutes: Int? = null,
    @SerialName("lead_days") val leadDays: Int? = null,
    @SerialName("max_open_bookings") val maxOpenBookings: Int? = null,
    @SerialName("display_minutes") val displayMinutes: Int? = null,
    @SerialName("guest_fee_cents") val guestFeeCents: Int? = null,
)

/** Eine aktive Buchungsart aus booking_types_aktiv. */
@Serializable
data class Buchungsart(
    val code: String,
    val name: String? = null,
    @SerialName("duration_minutes") val durationMinutes: Int? = null,
    @SerialName("requires_partner") val requiresPartner: Boolean? = null,
    @SerialName("min_players") val minPlayers: Int? = null,
    @SerialName("max_players") val maxPlayers: Int? = null,
    @SerialName("sort_order") val sortOrder: Int? = null,
)

/** Ein aktiver Platz aus courts_aktiv. */
@Serializable
data class AktiverPlatz(
    val id: String,
    val name: String? = null,
    @SerialName("short_name") val shortName: String? = null,
    val position: Int? = null,
)

/** Eine Zeile aus my_notifications. */
@Serializable
data class Benachrichtigung(
    val id: String,
    val kind: String? = null,
    val title: String? = null,
    val body: String? = null,
    @SerialName("created_at") override val createdAt: String,
    @SerialName("read_at") override val readAt: String? = null,
    @SerialName("event_id") val eventId: String? = null,
) : Benachrichtigungsdaten

/** Eine Zeile aus my_drink_purchases. */
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

/** Die eine Zeile aus my_work_duty. Stunden sind numeric, also Zahl oder Text. */
@Serializable
data class Arbeitsdienst(
    val year: Int? = null,
    @Serializable(ZahlOderText::class) @SerialName("required_hours") val requiredHours: Double? = null,
    @Serializable(ZahlOderText::class) @SerialName("completed_hours") val completedHours: Double? = null,
    @Serializable(ZahlOderText::class) @SerialName("missing_hours") val missingHours: Double? = null,
)

/** Vor- und Nachname aus ich(). */
data class MeinName(val vorname: String, val nachname: String)

/** Ohne Zugang oder ohne Mitglied (Kiosk) ist member_id null - dann kein Name. */
val Ich.name: MeinName?
    get() = if (memberId == null) null else MeinName(firstName ?: "", lastName ?: "")

/**
 * Initialen fuer Avatar und Mitspieler-Chips, an einer Stelle fuer alle Tabs
 * (HomeLogik/KontoLogik/PlaetzeLogik.initialen in iOS). Ohne Buchstaben leer;
 * der Chip zeigt dann "?".
 */
object Initialen {
    /** "max", "Muster" -> "MM" */
    fun von(vor: String?, nach: String?): String = ((vor ?: "").take(1) + (nach ?: "").take(1)).uppercase()

    fun von(name: MeinName?): String = von(name?.vorname, name?.nachname)

    /** Aus einem ganzen Namen: erstes und letztes Wort ("Eva Maria Muster" -> "EM"). */
    fun ausName(name: String?): String {
        val teile = (name ?: "").split(" ").filter { it.isNotEmpty() }
        return von(teile.firstOrNull(), if (teile.size > 1) teile.last() else null)
    }
}

// ---- Laden --------------------------------------------------------------------

class Startdaten(private val client: SupabaseClient) {
    /** Fuehrt einen Aufruf aus und uebersetzt jeden Fehler. */
    private suspend fun <T> uebersetzt(aufruf: suspend () -> T): T = try {
        aufruf()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        throw Meldung.aus(e)
    }

    private suspend fun rpc(
        name: String,
        parameter: JsonObject = JsonObject(emptyMap()),
        anfrage: PostgrestRequestBuilder.() -> Unit = {},
    ): PostgrestResult = client.postgrest.rpc(name, parameter) { anfrage() }

    /** Name aus ich(), ohne Zugang oder ohne Mitglied null. */
    suspend fun meinName(): MeinName? = uebersetzt { Zugangsdaten(client).ich()?.name }

    suspend fun meineBuchungen(): List<MeineBuchung> = uebersetzt { rpc("my_bookings").decodeList() }

    suspend fun offeneSpiele(): List<OffenesSpiel> = uebersetzt { rpc("open_matches").decodeList() }

    /** Belegungen eines Berliner Tages ("2026-10-29"). */
    suspend fun tagesplan(tag: String): List<TagesBelegung> =
        uebersetzt { rpc("day_schedule", buildJsonObject { put("p_date", tag) }).decodeList() }

    /** Ohne Zeile null. */
    suspend fun buchungseinstellungen(): Buchungseinstellungen? =
        uebersetzt { rpc("booking_settings").decodeList<Buchungseinstellungen>().firstOrNull() }

    suspend fun buchungsarten(): List<Buchungsart> =
        uebersetzt { rpc("booking_types_aktiv", buildJsonObject { put("p_applies_to", "booking") }).decodeList() }

    suspend fun plaetze(): List<AktiverPlatz> = uebersetzt { rpc("courts_aktiv").decodeList() }

    suspend fun eigeneGetraenke(): List<EigenesGetraenk> = uebersetzt { rpc("my_drink_purchases").decodeList() }

    /** Ohne Zeile null. */
    suspend fun arbeitsdienst(): Arbeitsdienst? =
        uebersetzt { rpc("my_work_duty").decodeList<Arbeitsdienst>().firstOrNull() }

    /** Fuer "Demnächst im Verein"; Liste und Detail stehen in Vereinsdaten. */
    suspend fun veranstaltungen(): List<MitgliedEvent> = uebersetzt { rpc("events_fuer_mitglied").decodeList() }

    /** Ungelesen zuerst, dann die neuesten. */
    suspend fun benachrichtigungen(limit: Int = 30): List<Benachrichtigung> =
        uebersetzt { rpc("my_notifications", buildJsonObject { put("p_limit", limit) }).decodeList() }

    /** Ohne p_ids: alle. Gibt die Zahl der markierten zurueck. */
    suspend fun markiereGelesen(): Int = uebersetzt { rpc("mark_notifications_read").decodeAs<Int>() }

    /** Ein Fehler zaehlt als 0 - die Glocke bleibt dann einfach leer. */
    suspend fun ungelesen(): Int = try {
        rpc("my_unread_notification_count").decodeAs<Int>()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        0
    }
}
