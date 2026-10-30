/*
 * Die einzige Activity
 *
 * Edge-to-Edge, dann die Weiche (StartAnsicht). Links aus Intents (App Links
 * auf passwort-setzen, das eigene Schema) gibt sie an die Sitzung - beim
 * Kaltstart aus onCreate, sonst aus onNewIntent (launchMode singleTask).
 */

package de.tcmuckensturm.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import de.tcmuckensturm.app.start.KonfigurationFehlt
import de.tcmuckensturm.app.start.StartAnsicht
import de.tcmuckensturm.app.theme.TcmTheme

class HauptActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val app = TcmApp.aus(this)
        val sitzung = app.sitzung
        sitzung?.starten()
        // Nur beim ersten Start, nicht nach einer Drehung o. Ae. ein zweites Mal.
        if (savedInstanceState == null) linkOeffnen(intent)

        setContent {
            if (sitzung != null) {
                StartAnsicht(sitzung)
            } else {
                TcmTheme { KonfigurationFehlt(app.konfiguration.exceptionOrNull()) }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        linkOeffnen(intent)
    }

    /**
     * Passwort-Links zuerst. TODO (Widget-/Push-Spur): sonst fuehrt das eigene
     * Schema (tcm://plaetze) wie eine Push-Nachricht dorthin (PushZiel.ausPfad in iOS).
     */
    private fun linkOeffnen(intent: Intent?) {
        if (intent?.action != Intent.ACTION_VIEW) return
        val adresse = intent.dataString ?: return
        TcmApp.aus(this).sitzung?.linkOeffnen(adresse)
    }
}
