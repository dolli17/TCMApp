/**
 * Farben und Schrift fuer SwiftUI
 *
 * `Farbe.ink` usw. ist eine dynamische Farbe: hell oder dunkel je nach
 * Erscheinungsbild der Umgebung. Die Anmeldeseiten setzen dafuer
 * `.environment(\.colorScheme, .dark)` - sie sind immer dunkel wie in der
 * Expo-App (ImmerDunkel).
 */

import SwiftUI
import UIKit

@dynamicMemberLookup
enum Farbe {
    static subscript(dynamicMember name: KeyPath<Farbpalette, String>) -> Color {
        let hell = UIColor(tokenFarbe: Tokens.farben.hell[keyPath: name])
        let dunkel = UIColor(tokenFarbe: Tokens.farben.dunkel[keyPath: name])
        return Color(uiColor: UIColor { $0.userInterfaceStyle == .dark ? dunkel : hell })
    }
}

extension UIColor {
    /// "#RRGGBB" oder "rgba(r,g,b,a)" wie in tokens.ts. Unlesbares wird Magenta, damit es auffaellt.
    convenience init(tokenFarbe wert: String) {
        if let (r, g, b, a) = Self.zerlegen(wert) {
            self.init(red: r, green: g, blue: b, alpha: a)
        } else {
            assertionFailure("Unbekanntes Farbformat: \(wert)")
            self.init(red: 1, green: 0, blue: 1, alpha: 1)
        }
    }

    static func zerlegen(_ wert: String) -> (CGFloat, CGFloat, CGFloat, CGFloat)? {
        let w = wert.trimmingCharacters(in: .whitespaces).lowercased()
        if w.hasPrefix("#"), w.count == 7, let zahl = UInt32(w.dropFirst(), radix: 16) {
            return (
                CGFloat((zahl >> 16) & 0xFF) / 255,
                CGFloat((zahl >> 8) & 0xFF) / 255,
                CGFloat(zahl & 0xFF) / 255,
                1
            )
        }
        if w.hasPrefix("rgba("), w.hasSuffix(")") {
            let teile = w.dropFirst(5).dropLast().split(separator: ",").map {
                Double($0.trimmingCharacters(in: .whitespaces))
            }
            guard teile.count == 4, let r = teile[0], let g = teile[1], let b = teile[2], let a = teile[3]
            else { return nil }
            return (CGFloat(r / 255), CGFloat(g / 255), CGFloat(b / 255), CGFloat(a))
        }
        return nil
    }
}

/**
 * Barlow fuer Fliesstext und - in 800 - fuer grosse Titel, Barlow Semi
 * Condensed fuer Uhrzeiten, Zahlen und Kicker. Die Dateien liegen unter
 * Ressourcen/Schriften (OFL, siehe OFL.txt) und stehen in UIAppFonts.
 * Die Groessen wachsen mit der eingestellten Textgroesse (Dynamic Type).
 */
enum Schrift {
    enum Gewicht: String {
        case normal = "Regular", mittel = "Medium", halbfett = "SemiBold", fett = "Bold", extrafett = "ExtraBold"
    }

    static func text(_ gewicht: Gewicht, _ groesse: CGFloat, relativeTo stil: Font.TextStyle = .body) -> Font {
        .custom("Barlow-\(gewicht.rawValue)", size: groesse, relativeTo: stil)
    }

    /// Nur halbfett, fett und extrafett liegen bei (wie in der Expo-App).
    static func display(_ gewicht: Gewicht, _ groesse: CGFloat, relativeTo stil: Font.TextStyle = .body) -> Font {
        .custom("BarlowSemiCondensed-\(gewicht.rawValue)", size: groesse, relativeTo: stil)
    }
}
