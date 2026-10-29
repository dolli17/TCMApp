/**
 * Die Tabs nach der Anmeldung: Home, Plaetze, Verein, Konto
 *
 * Frueher standen hier die Platzhalter; die Bildschirme stehen jetzt in
 * Bildschirme/. Der fuenfte Tab, die Verwaltung, erscheint nur mit
 * Platzrechten (VerwaltungZugang).
 */

import SwiftUI

struct HauptTabs: View {
    @State private var tab: HauptTab = .home
    @State private var verein = VereinZustand()
    @State private var verwaltung = VerwaltungZugang()
    @Environment(Sitzung.self) private var sitzung

    var body: some View {
        TabView(selection: $tab) {
            HomeBildschirm()
                .tabItem { Label("Home", systemImage: "house") }
                .tag(HauptTab.home)
            PlaetzeBildschirm()
                .tabItem { Label("Plätze", systemImage: "sportscourt") }
                .tag(HauptTab.plaetze)
            VereinBildschirm()
                .tabItem { Label("Verein", systemImage: "person.3") }
                .tag(HauptTab.verein)
            KontoBildschirm()
                .tabItem { Label("Konto", systemImage: "person.crop.circle") }
                .tag(HauptTab.konto)
            if verwaltung.sichtbar {
                VerwaltungBildschirm()
                    .tabItem { Label("Verwaltung", systemImage: "wrench.and.screwdriver") }
                    .tag(HauptTab.verwaltung)
            }
        }
        .environment(verwaltung)
        .task { await verwaltung.pruefen(sitzung.client) }
        .tint(Farbe.blue)
        // Home fuehrt auf Bildschirme, die es nativ noch nicht gibt: bis dahin der passende Tab.
        .environment(\.zuTab) { tab = $0 }
        // Getippte Push-Nachrichten oeffnen ihr Ziel (App/PushNavigation.swift). Innen, damit
        // zuVerein aus vereinTab schon gilt.
        .pushZiele($tab)
        .vereinTab(verein, tab: $tab)
        #if DEBUG
        // Fuer Bildschirmfotos per simctl (README): `-TCMTab konto` oeffnet den Tab.
        .task {
            let argumente = ProcessInfo.processInfo.arguments
            if let i = argumente.firstIndex(of: "-TCMTab"), i + 1 < argumente.count {
                let ziel: [String: HauptTab] = ["plaetze": .plaetze, "verein": .verein, "konto": .konto, "verwaltung": .verwaltung]
                // Die Verwaltung erst, wenn ich() die Rechte bestaetigt hat.
                if ziel[argumente[i + 1]] == .verwaltung { await verwaltung.pruefen(sitzung.client) }
                tab = ziel[argumente[i + 1]] ?? tab
            }
        }
        #endif
    }
}
