/*
 * Push-Marken in der Datenbank an- und abmelden
 *
 * Wie Daten/Pushdaten.swift der iOS-App, aber mit der FCM-Marke:
 * register_push_token mit p_platform 'android' und p_provider 'fcm',
 * remove_push_token und statt des Tabellenzugriffs push_token_aktiv
 * (docs/native/app-api.md, Push). Versandt wird von der Edge Function
 * notification-pushes direkt an FCM (supabase/functions/notification-pushes/fcm.ts).
 */

package de.tcmuckensturm.app.daten

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** Was die PushZentrale von der Datenbank braucht; im Test ohne Netz ersetzbar. */
interface Pushkonto {
    suspend fun anmelden(marke: String, geraet: String?): Ergebnis
    suspend fun abmelden(marke: String): Ergebnis

    /** true nur fuer die eigene, nicht stillgelegte Marke. */
    suspend fun aktiv(marke: String): Boolean
}

class Pushdaten(private val client: SupabaseClient) : Pushkonto {
    override suspend fun anmelden(marke: String, geraet: String?): Ergebnis = try {
        client.postgrest.rpc(
            "register_push_token",
            buildJsonObject {
                put("p_token", marke)
                put("p_platform", "android")
                if (!geraet.isNullOrBlank()) put("p_device_name", geraet)
                put("p_provider", "fcm")
            },
        )
        Ergebnis.erfolg("Benachrichtigungen sind eingeschaltet.")
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        Ergebnis.fehler(Meldung.aus(e).text)
    }

    override suspend fun abmelden(marke: String): Ergebnis = try {
        client.postgrest.rpc("remove_push_token", buildJsonObject { put("p_token", marke) })
        Ergebnis.erfolg("Benachrichtigungen sind ausgeschaltet.")
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        Ergebnis.fehler(Meldung.aus(e).text)
    }

    override suspend fun aktiv(marke: String): Boolean = try {
        client.postgrest.rpc("push_token_aktiv", buildJsonObject { put("p_token", marke) }).decodeAs<Boolean>()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        false
    }
}
