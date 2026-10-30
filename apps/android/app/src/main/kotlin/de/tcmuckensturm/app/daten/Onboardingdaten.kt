/*
 * Was der Onboarding-Assistent von Supabase liest und schreibt
 *
 * Wie Daten/Onboardingdaten.swift der iOS-App und der Abschnitt Onboarding in
 * apps/mobile/src/lib/daten.ts: my_onboarding() liefert alles in einem Zug,
 * gespeichert wird je Schritt ueber die Onboarding-RPCs (docs/native/app-api.md,
 * "Onboarding"). Geprueft wird in der Datenbank; vorher prueft die App nur,
 * was sich in einem Satz sagen laesst, der das Feld nennt (OnboardingLogik).
 *
 * Optionale Parameter fehlen, statt null zu sein (Grundsaetze in app-api.md).
 */

package de.tcmuckensturm.app.daten

import de.tcmuckensturm.app.bildschirme.onboarding.OnboardingLogik
import de.tcmuckensturm.kern.DbFehler
import de.tcmuckensturm.kern.Iban
import de.tcmuckensturm.kern.Onboarding
import de.tcmuckensturm.kern.OnboardingSchritt
import de.tcmuckensturm.kern.OnboardingSchrittKey
import de.tcmuckensturm.kern.Profil
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

// ---- Modell -----------------------------------------------------------------

/** Was my_onboarding() zurueckgibt (OnboardingZustand in packages/core/src/onboarding.ts). */
@Serializable
data class OnboardingZustand(
    @SerialName("abgeschlossen_am") val abgeschlossenAm: String? = null,
    val minderjaehrig: Boolean = false,
    /** Erledigt je Schritt, Schluessel = OnboardingSchrittKey.wert. */
    val status: Map<String, Boolean> = emptyMap(),
    val stammdaten: Stammdaten = Stammdaten(),
    val erziehungsberechtigte: Erziehungsberechtigte = Erziehungsberechtigte(),
    val notfallkontakt: Notfallkontakt = Notfallkontakt(),
    val dokumente: List<Dokument> = emptyList(),
    val mandat: Mandat = Mandat(),
    val merkmale: List<Merkmal> = emptyList(),
    val tennis: Tennis = Tennis(),
    val einstellungen: Einstellungen = Einstellungen(),
) {
    @Serializable
    data class Stammdaten(
        @SerialName("first_name") val firstName: String? = null,
        @SerialName("last_name") val lastName: String? = null,
        val title: String? = null,
        val gender: String? = null,
        val birthday: String? = null,
        val email: String? = null,
        val phone: String? = null,
        val mobile: String? = null,
        val street: String? = null,
        val postcode: String? = null,
        val city: String? = null,
    )

    @Serializable
    data class Erziehungsberechtigte(
        val name: String? = null,
        val email: String? = null,
        val phone: String? = null,
        @SerialName("zustimmung_am") val zustimmungAm: String? = null,
    )

    @Serializable
    data class Notfallkontakt(val name: String? = null, val phone: String? = null, val relation: String? = null)

    @Serializable
    data class Dokument(
        val code: String,
        val version: Int? = null,
        val title: String,
        @SerialName("valid_from") val validFrom: String? = null,
        @SerialName("zugestimmt_am") val zugestimmtAm: String? = null,
    )

    @Serializable
    data class Mandat(
        val vorhanden: Boolean = false,
        val referenz: String? = null,
        @SerialName("glaeubiger_name") val glaeubigerName: String? = null,
        @SerialName("glaeubiger_id") val glaeubigerId: String? = null,
        /** false, solange die Glaeubigerdaten des Vereins fehlen. */
        val moeglich: Boolean = false,
        val text: String? = null,
        @SerialName("kontoinhaber_vorschlag") val kontoinhaberVorschlag: String? = null,
    )

    @Serializable
    data class Merkmal(val code: String, val name: String, val description: String? = null, val gesetzt: Boolean = false)

    @Serializable
    data class Tennis(
        @SerialName("tennis_lk") val tennisLk: String? = null,
        @SerialName("nuliga_id") val nuligaId: String? = null,
        @SerialName("mannschaft_interesse") val mannschaftInteresse: Boolean = false,
    )

    @Serializable
    data class Einstellungen(@SerialName("booking_mail") val bookingMail: String? = null)

    val schritte: List<OnboardingSchritt> get() = Onboarding.schritte(minderjaehrig, status)

    val naechsterPflichtschritt: OnboardingSchrittKey? get() = Onboarding.naechsterPflichtschritt(minderjaehrig, status)

    companion object {
        /** Die Antwort als Text; "null" heisst: kein Mitglied angemeldet. */
        fun aus(antwort: String): OnboardingZustand? {
            val text = antwort.trim()
            if (text.isEmpty() || text == "null") return null
            return SupabaseVerbindung.json.decodeFromString(serializer(), text)
        }
    }
}

/** Ergebnis von complete_onboarding: fehlt noch etwas, die Schritte aus dem DETAIL. */
data class Abschluss(val ergebnis: Ergebnis, val fehlt: List<OnboardingSchrittKey> = emptyList())

// ---- Laden und Speichern ----------------------------------------------------

class Onboardingdaten(private val client: SupabaseClient) {
    private suspend fun schreiben(erfolg: String, aufruf: suspend () -> Unit): Ergebnis = try {
        aufruf()
        Ergebnis.erfolg(erfolg)
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        Ergebnis.fehler(Meldung.aus(e).text)
    }

