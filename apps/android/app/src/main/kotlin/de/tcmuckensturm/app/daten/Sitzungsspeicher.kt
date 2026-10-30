/*
 * Ablage der Sitzung: verschluesselt in DataStore
 *
 * supabase-kt legt die Sitzung ueber einen SessionManager ab. Die eingebaute
 * Ablage schreibt sie im Klartext in SharedPreferences; hier liegt sie als
 * AES-GCM-Geheimtext (Schluessel im Android Keystore, Verschluesselung.kt)
 * in einem DataStore - wie der Schluesselbund in der iOS-App.
 *
 * Das Glance-Widget laeuft im selben Prozess wie die App und liest die
 * Sitzung ueber `Sitzungsspeicher.fuer(context)` - dieselbe DataStore-Instanz
 * (DataStore verlangt genau eine je Datei und Prozess) und derselbe Schluessel.
 *
 * Laesst sich die Sitzung nicht entschluesseln (Schluessel weg, etwa nach
 * dem Loeschen der App-Daten oder einer Wiederherstellung), gilt das wie
 * "keine Sitzung": abgemeldet statt abgestuerzt.
 */

package de.tcmuckensturm.app.daten

import android.content.Context
import android.util.Base64
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import io.github.jan.supabase.auth.SessionManager
import io.github.jan.supabase.auth.exception.NoSessionFoundException
import io.github.jan.supabase.auth.user.UserSession
import kotlinx.coroutines.flow.first
import kotlinx.serialization.json.Json

private val Context.sitzungsDaten: DataStore<Preferences> by preferencesDataStore(name = "sitzung")

class Sitzungsspeicher(
    private val daten: DataStore<Preferences>,
    private val verschluesselung: Verschluesselung,
) : SessionManager {
    override suspend fun saveSession(session: UserSession) {
        val klartext = json.encodeToString(UserSession.serializer(), session).toByteArray(Charsets.UTF_8)
        val geheim = Base64.encodeToString(verschluesselung.verschluesseln(klartext), Base64.NO_WRAP)
        daten.edit { it[SCHLUESSEL] = geheim }
    }

    override suspend fun loadSession(): UserSession = loadSessionOrNull() ?: throw NoSessionFoundException()

    override suspend fun loadSessionOrNull(): UserSession? {
        val geheim = daten.data.first()[SCHLUESSEL] ?: return null
        return runCatching {
            val klartext = verschluesselung.entschluesseln(Base64.decode(geheim, Base64.NO_WRAP))
            json.decodeFromString(UserSession.serializer(), String(klartext, Charsets.UTF_8))
        }.getOrElse {
            // Unlesbar bleibt unlesbar - weg damit, sonst scheitert jeder Start erneut.
            deleteSession()
            null
        }
    }

    override suspend fun deleteSession() {
        daten.edit { it.remove(SCHLUESSEL) }
    }

    /** Liegt eine Sitzung (lesbar oder nicht)? Ohne zu entschluesseln - etwa fuer das Widget. */
    suspend fun vorhanden(): Boolean = daten.data.first()[SCHLUESSEL] != null

    companion object {
        private val SCHLUESSEL = stringPreferencesKey("sitzung")
        private val json = Json { ignoreUnknownKeys = true }

        @Volatile private var instanz: Sitzungsspeicher? = null

        /** Die eine Instanz je Prozess (App und Widget). */
        fun fuer(context: Context): Sitzungsspeicher =
            instanz ?: synchronized(this) {
                instanz ?: Sitzungsspeicher(
                    context.applicationContext.sitzungsDaten,
                    KeystoreSchluessel.verschluesselung(),
                ).also { instanz = it }
            }
    }
}
