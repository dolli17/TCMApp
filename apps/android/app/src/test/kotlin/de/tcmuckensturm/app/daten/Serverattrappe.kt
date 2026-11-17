package de.tcmuckensturm.app.daten

import android.content.Context
import android.os.Looper
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleRegistry
import androidx.lifecycle.ProcessLifecycleOwner
import androidx.startup.AppInitializer
import androidx.startup.Initializer
import androidx.test.core.app.ApplicationProvider
import de.tcmuckensturm.app.start.Umgebung
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.MemorySessionManager
import io.github.jan.supabase.auth.SessionManager
import io.ktor.client.engine.HttpClientEngineBase
import io.ktor.client.engine.HttpClientEngineCapability
import io.ktor.client.engine.HttpClientEngineConfig
import io.ktor.client.engine.callContext
import io.ktor.client.plugins.HttpTimeoutCapability
import io.ktor.client.request.HttpRequestData
import io.ktor.client.request.HttpResponseData
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpProtocolVersion
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.OutgoingContent
import io.ktor.http.headersOf
import io.ktor.util.date.GMTDate
import io.ktor.utils.io.ByteReadChannel
import io.ktor.utils.io.InternalAPI
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.robolectric.Shadows.shadowOf

/** Eine Anfrage, wie sie beim Server ankam. */
data class Anfrage(
    val methode: String,
    /** Ohne Abfrage, etwa "/rest/v1/rpc/my_bookings" */
    val pfad: String,
    val abfrage: Map<String, String>,
    val kopf: Map<String, String>,
    val text: String,
) {
    /** Der Name der RPC; null bei allem anderen (Auth). */
    val rpc: String? get() = pfad.substringAfter("/rest/v1/rpc/", "").ifEmpty { null }

    /** Die Parameter als JSON-Objekt; ohne Rumpf leer. */
    val json: JsonObject
        get() = if (text.isBlank()) JsonObject(emptyMap()) else Json.parseToJsonElement(text).jsonObject

    /** Die Parameter als Text, Schluessel sortiert - so lassen sie sich in einer Zeile vergleichen. */
    val parameter: String get() = JsonObject(json.toSortedMap()).toString()
}

data class Antwort(val status: Int = 200, val text: String = "") {
    companion object {
        /** Eine RPC ohne Rueckgabe (void): PostgREST antwortet mit 204 ohne Rumpf. */
        val LEER = Antwort(204)

        /** Ein Fehler, wie PostgREST ihn meldet (code, message, details, hint). */
        fun dbFehler(
            message: String,
            code: String = "P0001",
            details: String? = null,
            hint: String? = null,
            status: Int = 400,
        ): Antwort {
            fun feld(wert: String?) = if (wert == null) "null" else Json.encodeToString(wert)
            return Antwort(
                status,
                """{"code":${feld(code)},"message":${feld(message)},"details":${feld(details)},"hint":${feld(hint)}}""",
            )
        }

        /** Was PostgREST antwortet, wenn das Zugriffstoken abgelaufen ist. */
        val SITZUNG_ABGELAUFEN = dbFehler("JWT expired", code = "PGRST303", status = 401)

        /** Ein Fehler von Supabase Auth (GoTrue). */
        fun authFehler(status: Int, code: String, nachricht: String) =
            Antwort(status, """{"code":$status,"error_code":"$code","msg":"$nachricht"}""")

        const val NUTZER_ID = "11111111-2222-4333-8444-555555555555"

        /** Ein Nutzer, wie Supabase Auth ihn liefert (GET und PUT /user, in der Sitzung). */
        fun nutzer(email: String = "max@tcm.local", id: String = NUTZER_ID): String =
            """{"id":"$id","aud":"authenticated","role":"authenticated","email":"$email","app_metadata":{},""" +
                """"user_metadata":{},"created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-01T00:00:00Z"}"""

        /** Eine frische Sitzung, wie Supabase Auth sie nach Anmelden, Erneuern oder Einloesen eines Links liefert. */
        fun sitzung(zugriff: String = "at-1", email: String = "max@tcm.local", id: String = NUTZER_ID) = Antwort(
            200,
            """{"access_token":"$zugriff","token_type":"bearer","expires_in":3600,"refresh_token":"rt-$zugriff",""" +
                """"user":${nutzer(email, id)}}""",
        )
    }
}

/**
 * Ein Server aus nachgebauten Antworten, als Engine fuer Ktor - ohne Netz und
 * ohne zusaetzliche Bibliothek (ktor-client-mock). Der Supabase-Client der App
 * (SupabaseVerbindung.client) schickt seine Anfragen hierher; die Tests legen
 * fest, was zurueckkommt, und lesen nach, was gefragt wurde.
 *
 * Eine RPC ohne Regel wird wie von PostgREST mit 404 abgewiesen (PGRST202):
 * so faellt auf, wenn die App etwas anderes fragt als erwartet.
 */
class Serverattrappe : HttpClientEngineBase("serverattrappe") {
    override val config = HttpClientEngineConfig()

    /** supabase-kt setzt je Anfrage eine Frist; ohne die Angabe lehnt Ktor die Engine ab. */
    override val supportedCapabilities: Set<HttpClientEngineCapability<*>> = setOf(HttpTimeoutCapability)

    /** Alles, was ankam, in der Reihenfolge des Eintreffens. */
    val anfragen = CopyOnWriteArrayList<Anfrage>()

    private val regeln = ConcurrentHashMap<String, (Anfrage) -> Antwort>()

    /** Keine Antwort vom Server: jede Anfrage scheitert wie ohne Netz. */
    @Volatile var ohneNetz = false

