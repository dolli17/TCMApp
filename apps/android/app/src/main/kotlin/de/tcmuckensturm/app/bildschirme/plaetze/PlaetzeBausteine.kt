/*
 * Bausteine des Tabs Plaetze: Farben einer Belegung, Legende, Knoepfe,
 * Segmente, Chips und Felder des Blatts
 *
 * Wie die gleichnamigen Views in PlatzRaster.swift und Buchungsblatt.swift
 * der iOS-App. Ziele mindestens 48 dp hoch (Material, U18).
 */

package de.tcmuckensturm.app.bildschirme.plaetze

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.layout.layout
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.tcmuckensturm.app.theme.TcmSchrift
import de.tcmuckensturm.app.theme.TcmTheme
import de.tcmuckensturm.app.ui.tokens.Palette
import de.tcmuckensturm.app.ui.tokens.Radius
import de.tcmuckensturm.app.ui.tokens.Schrift
import de.tcmuckensturm.kern.TimelineKind
import java.time.Instant
import kotlinx.coroutines.delay

// ---- Zeit ---------------------------------------------------------------------------

/** Die Zeit fuer Plan und Raster; jede volle Minute neu, solange das Modell live ist. */
@Composable
fun rememberJetzt(m: PlaetzeModell): Instant {
    var jetzt by remember { mutableStateOf(m.uhr()) }
    if (m.live) {
        LaunchedEffect(Unit) {
            while (true) {
                jetzt = m.uhr()
                delay(60_000L - jetzt.toEpochMilli() % 60_000L)
            }
        }
    }
    return jetzt
}

/** Laeuft bis an den Bildschirmrand, obwohl der Inhalt um `rand` eingerueckt ist (Tagwahl). */
fun Modifier.randlos(rand: Dp): Modifier = layout { messbar, grenzen ->
    val extra = rand.roundToPx() * 2
    val breite = grenzen.maxWidth + extra
    val platziert = messbar.measure(grenzen.copy(minWidth = breite, maxWidth = breite))
    layout(grenzen.maxWidth, platziert.height) { platziert.place(-extra / 2, 0) }
}

// ---- Belegungsfarben ------------------------------------------------------------------

/**
 * Farben einer Belegung nach der Statustabelle (HANDOFF §2): eigen gold,
 * belegt blau mit Rand, sucht goldSoft gestrichelt, Training schraffiert,
 * gesperrt grau mit Rand.
 */
fun belegungsText(art: TimelineKind, f: Palette): Color = when (art) {
    TimelineKind.EIGEN -> f.onGold
    TimelineKind.BELEGT -> f.blueInk
    TimelineKind.SUCHT -> f.goldInk
    TimelineKind.SERIE -> f.ink2
    TimelineKind.GESPERRT -> f.muted
}

/** Die Flaeche einer Belegung, gezeichnet hinter dem Inhalt. */
fun Modifier.belegungsFlaeche(art: TimelineKind, f: Palette, radius: Dp): Modifier = drawBehind {
    val r = CornerRadius(radius.toPx())
    fun rand(farbe: Color, breite: Float, gestrichelt: Boolean = false) = drawRoundRect(
        farbe,
        topLeft = Offset(breite / 2, breite / 2),
        size = size.copy(width = size.width - breite, height = size.height - breite),
        cornerRadius = r,
        style = Stroke(
            width = breite,
            pathEffect = if (gestrichelt) PathEffect.dashPathEffect(floatArrayOf(4.dp.toPx(), 3.dp.toPx())) else null,
        ),
    )
    when (art) {
        TimelineKind.EIGEN -> drawRoundRect(f.gold, cornerRadius = r)
        TimelineKind.BELEGT -> {
            drawRoundRect(f.blueSoft, cornerRadius = r)
            rand(f.blue, 1.dp.toPx())
        }
        TimelineKind.SUCHT -> {
            drawRoundRect(f.goldSoft, cornerRadius = r)
            rand(f.goldLine, 1.5.dp.toPx(), gestrichelt = true)
        }
        TimelineKind.SERIE -> {
            drawRoundRect(f.surf3, cornerRadius = r)
            // Schraege Linien fuer Serien (Training)
            clipRect {
                val schritt = 6.dp.toPx()
                var x = -size.height
                while (x < size.width) {
                    drawLine(f.ink.copy(alpha = 0.1f), Offset(x, size.height), Offset(x + size.height, 0f), 1.5.dp.toPx())
                    x += schritt
                }
            }
            rand(f.rahmen, 1.dp.toPx())
        }
        TimelineKind.GESPERRT -> {
            drawRoundRect(f.surf3, cornerRadius = r)
            rand(f.rahmen, 1.dp.toPx())
        }
    }
}

