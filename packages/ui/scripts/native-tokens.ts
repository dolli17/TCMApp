/**
 * Die Design-Tokens als Swift (SwiftUI) und Kotlin (Jetpack Compose).
 *
 * Dieselbe Quelle wie tokens.css: tokens.ts. Die Funktionen hier liefern den
 * Dateiinhalt, build-native.ts schreibt ihn nach generated/. Der Test
 * native-tokens.test.ts vergleicht die eingecheckten Dateien mit dem, was
 * hier herauskommt - wer tokens.ts aendert und das Skript vergisst, faellt
 * dort auf.
 *
 * Farben: "#RRGGBB" und "rgba(r,g,b,a)" werden zu sRGB-Werten mit Deckkraft.
 * Masse (Abstand, Radius, Schriftgroesse) sind auf beiden Plattformen
 * dieselben Zahlen wie in px - als CGFloat-Punkte bzw. dp.
 */

import { abstand, avatarToene, farben, radius, schattenRn, schrift, type Farbname } from "../src/tokens";

export interface Rgba {
  r: number;
  g: number;
  b: number;
  /** 0 bis 1 */
  a: number;
}

/** "#1A6FB0" oder "rgba(255,255,255,.82)" -> Kanaele */
export function alsRgba(wert: string): Rgba {
  const hex = /^#([0-9a-f]{6})$/i.exec(wert);
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff, a: 1 };
  }
  const rgba = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/.exec(wert);
  if (rgba) {
    return { r: Number(rgba[1]), g: Number(rgba[2]), b: Number(rgba[3]), a: Number(rgba[4]) };
  }
  throw new Error(`Farbe nicht lesbar: ${wert}`);
}

/** 0xRRGGBBAA - in Swift und Kotlin dieselbe Schreibweise */
function alsHex8({ r, g, b, a }: Rgba): string {
  const kanal = (v: number) => v.toString(16).toUpperCase().padStart(2, "0");
  return `0x${kanal(r)}${kanal(g)}${kanal(b)}${kanal(Math.round(a * 255))}`;
}

/** 0xAARRGGBB - die Schreibweise von Compose (Color(0xFF1A6FB0)) */
function alsArgb({ r, g, b, a }: Rgba): string {
  const kanal = (v: number) => v.toString(16).toUpperCase().padStart(2, "0");
  return `0x${kanal(Math.round(a * 255))}${kanal(r)}${kanal(g)}${kanal(b)}`;
}

const farbnamen = Object.keys(farben.hell) as Farbname[];

/**
 * Schriftschnitte, wie die Dateien von Google Fonts heissen. Die PostScript-
 * Namen braucht iOS (Font.custom), Android nimmt die Dateien als
 * res/font/<datei>.ttf und baut daraus eine FontFamily.
 */
const SCHNITTE = {
  normal: { gewicht: schrift.gewicht.normal, suffix: "Regular" },
  mittel: { gewicht: schrift.gewicht.mittel, suffix: "Medium" },
  halbfett: { gewicht: schrift.gewicht.halbfett, suffix: "SemiBold" },
  fett: { gewicht: schrift.gewicht.fett, suffix: "Bold" },
  extrafett: { gewicht: schrift.gewicht.extrafett, suffix: "ExtraBold" },
} as const;

const KOPF = (kommentar: string) => `${kommentar} ===========================================================================
${kommentar} Design-Tokens des TC Muckensturm
${kommentar}
${kommentar} ERZEUGT AUS packages/ui/src/tokens.ts - NICHT VON HAND AENDERN.
${kommentar} Neu erzeugen mit: pnpm --filter @tcm/ui build:native
${kommentar}
${kommentar} Bedeutung und Regeln der einzelnen Tokens stehen als Kommentar in
${kommentar} tokens.ts (etwa: gold nie als Textfarbe auf hellem Grund).
${kommentar} ===========================================================================`;

// ---------------------------------------------------------------------------
// Swift
// ---------------------------------------------------------------------------

