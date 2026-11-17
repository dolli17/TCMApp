/*
 * Der Belegungsplan (docs/design/stitch, Entwurf "plaetze-belegungsplan")
 *
 * Die einzige Uebersicht der Plaetze: oben die Plaetze als Spalten, links die
 * Uhrzeiten von Oeffnung bis Schluss, 60 dp je Stunde. Frei ist weiss mit
 * feiner Linie, belegt grau, das eigene Spiel gelb ("Du"), ein Spiel, das
 * Mitspieler sucht, hellblau mit "+", Training schraffiert. Eine freie
 * Flaeche antippen waehlt Platz und Beginn aus (hellblau); gebucht wird erst
 * ueber die Leiste unten und das Blatt. Was frei ist, rechnet der Kern
 * (freeGaps), die Beschriftung ebenfalls (occupancyLabel).
 */

package de.tcmuckensturm.app.bildschirme.plaetze

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import de.tcmuckensturm.app.daten.AktiverPlatz
import de.tcmuckensturm.app.daten.TagesBelegung
import de.tcmuckensturm.app.theme.TcmSchrift
import de.tcmuckensturm.app.theme.TcmTheme
import de.tcmuckensturm.app.ui.tokens.Radius
import de.tcmuckensturm.app.ui.tokens.Schrift
import de.tcmuckensturm.kern.FreeGap
import de.tcmuckensturm.kern.Platzplan
import de.tcmuckensturm.kern.TimelineKind
import de.tcmuckensturm.kern.Zeit
import java.time.Instant
import kotlin.math.ceil
import kotlin.math.floor

private object Mass {
    /** Eine halbe Stunde ist so 30 dp hoch und eine Spalte bei acht Plaetzen rund 40 dp breit. */
    val stunde = 60.dp
    val kopf = 40.dp
    val zeitSpalte = 46.dp
    val abstand = 2.dp
    val ecke = 6.dp

    /** Ab dieser Spaltenbreite passt der Name des Buchers in den Block. */
    val breiteSpalte = 72.dp

    fun px(minuten: Int): Dp = stunde * (minuten / 60f)
}

@Composable
fun PlatzRaster(m: PlaetzeModell) {
    val f = TcmTheme.farben
    // Jede Minute neu: rote Linie und freie Flaechen ruecken mit der Uhr.
    val jetzt = rememberJetzt(m)
    val jetztMin = if (m.datum == Zeit.berlinDay(jetzt)) Zeit.localMinutes(jetzt) else null
    val form = RoundedCornerShape(Radius.karte)
    if (m.plaetze.isEmpty()) return
    BoxWithConstraints(
        Modifier
            .fillMaxWidth()
            .clip(form)
            .background(f.surf)
            .border(1.dp, f.line, form),
    ) {
        val breit = (maxWidth - Mass.zeitSpalte) / m.plaetze.size >= Mass.breiteSpalte
        Column {
            Kopfzeile(m.plaetze)
            Box(Modifier.fillMaxWidth().height(1.dp).background(f.line))
            Tag(m, jetzt, jetztMin, breit)
        }
    }
}

/** Die Plaetze als Spaltenkoepfe: nur die Nummer, der Name steht fuer TalkBack dabei. */
@Composable
private fun Kopfzeile(plaetze: List<AktiverPlatz>) {
    val f = TcmTheme.farben
    // Die Spalten sind schmal: hier waechst die Schrift nicht mit.
    val dichte = LocalDensity.current
    Row(Modifier.fillMaxWidth().height(Mass.kopf).background(f.surf2)) {
        Box(Modifier.width(Mass.zeitSpalte))
        for (p in plaetze) {
            Box(
                Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .semantics(mergeDescendants = true) {
                        contentDescription = p.name ?: ""
                        heading()
                    },
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    PlaetzeLogik.platzNummer(p.name, p.shortName),
                    style = TcmSchrift.display(Schrift.gewichtFett, with(dichte) { 15.dp.toSp() }),
                    color = f.ink,
                    maxLines = 1,
                )
            }
        }
    }
}

