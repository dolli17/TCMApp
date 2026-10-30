/*
 * Plaetze - der Belegungsplan (apps/mobile/app/(tabs)/plaetze/index.tsx)
 *
 * Wie PlaetzeBildschirm.swift der iOS-App: zwei Ansichten derselben
 * Tagesbelegung, umschaltbar ueber den kleinen Schalter rechts in der
 * Datumszeile; die Wahl bleibt gemerkt. Die Uebersicht ist ein Raster -
 * Plaetze als Zeilen, Stunden zum Wischen -, in dem eine freie Flaeche Platz
 * und Beginn auswaehlt; gebucht wird ueber die Leiste unten. Freie Zeiten
 * listet die Startzeiten mit den freien Plaetzen.
 *
 * Ob gebucht werden kann, entscheidet canStartAt (Kern); durchgesetzt wird
 * es ausschliesslich in create_booking. Der Plan haelt sich ueber Realtime
 * aktuell, laedt per Herunterziehen und beim Zurueckkehren in den
 * Vordergrund nach. Rueckmeldungen kommen als Snackbar.
 */

package de.tcmuckensturm.app.bildschirme.plaetze

import android.content.Context
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.KeyboardArrowDown
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
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.edit
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.viewmodel.compose.viewModel
import de.tcmuckensturm.app.bildschirme.Avatar
import de.tcmuckensturm.app.bildschirme.Fehlerzeile
import de.tcmuckensturm.app.bildschirme.GrosserKopf
import de.tcmuckensturm.app.bildschirme.nachrichten.Glocke
import de.tcmuckensturm.app.daten.AktiverPlatz
import de.tcmuckensturm.app.daten.Platzdaten
import de.tcmuckensturm.app.navigation.HauptTab
import de.tcmuckensturm.app.navigation.LocalZuTab
import de.tcmuckensturm.app.start.LocalSitzung
import de.tcmuckensturm.app.theme.TcmSchrift
import de.tcmuckensturm.app.theme.TcmTheme
import de.tcmuckensturm.app.ui.tokens.Abstand
import de.tcmuckensturm.app.ui.tokens.Radius
import de.tcmuckensturm.app.ui.tokens.Schrift
import de.tcmuckensturm.kern.Zeit
import kotlinx.coroutines.delay

private const val ANSICHT_SCHLUESSEL = "tcm-plaetze-ansicht"

