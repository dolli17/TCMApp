package de.tcmuckensturm.app.push

import android.Manifest
import android.app.Application
import android.app.NotificationManager
import android.content.Context
import android.os.Bundle
import android.provider.Settings
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.RemoteMessage
import de.tcmuckensturm.app.HauptActivity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.Shadows.shadowOf

/**
 * Push auf dem Geraet, soweit Robolectric es nachstellt: die Firebase-Werte,
 * der Kanal, die Erlaubnis und die Mitteilung, die der Dienst zeigt, solange
 * die App vorne ist. Die Marke selbst (FirebaseMessaging) braucht die
 * Play-Dienste und bleibt aussen vor - das deckt PushZentraleTest mit einer
 * nachgebauten Quelle ab.
 */
@RunWith(AndroidJUnit4::class)
class PushFirebaseTest {
    private val app: Application = ApplicationProvider.getApplicationContext()
    private val mitteilungen get() = shadowOf(app.getSystemService(NotificationManager::class.java))
    private val werte = FirebaseWerte("tcm-test", "1:1234567890:android:abcdef123456", "AIzaTestSchluessel", "1234567890")

    @Test
    fun firebaseWerte() {
        assertEquals(werte, FirebaseWerte.aus(" tcm-test ", "1:1234567890:android:abcdef123456\n", "AIzaTestSchluessel", "1234567890"))
        // Fehlt einer der vier Werte, bleibt Push aus.
        assertNull(FirebaseWerte.aus("tcm-test", "", "k", "1"))
        assertNull(FirebaseWerte.aus("tcm-test", "a", "   ", "1"))
        assertNull(FirebaseWerte.aus("", "", "", ""))
    }

    @Test
    fun ohneWerteKeinFirebase() {
        assertFalse(PushEinrichtung.firebase(app, null))
        assertTrue(FirebaseApp.getApps(app).isEmpty())
    }

    @Test
    fun firebaseEinrichten() {
        assertTrue(PushEinrichtung.firebase(app, werte))
        assertEquals("tcm-test", FirebaseApp.getInstance().options.projectId)
        assertEquals("1234567890", FirebaseApp.getInstance().options.gcmSenderId)
        // Ein zweiter Aufruf richtet nichts doppelt ein.
        assertTrue(PushEinrichtung.firebase(app, werte.copy(projektId = "anderes")))
        assertEquals("tcm-test", FirebaseApp.getInstance().options.projectId)
        FirebaseApp.getInstance().delete()
    }

    @Test
    fun kanal() {
        PushEinrichtung.kanalAnlegen(app)
        val kanal = app.getSystemService(NotificationManager::class.java).getNotificationChannel(PushEinrichtung.KANAL)
        assertEquals("Mitteilungen", kanal.name.toString())
        assertEquals(NotificationManager.IMPORTANCE_HIGH, kanal.importance)
        assertEquals("Buchungen, Spiele und Neuigkeiten aus dem Verein", kanal.description)
    }

    /** Ab Android 13 braucht es die Erlaubnis; abschalten kann man Mitteilungen immer. */
    @Test
    fun erlaubnis() {
        shadowOf(app).denyPermissions(Manifest.permission.POST_NOTIFICATIONS)
        assertFalse(PushEinrichtung.erlaubt(app))
        shadowOf(app).grantPermissions(Manifest.permission.POST_NOTIFICATIONS)
        assertTrue(PushEinrichtung.erlaubt(app))
        mitteilungen.setNotificationsEnabled(false)
        assertFalse(PushEinrichtung.erlaubt(app))
    }

    @Test
    fun geraetename() {
        Settings.Global.putString(app.contentResolver, Settings.Global.DEVICE_NAME, "Pixel von Anna")
        assertEquals("Pixel von Anna", PushEinrichtung.geraetename(app))
        // Ohne eigenen Namen das Modell.
        Settings.Global.putString(app.contentResolver, Settings.Global.DEVICE_NAME, "  ")
        assertEquals(android.os.Build.MODEL, PushEinrichtung.geraetename(app))
    }

    // ---- Der Dienst: eine Nachricht, waehrend die App vorne ist -----------------------

    private fun nachricht(titel: String?, text: String? = null, daten: Map<String, String> = emptyMap(), id: String? = "m1") =
        RemoteMessage(
            Bundle().apply {
                if (titel != null) {
                    putString("gcm.n.e", "1")
                    putString("gcm.notification.title", titel)
                    text?.let { putString("gcm.notification.body", it) }
                }
                id?.let { putString("google.message_id", it) }
                for ((k, v) in daten) putString(k, v)
            },
        )

    private fun dienst(): PushDienst = Robolectric.buildService(PushDienst::class.java).create().get()

    @Test
    fun dienstZeigtDieMitteilung() {
        shadowOf(app).grantPermissions(Manifest.permission.POST_NOTIFICATIONS)
        PushEinrichtung.kanalAnlegen(app)
        dienst().onMessageReceived(
            nachricht(
                "Buchung storniert", "Platz 1, Fr 18:00",
                mapOf("ziel" to "/nachrichten", "kind" to "booking_cancelled", "fremd" to "x"),
            ),
        )
        val gezeigt = mitteilungen.allNotifications.single()
        assertEquals("Buchung storniert", gezeigt.extras.getString("android.title"))
        assertEquals("Platz 1, Fr 18:00", gezeigt.extras.getCharSequence("android.text").toString())
        assertEquals(PushEinrichtung.KANAL, gezeigt.channelId)

        // Tippen oeffnet die Activity mit dem Ziel in den Extras - nur mit den Schluesseln, die die App liest.
        val absicht = shadowOf(gezeigt.contentIntent).savedIntent
        assertEquals(HauptActivity::class.java.name, absicht.component!!.className)
        assertEquals(mapOf("ziel" to "/nachrichten", "kind" to "booking_cancelled"), PushZiel.texte(absicht.extras))
        assertFalse(absicht.hasExtra("fremd"))
        assertEquals(PushZiel.Nachrichten, PushZiel.aus(PushZiel.texte(absicht.extras)))
    }

    /** Zwei Nachrichten bleiben zwei Mitteilungen. */
    @Test
    fun dienstJeNachrichtEineMitteilung() {
        shadowOf(app).grantPermissions(Manifest.permission.POST_NOTIFICATIONS)
        val d = dienst()
        d.onMessageReceived(nachricht("Eins", id = "m1"))
        d.onMessageReceived(nachricht("Zwei", id = "m2"))
        assertEquals(setOf("Eins", "Zwei"), mitteilungen.allNotifications.map { it.extras.getString("android.title") }.toSet())
    }

    @Test
    fun dienstOhneTitelOderErlaubnisNichts() {
        shadowOf(app).grantPermissions(Manifest.permission.POST_NOTIFICATIONS)
        val d = dienst()
        // Nur Daten, keine Mitteilung: nichts zu zeigen.
        d.onMessageReceived(nachricht(null, daten = mapOf("ziel" to "/plaetze")))
        assertEquals(0, mitteilungen.size())
        shadowOf(app).denyPermissions(Manifest.permission.POST_NOTIFICATIONS)
        d.onMessageReceived(nachricht("Buchung storniert"))
        assertEquals(0, mitteilungen.size())
    }

    /** Ohne Konfiguration (lokal ohne lokal.properties, CI) gibt es keine Sitzung: eine neue Marke wird ignoriert. */
    @Test
    fun neueMarkeOhneSitzung() {
        org.junit.Assume.assumeTrue(de.tcmuckensturm.app.TcmApp.aus(app).sitzung == null)
        dienst().onNewToken("marke-neu")
    }
}
