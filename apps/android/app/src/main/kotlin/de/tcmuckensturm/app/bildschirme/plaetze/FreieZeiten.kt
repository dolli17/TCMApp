/*
 * Freie Zeiten (apps/mobile/src/components/plaetze/FreieZeiten.tsx)
 *
 * Wie FreieZeiten.swift der iOS-App: eine Zeile je Startzeit mit einem
 * Kaestchen je Platz und "n frei". Antippen klappt die Zeile auf: freie
 * Plaetze als grosse Knoepfe, Spiele, die Mitspieler suchen, die eigene
 * Buchung und - mit Platzrechten - Sperrungen. Immer nur eine Zeile offen.
 * Die Zeilen rechnet der Kern (freeSlotsOfDay, also courtStatusAt und
 * canStartAt).
 *
 * Grosse Systemschrift (U52): ab 180 % fallen die Kaestchen weg und es
 * bleibt "n frei".
 */

package de.tcmuckensturm.app.bildschirme.plaetze

import androidx.compose.animation.animateContentSize
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
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.tcmuckensturm.app.bildschirme.Handlung
import de.tcmuckensturm.app.bildschirme.Leerzustand
import de.tcmuckensturm.app.daten.TagesBelegung
import de.tcmuckensturm.app.theme.TcmSchrift
import de.tcmuckensturm.app.theme.TcmTheme
import de.tcmuckensturm.app.ui.tokens.Radius
import de.tcmuckensturm.app.ui.tokens.Schrift
import de.tcmuckensturm.kern.CourtStatusKind
import de.tcmuckensturm.kern.FreeSlotRow
import de.tcmuckensturm.kern.Platzplan
import de.tcmuckensturm.kern.TimelineKind
import de.tcmuckensturm.kern.Zeit

/** Ab dieser Schriftgroesse des Systems fallen die Kaestchen weg. */
private const val GROSSE_SCHRIFT = 1.8f

@Composable
private fun grosseSchrift(): Boolean = LocalDensity.current.fontScale >= GROSSE_SCHRIFT

@Composable
fun FreieZeiten(m: PlaetzeModell) {
    val jetzt = rememberJetzt(m)
    var offen by rememberSaveable { mutableStateOf<Int?>(null) }
    // Nach dem Buchen klappt die Zeile zu; die neue Buchung leuchtet in ihr kurz auf.
    LaunchedEffect(m.markiert) { if (m.markiert != null) offen = null }
    LaunchedEffect(m.datum) { offen = null }

    // Ohne Plaetze (noch nicht geladen) stuende ueberall "voll".
    if (m.plaetze.isEmpty()) return
    val zeilen = Platzplan.freeSlotsOfDay(
        m.datum, m.plaetze.map { it.id }, m.oeffnung, m.schluss, m.raster, m.dauer, m.belegung,
        leadDays = m.vorlauf, now = jetzt,
    )
    if (zeilen.isEmpty()) {
        val tage = m.tage
        val i = tage.indexOf(m.datum)
        Leerzustand(
            "An diesem Tag lässt sich keine Stunde mehr buchen.",
            handlung = if (i >= 0 && i < tage.size - 1) Handlung("Nächster Tag") { m.waehleTag(tage[i + 1]) } else null,
        )
        return
    }
    Tabelle(m, zeilen, offen) { offen = it }
}

