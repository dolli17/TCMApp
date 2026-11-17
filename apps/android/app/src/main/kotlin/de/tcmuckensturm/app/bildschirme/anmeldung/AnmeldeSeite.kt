/*
 * Der Rahmen der Anmeldeseiten (docs/design/stitch, Entwurf "anmelden")
 *
 * Hell wie der Rest der App (im Dunkelmodus dunkel): Kicker "TC Muckensturm",
 * der Titel, darunter das Formular auf weissem Grund. Keine dunkelblaue
 * Buehne mehr.
 *
 * Dazu die Bausteine aller Anmeldeseiten: Eingabefeld (54 hoch), leiser
 * Verweis, Hinweis. Der Knopf ist der zentrale Hauptknopf.
 */

package de.tcmuckensturm.app.bildschirme.anmeldung

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicSecureTextField
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.input.TextFieldLineLimits
import androidx.compose.foundation.text.input.TextFieldState
import androidx.compose.foundation.text.input.TextObfuscationMode
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.contentType
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.tcmuckensturm.app.bildschirme.Kicker
import de.tcmuckensturm.app.theme.TcmSchrift
import de.tcmuckensturm.app.theme.TcmTheme
import de.tcmuckensturm.app.ui.tokens.Abstand
import de.tcmuckensturm.app.ui.tokens.Radius
import de.tcmuckensturm.app.ui.tokens.Schrift
import kotlin.math.max

@Composable
fun AnmeldeSeite(titel: String, unterzeile: String? = null, inhalt: @Composable ColumnScope.() -> Unit) {
    val f = TcmTheme.farben
    Column(
        Modifier
            .fillMaxSize()
            .background(f.bg)
            .imePadding()
            .verticalScroll(rememberScrollState()),
    ) {
        Column(
            Modifier
                .align(Alignment.CenterHorizontally)
                .widthIn(max = 420.dp)
                .fillMaxWidth()
                .statusBarsPadding()
                .navigationBarsPadding()
                .padding(start = 24.dp, end = 24.dp, top = 56.dp, bottom = 36.dp),
            verticalArrangement = Arrangement.spacedBy(Abstand.l),
        ) {
            Column(Modifier.padding(bottom = Abstand.abschnitt), verticalArrangement = Arrangement.spacedBy(Abstand.s)) {
                Kicker("TC Muckensturm")
                Text(
                    titel,
                    style = TcmSchrift.display(Schrift.gewichtFett, 30.sp, (-0.6).sp).copy(lineHeight = 36.sp),
                    color = f.ink,
                    modifier = Modifier.semantics { heading() },
                )
                if (unterzeile != null) {
                    Text(unterzeile, style = TcmSchrift.text(Schrift.gewichtNormal, 15.sp).copy(lineHeight = 22.sp), color = f.ink2)
                }
            }
            inhalt()
        }
    }
}

/**
 * Eingabefeld der Anmeldeseiten: Beschriftung darueber, 54 hoch, Radius 16.
 * Mit `passwort` verdeckt es die Eingabe und traegt rechts den Schalter "Anzeigen".
 * `inhaltsTyp` sagt dem Autofill-Dienst (Google, Passwortmanager), was hier hingehoert.
 */