    /** Was kommt, wenn keine Regel passt. */
    @Volatile var sonst: (Anfrage) -> Antwort = { a ->
        Antwort.dbFehler("Could not find the function public.${a.rpc} in the schema cache", code = "PGRST202", status = 404)
    }

    /** Antwort auf eine RPC: der Rumpf, wie PostgREST ihn schickt. */
    fun rpc(name: String, text: String) = rpc(name) { Antwort(200, text) }

    fun rpc(name: String, antwort: Antwort) = rpc(name) { antwort }

    fun rpc(name: String, antwort: (Anfrage) -> Antwort) {
        regeln["/rest/v1/rpc/$name"] = antwort
    }

    /** Antwort auf einen Pfad von Supabase Auth, etwa "token" fuer /auth/v1/token. */
    fun auth(pfad: String, antwort: (Anfrage) -> Antwort) {
        regeln["/auth/v1/$pfad"] = antwort
    }

    /** Die Anfragen an eine RPC. */
    fun rpcs(name: String): List<Anfrage> = anfragen.filter { it.rpc == name }

    /** Die eine Anfrage an eine RPC; scheitert, wenn es keine oder mehrere gab. */
    fun rpcAnfrage(name: String): Anfrage = rpcs(name).single()

    /** Die Anfragen an einen Pfad von Supabase Auth. */
    fun auths(pfad: String): List<Anfrage> = anfragen.filter { it.pfad == "/auth/v1/$pfad" }

    /** Die Namen aller gefragten RPCs. */
    val gefragt: List<String> get() = anfragen.mapNotNull { it.rpc }

    @InternalAPI
    override suspend fun execute(data: HttpRequestData): HttpResponseData {
        val kontext = callContext()
        val rumpf = (data.body as? OutgoingContent.ByteArrayContent)?.bytes()?.toString(Charsets.UTF_8) ?: ""
        val anfrage = Anfrage(
            methode = data.method.value,
            pfad = data.url.encodedPath,
            abfrage = data.url.parameters.names().associateWith { data.url.parameters[it] ?: "" },
            kopf = data.headers.names().associateWith { data.headers[it] ?: "" },
            text = rumpf,
        )
        anfragen += anfrage
        if (ohneNetz) throw IOException("Network request failed")
        val antwort = (regeln[anfrage.pfad] ?: sonst)(anfrage)
        return HttpResponseData(
            statusCode = HttpStatusCode.fromValue(antwort.status),
            requestTime = GMTDate(),
            headers = headersOf(HttpHeaders.ContentType, "application/json; charset=utf-8"),
            version = HttpProtocolVersion.HTTP_1_1,
            body = ByteReadChannel(antwort.text.toByteArray(Charsets.UTF_8)),
            callContext = kontext,
        )
    }

    companion object {
        const val SCHLUESSEL = "sb_publishable_test"

        /** Wie die Variante lokal: kein Web, eigenes Schema. */
        val UMGEBUNG = Umgebung(
            supabaseUrl = "https://tcm.test",
            supabaseKey = SCHLUESSEL,
            siteUrl = null,
            urlSchema = "tcmlokal",
        )
    }
}

/**
 * Der Client der App (dieselbe Einrichtung wie im Betrieb: Serializer, Auth,
 * PostgREST), nur mit der Attrappe statt OkHttp. Ohne gespeicherte Sitzung
 * fragt er mit dem oeffentlichen Schluessel.
 */
fun Serverattrappe.client(
    sitzungen: SessionManager = MemorySessionManager(),
    umgebung: Umgebung = Serverattrappe.UMGEBUNG,
): SupabaseClient {
    supabaseVorbereiten()
    return SupabaseVerbindung.client(umgebung, sitzungen, engine = this)
}

/**
 * Im Betrieb startet androidx.startup die Initializer von supabase-kt (Auth
 * braucht den Context fuer seine Ablage) beim Start der App; unter
 * Robolectric laeuft der InitializationProvider nicht von selbst.
 *
 * Dazu gilt die App als "vorne": auf Android meldet supabase-kt erst dann
 * "nicht angemeldet", wenn der Prozess sichtbar wird und keine Sitzung in der
 * Ablage liegt (ProcessLifecycleOwner, onStart). Der Beobachter haengt sich
 * ueber den Hauptfaden ein - wer auf den Stand der Sitzung wartet, nimmt
 * deshalb `warteBis`.
 */
fun supabaseVorbereiten() {
    (ProcessLifecycleOwner.get().lifecycle as LifecycleRegistry).handleLifecycleEvent(Lifecycle.Event.ON_START)
    val starter = AppInitializer.getInstance(ApplicationProvider.getApplicationContext<Context>())
    for (name in listOf("com.russhwolf.settings.SettingsInitializer", "io.github.jan.supabase.auth.SupabaseInitializer")) {
        @Suppress("UNCHECKED_CAST")
        starter.initializeComponent(Class.forName(name) as Class<out Initializer<Any>>)
    }
}

/**
 * Wartet, bis die Bedingung gilt, und laesst dabei den Hauptfaden von
 * Robolectric arbeiten (der steht sonst still, solange der Test wartet).
 */
fun warteBis(worauf: String = "die Bedingung", fristMs: Long = 10_000, bedingung: () -> Boolean) {
    val ende = System.currentTimeMillis() + fristMs
    while (true) {
        shadowOf(Looper.getMainLooper()).idle()
        if (bedingung()) return
        if (System.currentTimeMillis() > ende) throw AssertionError("Nach $fristMs ms gilt noch nicht: $worauf")
        Thread.sleep(5)
    }
}
