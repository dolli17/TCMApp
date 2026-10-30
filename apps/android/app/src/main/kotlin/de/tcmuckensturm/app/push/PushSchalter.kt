/*
 * Der Schalter "Mitteilungen aufs Handy" (PushZeile in konto.tsx,
 * SchrittEinstellungen in onboarding.tsx, App/PushSchalter.swift in iOS)
 *
 * Das ist zugleich der Widerruf: ein zusaetzliches Ja/Nein in der Datenbank
 * waere eine Attrappe, denn abgeschaltet wird ohnehin ueber das Geraet oder
 * hier. Ein Fehlschlag steht als Satz darunter und haelt nichts anderes auf.
 * Erst hier fragt Android (ab 13) nach der Erlaubnis POST_NOTIFICATIONS.
 */

package de.tcmuckensturm.app.push

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import de.tcmuckensturm.app.TcmApp
import de.tcmuckensturm.app.bildschirme.konto.Leise
import de.tcmuckensturm.app.bildschirme.konto.Symbolkachel
import de.tcmuckensturm.app.daten.Pushdaten
import de.tcmuckensturm.app.start.LocalSitzung
import de.tcmuckensturm.app.theme.TcmSchrift
import de.tcmuckensturm.app.theme.TcmTheme
import de.tcmuckensturm.app.ui.tokens.Schrift
import kotlinx.coroutines.launch

const val PUSH_TITEL = "Mitteilungen aufs Handy"

/**
 * Mit Sitzung und PushZentrale. `symbol`: im Konto mit Symbol links, die
 * Meldung darunter; im Onboarding ohne, mit Erklaerung unter dem Titel.
 */
@Composable
fun PushSchalter(symbol: Boolean = false, beschreibung: String? = null) {
    val context = LocalContext.current
    val sitzung = LocalSitzung.current
    val zentrale = remember { TcmApp.aus(context).push }
    val konto = remember(sitzung) { Pushdaten(sitzung.client) }
    val scope = rememberCoroutineScope()
    var an by remember { mutableStateOf(false) }
    var laeuft by remember { mutableStateOf(false) }
    var meldung by remember { mutableStateOf<String?>(null) }

    val schalten: (Boolean) -> Unit = { ziel ->
        laeuft = true
        scope.launch {
            val r = if (ziel) zentrale.anmelden(konto) else zentrale.abmelden(konto)
            laeuft = false
            meldung = r.meldung.ifEmpty { null }
            if (r.ok) an = ziel
        }
    }
    val erlaubnis = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ja ->
        if (ja) {
            schalten(true)
        } else {
            laeuft = false
            meldung = PushZentrale.OHNE_ERLAUBNIS
        }
    }

    LaunchedEffect(zentrale) { an = zentrale.istAngemeldet(konto) }

    PushSchalterAnsicht(
        an = an,
        laeuft = laeuft,
        meldung = meldung ?: PushZentrale.NICHT_EINGERICHTET.takeUnless { zentrale.verfuegbar },
        gesperrt = !zentrale.verfuegbar,
        symbol = symbol,
        beschreibung = beschreibung,
    ) { ziel ->
        if (!laeuft) {
            meldung = null
            val fragen = ziel && Build.VERSION.SDK_INT >= 33 &&
                ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
            if (fragen) {
                laeuft = true
                erlaubnis.launch(Manifest.permission.POST_NOTIFICATIONS)
            } else {
                schalten(ziel)
            }
        }
    }
}

/** Ohne Sitzung und Geraet - so zeichnen ihn auch die Screenshot-Tests. */
@Composable
fun PushSchalterAnsicht(
    an: Boolean,
    laeuft: Boolean = false,
    meldung: String? = null,
    gesperrt: Boolean = false,
    symbol: Boolean = false,
    beschreibung: String? = null,
    umschalten: (Boolean) -> Unit = {},
) {
    val f = TcmTheme.farben
    Column(
        Modifier
            .fillMaxWidth()
            .toggleable(value = an, enabled = !laeuft && !gesperrt, role = Role.Switch, onValueChange = umschalten)
            .heightIn(min = 56.dp)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            if (symbol) Symbolkachel(Icons.Outlined.Notifications)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(PUSH_TITEL, style = TcmSchrift.text(Schrift.gewichtHalbfett, 15.5.sp), color = f.ink)
                val unter = if (symbol) null else meldung ?: beschreibung
                if (!unter.isNullOrEmpty()) Leise(unter)
            }
            Switch(
                checked = an,
                // Das Tippen nimmt die ganze Zeile (toggleable), wie bei Material-Listen.
                onCheckedChange = null,
                enabled = !laeuft && !gesperrt,
                colors = SwitchDefaults.colors(checkedTrackColor = f.green, checkedBorderColor = f.green),
                modifier = Modifier.alpha(if (laeuft) 0.6f else 1f),
            )
        }
        if (symbol && meldung != null) Leise(meldung, Modifier.padding(start = 44.dp))
    }
}
