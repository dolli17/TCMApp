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
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Star
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.unit.dp
import de.tcmuckensturm.app.bildschirme.home.HomeGraph
import de.tcmuckensturm.app.bildschirme.konto.KontoGraph
import de.tcmuckensturm.app.bildschirme.plaetze.PlaetzeGraph
import de.tcmuckensturm.app.bildschirme.verein.VereinGraph
import de.tcmuckensturm.app.bildschirme.verwaltung.VerwaltungGraph

enum class HauptTab(val titel: String, val symbol: ImageVector, val graph: Any) {
    HOME("Home", Icons.Outlined.Home, HomeGraph),
    PLAETZE("Plätze", Tennisschlaeger, PlaetzeGraph),
    VEREIN("Verein", Icons.Outlined.Star, VereinGraph),
    KONTO("Konto", Icons.Outlined.AccountCircle, KontoGraph),

    /** Nur mit Platzrechten sichtbar (bildschirme/verwaltung). */
    VERWALTUNG("Verwaltung", Icons.Outlined.Build, VerwaltungGraph),
}

/**
 * Tennisschlaeger fuer den Plaetze-Tab (wie "tennis.racket" in der iOS-App).
 * Pfad aus Material Symbols "sports_tennis" (Apache 2.0); material-icons-core
 * hat kein Tennis-Symbol, und extended waere fuer ein Symbol zu gross.
 */
private val Tennisschlaeger: ImageVector =
    ImageVector.Builder("Tennisschlaeger", 24.dp, 24.dp, 960f, 960f)
        .addGroup(translationY = 960f)
        .addPath(
            PathParser().parsePathString(
                "m137-160-57-56 164-164q31-31 42.5-77.5T298-600q0-58 26-114t74-104q91-91 201-103t181 61q72 72 60 182T738-478q-48 48-104 74t-114 26q-97 0-142 11t-77 43L137-160Zm275-334q47 46 127 34t143-75q64-64 76.5-143.5T724-803q-48-48-125.5-36T456-763q-63 63-76.5 142.5T412-494ZM720-40q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113T720-40Zm0-80q33 0 56.5-23.5T800-200q0-33-23.5-56.5T720-280q-33 0-56.5 23.5T640-200q0 33 23.5 56.5T720-120Zm0-80Z",
            ).toNodes(),
            fill = SolidColor(Color.Black),
        )
        .clearGroup()
        .build()

/**
 * Wechselt den Tab - wie `zuTab` in der iOS-App. Bildschirme, die auf einen
 * anderen Tab fuehren (Home -> Plaetze), rufen `LocalZuTab.current(HauptTab.PLAETZE)`.
 */
val LocalZuTab = staticCompositionLocalOf<(HauptTab) -> Unit> { {} }
