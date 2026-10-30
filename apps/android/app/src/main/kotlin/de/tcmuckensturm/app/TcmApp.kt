/*
 * Die Application: haelt, was so lange lebt wie die App
 *
 * Liest die Umgebung aus BuildConfig und baut daraus Supabase-Client und
 * Sitzung - einmal je Prozess. Fehlt die Konfiguration (etwa Prod ohne Werte
 * oder lokal ohne lokal.properties), bleibt `sitzung` null und die App zeigt
 * einen Hinweis statt abzustuerzen.
 *
 * Dazu Push: FirebaseApp von Hand aus BuildConfig (push/PushFirebase.kt).
 * Ohne Firebase-Werte bleibt Push aus, der Rest laeuft wie sonst.
 */

package de.tcmuckensturm.app

import android.app.Application
import android.content.Context
import de.tcmuckensturm.app.daten.Sitzungsspeicher
import de.tcmuckensturm.app.daten.SupabaseVerbindung
import de.tcmuckensturm.app.push.FirebaseMarken
import de.tcmuckensturm.app.push.PushEinrichtung
import de.tcmuckensturm.app.push.PushZentrale
import de.tcmuckensturm.app.start.Sitzung
import de.tcmuckensturm.app.start.Umgebung
import de.tcmuckensturm.app.theme.einstellungen
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

class TcmApp : Application() {
    /** So lange wie der Prozess; fuer Sitzung und spaeter Push und Widget. */
    val appScope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    val konfiguration: Result<Umgebung> by lazy { runCatching { Umgebung.ausBuildConfig() } }

    /** Ob Firebase fuer Push eingerichtet ist (onCreate). */
    private var firebase = false

    override fun onCreate() {
        super.onCreate()
        firebase = PushEinrichtung.firebase(this)
        if (firebase) PushEinrichtung.kanalAnlegen(this)
    }

    val push: PushZentrale by lazy {
        PushZentrale(
            speicher = einstellungen,
            quelle = if (firebase) FirebaseMarken() else null,
            erlaubt = { PushEinrichtung.erlaubt(this) },
            geraet = PushEinrichtung.geraetename(this),
        )
    }

    /** Erst beim ersten Zugriff gebaut: Tests (Robolectric) starten die App ohne Netz. */
    val sitzung: Sitzung? by lazy {
        konfiguration.getOrNull()?.let { umgebung ->
            Sitzung(
                umgebung = umgebung,
                client = SupabaseVerbindung.client(umgebung, Sitzungsspeicher.fuer(this)),
                scope = appScope,
                push = push,
            )
        }
    }

    companion object {
        fun aus(context: Context): TcmApp = context.applicationContext as TcmApp
    }
}
