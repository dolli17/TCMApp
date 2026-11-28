/*
 * Bausteine im iOS-Stil (docs/design/ios-stil.md, Abschnitt 2)
 *
 * Nachbauten von Gruppenliste.swift der iOS-App: gruppierte Listen auf dem
 * grauen Grund (gruppenGrund), Zeilen mit Chevron, Symbol-Kacheln, der
 * Abschnittskopf, der Segment-Schalter und das Geruest eines Blatts.
 * Die Bedienung bleibt Android: Ripple beim Antippen, Zurueck-Geste.
 */

package de.tcmuckensturm.app.bildschirme

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.tcmuckensturm.app.theme.TcmSchrift
import de.tcmuckensturm.app.theme.TcmTheme
import de.tcmuckensturm.app.ui.tokens.Abstand
import de.tcmuckensturm.app.ui.tokens.Groesse
import de.tcmuckensturm.app.ui.tokens.Radius
import de.tcmuckensturm.app.ui.tokens.Schrift

// ---- Gruppe und Zeile ---------------------------------------------------------

/** Form einer Gruppe (.insetGrouped in iOS). */
val GruppenForm = RoundedCornerShape(Radius.gruppe)

/**
 * Eine Gruppe: weisse Flaeche (surf) ohne Rand auf dem grauen Grund. Zeilen
 * darin sind [GruppenZeile]; die Trennlinie zeichnet jede Zeile ausser der ersten.
 */
@Composable
fun Gruppe(modifier: Modifier = Modifier, inhalt: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier
            .fillMaxWidth()
            .clip(GruppenForm)
            .background(TcmTheme.farben.surf),
        content = inhalt,
    )
}

/** Trennlinie in einer Gruppe, eingerueckt ab dem Text (wie in iOS). */
@Composable
fun GruppenTrenner(einzug: Dp = Abstand.gruppenRand) {
    Box(
        Modifier
            .padding(start = einzug)
            .fillMaxWidth()
            .height(0.5.dp)
            .background(TcmTheme.farben.line2),
    )
}

/** Farbige Symbol-Kachel vor einer Zeile (IconKachel in iOS): 29 dp, weisses Symbol. */
@Composable
fun IconKachel(symbol: ImageVector, farbe: Color = TcmTheme.farben.blue) {
    Box(
        Modifier
            .size(29.dp)
            .clip(RoundedCornerShape(Radius.kachel))
            .background(farbe),
        contentAlignment = Alignment.Center,
    ) {
        Icon(symbol, contentDescription = null, tint = TcmTheme.farben.onBrand, modifier = Modifier.size(17.dp))
    }
}

/** Chevron am Ende einer Zeile (ZeilenPfeil in iOS). */
@Composable
fun ZeilenPfeil() {
    Icon(
        Icons.AutoMirrored.Outlined.KeyboardArrowRight,
        contentDescription = null,
        tint = TcmTheme.farben.line2,
        modifier = Modifier.size(22.dp),
    )
}

/**
 * Eine Zeile in einer [Gruppe]: optional Kachel, Titel und Nebentext links,
 * Wert rechts in muted, Chevron, wenn sie wohin fuehrt. `erste` laesst die
 * Trennlinie darueber weg.
 */
