/*
 * Die einzige Activity
 *
 * Edge-to-Edge, dann die Weiche (StartAnsicht). Links aus Intents (App Links
 * auf passwort-setzen, das eigene Schema) gibt sie an die Sitzung - beim
 * Kaltstart aus onCreate, sonst aus onNewIntent (launchMode singleTask).
 * Ebenso das Tippen auf eine Push-Nachricht: `data` steht in den Extras und
 * geht an die PushZentrale, bis die Tabs das Ziel oeffnen.
 * Ein Link mit dem eigenen Schema, der kein Passwort-Link ist, kommt von einem
 * Widget (WidgetLink) und geht als Pfad denselben Weg wie eine Push-Nachricht.
 */

package de.tcmuckensturm.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import de.tcmuckensturm.app.push.PushZiel
import de.tcmuckensturm.app.start.KonfigurationFehlt
import de.tcmuckensturm.app.start.StartAnsicht
import de.tcmuckensturm.app.theme.TcmTheme
import de.tcmuckensturm.app.widgets.WidgetLink

class HauptActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val app = TcmApp.aus(this)
        val sitzung = app.sitzung
        sitzung?.starten()
        // Nur beim ersten Start, nicht nach einer Drehung o. Ae. ein zweites Mal.
        if (savedInstanceState == null) {
            linkOeffnen(intent)
            pushOeffnen(intent)
        }

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
        pushOeffnen(intent)
    }

    /** Eine angetippte Push-Nachricht (vom System gezeigt oder vom PushDienst). */
    private fun pushOeffnen(intent: Intent?) {
        val daten = PushZiel.texte(intent?.extras)
        if (daten.isNotEmpty()) TcmApp.aus(this).push.geoeffnet(daten)
    }

    /**
     * Passwort-Links zuerst, sonst fuehrt das eigene Schema (tcm://plaetze) dorthin,
     * wo ein Widget hinwill - ueber PushZiel.ausPfad wie in iOS.
     */
    private fun linkOeffnen(intent: Intent?) {
        if (intent?.action != Intent.ACTION_VIEW) return
        val adresse = intent.dataString ?: return
        val app = TcmApp.aus(this)
        val sitzung = app.sitzung ?: return
        if (sitzung.linkOeffnen(adresse)) return
        WidgetLink.pfad(adresse, sitzung.umgebung.urlSchema)?.let { app.push.geoeffnet(mapOf("ziel" to it)) }
    }
}
