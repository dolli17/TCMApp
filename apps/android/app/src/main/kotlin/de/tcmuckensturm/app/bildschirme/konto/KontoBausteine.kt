/*
 * Bausteine des Konto-Tabs
 *
 * Wie Bildschirme/Konto/KontoBausteine.swift der iOS-App: Nachbauten der
 * Bausteine unten in konto.tsx (Gruppe, Zeile, Eintrag, Verweis, Marke,
 * Statusmarke) und der Formularteile (stil.feld, stil.hinweisFehler,
 * Segmente, BlattKopf). Masse wie dort, Farben und Groessen aus den Tokens.
 *
 * Karte, leiser Text und Fehlerzeile stehen hier fuer das Konto allein;
 * legt eine andere Spur sie gemeinsam unter bildschirme/ ab, ziehen sie dorthin.
 */

package de.tcmuckensturm.app.bildschirme.konto

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.contentType
import androidx.compose.ui.semantics.error
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.tcmuckensturm.app.theme.TcmSchrift
import de.tcmuckensturm.app.theme.TcmTheme
import de.tcmuckensturm.app.ui.tokens.Abstand
import de.tcmuckensturm.app.ui.tokens.Radius
import de.tcmuckensturm.app.ui.tokens.Schrift

// ---- Karte, Schrift, Fehler -------------------------------------------------

/** stil.listenkarte bzw. stil.karte: surf, Linie, kleiner Schatten (im Dunkeln keiner) */
@Composable
fun Modifier.karte(radius: Dp = Radius.karte, innen: Dp = 12.dp): Modifier {
    val f = TcmTheme.farben
    val schatten = TcmTheme.schatten.klein
    val form = RoundedCornerShape(radius)
    return this
        .shadow(schatten.elevation, form, ambientColor = schatten.farbe, spotColor = schatten.farbe)
        .background(f.surf, form)
        .border(1.dp, f.line, form)
        .clip(form)
        .padding(innen)
}

/** stil.leise */
@Composable
fun leiseSchrift() = TcmSchrift.text(Schrift.gewichtNormal, Schrift.klein).copy(color = TcmTheme.farben.muted)

@Composable
fun Leise(text: String, modifier: Modifier = Modifier) {
    Text(text, style = leiseSchrift(), modifier = modifier)
}

/** Ein Ladefehler mit dem Weg zurueck (Fehlerzeile.tsx, U3) */
@Composable
fun Fehlerzeile(text: String, laeuft: Boolean = false, onErneut: (() -> Unit)? = null) {
    val f = TcmTheme.farben
    Column(
        Modifier
            .fillMaxWidth()
            .background(f.red.copy(alpha = if (TcmTheme.dunkel) 0.16f else 0.12f), RoundedCornerShape(Radius.feld))
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(text, style = TcmSchrift.text(Schrift.gewichtNormal, Schrift.normal), color = f.redInk)
        if (onErneut != null) {
            Box(
                Modifier
                    .heightIn(min = 44.dp)
                    .alpha(if (laeuft) 0.6f else 1f)
                    .border(1.5.dp, f.red.copy(alpha = 0.4f), CircleShape)
                    .clip(CircleShape)
                    .clickable(enabled = !laeuft, role = Role.Button, onClick = onErneut)
                    .padding(horizontal = 16.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    if (laeuft) "Wird geladen…" else "Erneut versuchen",
                    style = TcmSchrift.text(Schrift.gewichtFett, 15.sp),
                    color = f.redInk,
                )
            }
        }
    }
}

/** Was ein Abschnitt braucht, um nach einem Fehler neu zu laden. */
data class Erneut(val laeuft: Boolean, val aktion: () -> Unit)

// ---- Gruppen und Zeilen -----------------------------------------------------

/** Abschnittskopf "Abrechnung", "Einstellungen" (stil.abschnitt) */
@Composable
fun KontoAbschnitt(titel: String) {
    Text(
        titel,
        style = TcmSchrift.text(Schrift.gewichtFett, Schrift.titel, (-0.2).sp),
        color = TcmTheme.farben.ink,
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = Abstand.abschnitt - Abstand.m)
            .semantics { heading() },
    )
}

