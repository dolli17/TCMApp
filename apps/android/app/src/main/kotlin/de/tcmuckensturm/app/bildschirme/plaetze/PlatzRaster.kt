/*
 * Die Plaetze als Raster (apps/mobile/src/components/plaetze/PlatzRaster.tsx)
 *
 * Wie PlatzRaster.swift der iOS-App: links eine feste Spalte mit den
 * Plaetzen, rechts waagerecht wischbar die Stunden von Oeffnung bis Schluss,
 * 88 dp je Stunde. Belegungen sind beschriftete Bloecke; eine freie Flaeche
 * antippen waehlt Platz und Beginn aus. Gebucht wird erst ueber die Leiste
 * unten und das Blatt. Was frei ist, rechnet der Kern (freeGaps), die
 * Beschriftung ebenfalls (occupancyLabel).
 */

package de.tcmuckensturm.app.bildschirme.plaetze

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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
    /** Eine halbe Stunde ist so 44 dp breit - schmaler trifft man sie mit dem Finger nicht (U18). */
    val stunde = 88.dp
    val zeile = 48.dp
    val kopf = 34.dp
    val spalte = 46.dp
    val abstand = 4.dp

    fun px(minuten: Int): Dp = stunde * (minuten / 60f)
}

@Composable
fun PlatzRaster(m: PlaetzeModell) {
    val f = TcmTheme.farben
    // Jede Minute neu: rote Linie und freie Flaechen ruecken mit der Uhr.
    val jetzt = rememberJetzt(m)
    val jetztMin = if (m.datum == Zeit.berlinDay(jetzt)) Zeit.localMinutes(jetzt) else null
    val form = RoundedCornerShape(Radius.karte)
    Row(
        Modifier
            .fillMaxWidth()
            .clip(form)
            .background(f.surf)
            .border(1.dp, f.line, form),
    ) {
        PlatzSpalte(m.plaetze)
        Box(Modifier.width(1.dp).height(Mass.kopf + 1.dp + Mass.zeile * m.plaetze.size).background(f.line))
        Stunden(m, jetzt, jetztMin)
    }
}

@Composable
private fun PlatzSpalte(plaetze: List<AktiverPlatz>) {
    val f = TcmTheme.farben
    Column(Modifier.width(Mass.spalte)) {
        Box(Modifier.height(Mass.kopf))
        Box(Modifier.fillMaxWidth().height(1.dp).background(f.line))
        for (p in plaetze) {
            // Die Spalte ist 46 dp schmal: hier waechst die Schrift nicht mit.
            val dichte = LocalDensity.current
            Column(
                Modifier
                    .size(Mass.spalte, Mass.zeile)
                    .drawBehind { drawLine(f.ink.copy(alpha = 0.06f), Offset(0f, size.height - 1), Offset(size.width, size.height - 1)) }
                    .semantics(mergeDescendants = true) {
                        contentDescription = p.name ?: ""
                        heading()
                    },
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                with(dichte) {
                    Text("PLATZ", style = TcmSchrift.text(Schrift.gewichtFett, (9.5.dp).toSp(), (0.8.dp).toSp()), color = f.muted)
                    Text(
                        PlaetzeLogik.platzNummer(p.name, p.shortName),
                        style = TcmSchrift.display(Schrift.gewichtFett, 20.dp.toSp()),
                        color = f.ink,
                        maxLines = 1,
                    )
                }
            }
        }
    }
}

