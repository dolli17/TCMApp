/*
 * Was der Tab Plaetze von Supabase liest und schreibt
 *
 * Wie apps/mobile/src/lib/daten.ts (ladeTagesplan, ladeKontingent,
 * bucheplatz, aendereMitspieler, storniereBuchung, sperreStunde usw.) und
 * Daten/Platzdaten.swift der iOS-App, Vertrag: docs/native/app-api.md,
 * Abschnitte Plaetze, Sperren und Realtime. Nur RPCs. Lesende Aufrufe werfen
 * den uebersetzten Satz als `Meldung`; schreibende geben ein `PlatzErgebnis`
 * zurueck, dessen Meldung im Blatt oder als Snackbar erscheint.
 *
 * Die Modelle des Tagesplans (TagesBelegung, Buchungseinstellungen,
 * Buchungsart, AktiverPlatz) und die lesenden Aufrufe dazu teilt sich der Tab
 * mit Home (Startdaten.kt).
 */

package de.tcmuckensturm.app.daten

import de.tcmuckensturm.app.bildschirme.plaetze.PlaetzeLogik
import de.tcmuckensturm.kern.BookingTypeInfo
import de.tcmuckensturm.kern.DbFehler
import de.tcmuckensturm.kern.Platzplan
import de.tcmuckensturm.kern.Zeit
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.realtime.PostgresAction
import io.github.jan.supabase.realtime.channel
import io.github.jan.supabase.realtime.postgresChangeFlow
import io.github.jan.supabase.realtime.realtime
import java.time.Instant
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.channelFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.add
import kotlinx.serialization.json.putJsonArray

// ---- Modelle --------------------------------------------------------------------

/** Die Spielform fuer die Besetzungsregeln (bookingTypeInfo). */
val Buchungsart.info: BookingTypeInfo
    get() = BookingTypeInfo(
        code = code,
        name = name ?: code,
        durationMinutes = durationMinutes ?: 60,
        minPlayers = minPlayers ?: 2,
        maxPlayers = maxPlayers ?: 2,
        requiresPartner = requiresPartner ?: true,
    )

/** Die eine Zeile aus my_booking_quota. allowed 0 heisst: unbegrenzt. */
@Serializable
data class Kontingent(val used: Int = 0, val allowed: Int = 0) {
    companion object {
        val LEER = Kontingent(0, 0)
    }
}

/** Eine Zeile aus member_directory. */
@Serializable
data class Mitglied(
    val id: String,
    @SerialName("first_name") val firstName: String? = null,
    @SerialName("last_name") val lastName: String? = null,
) {
    val name: String get() = "${firstName ?: ""} ${lastName ?: ""}".trim()
}

/** Was create_blocking und update_blocking zurueckgeben. */
@Serializable
private data class SperrErgebnis(
    @SerialName("created_count") val createdCount: Int? = null,
    @SerialName("displaced_count") val displacedCount: Int? = null,
)

/**
 * Ausgang einer schreibenden Aktion. Bei einer Sperrung, der Buchungen im
 * Weg liegen, steht deren Zahl in `kollisionen` - dann fragt das Blatt nach.
 */
data class PlatzErgebnis(val ok: Boolean, val meldung: String, val kollisionen: Int? = null)

// ---- Quelle -----------------------------------------------------------------------

/**
 * Alles, was der Tab Plaetze braucht. Platzdaten spricht mit Supabase; die
 * Bildschirmfotos nehmen eine Attrappe mit Beispieldaten, ohne Netz.
 */
interface PlatzQuelle {
    suspend fun plaetze(): List<AktiverPlatz>

    /** Belegungen eines Berliner Tages ("2026-10-29"). */
    suspend fun tagesplan(tag: String): List<TagesBelegung>

    suspend fun kontingent(): Kontingent

    suspend fun buchungseinstellungen(): Buchungseinstellungen?

    suspend fun buchungsarten(): List<Buchungsart>

    suspend fun blockungsarten(): List<Buchungsart>

    suspend fun verzeichnis(): List<Mitglied>

    suspend fun ich(): Ich?

    /** Ein Signal je Aenderung an bookings (Kanal plan-<tag>), solange gesammelt wird. */
    fun aenderungen(tag: String): Flow<Unit>

    suspend fun bucheplatz(
        courtId: String,
        beginn: Instant,
        typ: String,
        mitspieler: List<String>,
        gaeste: List<String>,
        sucheMitspieler: Boolean,
    ): PlatzErgebnis

    suspend fun aendereMitspieler(bookingId: String, mitglieder: List<String>, gaeste: List<String>): PlatzErgebnis

    suspend fun storniereBuchung(bookingId: String, grund: String?): PlatzErgebnis

    suspend fun sageSerienterminAb(bookingId: String, grund: String?): PlatzErgebnis

    suspend fun hebeSperreAuf(bookingId: String): PlatzErgebnis

    suspend fun spieleMit(bookingId: String): PlatzErgebnis

    suspend fun sucheMitspieler(bookingId: String, gesucht: Boolean): PlatzErgebnis