/** Eine Liste in einer Karte; die Zeilen trennt je eine KontoLinie. */
@Composable
fun KontoGruppe(modifier: Modifier = Modifier, inhalt: @Composable ColumnScope.() -> Unit) {
    Column(modifier.fillMaxWidth().karte(innen = 0.dp), content = inhalt)
}

/** Die Trennlinie zwischen zwei Zeilen einer Gruppe. */
@Composable
fun KontoLinie() {
    Box(Modifier.fillMaxWidth().height(1.dp).background(TcmTheme.farben.line))
}

/** Kleines Symbol auf surf2 links in einer Einstellungszeile. */
@Composable
fun Symbolkachel(symbol: ImageVector) {
    val f = TcmTheme.farben
    Box(Modifier.size(32.dp).background(f.surf2, RoundedCornerShape(10.dp)), contentAlignment = Alignment.Center) {
        Icon(symbol, contentDescription = null, tint = f.ink2, modifier = Modifier.size(18.dp))
    }
}

@Composable
private fun Pfeil() {
    Icon(
        Icons.AutoMirrored.Outlined.KeyboardArrowRight,
        contentDescription = null,
        tint = TcmTheme.farben.muted,
        modifier = Modifier.size(20.dp),
    )
}

private val zeilenSchrift @Composable get() = TcmSchrift.text(Schrift.gewichtHalbfett, 15.5.sp)

/** Eine Einstellung, die ein Blatt oeffnet (Eintrag in konto.tsx). */
@Composable
fun KontoEintrag(titel: String, symbol: ImageVector, aktion: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 56.dp)
            .clickable(role = Role.Button, onClick = aktion)
            .padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Symbolkachel(symbol)
        Text(titel, style = zeilenSchrift, color = TcmTheme.farben.ink, modifier = Modifier.weight(1f))
        Pfeil()
    }
}

/** Ein Verweis ins Web oder eine Handlung ("Abmelden" in rot). */
@Composable
fun KontoVerweis(titel: String, rot: Boolean = false, pfeil: Boolean = false, aktion: () -> Unit) {
    val f = TcmTheme.farben
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = if (pfeil) 56.dp else 52.dp)
            .clickable(role = Role.Button, onClick = aktion)
            .padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            titel,
            style = TcmSchrift.text(if (rot) Schrift.gewichtFett else Schrift.gewichtHalbfett, 15.5.sp),
            color = if (rot) f.redInk else f.ink,
            modifier = Modifier.weight(1f),
        )
        if (pfeil) Pfeil()
    }
}

/** Graue Marke im Profilkopf ("Mitglied seit 2019") */
@Composable
fun KontoMarke(text: String) {
    Box(
        Modifier
            .heightIn(min = 26.dp)
            .background(TcmTheme.farben.surf2, CircleShape)
            .padding(horizontal = 10.dp, vertical = 3.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, style = TcmSchrift.text(Schrift.gewichtHalbfett, Schrift.klein), color = TcmTheme.farben.ink2)
    }
}

