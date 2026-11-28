/*
 * Die Tabs nach der Anmeldung: Leiste unten, darueber der Graph des Tabs
 *
 * Ein NavHost fuer alle Tabs; jeder Tab bringt seinen eigenen Graphen mit
 * (homeGraph, plaetzeGraph, ...) und navigiert darin selbst weiter. Beim
 * Wechsel behaelt jeder Tab seinen Stapel (saveState/restoreState), die
 * Zurueck-Geste geht erst im Tab zurueck, dann auf Home.
 *
 * Die Tab-Leiste haelt unten frei; oben (Statusleiste) sorgt jeder
 * Bildschirm selbst fuer Abstand, damit grosse Koepfe darunter zeichnen koennen.
 *
 * Angetippte Push-Nachrichten und Widgets oeffnen hier ihr Ziel (push/PushNavigation.kt).
 */

package de.tcmuckensturm.app.navigation

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsTopHeight
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import de.tcmuckensturm.app.TcmApp
import de.tcmuckensturm.app.bildschirme.GedeckelteSchrift
import de.tcmuckensturm.app.bildschirme.home.HomeGraph
import de.tcmuckensturm.app.bildschirme.home.homeGraph
import de.tcmuckensturm.app.bildschirme.konto.KontoMannschaft
import de.tcmuckensturm.app.bildschirme.konto.LocalZuMannschaft
import de.tcmuckensturm.app.bildschirme.konto.kontoGraph
import de.tcmuckensturm.app.bildschirme.plaetze.plaetzeGraph
import de.tcmuckensturm.app.bildschirme.verein.VereinGraph
import de.tcmuckensturm.app.bildschirme.verein.VereinTab
import de.tcmuckensturm.app.bildschirme.verein.vereinGraph
import de.tcmuckensturm.app.bildschirme.verwaltung.rememberVerwaltungSichtbar
import de.tcmuckensturm.app.bildschirme.verwaltung.verwaltungGraph
import de.tcmuckensturm.app.daten.Pushdaten
import de.tcmuckensturm.app.push.PushZentrale
import de.tcmuckensturm.app.push.PushZieleOeffnen
import de.tcmuckensturm.app.start.LocalSitzung
import de.tcmuckensturm.app.theme.TcmSchrift
import de.tcmuckensturm.app.theme.TcmTheme
import de.tcmuckensturm.app.ui.tokens.Schrift

@Composable
fun HauptTabs() {
    val sitzung = LocalSitzung.current
    val push = TcmApp.aus(LocalContext.current).push
    // Hat FCM inzwischen eine andere Marke vergeben, wird die neue angemeldet.
    LaunchedEffect(sitzung) { push.auffrischen(Pushdaten(sitzung.client)) }
    HauptTabsInhalt(verwaltungSichtbar = rememberVerwaltungSichtbar(sitzung.client), push = push)
}

/** Ohne Sitzung, damit die Screenshot-Tests die Leiste zeichnen koennen; dort ohne Push. */
@Composable
fun HauptTabsInhalt(
    verwaltungSichtbar: Boolean,
    nav: NavHostController = rememberNavController(),
    push: PushZentrale? = null,
) {
    val tabs = HauptTab.entries.filter { it != HauptTab.VERWALTUNG || verwaltungSichtbar }
    val eintrag by nav.currentBackStackEntryAsState()
    val ziel = eintrag?.destination
    val f = TcmTheme.farben

    val zuTab: (HauptTab) -> Unit = { tab ->
        nav.navigate(tab.graph) {
            popUpTo(nav.graph.findStartDestination().id) { saveState = true }
            launchSingleTop = true
            restoreState = true
        }
    }

    Scaffold(
        containerColor = f.gruppenGrund,
        contentWindowInsets = WindowInsets(0),
        bottomBar = {
            // Tab-Leiste im iOS-Stil (docs/design/ios-stil.md): volle Breite, feine Linie oben,
            // Symbol ueber der Beschriftung, aktiv in Blau, ohne Pillen-Indikator.
            Column(Modifier.fillMaxWidth().background(f.surf)) {
                Box(Modifier.fillMaxWidth().height(0.5.dp).background(f.line2))
                Row(
                    Modifier
                        .fillMaxWidth()
                        .navigationBarsPadding()
                        .padding(horizontal = 4.dp)
                        .selectableGroup(),
                ) {
                    for (tab in tabs) {
                        val aktiv = ziel?.hierarchy?.any { it.hasRoute(tab.graph::class) } == true
                        val farbe = if (aktiv) f.blue else f.muted
                        Column(
                            Modifier
                                .weight(1f)
                                .heightIn(min = 56.dp)
                                .selectable(selected = aktiv, role = Role.Tab) { zuTab(tab) }
                                .padding(top = 7.dp, bottom = 5.dp, start = 2.dp, end = 2.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(3.dp, Alignment.Top),
                        ) {
                            Icon(tab.symbol, contentDescription = null, tint = farbe, modifier = Modifier.size(25.dp))
                            // Feste Flaeche: die Beschriftung waechst nur bis 120 % mit.
                            GedeckelteSchrift {
                                Text(
                                    tab.titel,
                                    style = TcmSchrift.text(Schrift.gewichtMittel, 10.5.sp),
                                    color = farbe,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                        }
                    }
                }
            }
        },
    ) { innen ->
        val zuMannschaft: () -> Unit = {
            zuTab(HauptTab.KONTO)
            nav.navigate(KontoMannschaft) { launchSingleTop = true }
        }
        CompositionLocalProvider(LocalZuTab provides zuTab, LocalZuMannschaft provides zuMannschaft) {
            // Korb und Reiter des Vereins ueberleben Tab-Wechsel; die Erinnerung an den Korb kommt von hier.
            val vereinOffen = ziel?.hierarchy?.any { it.hasRoute(VereinGraph::class) } == true
            VereinTab(nav, vereinOffen, zuTab) {
                Box(Modifier.fillMaxSize()) {
                    NavHost(
                        navController = nav,
                        startDestination = HomeGraph,
                        // consumeWindowInsets: Was die Tab-Leiste schon freihaelt, zieht imePadding() darunter ab.
                        modifier = Modifier.padding(bottom = innen.calculateBottomPadding()).consumeWindowInsets(innen),
                    ) {
                        homeGraph(nav)
                        plaetzeGraph(nav)
                        vereinGraph(nav)
                        kontoGraph(nav)
                        verwaltungGraph(nav)
                    }
                    // Edge-to-Edge: Was unter die Statusleiste scrollt, verschwindet hinter dem
                    // Seitenhintergrund, statt mit Uhrzeit und Symbolen zu kollidieren.
                    Spacer(
                        Modifier
                            .fillMaxWidth()
                            .windowInsetsTopHeight(WindowInsets.statusBars)
                            .background(f.gruppenGrund),
                    )
                }
                // Innerhalb von VereinTab: eine Veranstaltung oeffnet ueber LocalZuVerein ihr Detail.
                if (push != null) PushZieleOeffnen(push, nav, zuTab)
            }
        }
    }
}