@Composable
private fun Tag(m: PlaetzeModell, jetzt: Instant, jetztMin: Int?, breit: Boolean) {
    val f = TcmTheme.farben
    val oeffnung = m.oeffnung
    val schluss = m.schluss
    val hoehe = Mass.px(schluss - oeffnung)
    val volle = generateSequence(ceil(oeffnung / 60.0).toInt() * 60) { it + 60 }.takeWhile { it < schluss }.toList()
    val dichte = LocalDensity.current

    Row(
        Modifier
            .fillMaxWidth()
            .height(hoehe)
            .semantics { contentDescription = "Belegung nach Plätzen, von oben nach unten die Uhrzeit" }
            .drawWithContent {
                drawContent()
                // Die rote Linie fuer jetzt liegt ueber den Bloecken.
                if (jetztMin != null && jetztMin in oeffnung..schluss) {
                    val y = Mass.px(jetztMin - oeffnung).toPx()
                    drawLine(f.red, Offset(Mass.zeitSpalte.toPx(), y), Offset(size.width, y), 2.dp.toPx())
                }
            },
    ) {
        Box(Modifier.width(Mass.zeitSpalte).fillMaxHeight().stundenlinien(volle, oeffnung, f.line).clearAndSetSemantics {}) {
            for (s in volle) {
                for ((minute, voll) in listOf(s to true, s + 30 to false)) {
                    if (minute >= schluss) continue
                    Text(
                        Zeit.minutesToTime(minute),
                        style = TcmSchrift.display(
                            if (voll) Schrift.gewichtHalbfett else Schrift.gewichtNormal,
                            with(dichte) { 11.dp.toSp() },
                        ).copy(fontFeatureSettings = "tnum"),
                        color = if (voll) f.ink2 else f.muted,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.width(Mass.zeitSpalte).offset(y = Mass.px(minute - oeffnung) + 6.dp),
                    )
                }
            }
        }
        for (p in m.plaetze) Spalte(m, p, jetzt, breit, volle, Modifier.weight(1f))
    }
}

@Composable
private fun Spalte(m: PlaetzeModell, platz: AktiverPlatz, jetzt: Instant, breit: Boolean, volle: List<Int>, modifier: Modifier) {
    val f = TcmTheme.farben
    val oeffnung = m.oeffnung
    val luecken = Platzplan.freeGaps(
        m.datum, platz.id, oeffnung, m.schluss, m.raster, m.dauer, m.belegung, m.vorlauf, jetzt,
    )
    val hier = m.belegung.filter { it.courtId == platz.id }
    Box(
        modifier
            .fillMaxHeight()
            // Was nicht (mehr) buchbar ist, liegt leicht getoent hinter den freien Flaechen.
            .background(f.surf2)
            .drawBehind { drawLine(f.line, Offset(0f, 0f), Offset(0f, size.height), 1.dp.toPx()) },
    ) {
        for (l in luecken) {
            FreieFlaeche(platz, l, Modifier.offset(y = Mass.px(l.from - oeffnung))) { minute ->
                m.auswahl = Auswahl(platz.id, Platzplan.startInGap(l, minute, m.raster, m.dauer), l.until)
            }
        }
        // Stundenlinien ueber den freien Flaechen, unter den Bloecken und ihrer Schrift.
        Box(Modifier.matchParentSize().stundenlinien(volle, oeffnung, f.line))
        for (b in hier) {
            val von = maxOf(oeffnung, Zeit.minutesOf(b.startsAt))
            val bis = minOf(m.schluss, Zeit.minutesOf(b.endsAt))
            if (bis > von) {
                Block(
                    belegung = b,
                    platz = platz,
                    hoehe = maxOf(Mass.px(bis - von) - Mass.abstand * 2, 12.dp),
                    breit = breit,
                    kannAuf = m.oeffnebar(b),
                    markiert = m.markiert?.trifft(b) == true,
                    modifier = Modifier.offset(y = Mass.px(von - oeffnung) + Mass.abstand),
                ) { m.oeffne(b) }
            }
        }
        val a = m.auswahl
        if (a != null && a.courtId == platz.id) {
            // Ausgewaehlt ist hellblau mit blauer Kante - Gelb bleibt dem eigenen Spiel.
            Box(
                Modifier
                    .offset(y = Mass.px(a.minute - oeffnung) + Mass.abstand)
                    .padding(horizontal = Mass.abstand)
                    .fillMaxWidth()
                    .height(Mass.px(m.dauer) - Mass.abstand * 2)
                    .background(f.blueSoft, RoundedCornerShape(Mass.ecke))
                    .border(2.dp, f.blue, RoundedCornerShape(Mass.ecke))
                    .clearAndSetSemantics {},
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    Zeit.minutesToTime(a.minute),
                    style = TcmSchrift.display(Schrift.gewichtFett, with(LocalDensity.current) { 11.dp.toSp() })
                        .copy(fontFeatureSettings = "tnum"),
                    color = f.blueInk,
                    maxLines = 1,
                )
            }
        }
    }
}

