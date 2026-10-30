/*
 * Der Rahmen der Anmeldeseiten (Entwurf AppLogin, docs/design/clubhaus)
 *
 * Wie apps/mobile/src/components/AnmeldeSeite.tsx und
 * Bildschirme/Anmeldung/AnmeldeSeite.swift der iOS-App: oben eine Flaeche in
 * brand mit einem Tennisplatz in Perspektive und dem gelben Ball, das weisse
 * Logo, der Titel unten links; darunter das Formular auf dunklem Grund. Immer
 * dunkel, egal welches Erscheinungsbild gewaehlt ist. Die Flaeche reicht bis
 * unter die Statusleiste (Edge-to-Edge).
 *
 * Dazu die Bausteine aller Anmeldeseiten: Eingabefeld (54 hoch), gelber
 * Hauptknopf, leiser Verweis, Hinweis.
 */

package de.tcmuckensturm.app.bildschirme.anmeldung

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicSecureTextField
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.input.TextFieldLineLimits
import androidx.compose.foundation.text.input.TextFieldState
import androidx.compose.foundation.text.input.TextObfuscationMode
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
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
import de.tcmuckensturm.app.R
import de.tcmuckensturm.app.theme.ImmerDunkel
import de.tcmuckensturm.app.theme.TcmSchrift
import de.tcmuckensturm.app.theme.TcmTheme
import de.tcmuckensturm.app.ui.tokens.Abstand
import de.tcmuckensturm.app.ui.tokens.Radius
import de.tcmuckensturm.app.ui.tokens.Schrift
import kotlin.math.max

@Composable
fun AnmeldeSeite(titel: String, unterzeile: String? = null, inhalt: @Composable ColumnScope.() -> Unit) {
    ImmerDunkel {
        Column(
            Modifier
                .fillMaxSize()
                .background(TcmTheme.farben.bg)
                .imePadding()
                .verticalScroll(rememberScrollState()),
        ) {
            Buehne(titel, unterzeile)
            Column(
                Modifier
                    .align(Alignment.CenterHorizontally)
                    .widthIn(max = 420.dp)
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .padding(start = 24.dp, end = 24.dp, top = Abstand.s, bottom = 36.dp),
                verticalArrangement = Arrangement.spacedBy(Abstand.l),
                content = inhalt,
            )
        }
    }
}

/** Die obere Flaeche: Platz, Ball, Logo, Titel. */
@Composable
private fun Buehne(titel: String, unterzeile: String?) {
    val f = TcmTheme.farben
    Box(
        Modifier
            .fillMaxWidth()
            .height(360.dp)
            .clipToBounds()
            .background(f.brand),
    ) {
        Platz()
        Box(
            Modifier
                .align(Alignment.TopEnd)
                .padding(top = 96.dp, end = 54.dp)
                .size(38.dp)
                .background(f.gold, CircleShape),
        )
        Box(
            Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .height(160.dp)
                .background(Brush.verticalGradient(listOf(f.bg.copy(alpha = 0f), f.bg))),
        )
        Image(
            painter = painterResource(R.drawable.logo_weiss),
            contentDescription = "TC Muckensturm",
            alignment = Alignment.CenterStart,
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(top = 60.dp, start = 24.dp)
                .size(width = 126.dp, height = 36.dp),
        )
        Column(
            Modifier
                .align(Alignment.BottomStart)
                .padding(start = 24.dp, end = 24.dp, bottom = 22.dp),
            verticalArrangement = Arrangement.spacedBy(Abstand.s),
        ) {
            Text(
                titel,
                style = TcmSchrift.text(Schrift.gewichtExtrafett, 36.sp, (-0.7).sp).copy(lineHeight = 40.sp),
                color = f.onBrand,
                modifier = Modifier.semantics { heading() },
            )
            if (unterzeile != null) {
                Text(unterzeile, style = TcmSchrift.text(Schrift.gewichtNormal, 15.sp), color = f.ink2)
            }
        }
    }
}