/** Gestrichelter Rand fuer leere Plaetze und die Knoepfe "+ Mitglied" / "+ Gast". */
fun Modifier.gestrichelt(farbe: Color, radius: Dp, breite: Dp = 1.5.dp): Modifier = drawBehind {
    val b = breite.toPx()
    drawRoundRect(
        farbe,
        topLeft = Offset(b / 2, b / 2),
        size = size.copy(width = size.width - b, height = size.height - b),
        cornerRadius = CornerRadius(radius.toPx()),
        style = Stroke(width = b, pathEffect = PathEffect.dashPathEffect(floatArrayOf(4.dp.toPx(), 3.dp.toPx()))),
    )
}

/** Eine Legende als umbrechende Zeile; fuer TalkBack ohne Bedeutung, die Bloecke sagen es selbst. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun Legende(eintraege: List<Pair<String, Modifier>>, breite: Dp, hoehe: Dp) {
    val f = TcmTheme.farben
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
        modifier = Modifier.semantics(mergeDescendants = true) { contentDescription = "" },
    ) {
        for ((name, kaestchen) in eintraege) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Box(kaestchen.size(breite, hoehe))
                Text(name, style = TcmSchrift.text(Schrift.gewichtNormal, 12.5.sp), color = f.ink2)
            }
        }
    }
}

// ---- Texte ------------------------------------------------------------------------------

/** Leiser Hinweistext (.leise() in iOS). */
@Composable
fun Leise(text: String, modifier: Modifier = Modifier) {
    Text(text, style = TcmSchrift.text(Schrift.gewichtNormal, Schrift.klein), color = TcmTheme.farben.muted, modifier = modifier)
}

@Composable
fun Feldname(text: String, zusatz: String? = null) {
    val f = TcmTheme.farben
    Text(
        buildAnnotatedString {
            withStyle(SpanStyle(fontWeight = Schrift.gewichtHalbfett, color = f.ink2)) { append(text) }
            if (zusatz != null) {
                withStyle(SpanStyle(fontWeight = Schrift.gewichtMittel, color = f.muted)) { append(" · $zusatz") }
            }
        },
        style = TcmSchrift.text(Schrift.gewichtHalbfett, 13.sp),
        modifier = Modifier.padding(bottom = 8.dp),
    )
}

/** Rueckmeldung der Datenbank, steht ueber dem Hauptknopf; TalkBack liest sie vor. */
@Composable
fun FehlerText(text: String?) {
    if (text == null) return
    Text(
        text,
        style = TcmSchrift.text(Schrift.gewichtMittel, 14.sp),
        color = TcmTheme.farben.redInk,
        modifier = Modifier.fillMaxWidth().semantics { liveRegion = LiveRegionMode.Polite },
    )
}

@Composable
fun Fussnote(text: String) {
    Text(
        text,
        style = TcmSchrift.text(Schrift.gewichtNormal, Schrift.klein),
        color = TcmTheme.farben.muted,
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth(),
    )
}

/** Was zum Buchen noch fehlt - neutral, es ist kein Fehler. */
@Composable
fun Besetzungshinweis(text: String) {
    val f = TcmTheme.farben
    Text(
        text,
        style = TcmSchrift.text(Schrift.gewichtNormal, 14.sp).copy(lineHeight = 19.sp),
        color = f.ink2,
        modifier = Modifier
            .fillMaxWidth()
            .background(f.chip, RoundedCornerShape(14.dp))
            .padding(vertical = 12.dp, horizontal = 14.dp),
    )
}

// ---- Knoepfe ----------------------------------------------------------------------------

/**
 * Gesperrt ist neutral statt blassgold (U26). Mit `beiGesperrt` nimmt der
 * gesperrte Knopf das Tippen noch an und fuehrt zum naechsten Schritt.
 */
