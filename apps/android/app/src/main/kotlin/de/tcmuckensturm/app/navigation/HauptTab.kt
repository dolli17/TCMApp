/*
 * Die Tabs nach der Anmeldung
 *
 * Home, Plaetze, Verein, Konto - und Verwaltung nur mit Platzrechten (wie
 * HauptTab in der iOS-App). Jeder Tab hat sein eigenes Paket unter
 * bildschirme/ mit einem eigenen Navigationsgraphen (`<tab>Graph`); hier
 * steht nur, welcher Graph zu welchem Tab gehoert.
 */

package de.tcmuckensturm.app.navigation

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.outlined.Build
import androidx.compose.material.icons.outlined.DateRange
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Star
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.vector.ImageVector
import de.tcmuckensturm.app.bildschirme.home.HomeGraph
import de.tcmuckensturm.app.bildschirme.konto.KontoGraph
import de.tcmuckensturm.app.bildschirme.plaetze.PlaetzeGraph
import de.tcmuckensturm.app.bildschirme.verein.VereinGraph
import de.tcmuckensturm.app.bildschirme.verwaltung.VerwaltungGraph

enum class HauptTab(val titel: String, val symbol: ImageVector, val graph: Any) {
    HOME("Home", Icons.Outlined.Home, HomeGraph),
    PLAETZE("Plätze", Icons.Outlined.DateRange, PlaetzeGraph),
    VEREIN("Verein", Icons.Outlined.Star, VereinGraph),
    KONTO("Konto", Icons.Outlined.AccountCircle, KontoGraph),

    /** Nur mit Platzrechten sichtbar (bildschirme/verwaltung). */
    VERWALTUNG("Verwaltung", Icons.Outlined.Build, VerwaltungGraph),
}

/**
 * Wechselt den Tab - wie `zuTab` in der iOS-App. Bildschirme, die auf einen
 * anderen Tab fuehren (Home -> Plaetze), rufen `LocalZuTab.current(HauptTab.PLAETZE)`.
 */
val LocalZuTab = staticCompositionLocalOf<(HauptTab) -> Unit> { {} }