/** Der Stand einer Forderung - zurueckgebucht in rot, denn da muss das Mitglied etwas tun. */
@Composable
fun StatusmarkeAnsicht(marke: Statusmarke) {
    val f = TcmTheme.farben
    val (grund, schrift) = when (marke.ton) {
        Statusmarke.Ton.GOLD -> f.goldSoft to f.goldInk
        Statusmarke.Ton.ROT -> f.red.copy(alpha = 0.14f) to f.redInk
        Statusmarke.Ton.GRAU -> f.surf2 to f.ink2
    }
    Box(
        Modifier
            .padding(top = 5.dp)
            .heightIn(min = 22.dp)
            .background(grund, CircleShape)
            .padding(horizontal = 8.dp, vertical = 2.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(marke.text, style = TcmSchrift.text(Schrift.gewichtFett, Schrift.klein), color = schrift)
    }
}

/** Betrag rechts in einer Zeile: Semi Condensed, Ziffern gleich breit. */
@Composable
fun Betrag(text: String, groesse: Float = 19f) {
    Text(
        text,
        style = TcmSchrift.display(Schrift.gewichtFett, groesse.sp).copy(fontFeatureSettings = "tnum"),
        color = TcmTheme.farben.ink,
    )
}

/** Hinweis im Formular (stil.hinweisFehler / stil.hinweisErfolg); TalkBack liest ihn vor. */
@Composable
fun KontoHinweis(text: String, ok: Boolean = false) {
    val f = TcmTheme.farben
    Text(
        text,
        style = TcmSchrift.text(Schrift.gewichtNormal, Schrift.normal),
        color = if (ok) f.greenInk else f.redInk,
        modifier = Modifier
            .fillMaxWidth()
            .background(
                (if (ok) f.green else f.red).copy(alpha = if (TcmTheme.dunkel) 0.16f else 0.12f),
                RoundedCornerShape(Radius.feld),
            )
            .padding(12.dp)
            .semantics { liveRegion = LiveRegionMode.Polite },
    )
}

// ---- Formular ---------------------------------------------------------------

/**
 * Eingabefeld mit Beschriftung darueber (stil.feldLabel, stil.feld); rot,
 * wenn es beanstandet ist. `inhaltsTyp` sagt dem Autofill-Dienst, was hier
 * hingehoert.
 */
@Composable
fun KontoFeld(
    label: String,
    wert: String,
    aendern: (String) -> Unit,
    modifier: Modifier = Modifier,
    fehler: String? = null,
    inhaltsTyp: ContentType? = null,
    tastatur: KeyboardType = KeyboardType.Text,
    gross: KeyboardCapitalization = KeyboardCapitalization.Sentences,
    mehrzeilig: Boolean = false,
    gesperrt: Boolean = false,
) {
    val f = TcmTheme.farben
    val form = RoundedCornerShape(Radius.feld)
    Column(modifier, verticalArrangement = Arrangement.spacedBy(7.dp)) {
        Text(
            label,
            style = TcmSchrift.text(Schrift.gewichtHalbfett, Schrift.klein),
            color = if (fehler != null) f.red else f.ink2,
        )
        BasicTextField(
            value = wert,
            onValueChange = aendern,
            enabled = !gesperrt,
            singleLine = !mehrzeilig,
            minLines = if (mehrzeilig) 4 else 1,
            textStyle = TcmSchrift.text(Schrift.gewichtNormal, Schrift.normal).copy(color = f.ink),
            cursorBrush = SolidColor(f.ink),
            keyboardOptions = KeyboardOptions(capitalization = gross, keyboardType = tastatur),
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = if (mehrzeilig) 96.dp else 50.dp)
                .background(f.surf, form)
                .border(1.5.dp, if (fehler != null) f.red else f.rahmen, form)
                .padding(13.dp)
                .semantics {
                    contentDescription = label
                    if (inhaltsTyp != null) contentType = inhaltsTyp
                    if (fehler != null) error(fehler)
                },
        )
        if (fehler != null) KontoHinweis(fehler)
    }
}

/**
 * Auswahl nebeneinander oder untereinander (stil.segment, Segmente.tsx).
 * Fuer TalkBack eine Gruppe von Optionsfeldern.
 */
