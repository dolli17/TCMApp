/*
 * Bausteine der Bildschirme nach der Anmeldung
 *
 * Nachbauten der Expo-Komponenten (apps/mobile/src/components) wie
 * Bausteine.swift der iOS-App: grosser Kopf, Abschnittskopf, Leerzustand,
 * Fehlerzeile mit "Erneut versuchen", Karte, Kicker und Zeitleiste. Masse und
 * Texte wie dort, Farben und Groessen aus den Tokens.
 */

package de.tcmuckensturm.app.bildschirme

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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material3.Icon
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
import androidx.compose.ui.graphics.vector.ImageVector
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

/** Karte nach docs/design/stitch: surf mit feiner Linie, ohne Schatten. `gross` bleibt aus alten Aufrufen. */
@Composable
fun Modifier.karte(radius: Dp = Radius.karte, padding: Dp = 12.dp, @Suppress("UNUSED_PARAMETER") gross: Boolean = false): Modifier {
    val f = TcmTheme.farben
    val form = RoundedCornerShape(radius)
    return this
        .clip(form)
        .background(f.surf)
        .border(1.dp, f.line, form)
        .padding(padding)
}

/** Kicker: Space Grotesk 700, gross geschrieben, gesperrt */
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
 * Der grosse Titel-Kopf: Kicker "TC Muckensturm", darunter der Titel, rechts
 * die Glocke - auf jedem Tab gleich (docs/design/stitch). Der Titel darf
 * zweizeilig werden (U52). `glocke` ist in der App `Glocke()` aus
 * `nachrichten`, in den Bildschirmfotos nur ihr Knopf (ohne Netz). Die
 * Initialen neben der Glocke sind entfallen: ins Konto fuehrt der Tab.
 */
@Composable
fun GrosserKopf(
    titel: String,
    kicker: String? = "TC Muckensturm",
    @Suppress("UNUSED_PARAMETER") name: MeinName? = null,
    glocke: @Composable () -> Unit,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(top = 16.dp, bottom = Abstand.l),
        verticalAlignment = Alignment.Bottom,
        horizontalArrangement = Arrangement.spacedBy(Abstand.m),
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            if (kicker != null) Kicker(kicker)
            Text(
                titel,
                style = TcmSchrift.display(Schrift.gewichtFett, Schrift.seitentitel, Schrift.laufweiteTitel)
                    .copy(lineHeight = 32.sp),
                color = TcmTheme.farben.ink,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.semantics { heading() },
            )
        }
        glocke()
    }
}

/** Initialen auf hellblau (ohne Namen leer, solange er laedt); fuehrt ins Konto. */
@Composable
fun Avatar(name: MeinName?) {
    val f = TcmTheme.farben
    val zuTab = LocalZuTab.current
    Box(
        Modifier
            .size(44.dp)
            .clip(CircleShape)
            .background(f.blueSoft)
            .tippbar("Konto") { zuTab(HauptTab.KONTO) },
        contentAlignment = Alignment.Center,
    ) {
        GedeckelteSchrift {
            Text(Initialen.von(name), style = TcmSchrift.display(Schrift.gewichtFett, 15.sp), color = f.blueInk)
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
            style = TcmSchrift.display(Schrift.gewichtFett, Schrift.titel, (-0.2).sp),
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
            Text(titel, style = TcmSchrift.display(Schrift.gewichtFett, 20.sp), color = f.ink)
        }
        Text(text, style = leise.copy(lineHeight = 19.sp), color = f.muted)
        if (handlung != null) {
            LeiserKnopf(handlung.text, Modifier.padding(top = 10.dp), klein = true, aktion = handlung.aktion)
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
            LeiserKnopf(if (laeuft) "Wird geladen…" else "Erneut versuchen", rot = true, klein = true, gesperrt = laeuft, aktion = erneut)
        }
    }
}

/**
 * Nichts geladen und nichts zu zeigen (Entwurf "verein-fehlerzustand"): mittig
 * ein Symbol im Kreis, die Meldung und "Erneut versuchen" als leiser Knopf.
 * Steht schon Inhalt da, genuegt die Fehlerzeile darueber.
 */
