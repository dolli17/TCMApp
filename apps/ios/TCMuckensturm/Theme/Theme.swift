/**
 * Farben und Schrift fuer SwiftUI
 *
 * Die Werte kommen aus packages/ui/generated/Tokens.swift (erzeugt aus
 * packages/ui/src/tokens.ts, in project.yml als Quelle eingebunden).
 * `Farbe.ink` usw. ist die dynamische Farbe aus `Tokens.farben`: hell oder
 * dunkel je nach Erscheinungsbild der Umgebung. Die Anmeldeseiten setzen
 * dafuer `.environment(\.colorScheme, .dark)` - sie sind immer dunkel wie in
 * der Expo-App (ImmerDunkel).
 */

import SwiftUI

@dynamicMemberLookup
enum Farbe {
    static subscript(dynamicMember name: KeyPath<Tokens.Palette, Color>) -> Color {
        Tokens.farben[keyPath: name]
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