    /** Alles fuer den Assistenten in einem Zug; null, wenn kein Mitglied angemeldet ist. Wirft eine Meldung. */
    suspend fun laden(): OnboardingZustand? = try {
        OnboardingZustand.aus(client.postgrest.rpc("my_onboarding").data)
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        throw Meldung.aus(e)
    }

    suspend fun speichereStammdaten(werte: Map<String, String>): Ergebnis =
        when (val p = OnboardingLogik.pruefeStammdaten(werte)) {
            is OnboardingLogik.Pruefung.Fehler -> Ergebnis.fehler(p.fehler.meldung, p.fehler.feld)
            is OnboardingLogik.Pruefung.Ok -> {
                val t = { feld: String -> Profil.trim(werte[feld] ?: "") }
                val params = buildJsonObject {
                    put("p_first_name", t("first_name"))
                    put("p_last_name", t("last_name"))
                    put("p_birthday", p.geburtstag)
                    put("p_gender", t("gender"))
                    put("p_street", t("street"))
                    put("p_postcode", t("postcode"))
                    put("p_city", t("city"))
                    for (feld in listOf("phone", "mobile", "title")) if (t(feld).isNotEmpty()) put("p_$feld", t(feld))
                }
                schreiben("Deine Daten sind gespeichert.") { client.postgrest.rpc("onboarding_save_stammdaten", params) }
            }
        }

    /** Stimmt der jeweils gueltigen Version der genannten Texte zu. */
    suspend fun akzeptiereDokumente(codes: List<String>): Ergebnis {
        if (codes.isEmpty()) return Ergebnis.erfolg("")
        val params = buildJsonObject { put("p_codes", JsonArray(codes.map(::JsonPrimitive))) }
        return schreiben("Zustimmung gespeichert.") { client.postgrest.rpc("onboarding_accept_documents", params) }
    }

    suspend fun speichereErziehungsberechtigte(name: String, email: String, telefon: String, zustimmung: Boolean): Ergebnis {
        OnboardingLogik.pruefeErziehungsberechtigte(name, email, telefon)?.let { return Ergebnis.fehler(it.meldung, it.feld) }
        val params = buildJsonObject {
            put("p_name", Profil.trim(name))
            put("p_consent", zustimmung)
            if (Profil.trim(email).isNotEmpty()) put("p_email", Profil.trim(email))
            if (Profil.trim(telefon).isNotEmpty()) put("p_phone", Profil.trim(telefon))
        }
        return schreiben("Erziehungsberechtigte gespeichert.") { client.postgrest.rpc("onboarding_save_guardian", params) }
    }

    /** Ueber die RPC und nicht wie im Konto: nur sie weiss, dass er bei Minderjaehrigen Pflicht ist. */
    suspend fun speichereNotfallkontakt(name: String, telefon: String, verhaeltnis: String): Ergebnis {
        if (Profil.trim(telefon).isNotEmpty() && Profil.trim(name).isEmpty()) {
            return Ergebnis.fehler("Zur Notfallnummer gehört auch ein Name.", "name")
        }
        val params = buildJsonObject {
            put("p_name", Profil.trim(name))
            put("p_phone", Profil.trim(telefon))
            if (Profil.trim(verhaeltnis).isNotEmpty()) put("p_relation", Profil.trim(verhaeltnis))
        }
        return schreiben("Notfallkontakt gespeichert.") { client.postgrest.rpc("onboarding_save_notfallkontakt", params) }
    }

    /** Erteilt das SEPA-Mandat online. */
    suspend fun erteileMandat(iban: String, kontoinhaber: String, bestaetigt: Boolean): Ergebnis {
        if (!bestaetigt) return Ergebnis.fehler("Bitte bestätige das Mandat ausdrücklich.")
        if (!Iban.istGueltig(iban)) return Ergebnis.fehler("Diese IBAN ist nicht gültig. Bitte die Ziffern prüfen.")
        val params = buildJsonObject {
            put("p_iban", iban)
            put("p_accept", true)
            if (Profil.trim(kontoinhaber).isNotEmpty()) put("p_holder", Profil.trim(kontoinhaber))
        }
        return schreiben("Das Mandat ist erteilt.") { client.postgrest.rpc("create_my_sepa_mandate", params) }
    }

    suspend fun speichereTennis(lk: String, nuligaId: String, mannschaftInteresse: Boolean): Ergebnis {
        val params = buildJsonObject {
            put("p_mannschaft_interesse", mannschaftInteresse)
            if (Profil.trim(lk).isNotEmpty()) put("p_tennis_lk", Profil.trim(lk))
            if (Profil.trim(nuligaId).isNotEmpty()) put("p_nuliga_id", Profil.trim(nuligaId))
        }
        return schreiben("Gespeichert.") { client.postgrest.rpc("save_my_tennis", params) }
    }

    /**
     * Schaltet das Konto frei. Fehlt noch etwas, nennt die Meldung es, und
     * `fehlt` enthaelt die Schritte aus dem DETAIL der Datenbankmeldung -
     * damit springt der Assistent zum ersten davon.
     */
    suspend fun schliesseAb(): Abschluss = try {
        client.postgrest.rpc("complete_onboarding")
        Abschluss(Ergebnis.erfolg("Dein Konto ist freigeschaltet."))
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        val form = postgresFehler(e)
        Abschluss(Ergebnis.fehler(DbFehler.translateDbError(form)), OnboardingLogik.fehlendeSchritte(form.details))
    }
}