@Composable
private fun Tabelle(m: PlaetzeModell, zeilen: List<FreeSlotRow<TagesBelegung>>, offen: Int?, wechsel: (Int?) -> Unit) {
    val f = TcmTheme.farben
    val gross = grosseSchrift()
    val form = RoundedCornerShape(Radius.karte)
    Column(
        Modifier
            .fillMaxWidth()
            .clip(form)
            .background(f.surf)
            .border(1.dp, f.line, form),
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .heightIn(min = 40.dp)
                .padding(start = 16.dp, end = 12.dp)
                .clearAndSetSemantics {},
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("BEGINN", style = kopfStil, modifier = Modifier.widthIn(min = 64.dp))
            if (!gross) {
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    for (p in m.plaetze) {
                        Text(
                            PlaetzeLogik.platzNummer(p.name, p.shortName),
                            style = kopfStil,
                            maxLines = 1,
                            modifier = Modifier.width(18.dp),
                        )
                    }
                }
            }
            Spacer(Modifier.weight(1f).widthIn(min = 8.dp))
            Text("FREI", style = kopfStil)
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(f.line2))

        zeilen.forEachIndexed { i, z ->
            Zeile(m, z, istOffen = offen == z.minute, gross = gross) { wechsel(if (offen == z.minute) null else z.minute) }
            if (i < zeilen.size - 1) Box(Modifier.fillMaxWidth().height(1.dp).background(f.line))
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Zeile(m: PlaetzeModell, z: FreeSlotRow<TagesBelegung>, istOffen: Boolean, gross: Boolean, umschalten: () -> Unit) {
    val f = TcmTheme.farben
    val sucht = z.courts.filter { it.status.art == CourtStatusKind.SUCHT && it.status.belegung?.binDabei != true }
    val eigen = z.courts.filter { it.status.art == CourtStatusKind.EIGEN }
    val frei = z.courts.filter { it.status.art == CourtStatusKind.FREI }
    val gesperrt = z.courts.filter { c -> c.status.art == CourtStatusKind.GESPERRT && c.status.belegung?.let(m::oeffnebar) == true }
    val name = { id: String -> m.platz(id)?.name ?: "" }
    val label = (
        listOf("${Zeit.minutesToTime(z.minute)} Uhr", PlaetzeLogik.freiLabel(z.free)) +
            sucht.map { "${name(it.courtId)} sucht Mitspieler" } +
            eigen.map { "du spielst auf ${name(it.courtId)}" }
        ).joinToString(", ")
    // Die Zeile, in der die gerade gebuchte oder geaenderte Belegung beginnt
    val neu = z.courts.any { c ->
        val b = c.status.belegung ?: return@any false
        m.markiert?.trifft(b) == true && Zeit.minutesOf(b.startsAt) == z.minute
    }

    Column(
        Modifier
            .fillMaxWidth()
            .background(if (neu) f.goldSoft else if (istOffen) f.surf2 else f.surf)
            .animateContentSize(),
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .heightIn(min = 60.dp)
                .clickable(role = Role.Button, onClick = umschalten)
                .clearAndSetSemantics {
                    contentDescription = label
                    stateDescription = if (istOffen) "aufgeklappt" else "zugeklappt"
                    role = Role.Button
                    onClick { umschalten(); true }
                }
                .padding(start = 16.dp, end = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                Zeit.minutesToTime(z.minute),
                style = TcmSchrift.display(Schrift.gewichtFett, 22.sp).copy(fontFeatureSettings = "tnum"),
                color = f.ink,
                modifier = Modifier.widthIn(min = 64.dp).padding(end = 8.dp),
            )
            if (!gross) {
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    for (c in z.courts) Kaestchen(c.status.art)
                }
            }
            Spacer(Modifier.weight(1f).widthIn(min = 8.dp))
            Text(
                PlaetzeLogik.freiText(z.free),
                style = TcmSchrift.text(Schrift.gewichtFett, 14.sp),
                color = when {
                    z.free >= 3 -> f.greenInk
                    z.free > 0 -> f.ink
                    else -> f.muted
                },
            )
            Icon(
                Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = null,
                tint = f.muted,
                modifier = Modifier.padding(start = 6.dp).size(20.dp).rotate(if (istOffen) 90f else 0f),
            )
        }

        if (istOffen) {
            Column(
                Modifier.padding(start = 16.dp, end = 16.dp, bottom = 16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    "${Zeit.minutesToTime(z.minute)} – ${Zeit.minutesToTime(z.minute + m.dauer)} · " +
                        if (frei.isEmpty()) "Kein Platz frei" else "Welcher Platz?",
                    style = TcmSchrift.text(Schrift.gewichtMittel, 13.sp),
                    color = f.ink2,
                    modifier = Modifier.padding(bottom = 2.dp),
                )

                if (frei.isNotEmpty()) {
                    FlowRow(
                        maxItemsInEachRow = 3,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        for (c in frei) {
                            val p = m.platz(c.courtId) ?: continue
                            Box(
                                Modifier
                                    .weight(1f)
                                    .heightIn(min = 48.dp)
                                    .clip(RoundedCornerShape(14.dp))
                                    // greenInk: bg auf green hielt hell nur 3,1:1 (U15)
                                    .background(f.greenInk)
                                    .clickable(role = Role.Button) { m.buchenAuf(p, z.minute) }
                                    .semantics { contentDescription = "${p.name ?: ""} um ${Zeit.minutesToTime(z.minute)} Uhr buchen" },
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(
                                    p.name ?: "",
                                    style = TcmSchrift.text(Schrift.gewichtExtrafett, 15.sp),
                                    color = f.bg,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                        }
                        // Leere Plaetze halten die Breite, wenn die letzte Reihe nicht voll ist.
                        repeat((3 - frei.size % 3) % 3) { Spacer(Modifier.weight(1f)) }
                    }
                }

                for (c in sucht) {
                    val b = c.status.belegung ?: continue
                    val typ = b.typeName ?: "Spiel"
                    val text = "${name(c.courtId)} · $typ sucht noch ${b.frei ?: 1}"
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .heightIn(min = 48.dp)
                            .clip(RoundedCornerShape(14.dp))
                            .belegungsFlaeche(TimelineKind.SUCHT, f, 14.dp)
                            .clickable(role = Role.Button) { m.oeffne(b) }
                            .clearAndSetSemantics {
                                contentDescription = "${name(c.courtId)}, $typ sucht noch ${b.frei ?: 1}, mitspielen"
                                role = Role.Button
                                onClick { m.oeffne(b); true }
                            }
                            .padding(horizontal = 14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        val stil = TcmSchrift.text(Schrift.gewichtFett, 14.5.sp)
                        Text(text, style = stil, color = f.goldInk, modifier = Modifier.weight(1f))
                        Text("Mitspielen", style = stil, color = f.goldInk)
                    }
                }

                for (c in gesperrt) {
                    val b = c.status.belegung ?: continue
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .heightIn(min = 48.dp)
                            .clip(RoundedCornerShape(14.dp))
                            .background(f.surf3)
                            .clickable(role = Role.Button, onClickLabel = "Sperrung bearbeiten oder aufheben") { m.oeffne(b) }
                            .semantics(mergeDescendants = true) {
                                contentDescription = "${name(c.courtId)}, ${c.status.text}, öffnen"
                            }
                            .padding(horizontal = 14.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        val stil = TcmSchrift.text(Schrift.gewichtFett, 14.5.sp)
                        Text("${name(c.courtId)} · ${c.status.text}", style = stil, color = f.ink2, modifier = Modifier.weight(1f))
                        Text("Öffnen", style = stil, color = f.ink)
                    }
                }

                for (c in eigen) {
                    val b = c.status.belegung ?: continue
                    Row(
                        Modifier
                            .heightIn(min = 48.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .clickable(role = Role.Button, onClickLabel = "Öffnet die Buchung") { m.oeffne(b) },
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Box(Modifier.size(10.dp).background(f.gold, RoundedCornerShape(3.dp)))
                        Text(
                            "Du spielst um ${Zeit.minutesToTime(Zeit.minutesOf(b.startsAt))} auf ${name(c.courtId)}",
                            style = TcmSchrift.text(Schrift.gewichtMittel, 13.sp),
                            color = f.ink2,
                        )
                    }
                }
            }
        }
    }
}

/** Ein Kaestchen je Platz: frei die volle gruene Flaeche, belegt blau mit Rand, alles nicht Buchbare surf3 mit Rand (U74). */
@Composable
private fun Kaestchen(art: CourtStatusKind) {
    val f = TcmTheme.farben
    val form = RoundedCornerShape(5.dp)
    val stil = when (art) {
        CourtStatusKind.FREI -> Modifier.background(f.green, form)
        CourtStatusKind.EIGEN -> Modifier.background(f.gold, form).border(1.dp, f.goldLine, form)
        CourtStatusKind.BELEGT -> Modifier.belegungsFlaeche(TimelineKind.BELEGT, f, 5.dp)
        CourtStatusKind.SUCHT -> Modifier.belegungsFlaeche(TimelineKind.SUCHT, f, 5.dp)
        else -> Modifier.background(f.surf3, form).border(1.dp, f.rahmen, form)
    }
    Box(Modifier.size(18.dp, 24.dp).then(stil))
}

/** Die Legende als eine Zeile unter der Karte; ohne Kaestchen (grosse Schrift) entfaellt sie. */
@Composable
fun FreieZeitenLegende() {
    if (grosseSchrift()) return
    val f = TcmTheme.farben
    val form = RoundedCornerShape(3.dp)
    Legende(
        listOf(
            "frei" to Modifier.background(f.green, form),
            "belegt" to Modifier.belegungsFlaeche(TimelineKind.BELEGT, f, 3.dp),
            "sucht Mitspieler" to Modifier.belegungsFlaeche(TimelineKind.SUCHT, f, 3.dp),
            "du" to Modifier.background(f.gold, form),
            "Training, gesperrt" to Modifier.background(f.surf3, form).border(1.dp, f.rahmen, form),
        ),
        breite = 10.dp,
        hoehe = 14.dp,
    )
}
