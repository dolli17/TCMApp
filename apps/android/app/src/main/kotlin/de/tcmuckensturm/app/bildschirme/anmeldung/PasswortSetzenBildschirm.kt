/*
 * Passwort festlegen
 *
 * Ziel des Links aus der E-Mail (Einladung, Passwort vergessen), wie
 * apps/mobile/app/passwort-setzen.tsx und PasswortSetzenBildschirm.swift der
 * iOS-App. Den Link loest Sitzung ein; dieser Bildschirm zeigt nur, was
 * Sitzung.passwort meldet. Nach dem Speichern geht es in die Weiche, die
 * Zurueck-Geste verwirft den Link.
 *
 * Wie im Web steht ueber den Feldern, fuer welches Konto das Passwort gilt.
 */

package de.tcmuckensturm.app.bildschirme.anmeldung

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.input.TextFieldState
import androidx.compose.foundation.text.input.rememberTextFieldState
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.tcmuckensturm.app.bildschirme.Hauptknopf
import de.tcmuckensturm.app.start.LocalSitzung
import de.tcmuckensturm.app.start.PasswortRegeln
import de.tcmuckensturm.app.start.PasswortTexte
import de.tcmuckensturm.app.start.PasswortZustand
import de.tcmuckensturm.app.theme.TcmSchrift
import de.tcmuckensturm.app.theme.TcmTheme
import de.tcmuckensturm.app.ui.tokens.Abstand
import de.tcmuckensturm.app.ui.tokens.Schrift
import kotlinx.coroutines.launch

@Composable
fun PasswortSetzenBildschirm(zustand: PasswortZustand) {
    val sitzung = LocalSitzung.current
    val scope = rememberCoroutineScope()
    val passwort = rememberTextFieldState()
    val wiederholung = rememberTextFieldState()
    var fehler by rememberSaveable { mutableStateOf<String?>(null) }
    var laeuft by rememberSaveable { mutableStateOf(false) }
    var vergessenOffen by rememberSaveable { mutableStateOf(false) }

    if (vergessenOffen) {
        BackHandler { vergessenOffen = false }
        PasswortVergessenBildschirm(zurueck = sitzung::passwortSchliessen)
        return
    }
    BackHandler(onBack = sitzung::passwortSchliessen)

    PasswortSetzenInhalt(
        zustand = zustand,
        passwort = passwort,
        wiederholung = wiederholung,
        fehler = fehler,
        laeuft = laeuft,
        neuerLink = { vergessenOffen = true },
        schliessen = sitzung::passwortSchliessen,
        fortfahren = sitzung::linkBestaetigen,
        speichern = {
            if (!laeuft) {
                fehler = PasswortRegeln.pruefen(passwort.text.toString(), wiederholung.text.toString())
                if (fehler == null) {
                    laeuft = true
                    scope.launch {
                        val meldung = sitzung.passwortSpeichern(passwort.text.toString())
                        laeuft = false
                        // Ohne Fehler in die Weiche: sie kennt das offene Onboarding und "Kein Zugang".
                        if (meldung != null) fehler = meldung else sitzung.passwortSchliessen()
                    }
                }
            }
        },
    )
}

@Composable
fun PasswortSetzenInhalt(
    zustand: PasswortZustand,
    passwort: TextFieldState,
    wiederholung: TextFieldState,
    fehler: String?,
    laeuft: Boolean,
    neuerLink: () -> Unit,
    schliessen: () -> Unit,
    fortfahren: () -> Unit,
    speichern: () -> Unit,
) {
    val f = TcmTheme.farben
    AnmeldeSeite(titel = PasswortTexte.SETZEN_TITEL, unterzeile = PasswortTexte.SETZEN_UNTERZEILE) {
        when (zustand) {
            is PasswortZustand.Rueckfrage, PasswortZustand.Laden ->
                Box(Modifier.fillMaxWidth().heightIn(min = 120.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = f.gold)
                }
            is PasswortZustand.Fehler -> {
                AnmeldeHinweis(zustand.text)
                Column(Modifier.padding(top = Abstand.abschnitt), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Hauptknopf("Neuen Link anfordern", aktion = neuerLink)
                    LeiserVerweis("Zurück zur Anmeldung", aktion = schliessen)
                }
            }
            is PasswortZustand.Bereit -> {
                if (zustand.konto != null) {
                    Text(
                        buildAnnotatedString {
                            append("Für das Konto ")
                            withStyle(SpanStyle(fontWeight = Schrift.gewichtFett)) { append(zustand.konto) }
                        },
                        style = TcmSchrift.text(Schrift.gewichtNormal, 15.sp),
                        color = f.ink2,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                AnmeldeFeld(
                    beschriftung = "Neues Passwort",
                    zustand = passwort,
                    inhaltsTyp = ContentType.NewPassword,
                    passwort = true,
                )
                AnmeldeFeld(
                    beschriftung = "Noch einmal",
                    bedienName = "Passwort wiederholen",
                    zustand = wiederholung,
                    inhaltsTyp = ContentType.NewPassword,
                    passwort = true,
                    absenden = ImeAction.Go,
                    beimAbsenden = speichern,
                )
                if (fehler != null) AnmeldeHinweis(fehler)
                Hauptknopf(
                    if (laeuft) "Wird gespeichert…" else "Speichern",
                    modifier = Modifier.padding(top = Abstand.abschnitt),
                    gesperrt = laeuft,
                    aktion = speichern,
                )
            }
        }
    }

    if (zustand is PasswortZustand.Rueckfrage) {
        AlertDialog(
            // Wer daneben tippt, bricht ab - wie "Abbrechen".
            onDismissRequest = schliessen,
            title = { Text(PasswortTexte.RUECKFRAGE_TITEL) },
            text = { Text(PasswortTexte.rueckfrage(zustand.email)) },
            dismissButton = { TextButton(onClick = schliessen) { Text("Abbrechen") } },
            confirmButton = { TextButton(onClick = fortfahren) { Text("Fortfahren", color = f.redInk) } },
        )
    }
}
