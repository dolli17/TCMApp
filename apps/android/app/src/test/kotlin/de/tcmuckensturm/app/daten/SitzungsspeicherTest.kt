package de.tcmuckensturm.app.daten

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.test.ext.junit.runners.AndroidJUnit4
import io.github.jan.supabase.auth.exception.NoSessionFoundException
import io.github.jan.supabase.auth.user.UserSession
import java.io.File
import javax.crypto.AEADBadTagException
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith

/**
 * Der Sitzungsspeicher mit echtem DataStore auf der Platte.
 *
 * Der Schluessel kommt hier aus Software: Robolectric kennt den
 * AndroidKeyStore nicht. Gleich ist der Algorithmus (AesGcm); dass der
 * Keystore-Schluessel entsteht und haelt, zeigt der Rauchtest im Emulator (README).
 */
@RunWith(AndroidJUnit4::class)
class SitzungsspeicherTest {
    @get:Rule val ordner = TemporaryFolder()

    private fun schluessel(): SecretKey = KeyGenerator.getInstance("AES").apply { init(256) }.generateKey()

    private val sitzung = UserSession(
        accessToken = "geheimes-access-token",
        refreshToken = "geheimes-refresh-token",
        expiresIn = 3600,
        tokenType = "bearer",
    )

    private fun TestScope.speicher(datei: File, schluessel: SecretKey) = Sitzungsspeicher(
        PreferenceDataStoreFactory.create(scope = backgroundScope) { datei },
        AesGcm { schluessel },
    )

    private fun datei(name: String = "sitzung") = File(ordner.root, "$name.preferences_pb")

    @Test
    fun speichertUndLiestDieSitzung() = runTest {
        val s = speicher(datei(), schluessel())
        assertNull(s.loadSessionOrNull())
        s.saveSession(sitzung)
        val gelesen = s.loadSession()
        assertEquals(sitzung.accessToken, gelesen.accessToken)
        assertEquals(sitzung.refreshToken, gelesen.refreshToken)
        assertEquals(sitzung.expiresAt, gelesen.expiresAt)
        assertTrue(s.vorhanden())
    }

    @Test
    fun aufDerPlatteLiegtNurGeheimtext() = runTest {
        val d = datei()
        val s = speicher(d, schluessel())
        s.saveSession(sitzung)
        s.loadSession() // wartet, bis geschrieben ist
        val roh = d.readBytes().toString(Charsets.ISO_8859_1)
        assertFalse(roh.contains("geheimes-access-token"))
        assertFalse(roh.contains("geheimes-refresh-token"))
    }

    @Test
    fun loeschenEntferntDieSitzung() = runTest {
        val s = speicher(datei(), schluessel())
        s.saveSession(sitzung)
        s.deleteSession()
        assertNull(s.loadSessionOrNull())
        assertFalse(s.vorhanden())
        // Kein runBlocking: der DataStore laeuft im backgroundScope dieses Tests.
        val fehler = runCatching { s.loadSession() }.exceptionOrNull()
        assertTrue(fehler is NoSessionFoundException)
    }

    /** Schluessel weg (App-Daten geloescht, wiederhergestellt): abgemeldet statt abgestuerzt. */
    @Test
    fun mitAnderemSchluesselGiltSieAlsAbgemeldet() = runTest {
        val d = datei()
        val daten = PreferenceDataStoreFactory.create(scope = backgroundScope) { d }
        val alt = schluessel()
        val neu = schluessel()
        Sitzungsspeicher(daten, AesGcm { alt }).saveSession(sitzung)
        val fremd = Sitzungsspeicher(daten, AesGcm { neu })
        assertNull(fremd.loadSessionOrNull())
        // ... und die unlesbare Sitzung ist weg, sonst scheiterte jeder Start erneut.
        assertNull(daten.data.first()[androidx.datastore.preferences.core.stringPreferencesKey("sitzung")])
    }

    @Test
    fun aesGcmVerschluesseltJedesMalAnders() {
        val k = schluessel()
        val aes = AesGcm { k }
        val klar = "dieselbe Sitzung".toByteArray()
        val a = aes.verschluesseln(klar)
        val b = aes.verschluesseln(klar)
        assertFalse(a.contentEquals(b))
        assertArrayEquals(klar, aes.entschluesseln(a))
        assertArrayEquals(klar, aes.entschluesseln(b))
    }

    @Test
    fun aesGcmErkenntVeraenderungen() {
        val k = schluessel()
        val aes = AesGcm { k }
        val geheim = aes.verschluesseln("Sitzung".toByteArray())
        geheim[geheim.size - 1] = (geheim[geheim.size - 1].toInt() xor 1).toByte()
        assertThrows(AEADBadTagException::class.java) { aes.entschluesseln(geheim) }
        assertNotNull(aes.verschluesseln(ByteArray(0)))
    }
}