    suspend fun setzeUm(bookingId: String, platzId: String, tag: String, minute: Int, grund: String?): PlatzErgebnis

    suspend fun sperre(
        platzId: String,
        von: Instant,
        bis: Instant,
        typCode: String,
        grund: String,
        verdraengen: Boolean,
    ): PlatzErgebnis

    suspend fun aendereSperre(
        bookingId: String,
        platzIds: List<String>,
        von: Instant,
        bis: Instant,
        typCode: String,
        grund: String,
        verdraengen: Boolean,
    ): PlatzErgebnis
}

// ---- Laden und Schreiben --------------------------------------------------------

class Platzdaten(private val client: SupabaseClient) : PlatzQuelle {
    private val start = Startdaten(client)

    private suspend fun <T> uebersetzt(aufruf: suspend () -> T): T = try {
        aufruf()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        throw Meldung.aus(e)
    }

    /** Fuehrt eine schreibende RPC aus; jeder Fehler wird zur Meldung im PlatzErgebnis. */
    private suspend fun schreibe(erfolg: String, aufruf: suspend () -> Unit): PlatzErgebnis = try {
        aufruf()
        PlatzErgebnis(ok = true, meldung = erfolg)
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        PlatzErgebnis(ok = false, meldung = Meldung.aus(e).text)
    }

    private suspend fun rpc(name: String, parameter: JsonObject = JsonObject(emptyMap())) =
        client.postgrest.rpc(name, parameter)

    override suspend fun plaetze(): List<AktiverPlatz> = start.plaetze()

    override suspend fun tagesplan(tag: String): List<TagesBelegung> = start.tagesplan(tag)

    /** Ohne Zeile gilt {0, 0}, also unbegrenzt. */
    override suspend fun kontingent(): Kontingent =
        uebersetzt { rpc("my_booking_quota").decodeList<Kontingent>().firstOrNull() ?: Kontingent.LEER }

    override suspend fun buchungseinstellungen(): Buchungseinstellungen? = start.buchungseinstellungen()

    override suspend fun buchungsarten(): List<Buchungsart> = start.buchungsarten()

    /** Die Kategorien einer Sperrung, die erste ist die Vorgabe. */
    override suspend fun blockungsarten(): List<Buchungsart> =
        uebersetzt { rpc("booking_types_aktiv", buildJsonObject { put("p_applies_to", "blocking") }).decodeList() }

    /** Alle Mitglieder fuer die Mitspielersuche - gesucht wird in der App. */
    override suspend fun verzeichnis(): List<Mitglied> =
        uebersetzt { rpc("member_directory", buildJsonObject { put("p_query", "") }).decodeList() }

    /** member_id und Platzrechte aus ich(); ohne Zeile null. */
    override suspend fun ich(): Ich? = Zugangsdaten(client).ich()

    /**
     * Der Kanal plan-<tag> auf bookings (app-api.md, Realtime). Er filtert
     * nicht nach Tag, RLS bestimmt, was ankommt. Gelingt das Abo nicht, kommt
     * einfach nichts - dann bleibt das Nachladen von Hand und beim
     * Zurueckkehren. Endet das Sammeln, wird der Kanal entfernt.
     */
    override fun aenderungen(tag: String): Flow<Unit> = channelFlow {
        val kanal = client.channel("plan-$tag")
        val aenderungen = kanal.postgresChangeFlow<PostgresAction>(schema = "public") { table = "bookings" }
        launch { aenderungen.collect { send(Unit) } }
        try {
            kanal.subscribe()
            awaitCancellation()
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            // Ohne Kanal bleibt das Nachladen von Hand und beim Zurueckkehren.
            awaitCancellation()
        } finally {
            withContext(NonCancellable) { runCatching { client.realtime.removeChannel(kanal) } }
        }
    }

    // ---- Buchen ---------------------------------------------------------------------

    /** Beginn als Zeitpunkt aus berlinTime - nie in der Zeitzone des Geraets. */
    override suspend fun bucheplatz(
        courtId: String,
        beginn: Instant,
        typ: String,
        mitspieler: List<String>,
        gaeste: List<String>,
        sucheMitspieler: Boolean,
    ) = schreibe("Platz gebucht.") {
        rpc(
            "create_booking",
            buildJsonObject {
                put("p_court_id", courtId)
                put("p_starts_at", Zeit.iso(beginn))
                put("p_booking_type_code", typ)
                putJsonArray("p_player_member_ids") { mitspieler.forEach { add(it) } }
                putJsonArray("p_guest_names") { gaeste.forEach { add(it) } }
                put("p_partner_wanted", sucheMitspieler)
            },
        )
    }

    /** Tauscht die Mitspieler komplett aus; leere Gastnamen fallen weg. */
    override suspend fun aendereMitspieler(bookingId: String, mitglieder: List<String>, gaeste: List<String>): PlatzErgebnis {
        val namen = gaeste.map { it.trim() }.filter { it.isNotEmpty() }
        return schreibe("Mitspieler aktualisiert.") {
            rpc(
                "update_booking_players",
                buildJsonObject {
                    put("p_booking_id", bookingId)
                    putJsonArray("p_member_ids") { mitglieder.forEach { add(it) } }
                    putJsonArray("p_guest_names") { namen.forEach { add(it) } }
                },
            )
        }
    }