private fun Modifier.stundenlinien(volle: List<Int>, oeffnung: Int, farbe: Color): Modifier = drawBehind {
    for (s in volle) {
        val y = Mass.px(s - oeffnung).toPx()
        if (y > 0f) drawLine(farbe, Offset(0f, y), Offset(size.width, y), 1.dp.toPx())
    }
}

/**
 * Eine freie Flaeche: weiss mit feiner Linie, antippbar. Die Stelle des
 * Fingers bestimmt den Beginn; TalkBack tippt ohne Stelle und bekommt den
 * fruehesten.
 */
@Composable
private fun FreieFlaeche(platz: AktiverPlatz, luecke: FreeGap, modifier: Modifier, wahl: (Int) -> Unit) {
    val f = TcmTheme.farben
    val stundePx = with(LocalDensity.current) { Mass.stunde.toPx() }
    Box(
        modifier
            .fillMaxWidth()
            .height(Mass.px(luecke.until - luecke.from))
            .background(f.surf)
            .pointerInput(luecke) {
                detectTapGestures { ort -> wahl(luecke.from + floor(ort.y / stundePx * 60).toInt()) }
            }
            .clearAndSetSemantics {
                contentDescription = "${platz.name ?: ""}, frei von ${Zeit.minutesToTime(luecke.from)} bis ${Zeit.minutesToTime(luecke.until)} Uhr"
                role = Role.Button
                onClick(label = "${Zeit.minutesToTime(luecke.from)} Uhr zum Buchen auswählen") {
                    wahl(luecke.from)
                    true
                }
            },
    )
}

/** Eine Belegung als Block, gefaerbt nach der Statustabelle (wie .tr-block im Web). */
@Composable
private fun Block(
    belegung: TagesBelegung,
    platz: AktiverPlatz,
    hoehe: Dp,
    breit: Boolean,
    kannAuf: Boolean,
    markiert: Boolean,
    modifier: Modifier,
    aktion: () -> Unit,
) {
    val f = TcmTheme.farben
    val l = Platzplan.occupancyLabel(belegung)
    val form = RoundedCornerShape(Mass.ecke)
    // In schmalen Spalten nur das Zeichen aus dem Entwurf: "Du" und "+".
    val titel = when {
        breit -> l.title
        l.art == TimelineKind.EIGEN -> "Du"
        l.art == TimelineKind.SUCHT -> "+"
        else -> ""
    }
    Column(
        modifier
            .padding(horizontal = Mass.abstand)
            .fillMaxWidth()
            .height(hoehe)
            .clip(form)
            .belegungsFlaeche(l.art, f, Mass.ecke)
            .then(if (markiert) Modifier.border(2.dp, f.blue, form) else Modifier)
            .clickable(enabled = kannAuf, onClickLabel = "Öffnet die Buchung", role = Role.Button, onClick = aktion)
            .semantics(mergeDescendants = true) { contentDescription = "${platz.name ?: ""}, ${l.spoken}" }
            .padding(horizontal = if (breit) 6.dp else 1.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = if (breit) Alignment.Start else Alignment.CenterHorizontally,
    ) {
        val farbe = belegungsText(l.art, f)
        val dichte = LocalDensity.current
        if (titel.isNotEmpty()) {
            Text(
                titel,
                style = TcmSchrift.display(Schrift.gewichtFett, with(dichte) { 12.dp.toSp() }),
                color = farbe,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        if (breit && l.detail.isNotEmpty() && hoehe >= 40.dp) {
            Text(
                l.detail,
                style = TcmSchrift.text(Schrift.gewichtMittel, with(dichte) { 11.dp.toSp() }),
                color = farbe.copy(alpha = 0.85f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/** Kurze Legende ueber dem Raster. Jedes Kaestchen mit Rand: die Toenungen allein liegen unter 3:1 (U29). */
@Composable
fun RasterLegende() {
    val f = TcmTheme.farben
    val frei = Modifier
        .background(f.surf, RoundedCornerShape(3.dp))
        .border(1.dp, f.line2, RoundedCornerShape(3.dp))
    Legende(
        listOf(
            "frei" to frei,
            "belegt" to Modifier.belegungsFlaeche(TimelineKind.BELEGT, f, 3.dp),
            "Du" to Modifier.belegungsFlaeche(TimelineKind.EIGEN, f, 3.dp),
            "sucht Mitspieler" to Modifier.belegungsFlaeche(TimelineKind.SUCHT, f, 3.dp),
            "Training" to Modifier.belegungsFlaeche(TimelineKind.SERIE, f, 3.dp),
            "gesperrt" to Modifier.belegungsFlaeche(TimelineKind.GESPERRT, f, 3.dp),
        ),
        breite = 14.dp,
        hoehe = 14.dp,
    )
}
