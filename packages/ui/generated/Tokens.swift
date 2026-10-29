// ===========================================================================
// Design-Tokens des TC Muckensturm
//
// ERZEUGT AUS packages/ui/src/tokens.ts - NICHT VON HAND AENDERN.
// Neu erzeugen mit: pnpm --filter @tcm/ui build:native
//
// Bedeutung und Regeln der einzelnen Tokens stehen als Kommentar in
// tokens.ts (etwa: gold nie als Textfarbe auf hellem Grund).
// ===========================================================================

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
        public let blue: Color
        public let blueInk: Color
        public let blueSoft: Color
        public let gold: Color
        public let goldSoft: Color
        public let goldInk: Color
        public let goldLine: Color
        public let onGold: Color
        public let green: Color
        public let greenInk: Color
        public let greenSatt: Color
        public let red: Color
        public let redInk: Color
        public let brand: Color
        public let onBrand: Color
        public let bg: Color
        public let surf: Color
        public let surf2: Color
        public let surf3: Color
        public let ink: Color
        public let ink2: Color
        public let muted: Color
        public let line: Color
        public let line2: Color
        public let rahmen: Color
        public let chip: Color
        public let glass: Color
        public let glassLine: Color
        public let tabAktiv: Color
        public let tabAktivInk: Color
        public let navAktiv: Color
        public let navAktivInk: Color
        public let segAktiv: Color
        public let segAktivRand: Color

        public static let hell = Palette(
            blue: Color(rgba: 0x1A6FB0FF),
            blueInk: Color(rgba: 0x0F4C81FF),
            blueSoft: Color(rgba: 0xE2EFFAFF),
            gold: Color(rgba: 0xFFD21FFF),
            goldSoft: Color(rgba: 0xFFF6D1FF),
            goldInk: Color(rgba: 0x7A5C00FF),
            goldLine: Color(rgba: 0xE0B400FF),
            onGold: Color(rgba: 0x0A1624FF),
            green: Color(rgba: 0x1E9E6AFF),
            greenInk: Color(rgba: 0x126C48FF),
            greenSatt: Color(rgba: 0x168259FF),
            red: Color(rgba: 0xC4433AFF),
            redInk: Color(rgba: 0xA8352DFF),
            brand: Color(rgba: 0x1466A8FF),
            onBrand: Color(rgba: 0xFFFFFFFF),
            bg: Color(rgba: 0xF3F5F8FF),
            surf: Color(rgba: 0xFFFFFFFF),
            surf2: Color(rgba: 0xEEF2F6FF),
            surf3: Color(rgba: 0xE2E8EFFF),
            ink: Color(rgba: 0x0A1624FF),
            ink2: Color(rgba: 0x44566BFF),
            muted: Color(rgba: 0x596A7DFF),
            line: Color(rgba: 0xE3E8EEFF),
            line2: Color(rgba: 0xCBD5E0FF),
            rahmen: Color(rgba: 0x76869AFF),
            chip: Color(rgba: 0xEEF2F6FF),
            glass: Color(rgba: 0xFFFFFFD1),
            glassLine: Color(rgba: 0x0A162414),
            tabAktiv: Color(rgba: 0xFFD21FFF),
            tabAktivInk: Color(rgba: 0x0A1624FF),
            navAktiv: Color(rgba: 0x0A1624FF),
            navAktivInk: Color(rgba: 0xFFFFFFFF),
            segAktiv: Color(rgba: 0xFFFFFFFF),
            segAktivRand: Color(rgba: 0x44566BFF)
        )

        public static let dunkel = Palette(
            blue: Color(rgba: 0x2478BEFF),
            blueInk: Color(rgba: 0x8CC6F0FF),
            blueSoft: Color(rgba: 0x3A9BE02E),
            gold: Color(rgba: 0xFFD21FFF),
            goldSoft: Color(rgba: 0xFFD21F24),
            goldInk: Color(rgba: 0xFFD21FFF),
            goldLine: Color(rgba: 0xFFD21FFF),
            onGold: Color(rgba: 0x0A1624FF),
            green: Color(rgba: 0x3DD68CFF),
            greenInk: Color(rgba: 0x3DD68CFF),
            greenSatt: Color(rgba: 0x168259FF),
            red: Color(rgba: 0xCF3F35FF),
            redInk: Color(rgba: 0xFF6B61FF),
            brand: Color(rgba: 0x1466A8FF),
            onBrand: Color(rgba: 0xFFFFFFFF),
            bg: Color(rgba: 0x07111DFF),
            surf: Color(rgba: 0x0E1A29FF),
            surf2: Color(rgba: 0x152538FF),
            surf3: Color(rgba: 0x1E3249FF),
            ink: Color(rgba: 0xF3F7FBFF),
            ink2: Color(rgba: 0xB3C2D2FF),
            muted: Color(rgba: 0x879AAEFF),
            line: Color(rgba: 0xFFFFFF14),
            line2: Color(rgba: 0xFFFFFF29),
            rahmen: Color(rgba: 0x677C93FF),
            chip: Color(rgba: 0x152538FF),
            glass: Color(rgba: 0x162436C7),
            glassLine: Color(rgba: 0xFFFFFF1F),
            tabAktiv: Color(rgba: 0xFFD21F24),
            tabAktivInk: Color(rgba: 0xFFD21FFF),
            navAktiv: Color(rgba: 0xFFD21F1F),
            navAktivInk: Color(rgba: 0xFFD21FFF),
            segAktiv: Color(rgba: 0x1E3249FF),
            segAktivRand: Color(rgba: 0xB3C2D2FF)
        )

        /// Folgt der Systemeinstellung. Bildschirme mit festem Theme (die
        /// Anmeldung ist immer dunkel) nehmen `hell` oder `dunkel`.
        public static let system = Palette(
            blue: Color(hell: 0x1A6FB0FF, dunkel: 0x2478BEFF),
            blueInk: Color(hell: 0x0F4C81FF, dunkel: 0x8CC6F0FF),
            blueSoft: Color(hell: 0xE2EFFAFF, dunkel: 0x3A9BE02E),
            gold: Color(hell: 0xFFD21FFF, dunkel: 0xFFD21FFF),
            goldSoft: Color(hell: 0xFFF6D1FF, dunkel: 0xFFD21F24),
            goldInk: Color(hell: 0x7A5C00FF, dunkel: 0xFFD21FFF),
            goldLine: Color(hell: 0xE0B400FF, dunkel: 0xFFD21FFF),
            onGold: Color(hell: 0x0A1624FF, dunkel: 0x0A1624FF),
            green: Color(hell: 0x1E9E6AFF, dunkel: 0x3DD68CFF),
            greenInk: Color(hell: 0x126C48FF, dunkel: 0x3DD68CFF),
            greenSatt: Color(hell: 0x168259FF, dunkel: 0x168259FF),
            red: Color(hell: 0xC4433AFF, dunkel: 0xCF3F35FF),
            redInk: Color(hell: 0xA8352DFF, dunkel: 0xFF6B61FF),
            brand: Color(hell: 0x1466A8FF, dunkel: 0x1466A8FF),
            onBrand: Color(hell: 0xFFFFFFFF, dunkel: 0xFFFFFFFF),
            bg: Color(hell: 0xF3F5F8FF, dunkel: 0x07111DFF),
            surf: Color(hell: 0xFFFFFFFF, dunkel: 0x0E1A29FF),
            surf2: Color(hell: 0xEEF2F6FF, dunkel: 0x152538FF),
            surf3: Color(hell: 0xE2E8EFFF, dunkel: 0x1E3249FF),
            ink: Color(hell: 0x0A1624FF, dunkel: 0xF3F7FBFF),
            ink2: Color(hell: 0x44566BFF, dunkel: 0xB3C2D2FF),
            muted: Color(hell: 0x596A7DFF, dunkel: 0x879AAEFF),
            line: Color(hell: 0xE3E8EEFF, dunkel: 0xFFFFFF14),
            line2: Color(hell: 0xCBD5E0FF, dunkel: 0xFFFFFF29),
            rahmen: Color(hell: 0x76869AFF, dunkel: 0x677C93FF),
            chip: Color(hell: 0xEEF2F6FF, dunkel: 0x152538FF),
            glass: Color(hell: 0xFFFFFFD1, dunkel: 0x162436C7),
            glassLine: Color(hell: 0x0A162414, dunkel: 0xFFFFFF1F),
            tabAktiv: Color(hell: 0xFFD21FFF, dunkel: 0xFFD21F24),
            tabAktivInk: Color(hell: 0x0A1624FF, dunkel: 0xFFD21FFF),
            navAktiv: Color(hell: 0x0A1624FF, dunkel: 0xFFD21F1F),
            navAktivInk: Color(hell: 0xFFFFFFFF, dunkel: 0xFFD21FFF),
            segAktiv: Color(hell: 0xFFFFFFFF, dunkel: 0x1E3249FF),
            segAktivRand: Color(hell: 0x44566BFF, dunkel: 0xB3C2D2FF)
        )

        public static func fuer(_ theme: Theme) -> Palette {
            theme == .hell ? .hell : .dunkel
        }
    }

    public static let farben = Palette.system

    /// Die vier Toene der Avatare, in beiden Themes gleich. Schrift darauf ist onBrand.
    public static let avatarToene: [Color] = [
        Color(rgba: 0x1466A8FF),
        Color(rgba: 0x105083FF),
        Color(rgba: 0x2370ACFF),
        Color(rgba: 0x2C618FFF)
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
            normal: Schatten(farbe: Color(rgba: 0x0A16240F), radius: 10, x: 0, y: 6),
            klein: Schatten(farbe: Color(rgba: 0x0A16240D), radius: 2, x: 0, y: 1),
            schwebend: Schatten(farbe: Color(rgba: 0x0A162429), radius: 20, x: 0, y: 16)
        )

        /// Karten liegen im Dunkeln ohne Schatten, nur die schwebende Leiste behaelt ihren.
        public static let dunkel = Schattenstufen(
            normal: Schatten(farbe: Color(rgba: 0x00000000), radius: 0, x: 0, y: 0),
            klein: Schatten(farbe: Color(rgba: 0x00000000), radius: 0, x: 0, y: 0),
            schwebend: Schatten(farbe: Color(rgba: 0x00000080), radius: 20, x: 0, y: 16)
        )
    }

    // MARK: Schrift

    public enum Schrift {
        /// Fliesstext und - in 800 - grosse Titel
        public static let familieText = "Barlow"
        /// Uhrzeiten, Zahlen und Kicker
        public static let familieDisplay = "Barlow Semi Condensed"

        /// PostScript-Namen fuer Font.custom
        public static let textNormal = "Barlow-Regular"
        public static let textMittel = "Barlow-Medium"
        public static let textHalbfett = "Barlow-SemiBold"
        public static let textFett = "Barlow-Bold"
        public static let textExtrafett = "Barlow-ExtraBold"
        public static let displayNormal = "BarlowSemiCondensed-Regular"
        public static let displayMittel = "BarlowSemiCondensed-Medium"
        public static let displayHalbfett = "BarlowSemiCondensed-SemiBold"
        public static let displayFett = "BarlowSemiCondensed-Bold"
        public static let displayExtrafett = "BarlowSemiCondensed-ExtraBold"

        public static let kicker: CGFloat = 13
        public static let klein: CGFloat = 13
        public static let normal: CGFloat = 16
        public static let titel: CGFloat = 22
        public static let seitentitel: CGFloat = 34
        public static let hero: CGFloat = 40

        public static let gewichtNormal: Font.Weight = .regular
        public static let gewichtMittel: Font.Weight = .medium
        public static let gewichtHalbfett: Font.Weight = .semibold
        public static let gewichtFett: Font.Weight = .bold
        public static let gewichtExtrafett: Font.Weight = .heavy

        /// Faktor auf die Schriftgroesse
        public static let zeilenhoehe: CGFloat = 1.45
        /// in Punkt
        public static let laufweite: CGFloat = 0.1
        /// in em, also mal Schriftgroesse
        public static let laufweiteKicker: CGFloat = 0.14
        /// in Punkt, fuer den Seitentitel
        public static let laufweiteTitel: CGFloat = -0.6
    }

    // MARK: Abstand und Radius

    public enum Abstand {
        public static let xs: CGFloat = 4
        public static let s: CGFloat = 8
        public static let m: CGFloat = 12
        public static let l: CGFloat = 14
        public static let rand: CGFloat = 20
        public static let abschnitt: CGFloat = 28
    }

    public enum Radius {
        public static let klein: CGFloat = 10
        public static let feld: CGFloat = 16
        public static let knopf: CGFloat = 16
        public static let karte: CGFloat = 22
        public static let karteGross: CGFloat = 26
        public static let blatt: CGFloat = 30
        public static let chip: CGFloat = 99
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
