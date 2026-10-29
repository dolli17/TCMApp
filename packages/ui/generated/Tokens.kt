// ===========================================================================
// Design-Tokens des TC Muckensturm
//
// ERZEUGT AUS packages/ui/src/tokens.ts - NICHT VON HAND AENDERN.
// Neu erzeugen mit: pnpm --filter @tcm/ui build:native
//
// Bedeutung und Regeln der einzelnen Tokens stehen als Kommentar in
// tokens.ts (etwa: gold nie als Textfarbe auf hellem Grund).
// ===========================================================================

package de.tcmuckensturm.app.ui.tokens

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

enum class Theme { HELL, DUNKEL }

// Farben

@Immutable
data class Palette(
    val blue: Color,
    val blueInk: Color,
    val blueSoft: Color,
    val gold: Color,
    val goldSoft: Color,
    val goldInk: Color,
    val goldLine: Color,
    val onGold: Color,
    val green: Color,
    val greenInk: Color,
    val greenSatt: Color,
    val red: Color,
    val redInk: Color,
    val brand: Color,
    val onBrand: Color,
    val bg: Color,
    val surf: Color,
    val surf2: Color,
    val surf3: Color,
    val ink: Color,
    val ink2: Color,
    val muted: Color,
    val line: Color,
    val line2: Color,
    val rahmen: Color,
    val chip: Color,
    val glass: Color,
    val glassLine: Color,
    val tabAktiv: Color,
    val tabAktivInk: Color,
    val navAktiv: Color,
    val navAktivInk: Color,
    val segAktiv: Color,
    val segAktivRand: Color,
) {
    companion object {
        fun fuer(theme: Theme): Palette = if (theme == Theme.HELL) Hell else Dunkel
    }
}

val Hell = Palette(
    blue = Color(0xFF1A6FB0),
    blueInk = Color(0xFF0F4C81),
    blueSoft = Color(0xFFE2EFFA),
    gold = Color(0xFFFFD21F),
    goldSoft = Color(0xFFFFF6D1),
    goldInk = Color(0xFF7A5C00),
    goldLine = Color(0xFFE0B400),
    onGold = Color(0xFF0A1624),
    green = Color(0xFF1E9E6A),
    greenInk = Color(0xFF126C48),
    greenSatt = Color(0xFF168259),
    red = Color(0xFFC4433A),
    redInk = Color(0xFFA8352D),
    brand = Color(0xFF1466A8),
    onBrand = Color(0xFFFFFFFF),
    bg = Color(0xFFF3F5F8),
    surf = Color(0xFFFFFFFF),
    surf2 = Color(0xFFEEF2F6),
    surf3 = Color(0xFFE2E8EF),
    ink = Color(0xFF0A1624),
    ink2 = Color(0xFF44566B),
    muted = Color(0xFF596A7D),
    line = Color(0xFFE3E8EE),
    line2 = Color(0xFFCBD5E0),
    rahmen = Color(0xFF76869A),
    chip = Color(0xFFEEF2F6),
    glass = Color(0xD1FFFFFF),
    glassLine = Color(0x140A1624),
    tabAktiv = Color(0xFFFFD21F),
    tabAktivInk = Color(0xFF0A1624),
    navAktiv = Color(0xFF0A1624),
    navAktivInk = Color(0xFFFFFFFF),
    segAktiv = Color(0xFFFFFFFF),
    segAktivRand = Color(0xFF44566B),
)

val Dunkel = Palette(
    blue = Color(0xFF2478BE),
    blueInk = Color(0xFF8CC6F0),
    blueSoft = Color(0x2E3A9BE0),
    gold = Color(0xFFFFD21F),
    goldSoft = Color(0x24FFD21F),
    goldInk = Color(0xFFFFD21F),
    goldLine = Color(0xFFFFD21F),
    onGold = Color(0xFF0A1624),
    green = Color(0xFF3DD68C),
    greenInk = Color(0xFF3DD68C),
    greenSatt = Color(0xFF168259),
    red = Color(0xFFCF3F35),
    redInk = Color(0xFFFF6B61),
    brand = Color(0xFF1466A8),
    onBrand = Color(0xFFFFFFFF),
    bg = Color(0xFF07111D),
    surf = Color(0xFF0E1A29),
    surf2 = Color(0xFF152538),
    surf3 = Color(0xFF1E3249),
    ink = Color(0xFFF3F7FB),
    ink2 = Color(0xFFB3C2D2),
    muted = Color(0xFF879AAE),
    line = Color(0x14FFFFFF),
    line2 = Color(0x29FFFFFF),
    rahmen = Color(0xFF677C93),
    chip = Color(0xFF152538),
    glass = Color(0xC7162436),
    glassLine = Color(0x1FFFFFFF),
    tabAktiv = Color(0x24FFD21F),
    tabAktivInk = Color(0xFFFFD21F),
    navAktiv = Color(0x1FFFD21F),
    navAktivInk = Color(0xFFFFD21F),
    segAktiv = Color(0xFF1E3249),
    segAktivRand = Color(0xFFB3C2D2),
)

