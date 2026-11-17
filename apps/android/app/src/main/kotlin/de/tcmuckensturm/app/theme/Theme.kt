/*
 * Farben und Schrift fuer Compose
 *
 * Die Werte kommen aus packages/ui/generated/Tokens.kt (erzeugt aus
 * packages/ui/src/tokens.ts, in app/build.gradle.kts als Quelle eingebunden).
 * `TcmTheme.farben.ink` ist die Farbe aus der Palette des aktuellen Themes,
 * hell oder dunkel. Material 3 bekommt daraus sein Farbschema, damit
 * Bausteine wie Schalter und Dialoge zu den Vereinsfarben passen.
 *
 * Rollen der Farben: docs/design/stitch/README.md (Blau die eine Hauptaktion,
 * Hellblau alles Zweite und Ausgewaehlte, Gelb nur "deins"). Auch die
 * Anmeldeseiten folgen dem gewaehlten Erscheinungsbild.
 */

package de.tcmuckensturm.app.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import de.tcmuckensturm.app.R
import de.tcmuckensturm.app.ui.tokens.Dunkel
import de.tcmuckensturm.app.ui.tokens.Hell
import de.tcmuckensturm.app.ui.tokens.Palette
import de.tcmuckensturm.app.ui.tokens.Schattenstufen
import de.tcmuckensturm.app.ui.tokens.Schrift

private val LocalFarben = staticCompositionLocalOf { Hell }
private val LocalSchatten = staticCompositionLocalOf { Schattenstufen.Hell }
private val LocalDunkel = staticCompositionLocalOf { false }

object TcmTheme {
    val farben: Palette
        @Composable @ReadOnlyComposable
        get() = LocalFarben.current

    val schatten: Schattenstufen
        @Composable @ReadOnlyComposable
        get() = LocalSchatten.current

    val dunkel: Boolean
        @Composable @ReadOnlyComposable
        get() = LocalDunkel.current
}

/**
 * DM Sans fuer Fliesstext, Space Grotesk fuer Titel, Uhrzeiten, Zahlen, Kicker
 * und Knoepfe (docs/design/stitch); Space Grotesk gibt es nur bis 700, extrafett
 * faellt auf fett zurueck. Die Dateien liegen unter
 * res/font (OFL, assets/lizenzen/OFL-Schriften.txt); die Namen stehen in
 * Tokens.Schrift.DATEI_*. Groessen in sp wachsen mit der Schriftgroesse des Systems.
 */
object TcmSchrift {
    val text = FontFamily(
        Font(R.font.dmsans_regular, Schrift.gewichtNormal),
        Font(R.font.dmsans_medium, Schrift.gewichtMittel),
        Font(R.font.dmsans_semibold, Schrift.gewichtHalbfett),
        Font(R.font.dmsans_bold, Schrift.gewichtFett),
        Font(R.font.dmsans_extrabold, Schrift.gewichtExtrafett),
    )

    val display = FontFamily(
        Font(R.font.spacegrotesk_regular, Schrift.gewichtNormal),
        Font(R.font.spacegrotesk_medium, Schrift.gewichtMittel),
        Font(R.font.spacegrotesk_semibold, Schrift.gewichtHalbfett),
        Font(R.font.spacegrotesk_bold, Schrift.gewichtFett),
        Font(R.font.spacegrotesk_bold, Schrift.gewichtExtrafett),
    )

    fun text(gewicht: FontWeight, groesse: TextUnit, laufweite: TextUnit = TextUnit.Unspecified) =
        TextStyle(fontFamily = text, fontWeight = gewicht, fontSize = groesse, letterSpacing = laufweite)

    fun display(gewicht: FontWeight, groesse: TextUnit, laufweite: TextUnit = TextUnit.Unspecified) =
        TextStyle(fontFamily = display, fontWeight = gewicht, fontSize = groesse, letterSpacing = laufweite)

    /** Kicker: klein, Versalien, weit gesperrt (Tokens.Schrift.LAUFWEITE_KICKER_EM). */
    val kicker = display(Schrift.gewichtFett, Schrift.kicker, Schrift.LAUFWEITE_KICKER_EM.em)
}

