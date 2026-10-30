/*
 * Firebase Cloud Messaging ohne google-services.json
 *
 * Das Gradle-Plugin google-services ist nicht noetig: die vier Werte des
 * Firebase-Projekts kommen als BuildConfig (FIREBASE_PROJECT_ID,
 * FIREBASE_APP_ID, FIREBASE_API_KEY, FIREBASE_SENDER_ID, README "Push"), und
 * TcmApp richtet FirebaseApp damit von Hand ein. Fehlt einer, bleibt Push aus
 * und die App laeuft normal - der Schalter im Konto sagt es dann.
 *
 * Dazu der Kanal "Mitteilungen" (ab Android 8 Pflicht) und der Dienst, der
 * neue Marken weitergibt und Nachrichten zeigt, solange die App vorne ist.
 * Ist sie im Hintergrund, zeigt das System die Nachricht selbst (notification
 * aus fcm.ts, Kanal ueber default_notification_channel_id im Manifest); ein
 * Tippen oeffnet HauptActivity mit `data` in den Extras.
 */

package de.tcmuckensturm.app.push

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.tasks.Task
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import de.tcmuckensturm.app.BuildConfig
import de.tcmuckensturm.app.HauptActivity
import de.tcmuckensturm.app.R
import de.tcmuckensturm.app.TcmApp
import de.tcmuckensturm.app.daten.Pushdaten
import io.github.jan.supabase.auth.auth
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine

/** Die Werte des Firebase-Projekts; null, wenn einer fehlt. */
data class FirebaseWerte(val projektId: String, val appId: String, val apiKey: String, val senderId: String) {
    companion object {
        fun aus(projektId: String, appId: String, apiKey: String, senderId: String): FirebaseWerte? {
            val werte = listOf(projektId, appId, apiKey, senderId).map { it.trim() }
            if (werte.any { it.isEmpty() }) return null
            return FirebaseWerte(werte[0], werte[1], werte[2], werte[3])
        }

        fun ausBuildConfig(): FirebaseWerte? = aus(
            BuildConfig.FIREBASE_PROJECT_ID,
            BuildConfig.FIREBASE_APP_ID,
            BuildConfig.FIREBASE_API_KEY,
            BuildConfig.FIREBASE_SENDER_ID,
        )
    }
}

object PushEinrichtung {
    const val KANAL = "mitteilungen"

    /** Richtet FirebaseApp ein; false, wenn die Werte fehlen oder Firebase nicht startet. */
    fun firebase(context: Context, werte: FirebaseWerte? = FirebaseWerte.ausBuildConfig()): Boolean {
        if (werte == null) return false
        if (FirebaseApp.getApps(context).isNotEmpty()) return true
        return runCatching {
            val optionen = FirebaseOptions.Builder()
                .setProjectId(werte.projektId)
                .setApplicationId(werte.appId)
                .setApiKey(werte.apiKey)
                .setGcmSenderId(werte.senderId)
                .build()
            FirebaseApp.initializeApp(context, optionen)
        }.isSuccess
    }

    /** Der eine Kanal, deutsch benannt; ab Android 8 sieht man ihn in den App-Einstellungen. */
    fun kanalAnlegen(context: Context) {
        val kanal = NotificationChannel(KANAL, "Mitteilungen", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Buchungen, Spiele und Neuigkeiten aus dem Verein"
        }
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(kanal)
    }

    /** Darf die App Mitteilungen zeigen? Ab Android 13 braucht es die Erlaubnis, davor kann man sie abschalten. */
    fun erlaubt(context: Context): Boolean {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            return false
        }
        return NotificationManagerCompat.from(context).areNotificationsEnabled()
    }

    /** Wie UIDevice.name: der Name, den man dem Telefon gegeben hat, sonst das Modell. */
    fun geraetename(context: Context): String? =
        Settings.Global.getString(context.contentResolver, Settings.Global.DEVICE_NAME)?.takeIf { it.isNotBlank() }
            ?: Build.MODEL
}

/** Die Marke von Firebase Messaging. */
class FirebaseMarken : Markenquelle {
    override suspend fun marke(): String? = FirebaseMessaging.getInstance().token.warten()

    override suspend fun verwerfen() {
        FirebaseMessaging.getInstance().deleteToken().warten()
    }
}

/** Wartet auf eine Task der Play-Dienste (ohne kotlinx-coroutines-play-services). */
private suspend fun <T> Task<T>.warten(): T = suspendCancellableCoroutine { weiter ->
    addOnCompleteListener { t ->
        val fehler = t.exception
        when {
            fehler != null -> weiter.resumeWithException(fehler)
            t.isCanceled -> weiter.cancel()
            else -> weiter.resume(t.result)
        }
    }
}

/**
 * Neue Marken und Nachrichten, waehrend die App vorne ist. Im Manifest
 * eingetragen; ohne eingerichtete FirebaseApp startet ihn niemand.
 */
class PushDienst : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        val app = TcmApp.aus(this)
        val sitzung = app.sitzung ?: return
        // Ohne Sitzung weist die RPC ab; die gespeicherte Marke kam vom letzten Konto.
        if (sitzung.client.auth.currentSessionOrNull() == null) return
        app.appScope.launch { app.push.neueMarke(token, Pushdaten(sitzung.client)) }
    }

    /** Kommt eine Nachricht, waehrend die App offen ist: trotzdem zeigen (wie willPresent in iOS). */
    override fun onMessageReceived(nachricht: RemoteMessage) {
        val titel = nachricht.notification?.title ?: return
        if (!PushEinrichtung.erlaubt(this)) return
        val daten = nachricht.data.filterKeys { it in PushZiel.schluessel }
        val oeffnen = Intent(this, HauptActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
            for ((k, v) in daten) putExtra(k, v)
        }
        val id = (nachricht.messageId ?: "$titel${System.currentTimeMillis()}").hashCode()
        val absicht = PendingIntent.getActivity(
            this, id, oeffnen, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val mitteilung = NotificationCompat.Builder(this, PushEinrichtung.KANAL)
            .setSmallIcon(R.drawable.ic_mitteilung)
            .setColor(ContextCompat.getColor(this, R.color.markenblau))
            .setContentTitle(titel)
            .setContentText(nachricht.notification?.body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(nachricht.notification?.body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(absicht)
            .apply { nachricht.notification?.notificationCount?.let(::setNumber) }
            .build()
        try {
            NotificationManagerCompat.from(this).notify(id, mitteilung)
        } catch (e: SecurityException) {
            // Erlaubnis zwischendurch entzogen: dann eben keine Mitteilung.
        }
    }
}
