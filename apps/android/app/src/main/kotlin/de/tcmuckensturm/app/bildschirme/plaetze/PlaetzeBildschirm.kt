/*
 * Plaetze - der Belegungsplan (docs/design/stitch, Entwurf "plaetze-belegungsplan")
 *
 * Eine einzige Uebersicht: oben die Tagesleiste (der gewaehlte Tag in
 * kraeftigem Blau), darunter Legende und Raster - Plaetze als Spalten, die
 * Uhrzeit von oben nach unten. Eine freie Flaeche waehlt Platz und Beginn
 * aus; gebucht wird ueber die Leiste unten und das Blatt. Die fruehere zweite
 * Darstellung "Freie Zeiten" gibt es nicht mehr.
 *
 * Ob gebucht werden kann, entscheidet canStartAt (Kern); durchgesetzt wird
 * es ausschliesslich in create_booking. Der Plan haelt sich ueber Realtime
 * aktuell, laedt per Herunterziehen und beim Zurueckkehren in den
 * Vordergrund nach. Rueckmeldungen kommen als Snackbar.
 */

package de.tcmuckensturm.app.bildschirme.plaetze

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarVisuals
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInParent
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import de.tcmuckensturm.app.bildschirme.Fehlerzeile
import de.tcmuckensturm.app.bildschirme.Fehlerzustand
import de.tcmuckensturm.app.bildschirme.GrosserKopf
import de.tcmuckensturm.app.bildschirme.ImVordergrund
import de.tcmuckensturm.app.bildschirme.Knopf
import de.tcmuckensturm.app.bildschirme.Knopfstufe
import de.tcmuckensturm.app.bildschirme.Leise
import de.tcmuckensturm.app.bildschirme.nachrichten.Glocke
import de.tcmuckensturm.app.bildschirme.randlos
import de.tcmuckensturm.app.daten.AktiverPlatz
import de.tcmuckensturm.app.daten.Platzdaten
import de.tcmuckensturm.app.daten.name
import de.tcmuckensturm.app.start.LocalSitzung
import de.tcmuckensturm.app.theme.TcmSchrift
import de.tcmuckensturm.app.theme.TcmTheme
import de.tcmuckensturm.app.ui.tokens.Abstand
import de.tcmuckensturm.app.ui.tokens.Radius
import de.tcmuckensturm.app.ui.tokens.Schrift
import de.tcmuckensturm.kern.Zeit
import kotlin.math.roundToInt
import kotlinx.coroutines.delay

@Composable
fun PlaetzeBildschirm() {
    val client = LocalSitzung.current.client
    val m = viewModel { PlaetzeModell(quelle = Platzdaten(client)) }
    PlaetzeInhalt(m, glocke = { Glocke() })
}

/** Eine Snackbar mit Haken oder Warnung. */
private class HinweisSnackbar(val hinweis: Hinweis) : SnackbarVisuals {
    override val message = hinweis.text
    override val actionLabel: String? = null
    override val withDismissAction = false
    override val duration = SnackbarDuration.Short
}

/** Der Tab ohne eigene Datenquelle; `glocke` ist austauschbar fuer die Bildschirmfotos. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlaetzeInhalt(m: PlaetzeModell, glocke: @Composable () -> Unit = {}) {
    val f = TcmTheme.farben
    val snackbar = remember { SnackbarHostState() }

    // Erstes Laden und jeder Tageswechsel; der Kanal plan-<datum> wird je Tag neu aufgebaut.
    LaunchedEffect(m.datum) { m.laden(still = m.geladenFuer == m.datum) }
    if (m.live) {
        LaunchedEffect(m.datum) { m.beobachte(m.datum) }
        ImVordergrund { m.imVordergrund() }
    }
    // Die Hervorhebung nach einer Aktion bleibt fuenf Sekunden.
    LaunchedEffect(m.markiert) {
        if (m.markiert == null) return@LaunchedEffect
        delay(5_000)
        m.markiert = null
    }
    LaunchedEffect(m.meldung) {
        val h = m.meldung ?: return@LaunchedEffect
        snackbar.showSnackbar(HinweisSnackbar(h))
        if (m.meldung == h) m.meldung = null
    }

    // Heute rollt der Plan einmal zur aktuellen Uhrzeit - morgens liegt sie sonst unter dem Rand.
    val rollen = rememberScrollState()
    var rasterOben by remember { mutableIntStateOf(-1) }
    var gerolltFuer by rememberSaveable { mutableStateOf<String?>(null) }
    val dichte = LocalDensity.current
    LaunchedEffect(m.geladenFuer, rasterOben) {
        val tag = m.geladenFuer ?: return@LaunchedEffect
        if (rasterOben < 0 || gerolltFuer == tag) return@LaunchedEffect
        gerolltFuer = tag
        val jetzt = m.uhr()
        if (tag != Zeit.berlinDay(jetzt)) return@LaunchedEffect
        val minuten = Zeit.localMinutes(jetzt).coerceIn(m.oeffnung, m.schluss) - m.oeffnung
        // 60 dp je Stunde (PlatzRaster); zwei Stunden davor bleiben sichtbar.
        val ziel = with(dichte) { rasterOben + (minuten - 120).dp.roundToPx() }
        if (ziel > 0) rollen.scrollTo(ziel)
    }

    Box(Modifier.fillMaxSize().background(f.bg)) {
        PullToRefreshBox(isRefreshing = m.aktualisiert, onRefresh = m::vonHand, modifier = Modifier.fillMaxSize()) {
            Column(
                Modifier
                    .fillMaxSize()
                    .verticalScroll(rollen)
                    .statusBarsPadding()
                    .padding(horizontal = Abstand.rand)
                    .padding(bottom = Abstand.abschnitt * 2 + if (m.auswahl != null) 72.dp else 0.dp),
                verticalArrangement = Arrangement.spacedBy(Abstand.m),
            ) {
                Kopf(m, glocke)
                Tagwahl(m)
                m.ladeFehler?.let {
                    if (m.geladenFuer == null) Fehlerzustand(it, m.aktualisiert, erneut = m::vonHand) else Fehlerzeile(it, laeuft = m.aktualisiert, erneut = m::vonHand)
                }
                if (m.laedt && m.geladenFuer != m.datum) {
                    Box(Modifier.fillMaxWidth().padding(top = 40.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = f.muted)
                    }
                } else if (m.geladenFuer != null) {
                    PlaetzeLogik.kontingentText(m.kontingent)?.let { Leise(it) }
                    RasterLegende()
                    Box(Modifier.onGloballyPositioned { rasterOben = it.positionInParent().y.roundToInt() }) { PlatzRaster(m) }
                }
            }
        }

        Column(
            Modifier.align(Alignment.BottomCenter).padding(horizontal = Abstand.m, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            SnackbarHost(snackbar) { daten ->
                val h = (daten.visuals as? HinweisSnackbar)?.hinweis ?: Hinweis(true, daten.visuals.message)
                HinweisZeile(h) { daten.dismiss() }
            }
            val a = m.auswahl
            val p = a?.let { m.platz(it.courtId) }
            AnimatedVisibility(
                a != null && p != null && m.fenster == null,
                enter = slideInVertically { it } + fadeIn(),
                exit = slideOutVertically { it } + fadeOut(),
            ) {
                if (a != null && p != null) BuchenLeiste(p, a, m.dauer) { m.buchenAuf(p, a.minute) }
            }
        }
    }

    m.fenster?.let { Buchungsblatt(m, it) }
}

// ---- Kopf und Datumszeile ---------------------------------------------------------------

/** Der Kopf wie auf allen Tabs; darunter der gewaehlte Tag als Zeile ("Heute, 28.09."). */
@Composable
private fun Kopf(m: PlaetzeModell, glocke: @Composable () -> Unit) {
    Column {
        GrosserKopf("Plätze", name = m.ich?.name, glocke = glocke)
        Leise(PlaetzeLogik.tageszeile(m.datum, m.heute), Modifier.padding(top = 0.dp))
    }
}