@Composable
fun <W> KontoSegmente(
    optionen: List<Pair<W, String>>,
    gewaehlt: W?,
    modifier: Modifier = Modifier,
    untereinander: Boolean = false,
    gesperrt: Boolean = false,
    wahl: (W) -> Unit,
) {
    val f = TcmTheme.farben
    val knopfForm = RoundedCornerShape(Radius.knopf - 4.dp)
    val knoepfe: @Composable (Modifier) -> Unit = { breite ->
        for ((wert, label) in optionen) {
            val aktiv = wert == gewaehlt
            Box(
                breite
                    .heightIn(min = 38.dp)
                    .then(
                        if (aktiv) {
                            Modifier.background(f.segAktiv, knopfForm).border(1.5.dp, f.segAktivRand, knopfForm)
                        } else {
                            Modifier
                        },
                    )
                    .clip(knopfForm)
                    .selectable(selected = aktiv, enabled = !gesperrt, role = Role.RadioButton) { wahl(wert) }
                    .padding(horizontal = 6.dp, vertical = 8.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    label,
                    style = TcmSchrift.display(Schrift.gewichtFett, 15.sp),
                    color = if (aktiv) f.ink else f.muted,
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
    val rahmen = modifier
        .fillMaxWidth()
        .alpha(if (gesperrt) 0.6f else 1f)
        .background(f.surf2, RoundedCornerShape(Radius.knopf))
        .padding(4.dp)
        .selectableGroup()
    if (untereinander) {
        Column(rahmen, verticalArrangement = Arrangement.spacedBy(4.dp)) { knoepfe(Modifier.fillMaxWidth()) }
    } else {
        Row(rahmen, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            // Gleich breit wie flex: 1
            knoepfe(Modifier.weight(1f))
        }
    }
}

/** Titel und Schliessen oben in einem Blatt (BlattKopf in Blatt.tsx). */
@Composable
fun BlattKopf(titel: String, zu: () -> Unit) {
    val f = TcmTheme.farben
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(
            titel,
            style = TcmSchrift.text(Schrift.gewichtExtrafett, Schrift.titel),
            color = f.ink,
            modifier = Modifier.weight(1f).semantics { heading() },
        )
        Spacer(Modifier.width(Abstand.s))
        Box(
            Modifier
                .size(44.dp)
                .background(f.surf2, CircleShape)
                .clip(CircleShape)
                .clickable(role = Role.Button, onClick = zu)
                .semantics { contentDescription = "Schließen" },
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Outlined.Close, contentDescription = null, tint = f.ink, modifier = Modifier.size(20.dp))
        }
    }
}

/** Leiser Knopf mit Rand (stil.knopfLeise); rot fuer die Kuendigung. */
@Composable
fun LeiserKnopf(text: String, rot: Boolean = false, gesperrt: Boolean = false, aktion: () -> Unit) {
    val f = TcmTheme.farben
    val form = RoundedCornerShape(Radius.knopf)
    val druck = remember { MutableInteractionSource() }
    val gedrueckt by druck.collectIsPressedAsState()
    Box(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 52.dp)
            .alpha(if (gesperrt) 0.5f else 1f)
            .background(if (gedrueckt) f.ink.copy(alpha = 0.04f) else Color.Transparent, form)
            .border(1.5.dp, if (rot) f.red.copy(alpha = 0.5f) else f.line2, form)
            .clip(form)
            .clickable(interactionSource = druck, indication = null, enabled = !gesperrt, role = Role.Button, onClick = aktion),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, style = TcmSchrift.text(Schrift.gewichtFett, 16.sp), color = if (rot) f.redInk else f.ink)
    }
}

/** Ein Saeulenbau fuer "Bankverbindung & Mandat" - im Grundsatz der Symbole fehlt er (account_balance). */
val BankSymbol: ImageVector by lazy {
    ImageVector.Builder("Bank", 24.dp, 24.dp, 24f, 24f).path(fill = SolidColor(Color.Black)) {
        moveTo(4f, 10f); verticalLineToRelative(7f); horizontalLineToRelative(3f); verticalLineToRelative(-7f); close()
        moveTo(10f, 10f); verticalLineToRelative(7f); horizontalLineToRelative(3f); verticalLineToRelative(-7f); close()
        moveTo(16f, 10f); verticalLineToRelative(7f); horizontalLineToRelative(3f); verticalLineToRelative(-7f); close()
        moveTo(2f, 22f); horizontalLineToRelative(19f); verticalLineToRelative(-3f); horizontalLineTo(2f); close()
        moveTo(11.5f, 1f); lineTo(2f, 6f); verticalLineToRelative(2f); horizontalLineToRelative(19f); verticalLineTo(6f); close()
    }.build()
}
