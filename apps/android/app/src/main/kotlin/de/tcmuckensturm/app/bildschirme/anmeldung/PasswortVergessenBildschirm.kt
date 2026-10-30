/*
 * Passwort vergessen
 *
 * Wie apps/mobile/app/passwort-vergessen.tsx und
 * PasswortVergessenBildschirm.swift der iOS-App. Fordert den Link an; er
 * fuehrt auf <SITE_URL>/passwort-setzen (App Link) und oeffnet die App, sonst
 * das Web. Lokal ohne Web nimmt er das eigene Schema (Umgebung).
 */

package de.tcmuckensturm.app.bildschirme.anmeldung

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.input.TextFieldState
import androidx.compose.foundation.text.input.rememberTextFieldState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import de.tcmuckensturm.app.start.LocalSitzung
import de.tcmuckensturm.app.start.PasswortTexte
import de.tcmuckensturm.app.ui.tokens.Abstand
import kotlinx.coroutines.launch

@Composable
fun PasswortVergessenBildschirm(zurueck: () -> Unit) {
    val sitzung = LocalSitzung.current
    val scope = rememberCoroutineScope()
    val email = rememberTextFieldState()
    var meldung by rememberSaveable { mutableStateOf<String?>(null) }
    var fehler by rememberSaveable { mutableStateOf<String?>(null) }
    var laeuft by rememberSaveable { mutableStateOf(false) }

    PasswortVergessenInhalt(
        email = email,
        meldung = meldung,
        fehler = fehler,
        laeuft = laeuft,
        zurueck = zurueck,
        absenden = {
            if (!laeuft) {
                meldung = null
                fehler = null
                laeuft = true
                scope.launch {
                    val stoerung = sitzung.passwortLinkAnfordern(email.text.toString())
                    laeuft = false
                    if (stoerung != null) fehler = stoerung else meldung = PasswortTexte.UNTERWEGS
                }
            }
        },
    )
}

@Composable
fun PasswortVergessenInhalt(
    email: TextFieldState,
    meldung: String?,
    fehler: String?,
    laeuft: Boolean,
    zurueck: () -> Unit,
    absenden: () -> Unit,
) {
    AnmeldeSeite(titel = PasswortTexte.VERGESSEN_TITEL, unterzeile = PasswortTexte.VERGESSEN_UNTERZEILE) {
        AnmeldeFeld(
            beschriftung = "E-Mail",
            zustand = email,
            inhaltsTyp = ContentType.EmailAddress,
            tastatur = KeyboardType.Email,
            absenden = ImeAction.Send,
            beimAbsenden = absenden,
        )

        // Die Meldung ist dieselbe, ob es die Adresse gibt oder nicht.
        if (meldung != null) AnmeldeHinweis("$meldung ${PasswortTexte.SPAM}", ok = true)
        if (fehler != null) AnmeldeHinweis(fehler)

        Column(Modifier.padding(top = Abstand.abschnitt), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            GelberKnopf(if (laeuft) "Wird gesendet…" else "Link anfordern", gesperrt = laeuft, aktion = absenden)
            LeiserVerweis("Zurück zur Anmeldung", aktion = zurueck)
        }
    }
}