@Composable
private fun Stunden(m: PlaetzeModell, jetzt: Instant, jetztMin: Int?) {
    val f = TcmTheme.farben
    val oeffnung = m.oeffnung
    val schluss = m.schluss
    val breite = Mass.px(schluss - oeffnung)
    val volle = generateSequence(ceil(oeffnung / 60.0).toInt() * 60) { it + 60 }.takeWhile { it < schluss }.toList()
    // Beim Oeffnen und bei jedem Tageswechsel auf "jetzt" (eine Viertelstunde vorher), sonst auf die Oeffnung.
    val ziel = jetztMin?.let { maxOf(oeffnung, it - 15) } ?: oeffnung
    val zielStunde = volle.lastOrNull { it <= ziel } ?: volle.firstOrNull() ?: oeffnung
    val dichte = LocalDensity.current
    val zielPx = with(dichte) { Mass.px(zielStunde - oeffnung).roundToPx() }
    // Der Anfangswert gilt schon beim ersten Zeichnen; beim Tageswechsel wird gescrollt.
    val scroll = rememberScrollState(zielPx)
    LaunchedEffect(m.datum) { scroll.scrollTo(zielPx) }

    Column(
        Modifier
            .horizontalScroll(scroll)
            .semantics { contentDescription = "Belegung nach Plätzen, waagerecht wischen für frühere und spätere Stunden" },
    ) {
        Box(Modifier.size(breite, Mass.kopf).clearAndSetSemantics {}) {
            for (s in volle) {
                Text(
                    Zeit.minutesToTime(s),
                    style = TcmSchrift.text(Schrift.gewichtFett, 12.sp).copy(fontFeatureSettings = "tnum"),
                    color = f.ink2,
                    modifier = Modifier.offset(x = Mass.px(s - oeffnung) + 6.dp, y = 10.dp),
                )
            }
        }
        Box(Modifier.size(breite, 1.dp).background(f.line))
        Column(
            Modifier
                .size(breite, Mass.zeile * m.plaetze.size)
                .drawWithContent {
                    for (s in volle) {
                        val x = Mass.px(s - oeffnung).toPx()
                        drawLine(f.ink.copy(alpha = 0.07f), Offset(x, 0f), Offset(x, size.height), 1.dp.toPx())
                    }
                    drawContent()
                    // Die rote Linie fuer jetzt liegt ueber den Bloecken.
                    if (jetztMin != null && jetztMin in oeffnung..schluss) {
                        val x = Mass.px(jetztMin - oeffnung).toPx()
                        drawLine(f.red, Offset(x, 0f), Offset(x, size.height), 2.dp.toPx())
                    }
                },
        ) {
            for (p in m.plaetze) Zeile(m, p, jetzt)
        }
    }
}

@Composable
private fun Zeile(m: PlaetzeModell, platz: AktiverPlatz, jetzt: Instant) {
    val f = TcmTheme.farben
    val oeffnung = m.oeffnung
    val luecken = Platzplan.freeGaps(
        m.datum, platz.id, oeffnung, m.schluss, m.raster, m.dauer, m.belegung, m.vorlauf, jetzt,
    )
    val hier = m.belegung.filter { it.courtId == platz.id }
    Box(
        Modifier
            .fillMaxWidth()
            .height(Mass.zeile)
            .drawBehind { drawLine(f.ink.copy(alpha = 0.06f), Offset(0f, size.height - 1), Offset(size.width, size.height - 1)) },
    ) {
        for (l in luecken) {
            FreieFlaeche(platz, l, Modifier.offset(x = Mass.px(l.from - oeffnung) + 3.dp, y = Mass.abstand)) { minute ->
                m.auswahl = Auswahl(platz.id, Platzplan.startInGap(l, minute, m.raster, m.dauer), l.until)
            }
        }
        for (b in hier) {
            val von = maxOf(oeffnung, Zeit.minutesOf(b.startsAt))
            val bis = minOf(m.schluss, Zeit.minutesOf(b.endsAt))
            if (bis > von) {
                Block(
                    belegung = b,
                    platz = platz,
                    breite = maxOf(Mass.px(bis - von) - 6.dp, 12.dp),
                    kannAuf = m.oeffnebar(b),
                    markiert = m.markiert?.trifft(b) == true,
                    modifier = Modifier.offset(x = Mass.px(von - oeffnung) + 3.dp, y = Mass.abstand),
                ) { m.oeffne(b) }
            }
        }
        val a = m.auswahl
        if (a != null && a.courtId == platz.id) {
            Column(
                Modifier
                    .offset(x = Mass.px(a.minute - oeffnung) + 3.dp, y = Mass.abstand)
                    .size(Mass.px(m.dauer) - 6.dp, Mass.zeile - Mass.abstand * 2)
                    .background(f.goldSoft, RoundedCornerShape(10.dp))
                    .border(2.dp, f.gold, RoundedCornerShape(10.dp))
                    .padding(horizontal = 7.dp)
                    .clearAndSetSemantics {},
                verticalArrangement = Arrangement.Center,
            ) {
                Text("+ ${Zeit.minutesToTime(a.minute)}", style = TcmSchrift.text(Schrift.gewichtFett, 12.sp), color = f.goldInk, maxLines = 1)
                Text(
                    "ausgewählt",
                    style = TcmSchrift.text(Schrift.gewichtMittel, 12.sp),
                    color = f.goldInk.copy(alpha = 0.85f),
                    maxLines = 1,
                )
            }
        }
    }
}