/** Die Tagesleiste: die buchbaren Tage als runde Kacheln - nur so viele, wie lead_days erlaubt. */
@Composable
private fun Tagwahl(m: PlaetzeModell) {
    LazyRow(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        contentPadding = PaddingValues(horizontal = Abstand.rand),
        modifier = Modifier
            .randlos()
            .semantics { contentDescription = "Tag wählen" },
    ) {
        items(m.tage) { t ->
            TagKachel(t, heute = m.heute, aktiv = t == m.datum) { m.waehleTag(t) }
        }
    }
}

// ---- Leiste und Snackbar ----------------------------------------------------------------

/** Unten ueber dem Inhalt: Platz und Zeit der Auswahl, daneben "Buchen" - die eine Hauptaktion des Screens. */
@Composable
private fun BuchenLeiste(platz: AktiverPlatz, auswahl: Auswahl, dauer: Int, aktion: () -> Unit) {
    val f = TcmTheme.farben
    val form = RoundedCornerShape(Radius.karteGross)
    val schatten = TcmTheme.schatten.schwebend
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 68.dp)
            .shadow(schatten.elevation, form, ambientColor = schatten.farbe, spotColor = schatten.farbe)
            .background(f.surf, form)
            .border(1.dp, f.line, form)
            .padding(start = 22.dp, end = 8.dp, top = 8.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f).semantics(mergeDescendants = true) {}, verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                "${platz.name ?: ""} · ${Zeit.minutesToTime(auswahl.minute)} – ${Zeit.minutesToTime(auswahl.minute + dauer)}",
                style = TcmSchrift.display(Schrift.gewichtFett, 16.sp).copy(fontFeatureSettings = "tnum"),
                color = f.ink,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                "frei bis ${Zeit.minutesToTime(auswahl.bis)}",
                style = TcmSchrift.text(Schrift.gewichtNormal, Schrift.klein),
                color = f.muted,
                maxLines = 1,
            )
        }
        Knopf(
            "Buchen",
            stufe = Knopfstufe.HAUPT,
            breit = false,
            beschreibung = "${platz.name ?: ""} um ${Zeit.minutesToTime(auswahl.minute)} Uhr buchen",
            aktion = aktion,
        )
    }
}

/** Rueckmeldung nach einer Aktion (Toast.tsx): dunkle Snackbar mit Haken oder Warnung. */
@Composable
fun HinweisZeile(h: Hinweis, schliessen: () -> Unit) {
    val f = TcmTheme.farben
    Row(
        Modifier
            .fillMaxWidth()
            .shadow(8.dp, RoundedCornerShape(Radius.karte))
            .background(f.ink, RoundedCornerShape(Radius.karte))
            .clickable(onClickLabel = "Meldung schließen", onClick = schliessen)
            .padding(horizontal = 20.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(
            if (h.ok) Icons.Filled.CheckCircle else Icons.Filled.Warning,
            contentDescription = null,
            tint = if (h.ok) f.green else f.red,
        )
        Text(h.text, style = TcmSchrift.text(Schrift.gewichtHalbfett, 15.sp), color = f.bg, modifier = Modifier.weight(1f))
    }
}
