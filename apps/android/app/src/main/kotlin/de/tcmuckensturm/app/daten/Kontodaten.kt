/*
 * Was der Konto-Tab von Supabase liest und schreibt
 *
 * Wie Daten/Kontodaten.swift der iOS-App und apps/mobile/src/lib/daten.ts
 * (ladeMeineStammdaten, ladeMeinMandat, speichereStammdaten usw.), aber nur
 * ueber RPCs: statt der Tabellen members, memberships und sepa_mandates
 * nimmt die native App mein_profil(), mein_mandat(), save_my_profile und
 * save_my_notfallkontakt (docs/native/app-api.md, "Neu fuer die nativen Apps").
 *
 * Lesende Aufrufe werfen den uebersetzten Satz als `Meldung`, schreibende
 * geben ein `Ergebnis` zurueck, dessen Meldung im Formular erscheint.
 */

package de.tcmuckensturm.app.daten

import de.tcmuckensturm.kern.Kontoloeschung
import de.tcmuckensturm.kern.Profil
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

// ---- Modelle ----------------------------------------------------------------

/** Die eine Zeile aus mein_profil(). */
@Serializable
data class MeinProfil(
    @SerialName("first_name") val firstName: String? = null,
    @SerialName("last_name") val lastName: String? = null,
    val title: String? = null,
    val phone: String? = null,
    val mobile: String? = null,
    val street: String? = null,
    val postcode: String? = null,
    val city: String? = null,
    @SerialName("emergency_contact_name") val emergencyContactName: String? = null,
    @SerialName("emergency_contact_phone") val emergencyContactPhone: String? = null,
    @SerialName("emergency_contact_relation") val emergencyContactRelation: String? = null,
    @SerialName("membership_number") val membershipNumber: String? = null,
    @SerialName("member_since") val memberSince: String? = null,
    @SerialName("team_name") val teamName: String? = null,
    @SerialName("is_team_captain") val isTeamCaptain: Boolean? = null,
) {
    /**
     * Die Werte fuer die Formulare, Schluessel = Spaltenname. Aus null wird
     * der leere Text: das Formular arbeitet mit Zeichenketten.
     */
    val werte: Map<String, String>
        get() = mapOf(
            "first_name" to (firstName ?: ""), "last_name" to (lastName ?: ""), "title" to (title ?: ""),
            "phone" to (phone ?: ""), "mobile" to (mobile ?: ""), "street" to (street ?: ""),
            "postcode" to (postcode ?: ""), "city" to (city ?: ""),
            "emergency_contact_name" to (emergencyContactName ?: ""),
            "emergency_contact_phone" to (emergencyContactPhone ?: ""),
            "emergency_contact_relation" to (emergencyContactRelation ?: ""),
        )
}

/** Eine Zeile aus my_charges. */
@Serializable
data class Forderung(
    val id: String,
    val kind: String? = null,
    val description: String? = null,
    @SerialName("period_label") val periodLabel: String? = null,
    @SerialName("amount_cents") val amountCents: Int? = null,
    @SerialName("due_date") val dueDate: String? = null,
    val status: String? = null,
    @SerialName("member_name") val memberName: String? = null,
    @SerialName("is_for_other") val isForOther: Boolean? = null,
)

/** Die Zeile aus mein_mandat(). Von der IBAN gibt es nur die letzten vier Stellen. */
@Serializable
data class MeinMandat(
    val reference: String? = null,
    @SerialName("signed_on") val signedOn: String? = null,
    val status: String? = null,
    val holder: String? = null,
    @SerialName("bank_name") val bankName: String? = null,
    @SerialName("iban_last4") val ibanLast4: String? = null,
)

/** Eine Zeile aus member_attributes - je Merkmal und gesetztem Wert eine. */
@Serializable
data class MerkmalZeile(
    val code: String,
    val name: String? = null,
    val description: String? = null,
    /** list, text, date, boolean, number */
    @SerialName("value_kind") val valueKind: String? = null,
    val multiple: Boolean? = null,
    val optionen: List<Option>? = null,
    @SerialName("option_value") val optionValue: String? = null,
    @SerialName("option_label") val optionLabel: String? = null,
    @SerialName("text_value") val textValue: String? = null,
    @SerialName("set_at") val setAt: String? = null,
    @SerialName("self_editable") val selfEditable: Boolean? = null,
    @SerialName("darf_ich") val darfIch: Boolean? = null,
) {
    @Serializable
    data class Option(val value: String, val label: String? = null)
}

/** Ergebnis eines schreibenden Aufrufs (Ergebnis in daten.ts). */
data class Ergebnis(
    val ok: Boolean,
    val meldung: String,
    /** Bei Pruefungsfehlern: welches Feld gemeint ist, damit das Formular es markiert. */
    val feld: String? = null,
) {
    companion object {
        fun erfolg(meldung: String) = Ergebnis(ok = true, meldung = meldung)
        fun fehler(meldung: String, feld: String? = null) = Ergebnis(ok = false, meldung = meldung, feld = feld)
    }
}

// ---- Laden und Speichern ----------------------------------------------------

class Kontodaten(private val client: SupabaseClient) {
    private suspend fun <T> uebersetzt(aufruf: suspend () -> T): T = try {
        aufruf()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        throw Meldung.aus(e)
    }

