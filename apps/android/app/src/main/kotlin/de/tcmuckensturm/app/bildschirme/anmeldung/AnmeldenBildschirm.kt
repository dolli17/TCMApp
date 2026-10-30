/*
 * Anmeldung (Entwurf AppLogin, docs/design/clubhaus)
 *
 * Wie apps/mobile/app/anmelden.tsx und AnmeldenBildschirm.swift der iOS-App.
 * Die Felder tragen die Autofill-Typen Benutzername/E-Mail und Passwort,
 * damit Google oder ein Passwortmanager gespeicherte Zugaenge anbietet. Nach
 * dem Anmelden wechselt die Weiche (Sitzung) den Bildschirm - sie kennt das
 * offene Onboarding und "Kein Zugang".
 *
 * "Passwort vergessen" liegt darueber; die Zurueck-Geste fuehrt zurueck.
 */

package de.tcmuckensturm.app.bildschirme.anmeldung

import androidx.activity.compose.BackHandler
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
import de.tcmuckensturm.app.bildschirme.Hauptknopf
import de.tcmuckensturm.app.start.LocalSitzung
import de.tcmuckensturm.app.ui.tokens.Abstand
import kotlinx.coroutines.launch

@Composable
fun AnmeldenBildschirm() {
    val sitzung = LocalSitzung.current
    val scope = rememberCoroutineScope()
    val email = rememberTextFieldState()
    val passwort = rememberTextFieldState()
    var fehler by rememberSaveable { mutableStateOf<String?>(null) }
    var laeuft by rememberSaveable { mutableStateOf(false) }
    var vergessenOffen by rememberSaveable { mutableStateOf(false) }

    if (vergessenOffen) {
        BackHandler { vergessenOffen = false }
        PasswortVergessenBildschirm(zurueck = { vergessenOffen = false })
        return
    }

    AnmeldenInhalt(
        email = email,
        passwort = passwort,
        fehler = fehler,
        laeuft = laeuft,
        antrag = sitzung.umgebung.webLink("/antrag"),
        beimVergessen = { vergessenOffen = true },
        beimAnmelden = {
            if (!laeuft) {
                fehler = null
                laeuft = true
                scope.launch {
                    fehler = sitzung.anmelden(email.text.toString(), passwort.text.toString())
                    laeuft = false
                }
            }
        },
    )
}

/** Ohne Sitzung, damit die Screenshot-Tests ihn zeichnen koennen. */
@Composable
fun AnmeldenInhalt(
    email: TextFieldState,
    passwort: TextFieldState,
    fehler: String?,
    laeuft: Boolean,
    /** Der Mitgliedsantrag im Web; ohne Adresse (lokal) bleibt die Zeile weg. */
    antrag: String?,
    beimVergessen: () -> Unit,
    beimAnmelden: () -> Unit,
) {
    AnmeldeSeite(titel = "Willkommen zurück auf dem Platz.") {
        AnmeldeFeld(
            beschriftung = "E-Mail",
            zustand = email,
            inhaltsTyp = ContentType.Username + ContentType.EmailAddress,
            tastatur = KeyboardType.Email,
        )
        AnmeldeFeld(
            beschriftung = "Passwort",
            zustand = passwort,
            inhaltsTyp = ContentType.Password,
            passwort = true,
            absenden = ImeAction.Go,
            beimAbsenden = beimAnmelden,
        )
        LeiserVerweis("Passwort vergessen?", rechts = true, aktion = beimVergessen)

        // Die Meldung verraet bewusst nicht, ob die Adresse existiert.
        if (fehler != null) AnmeldeHinweis(fehler)

        Column(Modifier.padding(top = Abstand.abschnitt), verticalArrangement = Arrangement.spacedBy(Abstand.l)) {
            Hauptknopf(if (laeuft) "Anmelden…" else "Anmelden", gesperrt = laeuft, aktion = beimAnmelden)
            if (antrag != null) AnmeldeFusszeile("Noch kein Mitglied?", "Antrag stellen", antrag)
        }
    }
}
