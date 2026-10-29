/**
 * Platzhalter fuer alles, was nach der Anmeldung kommt
 *
 * Onboarding und die Tabs Plaetze, Verein, Konto bauen die naechsten
 * Schritte (Home steht in Bildschirme/Home). Die Verwaltung kommt spaeter dazu.
 */

import SwiftUI

struct HauptTabs: View {
    @State private var tab: HauptTab = .home

    var body: some View {
        TabView(selection: $tab) {
            HomeBildschirm()
                .tabItem { Label("Home", systemImage: "house") }
                .tag(HauptTab.home)
            Platzhalter(titel: "Plätze")
                .tabItem { Label("Plätze", systemImage: "sportscourt") }
                .tag(HauptTab.plaetze)
            Platzhalter(titel: "Verein")
                .tabItem { Label("Verein", systemImage: "person.3") }
                .tag(HauptTab.verein)
            Platzhalter(titel: "Konto", abmelden: true)
                .tabItem { Label("Konto", systemImage: "person.crop.circle") }
                .tag(HauptTab.konto)
        }
        .tint(Farbe.blue)
        // Home fuehrt auf Bildschirme, die es nativ noch nicht gibt: bis dahin der passende Tab.
        .environment(\.zuTab) { tab = $0 }
    }
}

struct OnboardingPlatzhalter: View {
    var body: some View {
        Platzhalter(titel: "Onboarding folgt", abmelden: true)
    }
}

private struct Platzhalter: View {
    @Environment(Sitzung.self) private var sitzung
    let titel: String
    var abmelden = false

    var body: some View {
        VStack(alignment: .leading, spacing: Tokens.Abstand.m) {
            Text(titel)
                .font(Schrift.text(.extrafett, Tokens.Schrift.seitentitel, relativeTo: .largeTitle))
                .tracking(Tokens.Schrift.laufweiteTitel)
                .foregroundStyle(Farbe.ink)
                .accessibilityAddTraits(.isHeader)
            Text("Dieser Bereich kommt in einem der nächsten Schritte.")
                .font(Schrift.text(.normal, Tokens.Schrift.normal))
                .foregroundStyle(Farbe.ink2)
            Spacer()
            if abmelden {
                Button("Abmelden") { Task { await sitzung.abmelden() } }
                    .font(Schrift.text(.fett, 16))
                    .foregroundStyle(Farbe.redInk)
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
        }
        .padding(Tokens.Abstand.rand)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Farbe.bg)
    }
}
