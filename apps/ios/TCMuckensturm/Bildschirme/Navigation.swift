/**
 * Wechsel zwischen den Tabs
 *
 * Home fuehrt auf Bildschirme, die es nativ noch nicht gibt (Buchen, Spiele,
 * Getraenke, Veranstaltungen). Bis dahin landet ein Tippen auf dem
 * passenden Tab - Plaetze, Verein oder Konto. HauptTabs setzt `zuTab`.
 */

import SwiftUI

enum HauptTab: Hashable, Sendable {
    case home, plaetze, verein, konto
}

private struct ZuTabSchluessel: EnvironmentKey {
    static let defaultValue: @MainActor @Sendable (HauptTab) -> Void = { _ in }
}

extension EnvironmentValues {
    /// Wechselt den Tab (siehe HauptTabs).
    var zuTab: @MainActor @Sendable (HauptTab) -> Void {
        get { self[ZuTabSchluessel.self] }
        set { self[ZuTabSchluessel.self] = newValue }
    }
}
