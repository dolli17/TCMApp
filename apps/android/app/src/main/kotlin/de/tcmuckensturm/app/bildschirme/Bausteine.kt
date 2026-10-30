/*
 * Bausteine der Bildschirme nach der Anmeldung
 *
 * Nachbauten der Expo-Komponenten (apps/mobile/src/components) wie
 * Bausteine.swift der iOS-App: grosser Kopf, Abschnittskopf, Leerzustand,
 * Fehlerzeile mit "Erneut versuchen", Karte, Kicker und Zeitleiste. Masse und
 * Texte wie dort, Farben und Groessen aus den Tokens.
 */

package de.tcmuckensturm.app.bildschirme

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.tcmuckensturm.app.theme.TcmSchrift
import de.tcmuckensturm.app.theme.TcmTheme
import de.tcmuckensturm.app.ui.tokens.Abstand
import de.tcmuckensturm.app.ui.tokens.Radius
import de.tcmuckensturm.app.ui.tokens.Schrift
import de.tcmuckensturm.kern.TimelineKind
import de.tcmuckensturm.kern.TimelineSegment

// ---- Karte und Schrift --------------------------------------------------------

/** stil.listenkarte bzw. stil.karte: surf, Linie, kleiner Schatten (im Dunkeln keiner) */
@Composable
fun Modifier.karte(radius: Dp = Radius.karte, padding: Dp = 12.dp, gross: Boolean = false): Modifier {
    val f = TcmTheme.farben
    val stufen = TcmTheme.schatten
    val schatten = if (gross) stufen.normal else stufen.klein
    val form = RoundedCornerShape(radius)
    return this
        .shadow(schatten.elevation, form, ambientColor = schatten.farbe, spotColor = schatten.farbe)
        .clip(form)
        .background(f.surf)
        .border(1.dp, f.line, form)
        .padding(padding)
}

/** stil.kicker: Barlow Semi Condensed 700, gross geschrieben, gesperrt */
@Composable
fun Kicker(text: String, modifier: Modifier = Modifier, farbe: Color = TcmTheme.farben.muted) {
    Text(text.uppercase(), style = TcmSchrift.kicker, color = farbe, modifier = modifier)
}

/** stil.leise */
val leise: TextStyle get() = TcmSchrift.text(Schrift.gewichtNormal, Schrift.klein)

/** Ein Knopf ohne Material-Rahmen, mindestens 48 dp hoch (Android-Ziel). */
fun Modifier.tippbar(beschreibung: String? = null, rolle: Role = Role.Button, aktion: () -> Unit): Modifier =
    this
        .clickable(role = rolle, onClick = aktion)
        .then(
            if (beschreibung != null) {
                Modifier.clearAndSetSemantics {
                    contentDescription = beschreibung
                    role = rolle
                }
            } else {
                Modifier
            },
        )

// ---- Kopf ---------------------------------------------------------------------

/**
 * Der grosse Titel-Kopf (GrosserKopf.tsx): optional ein Kicker, Titel in
 * 34/800, rechts Glocke und Avatar. Der Titel darf zweizeilig werden (U52).
 */
@Composable
fun GrosserKopf(titel: String, kicker: String? = null, rechts: @Composable () -> Unit = {}) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(top = 16.dp, bottom = Abstand.m),
        verticalAlignment = Alignment.Bottom,
        horizontalArrangement = Arrangement.spacedBy(Abstand.m),
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            if (kicker != null) Kicker(kicker)
            Text(
                titel,
                style = TcmSchrift.text(Schrift.gewichtExtrafett, Schrift.seitentitel, Schrift.laufweiteTitel)
                    .copy(lineHeight = 38.sp),
                color = TcmTheme.farben.ink,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.semantics { heading() },
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
            rechts()
        }
    }
}

/** Initialen auf brand; fuehrt ins Konto. */
@Composable
fun Avatar(initialen: String, aktion: () -> Unit) {
    val f = TcmTheme.farben
    Box(
        Modifier
            .size(44.dp)
            .clip(CircleShape)
            .background(f.brand)
            .tippbar("Konto", aktion = aktion),
        contentAlignment = Alignment.Center,
    ) {
        Text(initialen, style = TcmSchrift.text(Schrift.gewichtFett, 15.sp), color = f.onBrand)
    }
}

/** Ein Link rechts in der Kopfzeile; `label` sagt dem Screenreader, was gemeint ist (U6). */
data class KopfLink(val text: String, val label: String? = null, val aktion: () -> Unit)

/** Abschnittskopf mit optionalem Link rechts ("Alle") */
@Composable
fun Kopfzeile(titel: String, link: KopfLink? = null) {
    val f = TcmTheme.farben
    Row(
        Modifier
            .fillMaxWidth()
            .padding(top = Abstand.abschnitt - Abstand.m - 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            titel,
            style = TcmSchrift.text(Schrift.gewichtFett, Schrift.titel, (-0.2).sp),
            color = f.ink,
            modifier = Modifier
                .weight(1f)
                .semantics { heading() },
        )
        if (link != null) {
            TextButton(
                onClick = link.aktion,
                modifier = Modifier.semantics(mergeDescendants = true) {
                    contentDescription = link.label ?: link.text
                },
            ) {
                Text(link.text, style = TcmSchrift.text(Schrift.gewichtHalbfett, 14.sp), color = f.blueInk)
            }
        }
    }
}

