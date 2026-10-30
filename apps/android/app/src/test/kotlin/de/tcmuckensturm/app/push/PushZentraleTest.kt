package de.tcmuckensturm.app.push

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import de.tcmuckensturm.app.daten.Ergebnis
import de.tcmuckensturm.app.daten.Pushkonto
import java.io.File
import java.nio.file.Files
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** An- und Abmelden, Auffrischen und das offene Ziel - mit Ersatz fuer FCM und Datenbank, ohne Netz. */
class PushZentraleTest {
    private class Quelle(var marke: String?) : Markenquelle {
        var verworfen = 0
        override suspend fun marke() = marke
        override suspend fun verwerfen() {
            verworfen++
        }
    }

    private class Konto(var ok: Boolean = true) : Pushkonto {
        val angemeldet = mutableListOf<Pair<String, String?>>()
        val abgemeldet = mutableListOf<String>()
        val aktiv = mutableSetOf<String>()
        override suspend fun anmelden(marke: String, geraet: String?): Ergebnis {
            if (!ok) return Ergebnis.fehler("Keine Verbindung zum Server.")
            angemeldet += marke to geraet
            aktiv += marke
            return Ergebnis.erfolg("Benachrichtigungen sind eingeschaltet.")
        }
        override suspend fun abmelden(marke: String): Ergebnis {
            abgemeldet += marke
            aktiv -= marke
            return Ergebnis.erfolg("Benachrichtigungen sind ausgeschaltet.")
        }
        override suspend fun aktiv(marke: String) = marke in aktiv
    }

    private fun zentrale(scope: CoroutineScope, quelle: Markenquelle?, erlaubt: () -> Boolean = { true }): PushZentrale {
        val ordner = Files.createTempDirectory("push").toFile()
        val speicher = PreferenceDataStoreFactory.create(scope = scope) { File(ordner, "einstellungen.preferences_pb") }
        return PushZentrale(speicher, quelle, erlaubt, "Pixel von Anna")
    }

    @Test
    fun anmeldenUndAbmelden() = runTest {
        val quelle = Quelle("fcm-1")
        val konto = Konto()
        val z = zentrale(backgroundScope, quelle)
        assertFalse(z.istAngemeldet(konto))

        val an = z.anmelden(konto)
        assertTrue(an.ok)
        assertEquals(listOf("fcm-1" to "Pixel von Anna"), konto.angemeldet)
        assertTrue(z.istAngemeldet(konto))

        val aus = z.abmelden(konto)
        assertEquals("Benachrichtigungen sind ausgeschaltet.", aus.meldung)
        assertEquals(listOf("fcm-1"), konto.abgemeldet)
        assertEquals(1, quelle.verworfen)
        assertFalse(z.istAngemeldet(konto))
        // Nichts angemeldet: Abmelden (etwa beim Abmelden der Sitzung) tut nichts.
        assertEquals(Ergebnis.erfolg(""), z.abmelden(konto))
        assertEquals(1, konto.abgemeldet.size)
    }

    @Test
    fun ohneErlaubnisOderMarke() = runTest {
        val konto = Konto()
        assertEquals(Ergebnis.fehler(PushZentrale.OHNE_ERLAUBNIS), zentrale(backgroundScope, Quelle("x")) { false }.anmelden(konto))
        assertEquals(
            Ergebnis.fehler("Das Gerät hat keine Kennung geliefert."),
            zentrale(backgroundScope, Quelle(null)).anmelden(konto),
        )
        val ohneFirebase = zentrale(backgroundScope, null)
        assertFalse(ohneFirebase.verfuegbar)
        assertEquals(Ergebnis.fehler(PushZentrale.NICHT_EINGERICHTET), ohneFirebase.anmelden(konto))
        assertTrue(konto.angemeldet.isEmpty())
    }

    @Test
    fun fehlschlagMerktKeineMarke() = runTest {
        val konto = Konto(ok = false)
        val z = zentrale(backgroundScope, Quelle("fcm-1"))
        assertFalse(z.anmelden(konto).ok)
        konto.ok = true
        assertFalse(z.istAngemeldet(konto))
    }

    /** Erlaubnis spaeter in den Einstellungen entzogen: der Schalter steht aus. */
    @Test
    fun entzogeneErlaubnis() = runTest {
        var erlaubt = true
        val konto = Konto()
        val z = zentrale(backgroundScope, Quelle("fcm-1")) { erlaubt }
        z.anmelden(konto)
        erlaubt = false
        assertFalse(z.istAngemeldet(konto))
    }

    @Test
    fun neueMarkeNurWennPushAnWar() = runTest {
        val quelle = Quelle("fcm-1")
        val konto = Konto()
        val z = zentrale(backgroundScope, quelle)
        z.neueMarke("fcm-0", konto)
        assertTrue(konto.angemeldet.isEmpty())

        z.anmelden(konto)
        z.neueMarke("fcm-2", konto)
        assertEquals(listOf("fcm-1", "fcm-2"), konto.angemeldet.map { it.first })
        assertEquals(listOf("fcm-1"), konto.abgemeldet)

        // Auffrischen holt die Marke von FCM; ist sie dieselbe, passiert nichts.
        quelle.marke = "fcm-2"
        z.auffrischen(konto)
        assertEquals(2, konto.angemeldet.size)
        quelle.marke = "fcm-3"
        z.auffrischen(konto)
        assertEquals("fcm-3", konto.angemeldet.last().first)
        assertTrue(z.istAngemeldet(konto))
    }

    @Test
    fun offenesZielNurEinmal() = runTest {
        val z = zentrale(backgroundScope, null)
        z.geoeffnet(mapOf("ziel" to "/gibtsnicht"))
        assertNull(z.offenesZiel.value)
        z.geoeffnet(mapOf("ziel" to "/nachrichten"))
        assertEquals(PushZiel.Nachrichten, z.offenesZiel.value)
        z.zielGeoeffnet(PushZiel.Nachrichten)
        assertNull(z.offenesZiel.value)
    }
}
