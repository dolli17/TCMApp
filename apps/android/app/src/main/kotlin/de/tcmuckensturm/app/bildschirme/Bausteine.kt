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
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.intl.LocaleList
import androidx.compose.ui.text.style.Hyphens
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import de.tcmuckensturm.app.daten.Initialen
import de.tcmuckensturm.app.daten.MeinName
import de.tcmuckensturm.app.navigation.HauptTab
import de.tcmuckensturm.app.navigation.LocalZuTab
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

/**
 * Deutsche Silbentrennung fuer lange Woerter in schmalen Karten
 * ("Mitglieder-versammlung" statt "Mitgliederversammlu|ng"), auch wenn das
 * Telefon auf Englisch steht - die App ist deutsch.
 */
fun TextStyle.mitTrennung(): TextStyle = copy(hyphens = Hyphens.Auto, localeList = LocaleList("de-DE"))

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
 * 34/800, rechts Glocke und Avatar - auf jedem Tab gleich (Home, Plaetze,
 * Verein, Verwaltung; Konto hat nur die Glocke, wie iOS). Der Titel darf
 * zweizeilig werden (U52). `glocke` ist in der App `Glocke()` aus
 * `nachrichten`, in den Bildschirmfotos nur ihr Knopf (ohne Netz).
 */
@Composable
fun GrosserKopf(titel: String, kicker: String? = null, name: MeinName?, glocke: @Composable () -> Unit) {
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
            glocke()
            Avatar(name)
        }
    }
}