@Composable
fun Fehlerzustand(text: String, laeuft: Boolean = false, modifier: Modifier = Modifier, erneut: (() -> Unit)? = null) {
    val f = TcmTheme.farben
    Column(
        modifier.fillMaxWidth().padding(top = 72.dp, bottom = 40.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(Modifier.size(56.dp).background(f.surf2, CircleShape), contentAlignment = Alignment.Center) {
            Icon(Icons.Outlined.Info, contentDescription = null, tint = f.ink2, modifier = Modifier.size(26.dp))
        }
        Text(
            text,
            style = TcmSchrift.display(Schrift.gewichtHalbfett, Schrift.titel),
            color = f.ink,
            textAlign = TextAlign.Center,
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
        )
        if (erneut != null) {
            LeiserKnopf(if (laeuft) "Wird geladen…" else "Erneut versuchen", breit = false, gesperrt = laeuft, aktion = erneut)
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
 * Die Stufen der Knoepfe (docs/design/stitch, im Web .knopf):
 * HAUPT kraeftiges Blau mit weisser Schrift - die eine Hauptaktion je Screen;
 * ZWEIT hellblau mit blauer Schrift; LEISE weiss mit Linie; GEFAHR rot
 * gefuellt, nur als Bestaetigung neben einem leisen "Doch nicht";
 * GEFAHR_LEISE roter Text mit roter Linie.
 */
enum class Knopfstufe { HAUPT, ZWEIT, LEISE, GEFAHR, GEFAHR_LEISE }

/** Gleiche Hoehen auf allen Screens: 52, klein 40, gross 56. */
enum class Knopfgroesse(val hoehe: Dp, val schrift: Int, val rand: Dp) {
    KLEIN(40.dp, 14, 14.dp),
    NORMAL(52.dp, 16, 20.dp),
    GROSS(56.dp, 16, 20.dp),
}

/**
 * Der eine Knopf der App: Pille, Space Grotesk 600. Alle anderen Knoepfe
 * (Hauptknopf, Zweitknopf, LeiserKnopf) sind Kurzformen davon.
 *
 * Gesperrt ist neutral statt blass (U26). Mit `beiGesperrt` nimmt der
 * gesperrte Knopf das Tippen noch an und fuehrt zum naechsten Schritt; `grund`
 * sagt TalkBack, warum er gesperrt ist.
 */
@Composable
fun Knopf(
    text: String,
    modifier: Modifier = Modifier,
    stufe: Knopfstufe = Knopfstufe.ZWEIT,
    groesse: Knopfgroesse = Knopfgroesse.NORMAL,
    /** Volle Breite (im Blatt, in Formularen); sonst so breit wie der Text. */
    breit: Boolean = true,
    symbol: ImageVector? = null,
    /** Schmaler Rand und 15 sp, wenn zwei Knoepfe mit Symbol nebeneinander stehen (Startseite). */
    eng: Boolean = false,
    gesperrt: Boolean = false,
    grund: String? = null,
    beschreibung: String? = null,
    beiGesperrt: (() -> Unit)? = null,
    aktion: () -> Unit,
) {
    val f = TcmTheme.farben
    val gefuellt = stufe == Knopfstufe.HAUPT || stufe == Knopfstufe.GEFAHR
    val neutral = gesperrt && gefuellt
    val flaeche = when {
        neutral -> f.surf3
        stufe == Knopfstufe.HAUPT -> f.blue
        stufe == Knopfstufe.ZWEIT -> f.blueSoft
        stufe == Knopfstufe.LEISE -> f.surf
        stufe == Knopfstufe.GEFAHR -> f.red
        else -> Color.Transparent
    }
    val tinte = when {
        neutral -> f.muted
        gefuellt -> f.onBrand
        stufe == Knopfstufe.ZWEIT -> f.blueInk
        stufe == Knopfstufe.LEISE -> f.ink
        else -> f.redInk
    }
    val linie = when {
        gefuellt -> null
        stufe == Knopfstufe.ZWEIT -> f.blue.copy(alpha = 0.22f)
        stufe == Knopfstufe.LEISE -> f.line2
        else -> f.red.copy(alpha = 0.4f)
    }
    Row(
        modifier
            .then(if (breit) Modifier.fillMaxWidth() else Modifier)
            .heightIn(min = groesse.hoehe)
            .alpha(if (gesperrt && !gefuellt) 0.5f else 1f)
            .clip(Kapsel)
            .background(flaeche)
            .then(if (linie != null) Modifier.border(1.dp, linie, Kapsel) else Modifier)
            .clickable(enabled = !gesperrt || beiGesperrt != null, role = Role.Button) {
                if (gesperrt) beiGesperrt?.invoke() else aktion()
            }
            .semantics {
                if (gesperrt && grund != null) {
                    contentDescription = "${beschreibung ?: text}. $grund"
                } else if (beschreibung != null) {
                    contentDescription = beschreibung
                }
            }
            .padding(horizontal = if (eng) 10.dp else groesse.rand, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(if (eng) 6.dp else 8.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (symbol != null) Icon(symbol, contentDescription = null, tint = tinte, modifier = Modifier.size(20.dp))
        Text(
            text,
            style = TcmSchrift.display(Schrift.gewichtHalbfett, if (eng) 15.sp else groesse.schrift.sp),
            color = tinte,
            textAlign = TextAlign.Center,
        )
    }
}

/**
 * Die Hauptaktion: kraeftiges Blau, genau einmal je Screen. `rot` ist die
 * gefuellte rote Bestaetigung (Abmelden, Verdraengen, "Wirklich stornieren").
 * `kompakt` bleibt aus alten Aufrufen und aendert nichts mehr: alle sind 52 hoch.
 */
@Composable
fun Hauptknopf(
    text: String,
    modifier: Modifier = Modifier,
    rot: Boolean = false,
    @Suppress("UNUSED_PARAMETER") kompakt: Boolean = false,
    gesperrt: Boolean = false,
    grund: String? = null,
    beiGesperrt: (() -> Unit)? = null,
    aktion: () -> Unit,
) = Knopf(
    text, modifier, if (rot) Knopfstufe.GEFAHR else Knopfstufe.HAUPT,
    gesperrt = gesperrt, grund = grund, beiGesperrt = beiGesperrt, aktion = aktion,
)

/** Zweitaktion: hellblau mit blauer Schrift ("Getränk eintragen", "Mitspielen"). */
@Composable
fun Zweitknopf(
    text: String,
    modifier: Modifier = Modifier,
    klein: Boolean = false,
    breit: Boolean = !klein,
    gesperrt: Boolean = false,
    beschreibung: String? = null,
    aktion: () -> Unit,
) = Knopf(
    text, modifier, Knopfstufe.ZWEIT, if (klein) Knopfgroesse.KLEIN else Knopfgroesse.NORMAL,
    breit = breit, gesperrt = gesperrt, beschreibung = beschreibung, aktion = aktion,
)

/** Neutral: weiss mit Linie ("Doch nicht"); `rot` fuer Abmelden, Stornieren, Kuendigen als roter Text. */
@Composable
fun LeiserKnopf(
    text: String,
    modifier: Modifier = Modifier,
    rot: Boolean = false,
    klein: Boolean = false,
    breit: Boolean = !klein,
    gesperrt: Boolean = false,
    aktion: () -> Unit,
) = Knopf(
    text, modifier, if (rot) Knopfstufe.GEFAHR_LEISE else Knopfstufe.LEISE,
    if (klein) Knopfgroesse.KLEIN else Knopfgroesse.NORMAL,
    breit = breit, gesperrt = gesperrt, aktion = aktion,
)

/**
 * Gelb heisst "deins": der eigene Termin, "Du bist dabei", "Dein Spiel"
 * (.dein-marker im Web). Nie ein Knopf, nie eine Auswahl.
 */
@Composable
fun DeinMarker(text: String, modifier: Modifier = Modifier) {
    val f = TcmTheme.farben
    Box(
        modifier
            .heightIn(min = 24.dp)
            .clip(Kapsel)
            .background(f.gold)
            .padding(horizontal = 10.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, style = TcmSchrift.display(Schrift.gewichtHalbfett, 12.5.sp), color = f.onGold, maxLines = 1)
    }
}

/** Kleine Marke (.marke-klein): hellblau fuer Zaehler, Spielform und Status, sonst neutral. */
@Composable
fun MarkeKlein(text: String, modifier: Modifier = Modifier, blau: Boolean = true) {
    val f = TcmTheme.farben
    Box(
        modifier
            .clip(Kapsel)
            .background(if (blau) f.blueSoft else f.chip)
            .padding(horizontal = 8.dp, vertical = 3.dp),
    ) {
        Text(text, style = TcmSchrift.display(Schrift.gewichtHalbfett, 12.sp), color = if (blau) f.blueInk else f.ink2, maxLines = 1)
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
 * Buchung gelb, Mitspieler gesucht hellblau mit gestrichelter Kante, Serie
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
                        drawRoundRect(f.blueSoft, ort, groesse, rund)
                        drawRoundRect(
                            f.blue, ort, groesse, rund,
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