@Composable
fun AnmeldeFeld(
    beschriftung: String,
    zustand: TextFieldState,
    inhaltsTyp: ContentType,
    modifier: Modifier = Modifier,
    /** Fuer TalkBack, wenn die Beschriftung allein nicht reicht ("Noch einmal"). */
    bedienName: String = beschriftung,
    passwort: Boolean = false,
    tastatur: KeyboardType = if (passwort) KeyboardType.Password else KeyboardType.Text,
    absenden: ImeAction = ImeAction.Next,
    beimAbsenden: (() -> Unit)? = null,
) {
    val f = TcmTheme.farben
    var sichtbar by rememberSaveable { mutableStateOf(false) }
    val stil = TcmSchrift.text(Schrift.gewichtNormal, 16.sp).copy(color = f.ink)
    val feldModifier = Modifier
        .padding(start = 20.dp, end = if (passwort) 0.dp else 20.dp)
        .semantics {
            contentType = inhaltsTyp
            contentDescription = bedienName
        }
    val tasten = KeyboardOptions(
        capitalization = KeyboardCapitalization.None,
        autoCorrectEnabled = false,
        keyboardType = tastatur,
        imeAction = absenden,
    )

    Column(modifier, verticalArrangement = Arrangement.spacedBy(Abstand.s)) {
        // Das Feld traegt die Beschriftung selbst; TalkBack soll sie nicht zweimal lesen.
        Text(
            beschriftung.uppercase(),
            style = TcmSchrift.kicker,
            color = f.muted,
            modifier = Modifier.clearAndSetSemantics {},
        )
        Row(
            Modifier
                .fillMaxWidth()
                .heightIn(min = 54.dp)
                .background(f.surf2, RoundedCornerShape(Radius.feld))
                .border(1.dp, f.line2, RoundedCornerShape(Radius.feld)),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (passwort) {
                BasicSecureTextField(
                    state = zustand,
                    modifier = Modifier.weight(1f).then(feldModifier),
                    textStyle = stil,
                    cursorBrush = SolidColor(f.blue),
                    textObfuscationMode = if (sichtbar) TextObfuscationMode.Visible else TextObfuscationMode.RevealLastTyped,
                    keyboardOptions = tasten,
                    onKeyboardAction = beimAbsenden?.let { aktion -> { aktion() } },
                )
                PasswortSchalter(sichtbar, { sichtbar = !sichtbar }, Modifier.padding(end = 10.dp))
            } else {
                BasicTextField(
                    state = zustand,
                    modifier = Modifier.weight(1f).then(feldModifier),
                    textStyle = stil,
                    cursorBrush = SolidColor(f.blue),
                    lineLimits = TextFieldLineLimits.SingleLine,
                    keyboardOptions = tasten,
                    onKeyboardAction = beimAbsenden?.let { aktion -> { aktion() } },
                )
            }
        }
    }
}

/** "Anzeigen" am Passwortfeld (U31). Die Beschriftung sagt, was ein Tippen tut. */
@Composable
private fun PasswortSchalter(sichtbar: Boolean, umschalten: () -> Unit, modifier: Modifier = Modifier) {
    Box(
        modifier
            .heightIn(min = 48.dp)
            .widthIn(min = 48.dp)
            .clickable(role = Role.Switch, onClick = umschalten)
            .semantics {
                contentDescription = "Passwort anzeigen"
                stateDescription = if (sichtbar) "Ein" else "Aus"
            }
            .padding(horizontal = 10.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            if (sichtbar) "Verbergen" else "Anzeigen",
            style = TcmSchrift.display(Schrift.gewichtHalbfett, 14.sp),
            color = TcmTheme.farben.blueInk,
        )
    }
}

/** Leiser Verweis in Blau, etwa "Passwort vergessen?" */
@Composable
fun LeiserVerweis(text: String, rechts: Boolean = false, aktion: () -> Unit) {
    Box(Modifier.fillMaxWidth(), contentAlignment = if (rechts) Alignment.CenterEnd else Alignment.Center) {
        Box(
            Modifier
                .heightIn(min = 48.dp)
                .clickable(role = Role.Button, onClick = aktion)
                .padding(horizontal = 4.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(text, style = TcmSchrift.display(Schrift.gewichtHalbfett, 15.sp), color = TcmTheme.farben.blueInk)
        }
    }
}

/** Hinweis: Fehler in redInk auf roter Toenung, Erfolg in greenInk. */
@Composable
fun AnmeldeHinweis(text: String, ok: Boolean = false) {
    val f = TcmTheme.farben
    Text(
        text,
        style = TcmSchrift.text(Schrift.gewichtNormal, 16.sp),
        color = if (ok) f.greenInk else f.redInk,
        modifier = Modifier
            .fillMaxWidth()
            .background((if (ok) f.green else f.red).copy(alpha = if (TcmTheme.dunkel) 0.16f else 0.12f), RoundedCornerShape(Radius.feld))
            .padding(12.dp),
    )
}

/** "Noch kein Mitglied? Antrag stellen" - Text in muted, der Verweis in Blau, oeffnet den Browser. */
@Composable
fun AnmeldeFusszeile(text: String, verweis: String, ziel: String) {
    val f = TcmTheme.farben
    val links = LocalUriHandler.current
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text, style = TcmSchrift.text(Schrift.gewichtNormal, 14.sp), color = f.muted)
        Box(
            Modifier
                .heightIn(min = 48.dp)
                .clickable(role = Role.Button) { links.openUri(ziel) },
            contentAlignment = Alignment.Center,
        ) {
            Text(verweis, style = TcmSchrift.display(Schrift.gewichtHalbfett, 14.sp), color = f.blueInk)
        }
    }
}