export function swiftTokens(): string {
  const paletteFelder = farbnamen.map((n) => `        public let ${n}: Color`).join("\n");
  const palette = (theme: "hell" | "dunkel") =>
    farbnamen.map((n) => `            ${n}: Color(rgba: ${alsHex8(alsRgba(farben[theme][n]))})`).join(",\n");
  const system = farbnamen
    .map((n) => {
      const h = alsHex8(alsRgba(farben.hell[n]));
      const d = alsHex8(alsRgba(farben.dunkel[n]));
      return `            ${n}: Color(hell: ${h}, dunkel: ${d})`;
    })
    .join(",\n");

  const schatten = (theme: "hell" | "dunkel") =>
    Object.entries(schattenRn[theme])
      .map(([stufe, s]) => {
        const c = alsRgba(s.shadowColor);
        return `            ${stufe}: Schatten(farbe: Color(rgba: ${alsHex8({ ...c, a: s.shadowOpacity })}), radius: ${String(s.shadowRadius)}, x: ${String(s.shadowOffset.width)}, y: ${String(s.shadowOffset.height)})`;
      })
      .join(",\n");

  return `${KOPF("//")}

import SwiftUI
#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

public enum Tokens {
    public enum Theme: String, Sendable, CaseIterable {
        case hell, dunkel
    }

    // MARK: Farben

    public struct Palette: Sendable {
${paletteFelder}

        public static let hell = Palette(
${palette("hell")}
        )

        public static let dunkel = Palette(
${palette("dunkel")}
        )

        /// Folgt der Systemeinstellung. Bildschirme mit festem Theme (die
        /// Anmeldung ist immer dunkel) nehmen \`hell\` oder \`dunkel\`.
        public static let system = Palette(
${system}
        )

        public static func fuer(_ theme: Theme) -> Palette {
            theme == .hell ? .hell : .dunkel
        }
    }

    public static let farben = Palette.system

    /// Die vier Toene der Avatare, in beiden Themes gleich. Schrift darauf ist onBrand.
    public static let avatarToene: [Color] = [
${avatarToene.map((t) => `        Color(rgba: ${alsHex8(alsRgba(t))})`).join(",\n")}
    ]

    // MARK: Schatten

    public struct Schatten: Sendable {
        public let farbe: Color
        public let radius: CGFloat
        public let x: CGFloat
        public let y: CGFloat
    }

    public struct Schattenstufen: Sendable {
        public let normal: Schatten
        public let klein: Schatten
        public let schwebend: Schatten

        public static let hell = Schattenstufen(
${schatten("hell")}
        )

        /// Karten liegen im Dunkeln ohne Schatten, nur die schwebende Leiste behaelt ihren.
        public static let dunkel = Schattenstufen(
${schatten("dunkel")}
        )
    }

    // MARK: Schrift

    public enum Schrift {
        /// Fliesstext und - in 800 - grosse Titel
        public static let familieText = "Barlow"
        /// Uhrzeiten, Zahlen und Kicker
        public static let familieDisplay = "Barlow Semi Condensed"

        /// PostScript-Namen fuer Font.custom
${Object.entries(SCHNITTE)
  .map(([name, s]) => `        public static let text${gross(name)} = "Barlow-${s.suffix}"`)
  .join("\n")}
${Object.entries(SCHNITTE)
  .map(([name, s]) => `        public static let display${gross(name)} = "BarlowSemiCondensed-${s.suffix}"`)
  .join("\n")}

${Object.entries(schrift.groesse)
  .map(([k, v]) => `        public static let ${k}: CGFloat = ${String(v)}`)
  .join("\n")}

${Object.entries(SCHNITTE)
  .map(([name, s]) => `        public static let gewicht${gross(name)}: Font.Weight = .${swiftGewicht(s.gewicht)}`)
  .join("\n")}

        /// Faktor auf die Schriftgroesse
        public static let zeilenhoehe: CGFloat = ${String(schrift.zeilenhoehe)}
        /// in Punkt
        public static let laufweite: CGFloat = ${String(schrift.laufweite)}
        /// in em, also mal Schriftgroesse
        public static let laufweiteKicker: CGFloat = ${String(schrift.laufweiteKicker)}
        /// in Punkt, fuer den Seitentitel
        public static let laufweiteTitel: CGFloat = ${String(schrift.laufweiteTitel)}
    }

    // MARK: Abstand und Radius

    public enum Abstand {
${Object.entries(abstand)
  .map(([k, v]) => `        public static let ${k}: CGFloat = ${String(v)}`)
  .join("\n")}
    }

    public enum Radius {
${Object.entries(radius)
  .map(([k, v]) => `        public static let ${k}: CGFloat = ${String(v)}`)
  .join("\n")}
    }
}

extension Color {
    /// 0xRRGGBBAA in sRGB
    init(rgba: UInt32) {
        self.init(
            .sRGB,
            red: Double((rgba >> 24) & 0xFF) / 255,
            green: Double((rgba >> 16) & 0xFF) / 255,
            blue: Double((rgba >> 8) & 0xFF) / 255,
            opacity: Double(rgba & 0xFF) / 255
        )
    }

    /// Hell oder dunkel, je nach Darstellung der Ansicht
    init(hell: UInt32, dunkel: UInt32) {
        #if canImport(UIKit)
        self.init(uiColor: UIColor { merkmale in
            UIColor(Color(rgba: merkmale.userInterfaceStyle == .dark ? dunkel : hell))
        })
        #elseif canImport(AppKit)
        self.init(nsColor: NSColor(name: nil) { erscheinung in
            let istDunkel = erscheinung.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
            return NSColor(Color(rgba: istDunkel ? dunkel : hell))
        })
        #else
        self.init(rgba: hell)
        #endif
    }
}
`;
}

