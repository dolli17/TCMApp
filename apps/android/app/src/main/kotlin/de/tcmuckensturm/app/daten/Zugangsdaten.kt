/*
 * Wer bin ich, und darf ich herein? - mein_zugang() und ich()
 *
 * mein_zugang entscheidet die Weiche (StartLogik), ich() unter anderem, ob
 * der Tab Verwaltung erscheint. Beide RPCs aus docs/native/app-api.md.
 */

package de.tcmuckensturm.app.daten

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Eine Zeile aus public.mein_zugang(). */
@Serializable
data class Zugang(
    val zugang: Boolean = true,
    val grund: String? = null,
    @SerialName("onboarding_offen") val onboardingOffen: Boolean = false,
)

/** Eine Zeile aus public.ich(). Alles optional (app-api.md, "Nullbarkeit"). */
@Serializable
data class Ich(
    @SerialName("member_id") val memberId: String? = null,
    @SerialName("first_name") val firstName: String? = null,
    @SerialName("last_name") val lastName: String? = null,
    val roles: List<String>? = null,
    val admin: Boolean? = null,
    @SerialName("platz_rechte") val platzRechte: Boolean? = null,
    val kiosk: Boolean? = null,
    val zugang: Boolean? = null,
    val grund: String? = null,
    @SerialName("onboarding_offen") val onboardingOffen: Boolean? = null,
)

class Zugangsdaten(private val client: SupabaseClient) {
    /**
     * mein_zugang(); null, wenn das Lesen ausfaellt (siehe StartLogik).
     * Ohne Zeile (Kiosk-Konto ohne Mitglied) gilt: Zugang ja, Onboarding nein.
     */
    suspend fun meinZugang(): Zugang? = try {
        client.postgrest.rpc("mein_zugang").decodeList<Zugang>().firstOrNull() ?: Zugang()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        null
    }

    /** ich(); wirft eine Meldung. */
    suspend fun ich(): Ich? = try {
        client.postgrest.rpc("ich").decodeList<Ich>().firstOrNull()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        throw Meldung.aus(e)
    }
}
