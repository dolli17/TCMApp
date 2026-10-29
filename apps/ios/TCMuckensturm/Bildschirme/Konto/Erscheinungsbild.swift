/**
 * Erscheinungsbild: System, Hell oder Dunkel (ThemeWahl in konto.tsx)
 *
 * Die Systemeinstellung ist die Vorgabe, die Wahl ueberlebt den Neustart
 * (UserDefaults). Gesetzt wird sie fuer das ganze Fenster in StartAnsicht;
 * die Anmeldeseiten bleiben trotzdem dunkel (ImmerDunkel).
 */

import SwiftUI

enum Erscheinungsbild: String, CaseIterable, Identifiable, Sendable {
    case system, hell, dunkel

    static let schluessel = "erscheinungsbild"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .system: "System"
        case .hell: "Hell"
        case .dunkel: "Dunkel"
        }
    }

    /// nil folgt dem System.
    var farbschema: ColorScheme? {
        switch self {
        case .system: nil
        case .hell: .light
        case .dunkel: .dark
        }
    }
}
