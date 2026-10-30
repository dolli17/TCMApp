package de.tcmuckensturm.app.daten

import de.tcmuckensturm.app.start.Zeitueberschreitung
import de.tcmuckensturm.kern.Anmeldefehler
import de.tcmuckensturm.kern.DbFehler
import java.io.IOException
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

/** Ausnahmen ohne Antwort vom Server; die Formen mit Antwort pruefen die Kern-Tests. */
class FehlerformTest {
    @Test
    fun ohneNetzIstEineStoerung() {
        for (fehler in listOf(UnknownHostException("x"), ConnectException("x"), SocketTimeoutException("x"), Zeitueberschreitung())) {
            val form = authFehlerForm(fehler)
            assertTrue(form.ohneAntwort)
            assertEquals(Anmeldefehler.VERBINDUNG, Anmeldefehler.anmeldeFehlerText(form))
        }
    }

    @Test
    fun verpackterVerbindungsfehler() {
        val fehler = IllegalStateException("aussen", IOException("innen"))
        assertTrue(authFehlerForm(fehler).ohneAntwort)
    }

    @Test
    fun unbekannterFehlerIstFalscheDaten() {
        assertEquals(Anmeldefehler.ANMELDEDATEN_FALSCH, Anmeldefehler.anmeldeFehlerText(authFehlerForm(IllegalStateException("?"))))
    }

    @Test
    fun meldungFuerRpcs() {
        assertEquals(DbFehler.VERBINDUNGSFEHLER_TEXT, Meldung.aus(UnknownHostException("x")).text)
        assertEquals(DbFehler.ALLGEMEINER_FEHLER_TEXT, Meldung.aus(IllegalArgumentException("Decodierfehler")).text)
        val meldung = Meldung("Schon da.")
        assertSame(meldung, Meldung.aus(meldung))
    }
}
