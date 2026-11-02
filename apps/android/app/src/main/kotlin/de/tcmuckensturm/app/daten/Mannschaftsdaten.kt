/*
 * Mannschaft: Kader, Einladungen und was der Mannschaftsfuehrer darf
 *
 * Nur ueber die RPCs aus dem Vertrag "Mannschaftsfuehrer laedt in seine
 * Mannschaft ein" (meine_mannschaft, meine_mannschaft_einladungen,
 * mannschaft_kandidaten, mannschaft_einladen, mannschaft_einladung_*,
 * mannschaft_austragen, set_team_phone_visible). Ob jemand MF ist, prueft die
 * Datenbank (private.ist_mannschaftsfuehrer); die App zeigt nur an, was
 * meine_mannschaft() ihr sagt.
 *
 * Lesende Aufrufe werfen den uebersetzten Satz als `Meldung`, schreibende
 * geben ein `Ergebnis` zurueck - wie Kontodaten.
 */

package de.tcmuckensturm.app.daten

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

// ---- Modelle ----------------------------------------------------------------

/** Die Antwort von meine_mannschaft(); ohne Mannschaft gibt es keine. */
@Serializable
data class MeineMannschaft(
    @SerialName("team_id") val teamId: String,
    val name: String = "",
    @SerialName("ich_bin_mf") val ichBinMf: Boolean = false,
    @SerialName("telefon_sichtbar") val telefonSichtbar: Boolean = false,
    /** Sortiert von der Datenbank: MF zuerst, dann nach LK, dann Name. */
    val kader: List<Spieler> = emptyList(),
    /** Nur fuer den MF, sonst leer. */
    @SerialName("offene_einladungen") val offeneEinladungen: List<OffeneEinladung> = emptyList(),
) {
    @Serializable
    data class Spieler(
        @SerialName("member_id") val memberId: String,
        @SerialName("first_name") val firstName: String? = null,
        @SerialName("last_name") val lastName: String? = null,
        @SerialName("tennis_lk") val tennisLk: String? = null,
        @SerialName("is_team_captain") val isTeamCaptain: Boolean = false,
        /** Mobil, sonst Telefon - nur fuer den MF und nur mit Zustimmung des Spielers. */
        val telefon: String? = null,
    )

    @Serializable
    data class OffeneEinladung(
        val id: String,
        @SerialName("member_id") val memberId: String,
        @SerialName("first_name") val firstName: String? = null,
        @SerialName("last_name") val lastName: String? = null,
        @SerialName("created_at") val createdAt: String? = null,
        @SerialName("expires_at") val expiresAt: String? = null,
    )

    companion object {
        /** Die Antwort als Text; "null" heisst: in keiner Mannschaft. */
        fun aus(antwort: String): MeineMannschaft? {
            val text = antwort.trim()
            if (text.isEmpty() || text == "null") return null
            return SupabaseVerbindung.json.decodeFromString(serializer(), text)
        }
    }
}

/** Eine offene, nicht verfallene Einladung an mich (meine_mannschaft_einladungen). */
@Serializable
data class MeineEinladung(
    val id: String,
    @SerialName("team_id") val teamId: String,
    @SerialName("team_name") val teamName: String = "",
    @SerialName("eingeladen_von") val eingeladenVon: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("expires_at") val expiresAt: String? = null,
    /** Die Mannschaft, aus der ich beim Annehmen wechsle. */
    @SerialName("wechsel_von") val wechselVon: String? = null,
    /** false, solange ich MF einer anderen Mannschaft bin. */
    @SerialName("annehmen_moeglich") val annehmenMoeglich: Boolean = true,
    val hinweis: String? = null,
)

/** Wen der MF einladen kann (mannschaft_kandidaten). */
@Serializable
data class Kandidat(
    @SerialName("member_id") val memberId: String,
    @SerialName("first_name") val firstName: String? = null,
    @SerialName("last_name") val lastName: String? = null,
    @SerialName("tennis_lk") val tennisLk: String? = null,
    @SerialName("mannschaft_interesse") val mannschaftInteresse: Boolean = false,
    @SerialName("aktuelle_mannschaft") val aktuelleMannschaft: String? = null,
    val eingeladen: Boolean = false,
)

// ---- Laden und Schreiben ----------------------------------------------------

class Mannschaftsdaten(private val client: SupabaseClient) {
    private suspend fun <T> uebersetzt(aufruf: suspend () -> T): T = try {
        aufruf()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        throw Meldung.aus(e)
    }

    private suspend fun schreiben(erfolg: String, aufruf: suspend () -> Unit): Ergebnis = try {
        aufruf()
        Ergebnis.erfolg(erfolg)
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        Ergebnis.fehler(Meldung.aus(e).text)
    }

    private suspend fun rpc(name: String, parameter: JsonObject = JsonObject(emptyMap())) =
        client.postgrest.rpc(name, parameter)

    /** Ohne Mannschaft null. */
    suspend fun meineMannschaft(): MeineMannschaft? = uebersetzt { MeineMannschaft.aus(rpc("meine_mannschaft").data) }

    suspend fun einladungen(): List<MeineEinladung> = uebersetzt { rpc("meine_mannschaft_einladungen").decodeList() }

    /** Leere Suche heisst: die ersten 50, Interessenten zuerst. */
    suspend fun kandidaten(suche: String): List<Kandidat> = uebersetzt {
        val params = buildJsonObject { suche.trim().takeIf { it.isNotEmpty() }?.let { put("p_suche", it) } }
        rpc("mannschaft_kandidaten", params).decodeList()
    }

    suspend fun einladen(memberId: String, erfolg: String): Ergebnis =
        schreiben(erfolg) { rpc("mannschaft_einladen", buildJsonObject { put("p_member_id", memberId) }) }

    suspend fun zurueckziehen(einladungId: String, erfolg: String): Ergebnis =
        schreiben(erfolg) {
            rpc("mannschaft_einladung_zurueckziehen", buildJsonObject { put("p_invitation_id", einladungId) })
        }

    suspend fun beantworten(einladungId: String, annehmen: Boolean, telefonSichtbar: Boolean, erfolg: String): Ergebnis =
        schreiben(erfolg) {
            val params = buildJsonObject {
                put("p_invitation_id", einladungId)
                put("p_annehmen", annehmen)
                put("p_telefon_sichtbar", annehmen && telefonSichtbar)
            }
            rpc("mannschaft_einladung_beantworten", params)
        }

    /** Der MF traegt einen Spieler aus, oder ein Spieler sich selbst (dann seine eigene member_id). */
    suspend fun austragen(memberId: String, erfolg: String): Ergebnis =
        schreiben(erfolg) { rpc("mannschaft_austragen", buildJsonObject { put("p_member_id", memberId) }) }

    suspend fun telefonSichtbar(an: Boolean, erfolg: String): Ergebnis =
        schreiben(erfolg) { rpc("set_team_phone_visible", buildJsonObject { put("p_visible", an) }) }
}
