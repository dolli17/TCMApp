package de.tcmuckensturm.app.push

import android.os.Bundle
import androidx.test.ext.junit.runners.AndroidJUnit4
import de.tcmuckensturm.app.navigation.HauptTab
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith

/** Das Ziel beim Tippen: dieselben Faelle wie PushTests.swift (data aus notification-pushes, Funktion daten). */
@RunWith(AndroidJUnit4::class)
class PushZielTest {
    private val id = "8f0c2b1e-4a5d-4c3e-9b7a-1d2e3f4a5b6c"

    @Test
    fun zielAusDemPfad() {
        assertEquals(PushZiel.Nachrichten, PushZiel.aus(mapOf("ziel" to "/nachrichten")))
        assertEquals(
            PushZiel.Veranstaltung(id),
            PushZiel.aus(mapOf("ziel" to "/verein/veranstaltung/$id", "kind" to "event_reminder", "event_id" to id)),
        )
        assertEquals(PushZiel.Tab(HauptTab.PLAETZE), PushZiel.aus(mapOf("ziel" to "/plaetze?tag=2026-10-30")))
        assertEquals(PushZiel.Tab(HauptTab.KONTO), PushZiel.aus(mapOf("ziel" to "/konto")))
        assertEquals(PushZiel.Tab(HauptTab.HOME), PushZiel.aus(mapOf("ziel" to "/")))
        assertEquals(PushZiel.Tab(HauptTab.HOME), PushZiel.aus(mapOf("ziel" to "/home#oben")))
        assertEquals(PushZiel.Tab(HauptTab.VEREIN), PushZiel.aus(mapOf("ziel" to "/verein")))
    }

    /** Ohne brauchbaren Pfad entscheiden event_id, dann kind. */
    @Test
    fun rueckfall() {
        assertEquals(PushZiel.Veranstaltung(id), PushZiel.aus(mapOf("event_id" to id)))
        assertEquals(PushZiel.Veranstaltung(id), PushZiel.aus(mapOf("ziel" to "/gibtsnicht", "event_id" to id)))
        assertEquals(PushZiel.Nachrichten, PushZiel.aus(mapOf("kind" to "booking_cancelled")))
        assertNull(PushZiel.aus(emptyMap()))
        assertNull(PushZiel.aus(mapOf("ziel" to "/gibtsnicht")))
        assertNull(PushZiel.aus(mapOf("kind" to "")))
    }

    /** Nur Pfade der App selbst (sichererWeiterPfad). */
    @Test
    fun fremdeAdressen() {
        for (boese in listOf("https://boese.example", "//boese.example", "/\\boese.example", "/\t/boese.example", "nachrichten", "")) {
            assertNull(boese, PushZiel.ausPfad(boese))
        }
        assertEquals(PushZiel.Tab(HauptTab.VEREIN), PushZiel.ausPfad("/verein/veranstaltung/../../x"))
        assertNull(PushZiel.aus(mapOf("event_id" to "a/b")))
        assertNull(PushZiel.aus(mapOf("event_id" to "<script>")))
        assertNull(PushZiel.aus(mapOf("event_id" to "x".repeat(65))))
    }

    /** Was FCM in die Extras legt: data plus eigene Schluessel (google.*, from) - die App liest nur ihre. */
    @Test
    fun texteAusDenExtras() {
        val extras = Bundle().apply {
            putString("ziel", "/nachrichten")
            putString("kind", "booking_cancelled")
            putString("google.message_id", "0:123")
            putString("from", "4711")
            putInt("zahl", 3)
        }
        assertEquals(mapOf("ziel" to "/nachrichten", "kind" to "booking_cancelled"), PushZiel.texte(extras))
        assertEquals(emptyMap<String, String>(), PushZiel.texte(null))
    }

    @Test
    fun firebaseWerte() {
        assertEquals(FirebaseWerte("p", "1:2:android:3", "k", "2"), FirebaseWerte.aus(" p ", "1:2:android:3", "k", "2"))
        assertNull(FirebaseWerte.aus("p", "", "k", "2"))
        assertNull(FirebaseWerte.aus("", "", "", ""))
    }
}
