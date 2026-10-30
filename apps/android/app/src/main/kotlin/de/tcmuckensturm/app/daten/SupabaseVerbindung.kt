/*
 * Der Supabase-Client
 *
 * Die Sitzung liegt verschluesselt im Sitzungsspeicher, damit spaeter das
 * Widget sie lesen kann. Wie in der Expo-App und der iOS-App mit dem
 * impliziten Ablauf: Mit PKCE haengt "Passwort vergessen" den Link an einen
 * Schluessel auf diesem Geraet - wer die Mail am Rechner oeffnet, kaeme nicht
 * weiter. Der token_hash aus den Vorlagen braucht keinen.
 */

package de.tcmuckensturm.app.daten

import de.tcmuckensturm.app.start.Umgebung
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.auth.FlowType
import io.github.jan.supabase.auth.SessionManager
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.functions.Functions
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.realtime.Realtime
import io.github.jan.supabase.serializer.KotlinXSerializer
import io.ktor.client.engine.okhttp.OkHttp
import kotlinx.serialization.json.Json

object SupabaseVerbindung {
    /**
     * Antworten der RPCs: unbekannte Felder ignorieren (neue Spalten brechen
     * alte Apps nicht), fehlende optionale Felder sind null.
     */
    val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        coerceInputValues = true
    }

    /** @param autoRefresh im Widget aus - es lebt nur Sekunden. */
    fun client(umgebung: Umgebung, sitzungen: SessionManager, autoRefresh: Boolean = true): SupabaseClient =
        createSupabaseClient(umgebung.supabaseUrl, umgebung.supabaseKey) {
            defaultSerializer = KotlinXSerializer(json)
            httpEngine = OkHttp.create()
            install(Auth) {
                sessionManager = sitzungen
                flowType = FlowType.IMPLICIT
                alwaysAutoRefresh = autoRefresh
                // Die App oeffnet keine Links fuer OAuth; Passwort-Links wertet Sitzung selbst aus.
                scheme = umgebung.urlSchema
                host = "login"
            }
            install(Postgrest)
            install(Realtime)
            install(Functions)
        }
}