@Composable
fun GruppenZeile(
    titel: String,
    modifier: Modifier = Modifier,
    unterzeile: String? = null,
    wert: String? = null,
    symbol: ImageVector? = null,
    symbolFarbe: Color = TcmTheme.farben.blue,
    titelFarbe: Color = TcmTheme.farben.ink,
    erste: Boolean = false,
    pfeil: Boolean = true,
    rechts: (@Composable () -> Unit)? = null,
    aktion: (() -> Unit)? = null,
) {
    val f = TcmTheme.farben
    Column(modifier.fillMaxWidth()) {
        if (!erste) GruppenTrenner(if (symbol != null) Abstand.gruppenRand + 29.dp + Abstand.m else Abstand.gruppenRand)
        Row(
            Modifier
                .fillMaxWidth()
                .then(if (aktion != null) Modifier.tippbar(aktion = aktion) else Modifier)
                .heightIn(min = Groesse.zeile)
                .padding(start = Abstand.gruppenRand, end = if (aktion != null && pfeil) 8.dp else Abstand.gruppenRand)
                .padding(vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(Abstand.m),
        ) {
            if (symbol != null) IconKachel(symbol, symbolFarbe)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(titel, style = TcmSchrift.rolle(Schrift.Rolle.zeile), color = titelFarbe)
                if (unterzeile != null) {
                    Text(unterzeile, style = TcmSchrift.rolle(Schrift.Rolle.nebentextKlein), color = f.muted)
                }
            }
            if (wert != null) {
                Text(wert, style = TcmSchrift.rolle(Schrift.Rolle.zeile), color = f.muted, maxLines = 1)
            }
            rechts?.invoke()
            if (aktion != null && pfeil) ZeilenPfeil()
        }
    }
}

/**
 * Kopf ueber einer Gruppe (GruppenKopf in iOS): klein, grau, in Versalien.
 * Rechts optional ein Verweis in blueInk ("Alle anzeigen").
 */
@Composable
fun GruppenKopf(titel: String, link: KopfLink? = null, modifier: Modifier = Modifier) {
    val f = TcmTheme.farben
    Row(
        modifier
            .fillMaxWidth()
            .padding(start = Abstand.gruppenRand, end = if (link != null) 4.dp else Abstand.gruppenRand, top = Abstand.gruppe, bottom = 6.dp),
        verticalAlignment = Alignment.Bottom,
    ) {
        Text(
            titel.uppercase(),
            style = TcmSchrift.rolle(Schrift.Rolle.abschnittskopf),
            color = f.muted,
            modifier = Modifier
                .weight(1f)
                .semantics { heading() },
        )
        if (link != null) {
            Text(
                link.text,
                style = TcmSchrift.rolle(Schrift.Rolle.abschnittskopf).copy(fontWeight = Schrift.gewichtHalbfett),
                color = f.blueInk,
                modifier = Modifier
                    .clip(Kapsel)
                    .tippbar(link.label ?: link.text, aktion = link.aktion)
                    .padding(horizontal = 12.dp, vertical = 4.dp),
            )
        }
    }
}

/** Fusstext unter einer Gruppe (Footer der Section in iOS). */
@Composable
fun GruppenFuss(text: String) {
    Text(
        text,
        style = TcmSchrift.rolle(Schrift.Rolle.nebentextKlein),
        color = TcmTheme.farben.muted,
        modifier = Modifier.padding(start = Abstand.gruppenRand, end = Abstand.gruppenRand, top = 6.dp),
    )
}

