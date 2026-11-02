/**
 * Wechsel zwischen den Tabs
 *
 * Home fuehrt auf Bildschirme, die es nativ noch nicht gibt (Buchen).
 * Bis dahin landet ein Tippen auf dem passenden Tab - Plaetze oder Konto.
 * HauptTabs setzt `zuTab`. In den Verein geht es mit `zuVerein` gezielt:
 * auf einen Reiter oder gleich in eine Veranstaltung (Bildschirme/Verein);
 * in die Plaetze mit `zuPlaetze` auf Belegung oder Spiele, mit
 * `zuMannschaft` ins Konto auf die Mannschaft.
 */

import SwiftUI

enum HauptTab: Hashable, Sendable {
    case home, plaetze, verein, konto
    /// Nur mit Platzrechten sichtbar (Bildschirme/Verwaltung).
    case verwaltung
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

/// Wohin im Tab Plaetze.
enum PlaetzeZiel: Hashable, Sendable {
    /// Der Belegungsplan
    case belegung
    /// Meine & offene Spiele; offeneZuerst wie ?zeige=offen in der Expo-App
    case spiele(offeneZuerst: Bool)
}

private struct ZuPlaetzeSchluessel: EnvironmentKey {
    static let defaultValue: @MainActor @Sendable (PlaetzeZiel) -> Void = { _ in }
}

extension EnvironmentValues {
    /// Wechselt in den Tab Plaetze, auf die Belegung oder die Spiele (siehe plaetzeTab).
    var zuPlaetze: @MainActor @Sendable (PlaetzeZiel) -> Void {
        get { self[ZuPlaetzeSchluessel.self] }
        set { self[ZuPlaetzeSchluessel.self] = newValue }
    }
}

/// Wohin im Tab Konto.
enum KontoZiel: Hashable, Sendable {
    /// Einladungen, Kader und die Funktionen des Mannschaftsfuehrers
    case mannschaft
}

private struct ZuMannschaftSchluessel: EnvironmentKey {
    static let defaultValue: @MainActor @Sendable () -> Void = {}
}

extension EnvironmentValues {
    /// Wechselt in den Tab Konto und oeffnet die Mannschaft (siehe kontoTab).
    var zuMannschaft: @MainActor @Sendable () -> Void {
        get { self[ZuMannschaftSchluessel.self] }
        set { self[ZuMannschaftSchluessel.self] = newValue }
    }
}