    /** Ohne Grund faellt p_reason weg: dann nimmt die Funktion ihren Standardwert. */
    private fun mitGrund(bookingId: String, grund: String?) = buildJsonObject {
        put("p_booking_id", bookingId)
        Platzplan.nichtLeer(grund)?.let { put("p_reason", it) }
    }

    override suspend fun storniereBuchung(bookingId: String, grund: String?) =
        schreibe("Buchung storniert.") { rpc("cancel_booking", mitGrund(bookingId, grund)) }

    /** Ein Serientermin faellt aus, die Serie bleibt. */
    override suspend fun sageSerienterminAb(bookingId: String, grund: String?) =
        schreibe("Der Termin ist abgesagt.") { rpc("cancel_series_occurrence", mitGrund(bookingId, grund)) }

    /** Eine Sperrung aufheben - dieselbe RPC wie das Stornieren, eigene Meldung. */
    override suspend fun hebeSperreAuf(bookingId: String) =
        schreibe("Die Sperrung ist aufgehoben.") { rpc("cancel_booking", mitGrund(bookingId, null)) }

    override suspend fun spieleMit(bookingId: String) = schreibe("Du bist eingetragen. Viel Spaß!") {
        rpc("join_booking", buildJsonObject { put("p_booking_id", bookingId) })
    }

    override suspend fun sucheMitspieler(bookingId: String, gesucht: Boolean) = schreibe(
        if (gesucht) "Die Buchung steht jetzt bei den offenen Spielen." else "Die Buchung ist nicht mehr ausgeschrieben.",
    ) {
        rpc(
            "set_partner_wanted",
            buildJsonObject {
                put("p_booking_id", bookingId)
                put("p_wanted", gesucht)
            },
        )
    }

    // ---- Platzrechte ----------------------------------------------------------------

    /** Auf einen anderen Platz, Tag oder Beginn (move_booking), nur mit Platzrechten. */
    override suspend fun setzeUm(bookingId: String, platzId: String, tag: String, minute: Int, grund: String?) =
        schreibe("Die Buchung ist umgesetzt.") {
            rpc(
                "move_booking",
                buildJsonObject {
                    put("p_booking_id", bookingId)
                    put("p_court_id", platzId)
                    put("p_starts_at", Zeit.iso(Zeit.berlinTime(tag, minute)))
                    Platzplan.nichtLeer(grund)?.let { put("p_reason", it) }
                },
            )
        }

    private fun sperrParameter(
        bookingId: String?,
        platzIds: List<String>,
        von: Instant,
        bis: Instant,
        typCode: String,
        grund: String,
        verdraengen: Boolean,
    ) = buildJsonObject {
        bookingId?.let { put("p_booking_id", it) }
        putJsonArray("p_court_ids") { platzIds.forEach { add(it) } }
        put("p_von", Zeit.iso(von))
        put("p_bis", Zeit.iso(bis))
        put("p_type_code", typCode)
        put("p_title", grund.trim())
        put("p_force", verdraengen)
    }

    /**
     * Sperren (create_blocking). Zweistufig: liegen Buchungen im Weg, weist
     * die Datenbank ab und nennt ihre Zahl - die steht dann in `kollisionen`,
     * und erst mit verdraengen=true werden sie abgesagt.
     */
    override suspend fun sperre(
        platzId: String,
        von: Instant,
        bis: Instant,
        typCode: String,
        grund: String,
        verdraengen: Boolean,
    ): PlatzErgebnis = try {
        rpc("create_blocking", sperrParameter(null, listOf(platzId), von, bis, typCode, grund, verdraengen))
            .decodeList<SperrErgebnis>()
        PlatzErgebnis(ok = true, meldung = "Gesperrt.")
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        sperrFehler(e)
    }

    /** Eine Sperrung aendern (update_blocking), zweistufig wie sperre. */
    override suspend fun aendereSperre(
        bookingId: String,
        platzIds: List<String>,
        von: Instant,
        bis: Instant,
        typCode: String,
        grund: String,
        verdraengen: Boolean,
    ): PlatzErgebnis = try {
        val zeilen = rpc("update_blocking", sperrParameter(bookingId, platzIds, von, bis, typCode, grund, verdraengen))
            .decodeList<SperrErgebnis>()
        PlatzErgebnis(ok = true, meldung = PlaetzeLogik.sperreGeaendert(zeilen.firstOrNull()?.displacedCount ?: 0))
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        sperrFehler(e)
    }

    private fun sperrFehler(fehler: Throwable): PlatzErgebnis {
        val form = postgresFehler(fehler)
        return PlatzErgebnis(
            ok = false,
            meldung = DbFehler.translateDbError(form),
            kollisionen = PlaetzeLogik.kollisionen(form.message ?: ""),
        )
    }
}
