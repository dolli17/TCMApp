package de.tcmuckensturm.app.start

import android.os.Looper
import androidx.compose.ui.test.ComposeTimeoutException
import androidx.compose.ui.test.junit4.ComposeTestRule
import androidx.compose.ui.test.onAllNodesWithText
import de.tcmuckensturm.app.daten.Antwort
import de.tcmuckensturm.app.daten.Serverattrappe
import de.tcmuckensturm.app.daten.client
import de.tcmuckensturm.app.push.PushZentrale
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import org.robolectric.Shadows.shadowOf

/**
 * Eine echte Sitzung fuer Bildschirmtests: der Client der App gegen die
 * Serverattrappe. Erst im Test anlegen (braucht die Anwendung von Robolectric)
 * und am Ende schliessen.
 */
class Testsitzung(push: PushZentrale? = null) {
    val server = Serverattrappe()
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    val client = server.client()
    val sitzung = Sitzung(Serverattrappe.UMGEBUNG, client, scope, push = push).also { it.starten() }

    /** Auth nimmt jede Anmeldung an; mein_zugang antwortet mit der Zeile. */
    fun anmeldungGelingt(zugang: String = """[{"zugang":true,"grund":null,"onboarding_offen":false}]""") {
        server.auth("token") { Antwort.sitzung() }
        server.auth("logout") { Antwort.LEER }
        server.rpc("mein_zugang", zugang)
    }

    /** Alles, was die Bildschirme sonst fragen, kommt leer zurueck - sie zeigen dann ihre Leerzustaende. */
    fun sonstLeer() {
        server.sonst = { Antwort(200, "[]") }
    }

    fun schliessen() = runBlocking<Unit> {
        scope.cancel()
        client.close()
    }
}

/** Wartet, bis die Bedingung gilt; laesst dabei Compose und den Hauptfaden arbeiten. */
fun ComposeTestRule.bis(worauf: String, bedingung: () -> Boolean) {
    try {
        waitUntil(15_000) {
            shadowOf(Looper.getMainLooper()).idle()
            bedingung()
        }
    } catch (e: ComposeTimeoutException) {
        throw AssertionError("Nicht eingetreten: $worauf", e)
    }
}

/** Steht der Text (als ganzer Text eines Elements) gerade auf dem Bildschirm? */
fun ComposeTestRule.zeigt(text: String, teil: Boolean = false): Boolean =
    onAllNodesWithText(text, substring = teil).fetchSemanticsNodes().isNotEmpty()

fun ComposeTestRule.bisText(text: String, teil: Boolean = false) = bis("Text „$text“") { zeigt(text, teil) }