    /** Schreibt und macht aus jedem Fehler die Meldung fuer das Formular. */
    private suspend fun schreiben(erfolg: String, aufruf: suspend () -> Unit): Ergebnis = try {
        aufruf()
        Ergebnis.erfolg(erfolg)
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        Ergebnis.fehler(Meldung.aus(e).text)
    }

    private fun parameter(werte: Map<String, String>) = JsonObject(werte.mapValues { JsonPrimitive(it.value) })

    /** Ohne Zugang keine Zeile, dann null. */
    suspend fun profil(): MeinProfil? =
        uebersetzt { client.postgrest.rpc("mein_profil").decodeList<MeinProfil>().firstOrNull() }

    /** Die member_id fuer member_attributes; ohne Zugang oder als Kiosk null. */
    suspend fun meineId(): String? =
        uebersetzt { client.postgrest.rpc("ich").decodeList<Ich>().firstOrNull()?.memberId }

    suspend fun forderungen(): List<Forderung> =
        uebersetzt { client.postgrest.rpc("my_charges").decodeList<Forderung>() }

    /** Ohne aktives Mandat null. */
    suspend fun mandat(): MeinMandat? =
        uebersetzt { client.postgrest.rpc("mein_mandat").decodeList<MeinMandat>().firstOrNull() }

    suspend fun merkmale(): List<MerkmalZeile> {
        val id = meineId() ?: return emptyList()
        return uebersetzt {
            client.postgrest.rpc("member_attributes", parameter(mapOf("p_member_id" to id))).decodeList<MerkmalZeile>()
        }
    }

    /**
     * Eigene Stammdaten speichern (save_my_profile). Wie speichereStammdaten:
     * erst pruefen (Profil.speichern), dann nur die geaenderten Felder
     * schicken. Ein fehlender Parameter bleibt unveraendert, "" leert.
     */
    suspend fun speichereProfil(neu: Map<String, String>, alt: Map<String, String>): Ergebnis =
        when (val schritt = Profil.speichern(neu, alt)) {
            Profil.Speichern.NichtsGeaendert -> Ergebnis.fehler("Nichts geändert.")
            is Profil.Speichern.Fehlerhaft -> Ergebnis.fehler(schritt.fehler.meldung, schritt.fehler.feld)
            is Profil.Speichern.Senden -> {
                val params = schritt.patch.mapKeys { "p_${it.key}" }
                schreiben("Gespeichert.") { client.postgrest.rpc("save_my_profile", parameter(params)) }
            }
        }

    /** Ersetzt alle drei Felder; leere Texte werden in der RPC zu null. */
    suspend fun speichereNotfallkontakt(werte: Map<String, String>): Ergebnis {
        Profil.pruefeNotfallkontakt(werte)?.let { return Ergebnis.fehler(it.meldung, it.feld) }
        val params = mapOf(
            "p_name" to Profil.trim(werte["emergency_contact_name"] ?: ""),
            "p_phone" to Profil.trim(werte["emergency_contact_phone"] ?: ""),
            "p_relation" to Profil.trim(werte["emergency_contact_relation"] ?: ""),
        )
        return schreiben("Notfallkontakt gespeichert.") {
            client.postgrest.rpc("save_my_notfallkontakt", parameter(params))
        }
    }

    /** Optionale Parameter fehlen, statt null zu sein (Grundsaetze in app-api.md). */
    suspend fun setzeMerkmal(code: String, option: String? = null, text: String? = null): Ergebnis =
        schreibeMerkmal("set_member_attribute", "Gespeichert.", code, option, text)

    suspend fun entferneMerkmal(code: String, option: String? = null): Ergebnis =
        schreibeMerkmal("remove_member_attribute", "Entfernt.", code, option, null)

    private suspend fun schreibeMerkmal(rpc: String, erfolg: String, code: String, option: String?, text: String?): Ergebnis =
        try {
            val id = meineId()
            if (id == null) {
                Ergebnis.fehler("Nicht angemeldet.")
            } else {
                val params = buildMap {
                    put("p_member_id", id)
                    put("p_type_code", code)
                    if (option != null) put("p_option_value", option)
                    if (text != null) put("p_text_value", text)
                }
                client.postgrest.rpc(rpc, parameter(params))
                Ergebnis.erfolg(erfolg)
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Ergebnis.fehler(Meldung.aus(e).text)
        }

    /** Kuendigung beantragen. Ein zweiter Antrag binnen 24 Stunden ist kein Fehler. */
    suspend fun beantrageKontoloeschung(nachricht: String): Ergebnis =
        when (val eingabe = Kontoloeschung.pruefen(nachricht)) {
            is Kontoloeschung.Eingabe.Fehler -> Ergebnis.fehler(eingabe.text)
            is Kontoloeschung.Eingabe.Ok -> try {
                val params = eingabe.nachricht?.let { mapOf("p_nachricht" to it) } ?: emptyMap()
                val neu = client.postgrest.rpc("konto_loeschung_beantragen", parameter(params)).decodeAs<Boolean>()
                Ergebnis.erfolg(Kontoloeschung.meldung(neu))
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Ergebnis.fehler(Meldung.aus(e).text)
            }
        }
}