@Composable
fun PlaetzeBildschirm() {
    val client = LocalSitzung.current.client
    val einstellungen = LocalContext.current.applicationContext.getSharedPreferences("tcm-plaetze", Context.MODE_PRIVATE)
    val m = viewModel {
        PlaetzeModell(
            quelle = Platzdaten(client),
            ansichtAnfang = Ansicht.aus(einstellungen.getString(ANSICHT_SCHLUESSEL, null)),
            ansichtMerken = { a -> einstellungen.edit { putString(ANSICHT_SCHLUESSEL, a.wert) } },
        )
    }
    val zuTab = LocalZuTab.current
    PlaetzeInhalt(m, glocke = { Glocke(zuVeranstaltung = { zuTab(HauptTab.VEREIN) }) })
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

    Box(Modifier.fillMaxSize().background(f.bg)) {
        PullToRefreshBox(isRefreshing = m.aktualisiert, onRefresh = m::vonHand, modifier = Modifier.fillMaxSize()) {
            Column(
                Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .statusBarsPadding()
                    .padding(horizontal = Abstand.rand)
                    .padding(bottom = Abstand.abschnitt * 2 + if (m.auswahl != null) 72.dp else 0.dp),
                verticalArrangement = Arrangement.spacedBy(Abstand.m),
            ) {
                Kopf(m, glocke)
                Datumszeile(m)
                AnimatedVisibility(m.tagwahlOffen, enter = expandVertically() + fadeIn(), exit = shrinkVertically() + fadeOut()) {
                    Tagwahl(m)
                }
                m.ladeFehler?.let { Fehlerzeile(it, laeuft = m.aktualisiert, erneut = m::vonHand) }
                if (m.laedt && m.geladenFuer != m.datum) {
                    Box(Modifier.fillMaxWidth().padding(top = 40.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = f.muted)
                    }
                } else if (m.geladenFuer != null) {
                    PlaetzeLogik.kontingentText(m.kontingent)?.let { Leise(it) }
                    when (m.ansicht) {
                        Ansicht.UEBERSICHT -> {
                            PlatzRaster(m)
                            RasterLegende()
                        }
                        Ansicht.FREIE_ZEITEN -> {
                            FreieZeiten(m)
                            FreieZeitenLegende()
                        }
                    }
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
                m.ansicht == Ansicht.UEBERSICHT && a != null && p != null && m.fenster == null,
                enter = slideInVertically { it } + fadeIn(),
                exit = slideOutVertically { it } + fadeOut(),
            ) {
                if (a != null && p != null) BuchenLeiste(p, a, m.dauer) { m.buchenAuf(p, a.minute) }
            }
        }
    }

    m.fenster?.let { Buchungsblatt(m, it) }
}

/** Nach dem Zurueckkehren aus dem Hintergrund (ON_STOP, dann ON_START). */
@Composable
private fun ImVordergrund(aktion: () -> Unit) {
    val besitzer = LocalLifecycleOwner.current
    DisposableEffect(besitzer) {
        var warWeg = false
        val beobachter = LifecycleEventObserver { _, ereignis ->
            when (ereignis) {
                Lifecycle.Event.ON_STOP -> warWeg = true
                Lifecycle.Event.ON_START -> if (warWeg) {
                    warWeg = false
                    aktion()
                }
                else -> Unit
            }
        }
        besitzer.lifecycle.addObserver(beobachter)
        onDispose { besitzer.lifecycle.removeObserver(beobachter) }
    }
}

// ---- Kopf und Datumszeile ---------------------------------------------------------------

/** Grosser Titel wie auf iOS, rechts Glocke und Initialen - die fuehren ins Konto. */
@Composable
private fun Kopf(m: PlaetzeModell, glocke: @Composable () -> Unit) {
    val zuTab = LocalZuTab.current
    GrosserKopf("Plätze") {
        glocke()
        val ich = m.ich
        if (ich?.memberId != null) Avatar(PlaetzeLogik.initialen(ich.firstName, ich.lastName)) { zuTab(HauptTab.KONTO) }
    }
}

@Composable
private fun Datumszeile(m: PlaetzeModell) {
    val f = TcmTheme.farben
    val tage = m.tage
    val i = tage.indexOf(m.datum)
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Rundknopf("Vortag", aus = i <= 0, aktion = { m.waehleTag(tage[i - 1]) }) {
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, contentDescription = null, tint = f.ink)
        }
        Row(
            Modifier
                .weight(1f)
                .heightIn(min = 48.dp)
                .clip(RoundedCornerShape(12.dp))
                .clickable(role = Role.Button) { m.tagwahlOffen = !m.tagwahlOffen }
                .semantics(mergeDescendants = true) {
                    contentDescription = "${PlaetzeLogik.lesbar(m.datum)}, Tag wählen"
                    stateDescription = if (m.tagwahlOffen) "aufgeklappt" else "zugeklappt"
                },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center,
        ) {
            Text(
                PlaetzeLogik.tageszeile(m.datum, m.heute),
                style = TcmSchrift.text(Schrift.gewichtFett, 17.sp),
                color = f.ink,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.width(6.dp))
            Icon(
                Icons.Filled.KeyboardArrowDown,
                contentDescription = null,
                tint = f.muted,
                modifier = Modifier.size(18.dp).rotate(if (m.tagwahlOffen) 180f else 0f),
            )
        }
        Rundknopf("Folgetag", aus = i < 0 || i >= tage.size - 1, aktion = { m.waehleTag(tage[i + 1]) }) {
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = f.ink)
        }
        AnsichtSchalter(m.ansicht, m::waehleAnsicht)
    }
}

/**
 * Rechts in der Datumszeile: Uebersicht (Raster) oder Freie Zeiten (Liste).
 * Zwei Knoepfe statt eines Wechselknopfs, damit man sieht, was gerade gilt.
 */