/** Material 3 mit den Vereinsfarben. */
fun farbschema(p: Palette, dunkel: Boolean): ColorScheme {
    val basis = if (dunkel) darkColorScheme() else lightColorScheme()
    return basis.copy(
        primary = p.blue,
        onPrimary = p.onBrand,
        primaryContainer = p.blueSoft,
        onPrimaryContainer = p.blueInk,
        // Gelb ist kein Bedienelement (nur "deins"): auch die zweite Rolle von Material ist blau.
        secondary = p.blue,
        onSecondary = p.onBrand,
        secondaryContainer = p.blueSoft,
        onSecondaryContainer = p.blueInk,
        tertiary = p.green,
        background = p.bg,
        onBackground = p.ink,
        surface = p.surf,
        onSurface = p.ink,
        surfaceVariant = p.surf2,
        onSurfaceVariant = p.ink2,
        surfaceContainerLowest = p.surf,
        surfaceContainerLow = p.surf,
        surfaceContainer = p.surf2,
        surfaceContainerHigh = p.surf2,
        surfaceContainerHighest = p.surf3,
        outline = p.rahmen,
        outlineVariant = p.line2,
        error = p.red,
        onError = p.onBrand,
    )
}

private fun typografie(): Typography {
    val t = Typography()
    fun TextStyle.fliesstext() = copy(fontFamily = TcmSchrift.text)
    return Typography(
        displayLarge = t.displayLarge.fliesstext(),
        displayMedium = t.displayMedium.fliesstext(),
        displaySmall = t.displaySmall.fliesstext(),
        headlineLarge = TcmSchrift.display(Schrift.gewichtFett, Schrift.seitentitel, Schrift.laufweiteTitel),
        headlineMedium = t.headlineMedium.copy(fontFamily = TcmSchrift.display, fontWeight = Schrift.gewichtFett),
        headlineSmall = t.headlineSmall.copy(fontFamily = TcmSchrift.display, fontWeight = Schrift.gewichtFett),
        titleLarge = TcmSchrift.display(Schrift.gewichtFett, Schrift.titel),
        titleMedium = t.titleMedium.fliesstext().copy(fontWeight = Schrift.gewichtHalbfett),
        titleSmall = t.titleSmall.fliesstext().copy(fontWeight = Schrift.gewichtHalbfett),
        bodyLarge = TcmSchrift.text(Schrift.gewichtNormal, Schrift.normal),
        bodyMedium = t.bodyMedium.fliesstext(),
        bodySmall = TcmSchrift.text(Schrift.gewichtNormal, Schrift.klein),
        labelLarge = t.labelLarge.copy(fontFamily = TcmSchrift.display, fontWeight = Schrift.gewichtHalbfett),
        labelMedium = t.labelMedium.fliesstext().copy(fontWeight = Schrift.gewichtHalbfett),
        labelSmall = t.labelSmall.fliesstext().copy(fontWeight = Schrift.gewichtHalbfett, fontSize = 12.sp),
    )
}

@Composable
fun TcmTheme(dunkel: Boolean = isSystemInDarkTheme(), inhalt: @Composable () -> Unit) {
    val palette = if (dunkel) Dunkel else Hell
    Systemleisten(dunkel)
    MaterialTheme(colorScheme = farbschema(palette, dunkel), typography = typografie()) {
        CompositionLocalProvider(
            LocalFarben provides palette,
            LocalSchatten provides if (dunkel) Schattenstufen.Dunkel else Schattenstufen.Hell,
            LocalDunkel provides dunkel,
            LocalContentColor provides palette.ink,
        ) {
            inhalt()
        }
    }
}

/**
 * Helle Symbole in der Statusleiste auf dunklem Grund und umgekehrt (Edge-to-Edge).
 * Stecken Themes ineinander, stellt das innere beim Gehen den Stand davor wieder her.
 */
@Composable
private fun Systemleisten(dunkel: Boolean) {
    val view = LocalView.current
    if (view.isInEditMode) return
    DisposableEffect(view, dunkel) {
        val fenster = (view.context as? Activity)?.window ?: return@DisposableEffect onDispose {}
        val leisten = WindowCompat.getInsetsController(fenster, view)
        val vorher = leisten.isAppearanceLightStatusBars to leisten.isAppearanceLightNavigationBars
        leisten.isAppearanceLightStatusBars = !dunkel
        leisten.isAppearanceLightNavigationBars = !dunkel
        onDispose {
            leisten.isAppearanceLightStatusBars = vorher.first
            leisten.isAppearanceLightNavigationBars = vorher.second
        }
    }
}