@Composable
fun Hauptknopf(
    text: String,
    gesperrt: Boolean = false,
    grund: String? = null,
    beiGesperrt: (() -> Unit)? = null,
    aktion: () -> Unit,
) {
    val f = TcmTheme.farben
    val tippbar = !gesperrt || beiGesperrt != null
    Box(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 58.dp)
            .clip(RoundedCornerShape(18.dp))
            .background(if (gesperrt) f.surf3 else f.gold)
            .clickable(enabled = tippbar, role = Role.Button) { if (gesperrt) beiGesperrt?.invoke() else aktion() }
            .semantics { if (gesperrt && grund != null) contentDescription = "$text. $grund" }
            .padding(horizontal = 16.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text,
            style = TcmSchrift.text(Schrift.gewichtExtrafett, 17.sp),
            color = if (gesperrt) f.muted else f.onGold,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
fun Nebenknopf(
    text: String,
    modifier: Modifier = Modifier,
    gefahr: Boolean = false,
    gesperrt: Boolean = false,
    klein: Boolean = false,
    aktion: () -> Unit,
) {
    val f = TcmTheme.farben
    val form = RoundedCornerShape(if (klein) 24.dp else 16.dp)
    Box(
        modifier
            .then(if (klein) Modifier else Modifier.fillMaxWidth())
            .heightIn(min = if (klein) 48.dp else 52.dp)
            .alpha(if (gesperrt) 0.5f else 1f)
            .clip(form)
            .background(if (gefahr) Color.Transparent else f.surf2)
            .border(1.5.dp, if (gefahr) f.red.copy(alpha = 0.4f) else f.line, form)
            .clickable(enabled = !gesperrt, role = Role.Button, onClick = aktion)
            .padding(horizontal = 16.dp, vertical = 6.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text,
            style = TcmSchrift.text(Schrift.gewichtFett, if (klein) 14.sp else 16.sp),
            color = if (gefahr) f.redInk else f.ink,
            textAlign = TextAlign.Center,
        )
    }
}

/** Runder Knopf mit Symbol (Vortag, Folgetag, Schliessen), 48 dp. */
@Composable
fun Rundknopf(
    beschriftung: String,
    aus: Boolean = false,
    hintergrund: Color = TcmTheme.farben.surf2,
    aktion: () -> Unit,
    symbol: @Composable () -> Unit,
) {
    Box(
        Modifier
            .size(48.dp)
            .alpha(if (aus) 0.4f else 1f)
            .clip(CircleShape)
            .background(hintergrund)
            .clickable(enabled = !aus, role = Role.Button, onClick = aktion)
            .semantics { contentDescription = beschriftung },
        contentAlignment = Alignment.Center,
    ) { symbol() }
}

// ---- Eingaben ---------------------------------------------------------------------------

/** Ein Eingabefeld wie stil.feld: bg, Rahmen, Radius 16. */
@Composable
fun Eingabe(platzhalter: String, bedienName: String, text: String, wechsel: (String) -> Unit, modifier: Modifier = Modifier) {
    val f = TcmTheme.farben
    val stil = TcmSchrift.text(Schrift.gewichtNormal, 16.sp)
    BasicTextField(
        value = text,
        onValueChange = wechsel,
        singleLine = true,
        textStyle = stil.copy(color = f.ink),
        cursorBrush = SolidColor(f.ink),
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 50.dp)
            .background(f.bg, RoundedCornerShape(Radius.feld))
            .border(1.5.dp, f.rahmen, RoundedCornerShape(Radius.feld))
            .semantics { contentDescription = bedienName },
        decorationBox = { feld ->
            Box(Modifier.padding(horizontal = 16.dp, vertical = 14.dp), contentAlignment = Alignment.CenterStart) {
                if (text.isEmpty()) Text(platzhalter, style = stil, color = f.muted)
                feld()
            }
        },
    )
}

/** Eine Wahl aus Segmenten mit erkennbar aktivem Feld; einzelne Werte lassen sich abschalten. */
data class Segment<T>(val wert: T, val label: String, val aus: Boolean = false)

@Composable
fun <T> Segmente(beschriftung: String, optionen: List<Segment<T>>, wert: T, wahl: (T) -> Unit, modifier: Modifier = Modifier) {
    val f = TcmTheme.farben
    val dunkel = TcmTheme.dunkel
    Row(
        modifier
            .fillMaxWidth()
            .background(f.surf2, RoundedCornerShape(15.dp))
            .padding(4.dp)
            .semantics { contentDescription = beschriftung },
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        for (o in optionen) {
            val aktiv = o.wert == wert
            Box(
                Modifier
                    .weight(1f)
                    .heightIn(min = 44.dp)
                    .alpha(if (o.aus) 0.35f else 1f)
                    .clip(RoundedCornerShape(12.dp))
                    .then(
                        if (aktiv) {
                            Modifier
                                .background(f.segAktiv, RoundedCornerShape(12.dp))
                                .then(if (dunkel) Modifier else Modifier.border(0.5.dp, f.line2, RoundedCornerShape(12.dp)))
                        } else {
                            Modifier
                        },
                    )
                    .clickable(enabled = !o.aus, role = Role.RadioButton) { wahl(o.wert) }
                    .semantics { selected = aktiv },
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    o.label,
                    style = TcmSchrift.text(Schrift.gewichtFett, 15.sp).copy(fontFeatureSettings = "tnum"),
                    color = if (aktiv) f.ink else f.ink2,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

/** Chips zum Antippen, einzeln oder mehrfach (Kategorie, Plaetze, Beginn). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun Chipwahl(optionen: List<Pair<String, String>>, gewaehlt: (String) -> Boolean, wahl: (String) -> Unit) {
    val f = TcmTheme.farben
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        for ((wert, label) in optionen) {
            val aktiv = gewaehlt(wert)
            Box(
                Modifier
                    .heightIn(min = 48.dp)
                    .widthIn(min = 48.dp)
                    .clip(CircleShape)
                    .background(if (aktiv) f.gold else f.surf2)
                    .clickable(role = Role.Checkbox) { wahl(wert) }
                    .semantics { selected = aktiv }
                    .padding(horizontal = 14.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    label,
                    style = TcmSchrift.text(Schrift.gewichtHalbfett, 14.5.sp).copy(fontFeatureSettings = "tnum"),
                    color = if (aktiv) f.onGold else f.ink,
                )
            }
        }
    }
}

/** "Mitspieler gesucht" mit Erklaerung - ohne sie raet man, was das bewirkt. */
@Composable
fun GesuchtKarte(an: Boolean, deaktiviert: Boolean = false, wechsel: (Boolean) -> Unit) {
    val f = TcmTheme.farben
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(f.surf2)
            .clickable(enabled = !deaktiviert, role = Role.Switch) { wechsel(!an) }
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text("Mitspieler gesucht", style = TcmSchrift.text(Schrift.gewichtFett, 16.sp), color = f.ink)
            Text(
                "Dein Spiel erscheint unter „Offene Spiele“. Wer mag, trägt sich selbst ein.",
                style = TcmSchrift.text(Schrift.gewichtNormal, 13.sp),
                color = f.muted,
            )
        }
        Spacer(Modifier.width(12.dp))
        Switch(
            checked = an,
            onCheckedChange = null,
            enabled = !deaktiviert,
            colors = SwitchDefaults.colors(
                checkedTrackColor = f.greenInk,
                checkedThumbColor = f.surf,
                uncheckedTrackColor = f.surf3,
                uncheckedThumbColor = f.rahmen,
                uncheckedBorderColor = f.rahmen,
            ),
        )
    }
}

/** Ein Mitspieler als Chip: Initialen im Kreis, Name, optional ein X zum Entfernen. */
@Composable
fun Chip(
    kuerzel: String,
    name: String,
    gelb: Boolean = false,
    istGast: Boolean = false,
    leer: Boolean = false,
    weg: (() -> Unit)? = null,
    wegLabel: String? = null,
) {
    val f = TcmTheme.farben
    Row(
        Modifier
            .heightIn(min = 40.dp)
            .then(if (leer) Modifier.gestrichelt(f.line2, 20.dp) else Modifier.background(f.surf2, CircleShape))
            .padding(start = 4.dp, end = if (weg == null) 14.dp else 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(
            Modifier
                .size(32.dp)
                .background(
                    when {
                        leer -> Color.Transparent
                        gelb -> f.gold
                        istGast -> f.goldSoft
                        else -> f.brand
                    },
                    CircleShape,
                ),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                kuerzel,
                style = TcmSchrift.text(Schrift.gewichtFett, Schrift.kicker),
                color = when {
                    gelb -> f.onGold
                    istGast -> f.goldInk
                    else -> f.onBrand
                },
            )
        }
        Text(
            name,
            style = TcmSchrift.text(Schrift.gewichtHalbfett, 14.5.sp),
            color = if (leer) f.muted else f.ink,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (weg != null) {
            Box(
                Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .clickable(role = Role.Button, onClick = weg)
                    .semantics { contentDescription = wegLabel ?: "Entfernen" },
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.Close, contentDescription = null, tint = f.ink2, modifier = Modifier.size(16.dp))
            }
        }
    }
}

/** Eine Datumskachel "MO / 28", gewaehlt in Gold - auch beim Umsetzen. */
@Composable
fun TagKachel(tag: String, heute: String? = null, aktiv: Boolean, aktion: () -> Unit) {
    val f = TcmTheme.farben
    val k = PlaetzeLogik.kachel(tag, heute)
    Column(
        Modifier
            .size(width = 52.dp, height = 58.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(if (aktiv) f.gold else f.surf2)
            .clickable(role = Role.Tab, onClick = aktion)
            .semantics(mergeDescendants = true) {
                contentDescription = PlaetzeLogik.lesbar(tag)
                selected = aktiv
            },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        val farbe = if (aktiv) f.onGold else f.ink2
        Text(k.wochentag, style = TcmSchrift.display(Schrift.gewichtFett, Schrift.kicker, 0.6.sp), color = farbe)
        Text("${k.tag}", style = TcmSchrift.display(Schrift.gewichtFett, 21.sp), color = farbe)
    }
}

/** Schriftstil der Kopfzeilen in Tabellen ("BEGINN", "FREI"). */
val kopfStil @Composable get() = TcmSchrift.text(Schrift.gewichtFett, 11.sp, 1.1.sp).copy(color = TcmTheme.farben.muted)
