/**
 * Farben und Schrift fuer SwiftUI
 *
 * Die Werte kommen aus packages/ui/generated/Tokens.swift (erzeugt aus
 * packages/ui/src/tokens.ts, in project.yml als Quelle eingebunden).
 * `Farbe.ink` usw. ist die dynamische Farbe aus `Tokens.farben`: hell oder
 * dunkel je nach Erscheinungsbild der Umgebung - auch auf den Anmeldeseiten.
 */

import SwiftUI

@dynamicMemberLookup
enum Farbe {
    static subscript(dynamicMember name: KeyPath<Tokens.Palette, Color>) -> Color {
        Tokens.farben[keyPath: name]
    }
}

/**
 * DM Sans fuer Fliesstext, Space Grotesk fuer Titel, Uhrzeiten, Zahlen, Kicker
 * und Knoepfe (docs/design/stitch). Die Dateien liegen unter
 * Ressourcen/Schriften (OFL, siehe OFL.txt) und stehen in UIAppFonts.
 * Die Groessen wachsen mit der eingestellten Textgroesse (Dynamic Type).
 */
enum Schrift {
    enum Gewicht: String {
        case normal = "Regular", mittel = "Medium", halbfett = "SemiBold", fett = "Bold", extrafett = "ExtraBold"
    }

    static func text(_ gewicht: Gewicht, _ groesse: CGFloat, relativeTo stil: Font.TextStyle = .body) -> Font {
        .custom("DMSans-\(gewicht.rawValue)", size: groesse, relativeTo: stil)
    }

    /// Space Grotesk gibt es nur bis 700: extrafett faellt auf fett zurueck.
    static func display(_ gewicht: Gewicht, _ groesse: CGFloat, relativeTo stil: Font.TextStyle = .body) -> Font {
        let schnitt = gewicht == .extrafett ? Gewicht.fett : gewicht
        return .custom("SpaceGrotesk-\(schnitt.rawValue)", size: groesse, relativeTo: stil)
    }
}
