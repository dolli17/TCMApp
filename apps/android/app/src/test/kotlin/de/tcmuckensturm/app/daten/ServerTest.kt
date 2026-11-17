package de.tcmuckensturm.app.daten

import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.fail
import org.junit.runner.RunWith

/**
 * Grundlage der Tests der Datenschicht: der Client der App gegen die
 * Serverattrappe. Unter Robolectric, weil supabase-kt auf Android den Context
 * braucht - ins Netz geht nichts.
 */
@RunWith(AndroidJUnit4::class)
abstract class ServerTest {
    protected val server = Serverattrappe()

    /** Erst im Test gebaut: der Client braucht die Anwendung von Robolectric. */
    protected val client by lazy { server.client() }

    @After
    fun schliessen() = runBlocking { client.close() }

    /** Der Satz der Meldung, die ein lesender Aufruf wirft. */
    protected suspend fun meldung(aufruf: suspend () -> Any?): String {
        try {
            aufruf()
        } catch (e: Meldung) {
            return e.text
        }
        fail("Der Aufruf haette eine Meldung werfen muessen")
        return ""
    }

    protected companion object {
        const val KEINE_VERBINDUNG = "Keine Verbindung zum Server. Bitte prüfe die Internetverbindung und versuche es erneut."
        const val ALLGEMEIN = "Das hat nicht geklappt. Bitte versuche es erneut."
        const val KEIN_RECHT = "Dafür fehlt dir die Berechtigung."

        /** permission denied, wie PostgREST es fuer eine RPC ohne Recht meldet. */
        val VERBOTEN = Antwort.dbFehler("permission denied for function x", code = "42501", status = 403)
    }
}