/** Ein Tennisplatz in Perspektive, dezent - dieselben Linien wie das SVG der Expo-App (390 x 360). */
@Composable
private fun BoxScope.Platz() {
    val linie = TcmTheme.farben.onBrand
    Canvas(Modifier.matchParentSize()) {
        // preserveAspectRatio="xMidYMax slice": fuellen, unten und mittig ausrichten.
        val skala = max(size.width / 390f, size.height / 360f)
        val dx = (size.width - 390f * skala) / 2f
        val dy = size.height - 360f * skala
        fun p(x: Float, y: Float) = Offset(dx + x * skala, dy + y * skala)
        val breite = 2.5.dp.toPx()
        val farbe = linie.copy(alpha = 0.22f)
        fun strich(punkte: List<Offset>) = punkte.zipWithNext { a, b -> drawLine(farbe, a, b, breite) }
        strich(listOf(p(40f, 360f), p(130f, 110f), p(260f, 110f), p(350f, 360f)))
        strich(listOf(p(78f, 255f), p(312f, 255f)))
        strich(listOf(p(100f, 195f), p(290f, 195f)))
        strich(listOf(p(60f, 305f), p(330f, 305f)))
        strich(listOf(p(195f, 195f), p(195f, 305f)))
        drawLine(
            linie.copy(alpha = 0.4f),
            p(0f, 110f),
            p(390f, 110f),
            breite,
            pathEffect = PathEffect.dashPathEffect(floatArrayOf(3.dp.toPx(), 5.dp.toPx())),
        )
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
        .padding(start = 16.dp, end = if (passwort) 0.dp else 16.dp)
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
        Text(beschriftung, style = TcmSchrift.text(Schrift.gewichtHalbfett, 13.sp), color = f.ink2)
        Row(
            Modifier
                .fillMaxWidth()
                .heightIn(min = 54.dp)
                .background(f.surf, RoundedCornerShape(Radius.feld))
                .border(1.5.dp, f.rahmen, RoundedCornerShape(Radius.feld)),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (passwort) {
                BasicSecureTextField(
                    state = zustand,
                    modifier = Modifier.weight(1f).then(feldModifier),
                    textStyle = stil,
                    cursorBrush = SolidColor(f.gold),
                    textObfuscationMode = if (sichtbar) TextObfuscationMode.Visible else TextObfuscationMode.RevealLastTyped,
                    keyboardOptions = tasten,
                    onKeyboardAction = beimAbsenden?.let { aktion -> { aktion() } },
                )
                PasswortSchalter(sichtbar, { sichtbar = !sichtbar }, Modifier.padding(end = 6.dp))
            } else {
                BasicTextField(
                    state = zustand,
                    modifier = Modifier.weight(1f).then(feldModifier),
                    textStyle = stil,
                    cursorBrush = SolidColor(f.gold),
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
            style = TcmSchrift.text(Schrift.gewichtFett, 14.sp),
            color = TcmTheme.farben.ink2,
        )
    }
}

/** Der gelbe Hauptknopf, 58 hoch. */
@Composable
fun GelberKnopf(text: String, modifier: Modifier = Modifier, gesperrt: Boolean = false, aktion: () -> Unit) {
    val f = TcmTheme.farben
    val druck = remember { MutableInteractionSource() }
    val gedrueckt by druck.collectIsPressedAsState()
    Box(
        modifier
            .fillMaxWidth()
            .heightIn(min = 58.dp)
            .alpha(if (gesperrt) 0.6f else if (gedrueckt) 0.85f else 1f)
            .background(f.gold, RoundedCornerShape(18.dp))
            .clickable(interactionSource = druck, indication = null, enabled = !gesperrt, role = Role.Button, onClick = aktion),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, style = TcmSchrift.text(Schrift.gewichtExtrafett, 17.sp), color = f.onGold)
    }
}

/** Leiser Verweis in ink2, etwa "Passwort vergessen?" */
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
            Text(text, style = TcmSchrift.text(Schrift.gewichtHalbfett, 14.sp), color = TcmTheme.farben.ink2)
        }
    }
}

/** Hinweis auf dunklem Grund: Fehler in redInk auf roter Toenung, Erfolg in greenInk. */
@Composable
fun AnmeldeHinweis(text: String, ok: Boolean = false) {
    val f = TcmTheme.farben
    Text(
        text,
        style = TcmSchrift.text(Schrift.gewichtNormal, 16.sp),
        color = if (ok) f.greenInk else f.redInk,
        modifier = Modifier
            .fillMaxWidth()
            .background((if (ok) f.green else f.red).copy(alpha = 0.16f), RoundedCornerShape(Radius.feld))
            .padding(12.dp),
    )
}

/** "Noch kein Mitglied? Antrag stellen" - Text in muted, der Verweis in gold, oeffnet den Browser. */
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
            Text(verweis, style = TcmSchrift.text(Schrift.gewichtFett, 14.sp), color = f.gold)
        }
    }
}
