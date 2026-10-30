/*
 * Bausteine des Tabs Verein
 *
 * Gegenstuecke zu Bausteine.swift, KontoBausteine.swift und den Bausteinen
 * in VereinBildschirm.swift der iOS-App: Kopf mit Segmenten, Karte,
 * Fehlerzeile, Leerzustand, Marke, Zaehlknoepfe, Knoepfe, Hinweis und die
 * Meldung unten (Snackbar statt Toast). Vorerst nur hier; sobald andere Tabs
 * dieselben brauchen, ziehen sie in ein gemeinsames Paket.
 */

package de.tcmuckensturm.app.bildschirme.verein

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Snackbar
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.tcmuckensturm.app.bildschirme.Avatar
import de.tcmuckensturm.app.bildschirme.GedeckelteSchrift
import de.tcmuckensturm.app.bildschirme.GrosserKopf
import de.tcmuckensturm.app.bildschirme.home.HomeLogik
import de.tcmuckensturm.app.bildschirme.leise
import de.tcmuckensturm.app.daten.MeinName
import de.tcmuckensturm.app.navigation.HauptTab
import de.tcmuckensturm.app.navigation.LocalZuTab
import de.tcmuckensturm.app.theme.TcmSchrift
import de.tcmuckensturm.app.theme.TcmTheme
import de.tcmuckensturm.app.ui.tokens.Abstand
import de.tcmuckensturm.app.ui.tokens.Radius
import de.tcmuckensturm.app.ui.tokens.Schrift
import de.tcmuckensturm.kern.EventTon

// ---- Kopf --------------------------------------------------------------------

/**
 * Der grosse Kopf "Verein" (GrosserKopf aus Bausteine.kt) mit Glocke und
 * Avatar, darunter die Segmente fuer den Reiter. `glocke` ist in der App die
 * Glocke aus `nachrichten`, in den Bildschirmfotos nur ihr Knopf.
 */
@Composable
fun VereinKopf(reiter: VereinReiter, name: MeinName?, wechsle: (VereinReiter) -> Unit, glocke: @Composable () -> Unit) {
    val f = TcmTheme.farben
    val zuTab = LocalZuTab.current
    GrosserKopf("Verein", name = name, glocke = glocke)
    // Segmente wachsen nur bis 120 % mit (wie der Picker in iOS), sonst bricht "Veranstaltungen" im Wort.
    GedeckelteSchrift {
        SingleChoiceSegmentedButtonRow(
            Modifier.fillMaxWidth().padding(bottom = Abstand.xs).semantics { contentDescription = "Bereich" },
        ) {
            VereinReiter.entries.forEachIndexed { i, r ->
                SegmentedButton(
                    selected = r == reiter,
                    onClick = { wechsle(r) },
                    shape = SegmentedButtonDefaults.itemShape(i, VereinReiter.entries.size),
                    icon = {},
                    colors = SegmentedButtonDefaults.colors(
                        activeContainerColor = f.segAktiv,
                        activeContentColor = f.ink,
                        activeBorderColor = f.segAktivRand,
                        inactiveContainerColor = f.surf2,
                        inactiveContentColor = f.ink2,
                        inactiveBorderColor = f.line,
                    ),
                ) {
                    Text(r.label, style = TcmSchrift.text(Schrift.gewichtHalbfett, 15.sp), maxLines = 1)
                }
            }
        }
    }
}

// ---- Texte ------------------------------------------------------------

/** Titel in einer Karte ("Anmelden", "Du bist angemeldet"); Abschnitte der Seite nehmen Kopfzeile. */
@Composable
fun Abschnitt(titel: String, modifier: Modifier = Modifier) {
    Text(
        titel,
        style = TcmSchrift.text(Schrift.gewichtFett, Schrift.titel, (-0.2).sp),
        color = TcmTheme.farben.ink,
        modifier = modifier.semantics { heading() },
    )
}

/** .marke-klein in den Toenen von EVENT_KIND_TON */
@Composable
fun MarkeKlein(text: String, ton: EventTon) {
    val f = TcmTheme.farben
    val (grund, tinte) = when (ton) {
        EventTon.BLAU -> f.blueSoft to f.blueInk
        EventTon.GELB -> f.goldSoft to f.goldInk
        EventTon.GRUEN -> f.green.copy(alpha = 0.16f) to f.greenInk
        EventTon.GRAU -> f.chip to f.ink2
        EventTon.ROT -> f.red.copy(alpha = 0.14f) to f.redInk
    }
    Text(
        text,
        style = TcmSchrift.text(Schrift.gewichtHalbfett, Schrift.klein),
        color = tinte,
        modifier = Modifier.clip(CircleShape).background(grund).padding(vertical = 3.dp, horizontal = 8.dp),
    )
}

