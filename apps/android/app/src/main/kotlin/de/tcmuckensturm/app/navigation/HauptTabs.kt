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
 */

package de.tcmuckensturm.app.navigation

import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import de.tcmuckensturm.app.bildschirme.home.HomeGraph
import de.tcmuckensturm.app.bildschirme.home.homeGraph
import de.tcmuckensturm.app.bildschirme.konto.kontoGraph
import de.tcmuckensturm.app.bildschirme.plaetze.plaetzeGraph
import de.tcmuckensturm.app.bildschirme.verein.VereinGraph
import de.tcmuckensturm.app.bildschirme.verein.VereinTab
import de.tcmuckensturm.app.bildschirme.verein.vereinGraph
import de.tcmuckensturm.app.bildschirme.verwaltung.rememberVerwaltungSichtbar
import de.tcmuckensturm.app.bildschirme.verwaltung.verwaltungGraph
import de.tcmuckensturm.app.start.LocalSitzung
import de.tcmuckensturm.app.theme.TcmSchrift
import de.tcmuckensturm.app.theme.TcmTheme
import de.tcmuckensturm.app.ui.tokens.Schrift

@Composable
fun HauptTabs() {
    val sitzung = LocalSitzung.current
    HauptTabsInhalt(verwaltungSichtbar = rememberVerwaltungSichtbar(sitzung.client))
}

/** Ohne Sitzung, damit die Screenshot-Tests die Leiste zeichnen koennen. */
@Composable
fun HauptTabsInhalt(verwaltungSichtbar: Boolean, nav: NavHostController = rememberNavController()) {
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
        containerColor = f.bg,
        contentWindowInsets = WindowInsets(0),
        bottomBar = {
            NavigationBar(containerColor = f.surf) {
                for (tab in tabs) {
                    val aktiv = ziel?.hierarchy?.any { it.hasRoute(tab.graph::class) } == true
                    NavigationBarItem(
                        selected = aktiv,
                        onClick = { zuTab(tab) },
                        icon = { Icon(tab.symbol, contentDescription = null) },
                        label = { Text(tab.titel, style = TcmSchrift.text(Schrift.gewichtHalbfett, Schrift.klein)) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = f.navAktivInk,
                            selectedTextColor = f.ink,
                            indicatorColor = f.navAktiv,
                            unselectedIconColor = f.muted,
                            unselectedTextColor = f.muted,
                        ),
                    )
                }
            }
        },
    ) { innen ->
        CompositionLocalProvider(LocalZuTab provides zuTab) {
            // Korb und Reiter des Vereins ueberleben Tab-Wechsel; die Erinnerung an den Korb kommt von hier.
            val vereinOffen = ziel?.hierarchy?.any { it.hasRoute(VereinGraph::class) } == true
            VereinTab(nav, vereinOffen, zuTab) {
                NavHost(
                    navController = nav,
                    startDestination = HomeGraph,
                    modifier = Modifier.padding(bottom = innen.calculateBottomPadding()),
                ) {
                    homeGraph(nav)
                    plaetzeGraph(nav)
                    vereinGraph(nav)
                    kontoGraph(nav)
                    verwaltungGraph(nav)
                }
            }
        }
    }
}