/** Initialen auf brand (ohne Namen leer, solange er laedt); fuehrt ins Konto. */
@Composable
fun Avatar(name: MeinName?) {
    val f = TcmTheme.farben
    val zuTab = LocalZuTab.current
    Box(
        Modifier
            .size(44.dp)
            .clip(CircleShape)
            .background(f.brand)
            .tippbar("Konto") { zuTab(HauptTab.KONTO) },
        contentAlignment = Alignment.Center,
    ) {
        GedeckelteSchrift {
            Text(Initialen.von(name), style = TcmSchrift.text(Schrift.gewichtFett, 15.sp), color = f.onBrand)
        }
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
            // Kein TextButton: dessen Mindestbreite zentriert kurze Links wie "Alle" und
            // verschiebt so die rechte Kante gegenüber "Alle Plätze".
            Text(
                link.text,
                style = TcmSchrift.text(Schrift.gewichtHalbfett, 14.sp),
                color = f.blueInk,
                modifier = Modifier
                    .clip(Kapsel)
                    .tippbar(link.label ?: link.text, aktion = link.aktion)
                    .heightIn(min = 48.dp)
                    .wrapContentHeight()
                    .padding(horizontal = 12.dp),
            )
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

// ---- Texte und Meldungen --------------------------------------------------------

/** Leiser Text (stil.leise in muted), etwa unter einem Titel oder als Fussnote im Blatt. */
@Composable
fun Leise(text: String, modifier: Modifier = Modifier, farbe: Color = TcmTheme.farben.muted) {
    Text(text, style = leise.copy(lineHeight = 18.sp), color = farbe, modifier = modifier)
}

/** Eine Meldung im Inhalt (stil.hinweisFehler): rot fuer einen Fehler, gruen fuer Erfolg; TalkBack liest sie vor. */
@Composable
fun Hinweis(text: String, ok: Boolean = false) {
    val f = TcmTheme.farben
    Text(
        text,
        style = TcmSchrift.text(Schrift.gewichtNormal, Schrift.normal),
        color = if (ok) f.greenInk else f.redInk,
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(Radius.feld))
            .background((if (ok) f.green else f.red).copy(alpha = if (TcmTheme.dunkel) 0.16f else 0.12f))
            .padding(12.dp)
            .semantics { liveRegion = LiveRegionMode.Polite },
    )
}

// ---- Knoepfe ----------------------------------------------------------------------

/**
 * Der gelbe Hauptknopf (stil.knopfGold), rot fuer Abmelden, Verdraengen und
 * Absagen. Gross (58 dp, Radius 18) in Anmeldung, Formularen und Blaettern,
 * `kompakt` (52 dp, Radius knopf) in Karten wie in iOS (Veranstaltung,
 * Rueckfragen der Verwaltung).
 *
 * Gesperrt ist neutral statt blassgold (U26). Mit `beiGesperrt` nimmt der
 * gesperrte Knopf das Tippen noch an und fuehrt zum naechsten Schritt; `grund`
 * sagt TalkBack, warum er gesperrt ist.
 */
@Composable
fun Hauptknopf(
    text: String,
    modifier: Modifier = Modifier,
    rot: Boolean = false,
    kompakt: Boolean = false,
    gesperrt: Boolean = false,
    grund: String? = null,
    beiGesperrt: (() -> Unit)? = null,
    aktion: () -> Unit,
) {
    val f = TcmTheme.farben
    val form = RoundedCornerShape(if (kompakt) Radius.knopf else 18.dp)
    val neutral = gesperrt && !rot
    Box(
        modifier
            .fillMaxWidth()
            .heightIn(min = if (kompakt) 52.dp else 58.dp)
            .alpha(if (gesperrt && rot) 0.6f else 1f)
            .clip(form)
            .background(if (neutral) f.surf3 else if (rot) f.red else f.gold)
            .clickable(enabled = !gesperrt || beiGesperrt != null, role = Role.Button) {
                if (gesperrt) beiGesperrt?.invoke() else aktion()
            }
            .semantics { if (gesperrt && grund != null) contentDescription = "$text. $grund" }
            .padding(horizontal = 16.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text,
            style = TcmSchrift.text(Schrift.gewichtExtrafett, if (kompakt) 16.sp else 17.sp),
            color = if (neutral) f.muted else if (rot) f.onBrand else f.onGold,
            textAlign = TextAlign.Center,
        )
    }
}

/** Umrandeter Knopf (LeiserKnopf in iOS), 52 dp; rot fuer Abmelden und Kuendigen. */
@Composable
fun LeiserKnopf(
    text: String,
    modifier: Modifier = Modifier,
    rot: Boolean = false,
    gesperrt: Boolean = false,
    aktion: () -> Unit,
) {
    val f = TcmTheme.farben
    val form = RoundedCornerShape(Radius.knopf)
    Box(
        modifier
            .fillMaxWidth()
            .heightIn(min = 52.dp)
            .alpha(if (gesperrt) 0.5f else 1f)
            .clip(form)
            .border(1.5.dp, if (rot) f.red.copy(alpha = 0.5f) else f.line2, form)
            .clickable(enabled = !gesperrt, role = Role.Button, onClick = aktion)
            .padding(horizontal = 16.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text,
            style = TcmSchrift.text(Schrift.gewichtFett, 16.sp),
            color = if (rot) f.redInk else f.ink,
            textAlign = TextAlign.Center,
        )
    }
}

// ---- Schriftgroesse -------------------------------------------------------------

/** Ob die Systemschrift mindestens `ab` (130 %, 150 % ...) gross ist - dann stapeln Reihen um. */
@Composable
fun grosseSchrift(ab: Float = 1.3f): Boolean = LocalDensity.current.fontScale >= ab

/**
 * Zwei Dinge nebeneinander, gleich breit und gleich hoch; bei grosser Schrift
 * (ab 130 %) untereinander - wie ViewThatFits in iOS (Storno-Knoepfe, Dein
 * Stand). `inhalt` bekommt die Breite fuer jedes Teil.
 */
@Composable
fun NebeneinanderOderUntereinander(abstand: Dp = 10.dp, inhalt: @Composable (Modifier) -> Unit) {
    if (grosseSchrift()) {
        Column(verticalArrangement = Arrangement.spacedBy(abstand)) { inhalt(Modifier.fillMaxWidth()) }
    } else {
        Row(Modifier.height(IntrinsicSize.Max), horizontalArrangement = Arrangement.spacedBy(abstand)) {
            inhalt(Modifier.weight(1f).fillMaxHeight())
        }
    }
}

/**
 * Deckelt die Schriftgroesse fuer Inhalte mit fester Flaeche (Datumskacheln,
 * Initialen, Marken) - wie `dynamicTypeSize(...DynamicTypeSize.xLarge)` in iOS.
 * Der Text daneben waechst weiter mit.
 */
@Composable
fun GedeckelteSchrift(hoechstens: Float = 1.2f, inhalt: @Composable () -> Unit) {
    val d = LocalDensity.current
    CompositionLocalProvider(LocalDensity provides Density(d.density, minOf(d.fontScale, hoechstens)), content = inhalt)
}

// ---- Laden ------------------------------------------------------------------------

/** Was ein Abschnitt braucht, um nach einem Fehler neu zu laden (Home, Konto). */
data class Erneut(val laeuft: Boolean, val aktion: () -> Unit)

/** Ruft `aktion`, wenn die App aus dem Hintergrund zurueckkommt (nicht beim ersten Start). */
@Composable
fun ImVordergrund(aktion: () -> Unit) {
    val besitzer = LocalLifecycleOwner.current
    val aktuell by rememberUpdatedState(aktion)
    DisposableEffect(besitzer) {
        var warWeg = false
        val beobachter = LifecycleEventObserver { _, ereignis ->
            when (ereignis) {
                Lifecycle.Event.ON_STOP -> warWeg = true
                Lifecycle.Event.ON_START -> if (warWeg) {
                    warWeg = false
                    aktuell()
                }
                else -> Unit
            }
        }
        besitzer.lifecycle.addObserver(beobachter)
        onDispose { besitzer.lifecycle.removeObserver(beobachter) }
    }
}

/**
 * Laeuft bis an den Bildschirmrand, obwohl die Spalte um `rand` eingerueckt
 * ist (Wischreihen auf Home, Tagwahl) - wie padding(-rand) in SwiftUI.
 */
fun Modifier.randlos(rand: Dp = Abstand.rand): Modifier = layout { messbar, grenzen ->
    val extra = rand.roundToPx() * 2
    val breite = grenzen.maxWidth + extra
    val platziert = messbar.measure(grenzen.copy(minWidth = breite, maxWidth = breite))
    layout(grenzen.maxWidth, platziert.height) { platziert.place(-extra / 2, 0) }
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