// ---- Knoepfe -------------------------------------------------------------------

private val MinusSymbol: ImageVector by lazy {
    // Material hat im Grundsatz kein Minus; ein Strich in der Breite des Plus.
    ImageVector.Builder("Minus", 24.dp, 24.dp, 24f, 24f).apply {
        addPath(
            pathData = addPathNodes("M19,13H5v-2h14v2z"),
            fill = SolidColor(Color.Black),
        )
    }.build()
}

/** Runder Plus-/Minus-Knopf mit 44 dp (Rundknopf.tsx) - Getraenke und Begleitpersonen. */
@Composable
fun Zaehlknopf(plus: Boolean, beschriftung: String, gelb: Boolean = false, aus: Boolean = false, aktion: () -> Unit) {
    val f = TcmTheme.farben
    Surface(
        onClick = aktion,
        enabled = !aus,
        shape = CircleShape,
        color = if (gelb) f.gold else f.surf2,
        modifier = Modifier.size(44.dp).alpha(if (aus) 0.4f else 1f).semantics { contentDescription = beschriftung },
    ) {
        Box(contentAlignment = Alignment.Center) {
            Icon(
                if (plus) Icons.Filled.Add else MinusSymbol,
                contentDescription = null,
                tint = if (gelb) f.onGold else f.ink,
                modifier = Modifier.size(20.dp),
            )
        }
    }
}

/** Die Zahl zwischen Minus und Plus. */
@Composable
fun Zaehlerstand(wert: Int, label: String) {
    Text(
        "$wert",
        style = TcmSchrift.display(Schrift.gewichtFett, 22.sp),
        color = TcmTheme.farben.ink,
        textAlign = TextAlign.Center,
        modifier = Modifier.widthIn(min = 28.dp).semantics { contentDescription = label },
    )
}

/** Ein Textknopf in blueInk ("Vergangene Veranstaltungen"). */
@Composable
fun Textknopf(text: String, modifier: Modifier = Modifier, aktion: () -> Unit) {
    TextButton(onClick = aktion, modifier = modifier.heightIn(min = 44.dp)) {
        Text(text, style = TcmSchrift.text(Schrift.gewichtHalbfett, 14.sp), color = TcmTheme.farben.blueInk)
    }
}

// ---- Meldung -------------------------------------------------------------------

/** Was nach einer Handlung unten erscheint (ToastMeldung in iOS). Die Nummer macht gleiche Texte unterscheidbar. */
data class Meldungstext(val ok: Boolean, val text: String, val nummer: Long = System.nanoTime())

/** Die Meldung als Snackbar: Erfolg verschwindet von selbst (GetraenkeAnsicht), ein Fehler bleibt bis zum Schliessen. */
@Composable
fun Meldungsleiste(meldung: Meldungstext, schliessen: () -> Unit) {
    val f = TcmTheme.farben
    Snackbar(
        containerColor = if (meldung.ok) f.ink else f.red,
        contentColor = if (meldung.ok) f.bg else f.onBrand,
        shape = RoundedCornerShape(Radius.feld),
        dismissAction = {
            IconButton(onClick = schliessen) {
                Icon(Icons.Filled.Close, contentDescription = "Schließen", tint = if (meldung.ok) f.bg else f.onBrand)
            }
        },
        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
    ) {
        Text(meldung.text, style = TcmSchrift.text(Schrift.gewichtHalbfett, 15.sp))
    }
}

// ---- Platzlinien ---------------------------------------------------------------

/** Platzlinien in Perspektive, dezent - auf brand (Monatskarte, Kopf im Detail). */
@Composable
fun Platzlinien(modifier: Modifier = Modifier) {
    val farbe = TcmTheme.farben.onBrand.copy(alpha = 0.12f)
    Canvas(modifier) {
        // Wie das SVG der Expo-App: 350 x 150 rechts oben (in dp)
        val e = density
        val x0 = size.width - 350 * e
        fun p(x: Float, y: Float) = Offset(x0 + x * e, y * e)
        val breite = 2 * e
        drawLine(farbe, p(200f, 150f), p(250f, 0f), breite)
        drawLine(farbe, p(350f, 40f), p(260f, 150f), breite)
        drawLine(farbe, p(230f, 80f), p(350f, 80f), breite)
    }
}
