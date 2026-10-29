/**
 * Wechsel zwischen den Tabs
 *
 * Home fuehrt auf Bildschirme, die es nativ noch nicht gibt (Buchen, Spiele).
 * Bis dahin landet ein Tippen auf dem passenden Tab - Plaetze oder Konto.
 * HauptTabs setzt `zuTab`. In den Verein geht es mit `zuVerein` gezielt:
 * auf einen Reiter oder gleich in eine Veranstaltung (Bildschirme/Verein).
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

/// Wohin im Tab Verein.
enum VereinZiel: Hashable, Sendable {
    case getraenke, veranstaltungen
    case veranstaltung(String)
}

private struct ZuVereinSchluessel: EnvironmentKey {
    static let defaultValue: @MainActor @Sendable (VereinZiel) -> Void = { _ in }
}

extension EnvironmentValues {
    /// Wechselt in den Tab Verein, auf einen Reiter oder in eine Veranstaltung (siehe vereinTab).
    var zuVerein: @MainActor @Sendable (VereinZiel) -> Void {
        get { self[ZuVereinSchluessel.self] }
        set { self[ZuVereinSchluessel.self] = newValue }
    }
}