/** Fehler in einer Zeile (FehlerZeile in iOS): Warnsymbol und Text in redInk, darunter "Erneut versuchen". */
@Composable
fun FehlerGruppe(text: String, laeuft: Boolean = false, erneut: (() -> Unit)? = null) {
    val f = TcmTheme.farben
    Gruppe {
        Row(
            Modifier
                .fillMaxWidth()
                .heightIn(min = Groesse.zeile)
                .padding(horizontal = Abstand.gruppenRand, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Icon(Icons.Filled.Warning, contentDescription = null, tint = f.redInk, modifier = Modifier.size(20.dp))
            Text(text, style = TcmSchrift.rolle(Schrift.Rolle.zeile), color = f.redInk, modifier = Modifier.weight(1f))
        }
        if (erneut != null) {
            GruppenZeile(
                if (laeuft) "Wird geladen…" else "Erneut versuchen",
                titelFarbe = f.blueInk,
                pfeil = false,
                aktion = { if (!laeuft) erneut() },
            )
        }
    }
}

// ---- Segment ------------------------------------------------------------------

/**
 * Der Segment-Schalter von iOS (Picker .segmented), nachgebaut: graue Schiene,
 * die Wahl als weisse Flaeche mit leichtem Schatten. Fuer TalkBack eine
 * Gruppe von Reitern. Die Schrift waechst nur bis 120 % mit, wie in iOS.
 */
@Composable
fun <W> Segment(
    optionen: List<Pair<W, String>>,
    gewaehlt: W?,
    modifier: Modifier = Modifier,
    beschriftung: String? = null,
    gesperrt: Boolean = false,
    rolle: Role = Role.Tab,
    wahl: (W) -> Unit,
) {
    val f = TcmTheme.farben
    val dunkel = TcmTheme.dunkel
    val schiene = RoundedCornerShape(9.dp)
    val wahlForm = RoundedCornerShape(7.dp)
    GedeckelteSchrift {
        Row(
            modifier
                .fillMaxWidth()
                .clip(schiene)
                .background(if (dunkel) f.surf2 else f.surf3)
                .padding(2.dp)
                .selectableGroup()
                .semantics { if (beschriftung != null) contentDescription = beschriftung },
        ) {
            for ((wert, label) in optionen) {
                val aktiv = wert == gewaehlt
                Box(
                    Modifier
                        .weight(1f)
                        .heightIn(min = 32.dp)
                        .then(
                            if (aktiv) {
                                Modifier
                                    .shadow(if (dunkel) 0.dp else 2.dp, wahlForm, ambientColor = Color.Black.copy(alpha = 0.12f), spotColor = Color.Black.copy(alpha = 0.12f))
                                    .background(if (dunkel) f.surf3 else f.surf, wahlForm)
                            } else {
                                Modifier
                            },
                        )
                        .clip(wahlForm)
                        .selectable(selected = aktiv, enabled = !gesperrt, role = rolle) { wahl(wert) }
                        .padding(horizontal = 6.dp, vertical = 6.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        label,
                        style = TcmSchrift.rolle(Schrift.Rolle.nebentextKlein)
                            .copy(fontWeight = if (aktiv) Schrift.gewichtHalbfett else Schrift.gewichtMittel, fontSize = 14.sp),
                        color = if (gesperrt) f.muted else f.ink,
                        textAlign = TextAlign.Center,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

// ---- Blatt --------------------------------------------------------------------

/**
 * Geruest eines Blatts im iOS-Stil: oben Abbrechen links und der Titel klein in
 * der Mitte, darunter der Inhalt auf dem grauen Grund, unten der Haupt-Knopf,
 * der sagt, was passiert ("Platz 2 buchen"). Entschieden am 28.11.2026
 * (docs/design/ios-stil.md, Abschnitt 6): kein Haken oben rechts.
 */
@Composable
fun BlattGeruest(
    titel: String,
    abbrechen: () -> Unit,
    knopf: String? = null,
    knopfGesperrt: Boolean = false,
    knopfGrund: String? = null,
    knopfAktion: () -> Unit = {},
    inhalt: @Composable ColumnScope.() -> Unit,
) {
    val f = TcmTheme.farben
    Column(Modifier.fillMaxWidth().background(f.gruppenGrund).navigationBarsPadding()) {
        Row(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = abbrechen) {
                Icon(Icons.Outlined.Close, contentDescription = "Abbrechen", tint = f.ink)
            }
            Text(
                titel,
                style = TcmSchrift.rolle(Schrift.Rolle.wichtigeZeile),
                color = f.ink,
                textAlign = TextAlign.Center,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier
                    .weight(1f)
                    .semantics { heading() },
            )
            // Gegengewicht zum Abbrechen-Knopf, damit der Titel mittig steht.
            Spacer(Modifier.width(48.dp))
        }
        Column(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = Abstand.gruppenRand),
            content = inhalt,
        )
        if (knopf != null) {
            Hauptknopf(
                knopf,
                Modifier.padding(horizontal = Abstand.gruppenRand, vertical = Abstand.m),
                gesperrt = knopfGesperrt,
                grund = knopfGrund,
                aktion = knopfAktion,
            )
        }
    }
}