/** Die vier Toene der Avatare, in beiden Themes gleich. Schrift darauf ist onBrand. */
val AvatarToene: List<Color> = listOf(
    Color(0xFF1466A8),
    Color(0xFF105083),
    Color(0xFF2370AC),
    Color(0xFF2C618F),
)

// Schatten

/**
 * Android zeichnet nur nach elevation, und nur auf Flaechen mit deckendem
 * Hintergrund. Farbe, Radius und Versatz sind fuer eigene Schatten
 * (Modifier.shadow mit ambientColor/spotColor).
 */
@Immutable
data class Schatten(val farbe: Color, val elevation: Dp, val radius: Dp, val x: Dp, val y: Dp)

@Immutable
data class Schattenstufen(val normal: Schatten, val klein: Schatten, val schwebend: Schatten) {
    companion object {
        val Hell = Schattenstufen(
            normal = Schatten(farbe = Color(0x0F0A1624), elevation = 2.dp, radius = 10.dp, x = 0.dp, y = 6.dp),
            klein = Schatten(farbe = Color(0x0D0A1624), elevation = 1.dp, radius = 2.dp, x = 0.dp, y = 1.dp),
            schwebend = Schatten(farbe = Color(0x290A1624), elevation = 12.dp, radius = 20.dp, x = 0.dp, y = 16.dp),
        )

        /** Karten liegen im Dunkeln ohne Schatten, nur die schwebende Leiste behaelt ihren. */
        val Dunkel = Schattenstufen(
            normal = Schatten(farbe = Color(0x00000000), elevation = 0.dp, radius = 0.dp, x = 0.dp, y = 0.dp),
            klein = Schatten(farbe = Color(0x00000000), elevation = 0.dp, radius = 0.dp, x = 0.dp, y = 0.dp),
            schwebend = Schatten(farbe = Color(0x80000000), elevation = 12.dp, radius = 20.dp, x = 0.dp, y = 16.dp),
        )
    }
}

// Schrift

object Schrift {
    /** Fliesstext und - in 800 - grosse Titel */
    const val FAMILIE_TEXT = "Barlow"
    /** Uhrzeiten, Zahlen und Kicker */
    const val FAMILIE_DISPLAY = "Barlow Semi Condensed"

    /** Dateinamen unter res/font (Google Fonts, kleingeschrieben) */
    const val DATEI_TEXT_NORMAL = "barlow_regular"
    const val DATEI_TEXT_MITTEL = "barlow_medium"
    const val DATEI_TEXT_HALBFETT = "barlow_semibold"
    const val DATEI_TEXT_FETT = "barlow_bold"
    const val DATEI_TEXT_EXTRAFETT = "barlow_extrabold"
    const val DATEI_DISPLAY_NORMAL = "barlowsemicondensed_regular"
    const val DATEI_DISPLAY_MITTEL = "barlowsemicondensed_medium"
    const val DATEI_DISPLAY_HALBFETT = "barlowsemicondensed_semibold"
    const val DATEI_DISPLAY_FETT = "barlowsemicondensed_bold"
    const val DATEI_DISPLAY_EXTRAFETT = "barlowsemicondensed_extrabold"

    val kicker: TextUnit = 13.sp
    val klein: TextUnit = 13.sp
    val normal: TextUnit = 16.sp
    val titel: TextUnit = 22.sp
    val seitentitel: TextUnit = 34.sp
    val hero: TextUnit = 40.sp

    val gewichtNormal = FontWeight(400)
    val gewichtMittel = FontWeight(500)
    val gewichtHalbfett = FontWeight(600)
    val gewichtFett = FontWeight(700)
    val gewichtExtrafett = FontWeight(800)

    /** Faktor auf die Schriftgroesse */
    const val ZEILENHOEHE = 1.45f
    /** in sp */
    val laufweite: TextUnit = 0.1.sp
    /** in em, also mal Schriftgroesse */
    const val LAUFWEITE_KICKER_EM = 0.14f
    /** in sp, fuer den Seitentitel */
    val laufweiteTitel: TextUnit = (-0.6).sp
}

// Abstand und Radius

object Abstand {
    val xs: Dp = 4.dp
    val s: Dp = 8.dp
    val m: Dp = 12.dp
    val l: Dp = 14.dp
    val rand: Dp = 20.dp
    val abschnitt: Dp = 28.dp
}

object Radius {
    val klein: Dp = 10.dp
    val feld: Dp = 16.dp
    val knopf: Dp = 16.dp
    val karte: Dp = 22.dp
    val karteGross: Dp = 26.dp
    val blatt: Dp = 30.dp
    val chip: Dp = 99.dp
}
