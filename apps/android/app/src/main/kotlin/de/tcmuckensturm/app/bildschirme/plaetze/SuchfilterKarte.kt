/*
 * "Nur für …" unter "Mitspieler gesucht" (lk-vertrag vom 02.11.2026)
 *
 * LK-Bereich von–bis in 0,1-Schritten (Schieber fuer grob, Minus/Plus fuer
 * fein) und fuer wen: Alle, Damen, Herren. Standard ist LK 1–25 und Alle,
 * also keine Einschraenkung. Durchgesetzt wird der Filter in der Datenbank;
 * das Blatt zeigt ihn nur und gibt ihn an create_booking bzw.
 * set_partner_wanted weiter.
 */

package de.tcmuckensturm.app.bildschirme.plaetze

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.RangeSlider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.tcmuckensturm.app.bildschirme.Leise
import de.tcmuckensturm.app.theme.TcmSchrift
import de.tcmuckensturm.app.theme.TcmTheme
import de.tcmuckensturm.app.ui.tokens.Schrift
import de.tcmuckensturm.kern.SuchFuer
import de.tcmuckensturm.kern.Suchfilter
import kotlin.math.roundToInt

/** 100 -> "10,0": beim Einstellen immer mit Nachkommastelle, damit der 0,1-Schritt sichtbar ist. */
private fun lkGenau(zehntel: Int): String = "${zehntel / 10},${zehntel % 10}"

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SuchfilterKarte(filter: Suchfilter, deaktiviert: Boolean = false, aendern: (Suchfilter) -> Unit) {
    val f = TcmTheme.farben
    val form = RoundedCornerShape(18.dp)
    Column(
        Modifier
            .fillMaxWidth()
            .border(1.dp, f.line, form)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Nur für …", style = TcmSchrift.text(Schrift.gewichtFett, 16.sp), color = f.ink, modifier = Modifier.weight(1f))
            Text(
                filter.zusatz ?: "alle",
                style = TcmSchrift.text(Schrift.gewichtFett, 14.sp).copy(fontFeatureSettings = "tnum"),
                color = if (filter.eingeschraenkt) f.goldInk else f.muted,
                textAlign = TextAlign.End,
            )
        }

        Column {
            Feldname("LK-Bereich", "1 ist die beste, 25 die schwächste")
            RangeSlider(
                value = filter.von.toFloat()..filter.bis.toFloat(),
                onValueChange = { r ->
                    val von = r.start.roundToInt().coerceIn(Suchfilter.MIN, Suchfilter.MAX)
                    val bis = r.endInclusive.roundToInt().coerceIn(Suchfilter.MIN, Suchfilter.MAX)
                    aendern(filter.copy(von = minOf(von, bis), bis = maxOf(von, bis)))
                },
                valueRange = Suchfilter.MIN.toFloat()..Suchfilter.MAX.toFloat(),
                enabled = !deaktiviert,
                colors = SliderDefaults.colors(
                    thumbColor = f.greenInk,
                    activeTrackColor = f.greenInk,
                    inactiveTrackColor = f.surf3,
                ),
                modifier = Modifier.semantics { contentDescription = "LK-Bereich ${filter.bereichText}" },
            )
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                LkSchritt("Von", filter.von, aus = deaktiviert, kleiner = filter.von <= Suchfilter.MIN, groesser = filter.von >= filter.bis) {
                    aendern(filter.mitVon(it))
                }
                LkSchritt("Bis", filter.bis, aus = deaktiviert, kleiner = filter.bis <= filter.von, groesser = filter.bis >= Suchfilter.MAX) {
                    aendern(filter.mitBis(it))
                }
            }
        }

        Column {
            Feldname("Für wen")
            Segmente("Für wen", SuchFuer.entries.map { Segment(it, it.label, aus = deaktiviert) }, filter.fuer, { aendern(filter.copy(fuer = it)) })
        }

        if (filter.lkBis != null) {
            Leise("Wer keine LK eingetragen hat, sieht die Suche nur, wenn sie bis LK 25 reicht.")
        }
    }
}

/** Eine LK-Grenze mit Minus und Plus, je 0,1. */
@Composable
private fun LkSchritt(name: String, zehntel: Int, aus: Boolean, kleiner: Boolean, groesser: Boolean, wert: (Int) -> Unit) {
    val f = TcmTheme.farben
    Row(
        Modifier
            .fillMaxWidth()
            .background(f.surf2, RoundedCornerShape(18.dp))
            .padding(6.dp)
            .padding(start = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(name, style = TcmSchrift.text(Schrift.gewichtHalbfett, 15.sp), color = f.ink2, modifier = Modifier.weight(1f))
        Rundknopf("$name LK 0,1 niedriger", aus = aus || kleiner, hintergrund = f.surf3, aktion = { wert(zehntel - 1) }) {
            Text("−", style = TcmSchrift.text(Schrift.gewichtFett, 20.sp), color = f.ink)
        }
        Text(
            lkGenau(zehntel),
            style = TcmSchrift.display(Schrift.gewichtFett, 20.sp).copy(fontFeatureSettings = "tnum"),
            color = f.ink,
            textAlign = TextAlign.Center,
            modifier = Modifier.widthIn(min = 56.dp).semantics { contentDescription = "$name LK ${lkGenau(zehntel)}" },
        )
        Rundknopf("$name LK 0,1 höher", aus = aus || groesser, hintergrund = f.surf3, aktion = { wert(zehntel + 1) }) {
            Icon(Icons.Filled.Add, contentDescription = null, tint = f.ink, modifier = Modifier.size(18.dp))
        }
    }
}