@Composable
private fun AnsichtSchalter(wert: Ansicht, wahl: (Ansicht) -> Unit) {
    val f = TcmTheme.farben
    Row(
        Modifier
            .background(f.surf2, RoundedCornerShape(Radius.knopf - 2.dp))
            .padding(2.dp)
            .semantics { contentDescription = "Darstellung" },
    ) {
        for ((a, label) in listOf(Ansicht.UEBERSICHT to "Übersicht", Ansicht.FREIE_ZEITEN to "Freie Zeiten")) {
            val aktiv = wert == a
            val farbe = if (aktiv) f.ink else f.ink2
            // 36 sichtbar, 44 zum Tippen (U18)
            Box(
                Modifier
                    .size(44.dp)
                    .clip(RoundedCornerShape(Radius.knopf - 4.dp))
                    .clickable(role = Role.Tab) { wahl(a) }
                    .semantics {
                        contentDescription = label
                        selected = aktiv
                    },
                contentAlignment = Alignment.Center,
            ) {
                Box(
                    Modifier
                        .size(36.dp)
                        .then(if (aktiv) Modifier.shadow(1.dp, RoundedCornerShape(Radius.knopf - 6.dp)) else Modifier)
                        .background(if (aktiv) f.segAktiv else Color.Transparent, RoundedCornerShape(Radius.knopf - 6.dp)),
                    contentAlignment = Alignment.Center,
                ) {
                    if (a == Ansicht.UEBERSICHT) {
                        RasterSymbol(farbe)
                    } else {
                        Icon(Icons.AutoMirrored.Filled.List, contentDescription = null, tint = farbe, modifier = Modifier.size(20.dp))
                    }
                }
            }
        }
    }
}

/** Vier Kaestchen - das Symbol fuer die Uebersicht (im Grundsatz der Material-Symbole fehlt es). */
@Composable
private fun RasterSymbol(farbe: Color) {
    Canvas(Modifier.size(16.dp)) {
        val k = size.width * 0.42f
        val r = CornerRadius(2.dp.toPx())
        for (x in listOf(0f, size.width - k)) {
            for (y in listOf(0f, size.height - k)) drawRoundRect(farbe, Offset(x, y), Size(k, k), r)
        }
    }
}

/** Die buchbaren Tage als Kacheln - nur so viele, wie lead_days erlaubt. */
@Composable
private fun Tagwahl(m: PlaetzeModell) {
    LazyRow(
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        contentPadding = PaddingValues(horizontal = Abstand.rand),
        modifier = Modifier.randlos(Abstand.rand),
    ) {
        items(m.tage) { t ->
            TagKachel(t, heute = m.heute, aktiv = t == m.datum) {
                m.waehleTag(t)
                m.tagwahlOffen = false
            }
        }
    }
}

/** Der Plan liess sich nicht laden: oben statt als Snackbar, mit "Erneut versuchen" (U3). */
// ---- Leiste und Snackbar ----------------------------------------------------------------

/** Unten ueber dem Inhalt: Platz und Zeit der Auswahl, daneben "Buchen". */
@Composable
private fun BuchenLeiste(platz: AktiverPlatz, auswahl: Auswahl, dauer: Int, aktion: () -> Unit) {
    val f = TcmTheme.farben
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 64.dp)
            .shadow(10.dp, RoundedCornerShape(22.dp))
            .background(f.ink, RoundedCornerShape(22.dp))
            .padding(start = 18.dp, end = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f).semantics(mergeDescendants = true) {}, verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                "${platz.name ?: ""} · ${Zeit.minutesToTime(auswahl.minute)} – ${Zeit.minutesToTime(auswahl.minute + dauer)}",
                style = TcmSchrift.text(Schrift.gewichtExtrafett, 15.sp),
                color = f.bg,
                maxLines = 1,
            )
            Text(
                "frei bis ${Zeit.minutesToTime(auswahl.bis)}",
                style = TcmSchrift.text(Schrift.gewichtMittel, Schrift.klein),
                color = f.bg.copy(alpha = 0.7f),
                maxLines = 1,
            )
        }
        Box(
            Modifier
                .heightIn(min = 48.dp)
                .clip(RoundedCornerShape(16.dp))
                .background(f.gold)
                .clickable(role = Role.Button, onClick = aktion)
                .semantics { contentDescription = "${platz.name ?: ""} um ${Zeit.minutesToTime(auswahl.minute)} Uhr buchen" }
                .padding(horizontal = 22.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text("Buchen", style = TcmSchrift.text(Schrift.gewichtExtrafett, 15.5.sp), color = f.onGold)
        }
    }
}

/** Rueckmeldung nach einer Aktion (Toast.tsx): dunkle Snackbar mit Haken oder Warnung. */
@Composable
fun HinweisZeile(h: Hinweis, schliessen: () -> Unit) {
    val f = TcmTheme.farben
    Row(
        Modifier
            .fillMaxWidth()
            .shadow(8.dp, RoundedCornerShape(18.dp))
            .background(f.ink, RoundedCornerShape(18.dp))
            .clickable(onClickLabel = "Meldung schließen", onClick = schliessen)
            .padding(horizontal = 16.dp, vertical = 12.dp),
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