// ---- Leer und Fehler ----------------------------------------------------------

/** Eine Handlung unter einem Text (Leerzustand). */
data class Handlung(val text: String, val aktion: () -> Unit)

/** Wenn eine Liste leer ist (Leerzustand.tsx, U27) */
@Composable
fun Leerzustand(text: String, titel: String? = null, handlung: Handlung? = null) {
    val f = TcmTheme.farben
    Column(
        Modifier
            .fillMaxWidth()
            .karte(
                radius = if (titel != null) Radius.karteGross else Radius.karte,
                padding = if (titel != null) 20.dp else 16.dp,
                gross = true,
            ),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        if (titel != null) {
            Text(titel, style = TcmSchrift.text(Schrift.gewichtFett, 18.sp), color = f.ink)
        }
        Text(text, style = leise.copy(lineHeight = 19.sp), color = f.muted)
        if (handlung != null) {
            OutlinedButton(
                onClick = handlung.aktion,
                shape = RoundedCornerShape(Radius.knopf),
                border = BorderStroke(1.5.dp, f.line2),
                modifier = Modifier.padding(top = 10.dp),
            ) {
                Text(handlung.text, style = TcmSchrift.display(Schrift.gewichtFett, Schrift.normal), color = f.ink)
            }
        }
    }
}

/** Ein Ladefehler mit dem Weg zurueck (Fehlerzeile.tsx, U3) */
@Composable
fun Fehlerzeile(text: String, laeuft: Boolean = false, erneut: (() -> Unit)? = null) {
    val f = TcmTheme.farben
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(Radius.feld))
            .background(f.red.copy(alpha = if (TcmTheme.dunkel) 0.16f else 0.12f))
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(text, style = TcmSchrift.text(Schrift.gewichtNormal, Schrift.normal), color = f.redInk)
        if (erneut != null) {
            OutlinedButton(
                onClick = erneut,
                enabled = !laeuft,
                border = BorderStroke(1.5.dp, f.red.copy(alpha = if (laeuft) 0.24f else 0.4f)),
            ) {
                Text(
                    if (laeuft) "Wird geladen…" else "Erneut versuchen",
                    style = TcmSchrift.text(Schrift.gewichtFett, 15.sp),
                    color = f.redInk.copy(alpha = if (laeuft) 0.6f else 1f),
                )
            }
        }
    }
}

// ---- Zeitleiste ---------------------------------------------------------------

/**
 * Die Zeitleiste eines Platzes (MiniZeitleiste.tsx): belegt blau, eigene
 * Buchung gelb, Mitspieler gesucht gelblich mit gestrichelter Kante, Serie
 * schraffiert, Sperrung flach in surf3. Dazu die senkrechte Marke fuer jetzt.
 * Schmuck; was die Leiste zeigt, steht daneben als Text.
 */
@Composable
fun MiniZeitleiste(segmente: List<TimelineSegment>, markierung: Double? = null, hoehe: Dp = 8.dp) {
    val f = TcmTheme.farben
    Canvas(
        Modifier
            .fillMaxWidth()
            .height(hoehe)
            .clearAndSetSemantics {},
    ) {
        val h = size.height
        val w = size.width
        val rund = CornerRadius(h / 2, h / 2)
        val leiste = Path().apply {
            addRoundRect(RoundRect(0f, 0f, w, h, rund))
        }
        clipPath(leiste) {
            drawRect(f.surf2)
            for (s in segmente) {
                val x = (w * s.left / 100).toFloat()
                val breite = maxOf(0f, (w * s.width / 100).toFloat())
                val ort = Offset(x, 0f)
                val groesse = Size(breite, h)
                when (s.art) {
                    TimelineKind.BELEGT -> drawRoundRect(f.blue, ort, groesse, rund)
                    TimelineKind.EIGEN -> drawRoundRect(f.gold, ort, groesse, rund)
                    TimelineKind.SUCHT -> {
                        drawRoundRect(f.goldSoft, ort, groesse, rund)
                        drawRoundRect(
                            f.goldLine, ort, groesse, rund,
                            style = Stroke(1.5.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(3.dp.toPx(), 2.dp.toPx()))),
                        )
                    }
                    TimelineKind.GESPERRT -> drawRoundRect(f.surf3, ort, groesse, rund)
                    TimelineKind.SERIE -> {
                        drawRoundRect(f.surf3, ort, groesse, rund)
                        // Schraege Linien fuer Serien (Training)
                        val segment = Path().apply {
                            addRoundRect(RoundRect(x, 0f, x + breite, h, rund))
                        }
                        clipPath(segment) {
                            var sx = x - h
                            while (sx < x + breite) {
                                drawLine(f.rahmen.copy(alpha = 0.6f), Offset(sx, h), Offset(sx + h, 0f), 1.5.dp.toPx())
                                sx += 5.dp.toPx()
                            }
                        }
                    }
                }
            }
        }
        if (markierung != null) {
            val mx = minOf(w - 2.dp.toPx(), (w * markierung / 100).toFloat())
            drawRoundRect(f.ink, Offset(mx, 0f), Size(2.dp.toPx(), h), CornerRadius(1.dp.toPx()))
        }
    }
}

/** Eine Kapsel als Form (Knoepfe, Marken). */
val Kapsel: Shape = RoundedCornerShape(50)