/**
 * Eine freie Flaeche: gruen getoent mit gruenem Rand, antippbar. Die Stelle
 * des Fingers bestimmt den Beginn; TalkBack tippt ohne Stelle und bekommt den
 * fruehesten.
 */
@Composable
private fun FreieFlaeche(platz: AktiverPlatz, luecke: FreeGap, modifier: Modifier, wahl: (Int) -> Unit) {
    val f = TcmTheme.farben
    val form = RoundedCornerShape(10.dp)
    val dichte = LocalDensity.current
    val stundePx = with(dichte) { Mass.stunde.toPx() }
    Box(
        modifier
            .size(maxOf(Mass.px(luecke.until - luecke.from) - 6.dp, 12.dp), Mass.zeile - Mass.abstand * 2)
            .clip(form)
            .background(f.green.copy(alpha = 0.16f))
            .border(1.5.dp, f.green, form)
            .pointerInput(luecke) {
                detectTapGestures { ort -> wahl(luecke.from + floor(ort.x / stundePx * 60).toInt()) }
            }
            .clearAndSetSemantics {
                contentDescription = "${platz.name ?: ""}, frei von ${Zeit.minutesToTime(luecke.from)} bis ${Zeit.minutesToTime(luecke.until)} Uhr"
                role = Role.Button
                onClick(label = "${Zeit.minutesToTime(luecke.from)} Uhr zum Buchen auswählen") {
                    wahl(luecke.from)
                    true
                }
            }
            .padding(horizontal = 7.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        Text("frei", style = TcmSchrift.text(Schrift.gewichtFett, 12.sp), color = f.greenInk)
    }
}

/** Eine Belegung als Block, gefaerbt nach der Statustabelle (wie .tr-block im Web). */
@Composable
private fun Block(
    belegung: TagesBelegung,
    platz: AktiverPlatz,
    breite: Dp,
    kannAuf: Boolean,
    markiert: Boolean,
    modifier: Modifier,
    aktion: () -> Unit,
) {
    val f = TcmTheme.farben
    val l = Platzplan.occupancyLabel(belegung)
    val form = RoundedCornerShape(10.dp)
    Column(
        modifier
            .size(breite, Mass.zeile - Mass.abstand * 2)
            .clip(form)
            .belegungsFlaeche(l.art, f, 10.dp)
            .then(if (markiert) Modifier.border(3.dp, f.goldLine, form) else Modifier)
            .clickable(enabled = kannAuf, onClickLabel = "Öffnet die Buchung", role = Role.Button, onClick = aktion)
            .semantics(mergeDescendants = true) { contentDescription = "${platz.name ?: ""}, ${l.spoken}" }
            .padding(horizontal = 8.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        val farbe = belegungsText(l.art, f)
        Text(l.title, style = TcmSchrift.text(Schrift.gewichtFett, 12.sp), color = farbe, maxLines = 1, overflow = TextOverflow.Ellipsis)
        if (l.detail.isNotEmpty()) {
            Text(
                l.detail,
                style = TcmSchrift.text(Schrift.gewichtMittel, 12.sp),
                color = farbe,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.alpha(0.85f),
            )
        }
    }
}

/** Kurze Legende unter dem Raster. Jedes Kaestchen mit Rand: die Toenungen allein liegen unter 3:1 (U29). */
@Composable
fun RasterLegende() {
    val f = TcmTheme.farben
    val frei = Modifier
        .background(f.green.copy(alpha = 0.16f), RoundedCornerShape(3.dp))
        .border(1.dp, f.green, RoundedCornerShape(3.dp))
    Legende(
        listOf(
            "frei" to frei,
            "Du" to Modifier.belegungsFlaeche(TimelineKind.EIGEN, f, 3.dp),
            "belegt" to Modifier.belegungsFlaeche(TimelineKind.BELEGT, f, 3.dp),
            "sucht Mitspieler" to Modifier.belegungsFlaeche(TimelineKind.SUCHT, f, 3.dp),
            "Training" to Modifier.belegungsFlaeche(TimelineKind.SERIE, f, 3.dp),
            "gesperrt" to Modifier.belegungsFlaeche(TimelineKind.GESPERRT, f, 3.dp),
        ),
        breite = 16.dp,
        hoehe = 10.dp,
    )
}