function gross(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function swiftGewicht(g: number): string {
  const namen: Record<number, string> = { 400: "regular", 500: "medium", 600: "semibold", 700: "bold", 800: "heavy" };
  const name = namen[g];
  if (!name) throw new Error(`Schriftgewicht ${g} hat keinen Namen in SwiftUI`);
  return name;
}

// ---------------------------------------------------------------------------
// Kotlin
// ---------------------------------------------------------------------------

export function kotlinTokens(): string {
  const paletteFelder = farbnamen.map((n) => `    val ${n}: Color,`).join("\n");
  const palette = (theme: "hell" | "dunkel") =>
    farbnamen.map((n) => `    ${n} = Color(${alsArgb(alsRgba(farben[theme][n]))}),`).join("\n");

  const schatten = (theme: "hell" | "dunkel") =>
    Object.entries(schattenRn[theme])
      .map(([stufe, s]) => {
        const c = alsRgba(s.shadowColor);
        return `            ${stufe} = Schatten(farbe = Color(${alsArgb({ ...c, a: s.shadowOpacity })}), elevation = ${String(s.elevation)}.dp, radius = ${String(s.shadowRadius)}.dp, x = ${String(s.shadowOffset.width)}.dp, y = ${String(s.shadowOffset.height)}.dp),`;
      })
      .join("\n");

  return `${KOPF("//")}

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
${paletteFelder}
) {
    companion object {
        fun fuer(theme: Theme): Palette = if (theme == Theme.HELL) Hell else Dunkel
    }
}

val Hell = Palette(
${palette("hell")}
)

val Dunkel = Palette(
${palette("dunkel")}
)

/** Die vier Toene der Avatare, in beiden Themes gleich. Schrift darauf ist onBrand. */
val AvatarToene: List<Color> = listOf(
${avatarToene.map((t) => `    Color(${alsArgb(alsRgba(t))}),`).join("\n")}
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
${schatten("hell")}
        )

        /** Karten liegen im Dunkeln ohne Schatten, nur die schwebende Leiste behaelt ihren. */
        val Dunkel = Schattenstufen(
${schatten("dunkel")}
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
${Object.entries(SCHNITTE)
  .map(([name, s]) => `    const val DATEI_TEXT_${name.toUpperCase()} = "barlow_${s.suffix.toLowerCase()}"`)
  .join("\n")}
${Object.entries(SCHNITTE)
  .map(([name, s]) => `    const val DATEI_DISPLAY_${name.toUpperCase()} = "barlowsemicondensed_${s.suffix.toLowerCase()}"`)
  .join("\n")}

${Object.entries(schrift.groesse)
  .map(([k, v]) => `    val ${k}: TextUnit = ${String(v)}.sp`)
  .join("\n")}

${Object.entries(SCHNITTE)
  .map(([name, s]) => `    val gewicht${gross(name)} = FontWeight(${s.gewicht})`)
  .join("\n")}

    /** Faktor auf die Schriftgroesse */
    const val ZEILENHOEHE = ${String(schrift.zeilenhoehe)}f
    /** in sp */
    val laufweite: TextUnit = ${String(schrift.laufweite)}.sp
    /** in em, also mal Schriftgroesse */
    const val LAUFWEITE_KICKER_EM = ${String(schrift.laufweiteKicker)}f
    /** in sp, fuer den Seitentitel */
    val laufweiteTitel: TextUnit = (${String(schrift.laufweiteTitel)}).sp
}

// Abstand und Radius

object Abstand {
${Object.entries(abstand)
  .map(([k, v]) => `    val ${k}: Dp = ${String(v)}.dp`)
  .join("\n")}
}

object Radius {
${Object.entries(radius)
  .map(([k, v]) => `    val ${k}: Dp = ${String(v)}.dp`)
  .join("\n")}
}
`;
}
