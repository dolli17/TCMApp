/**
 * Platzhalter fuer alles, was nach der Anmeldung kommt
 *
 * Onboarding und die vier Tabs (Home, Plaetze, Verein, Konto) bauen die
 * naechsten Schritte. Die Verwaltung kommt spaeter dazu.
 */

import SwiftUI

struct HauptTabs: View {
    var body: some View {
        TabView {
            Platzhalter(titel: "Home")
                .tabItem { Label("Home", systemImage: "house") }
            Platzhalter(titel: "Plätze")
                .tabItem { Label("Plätze", systemImage: "sportscourt") }
            Platzhalter(titel: "Verein")
                .tabItem { Label("Verein", systemImage: "person.3") }
            Platzhalter(titel: "Konto", abmelden: true)
                .tabItem { Label("Konto", systemImage: "person.crop.circle") }
        }
        .tint(Farbe.blue)
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
        VStack(alignment: .leading, spacing: Tokens.abstand.m) {
            Text(titel)
                .font(Schrift.text(.extrafett, Tokens.schrift.groesse.seitentitel, relativeTo: .largeTitle))
                .tracking(Tokens.schrift.laufweiteTitel)
                .foregroundStyle(Farbe.ink)
                .accessibilityAddTraits(.isHeader)
            Text("Dieser Bereich kommt in einem der nächsten Schritte.")
                .font(Schrift.text(.normal, Tokens.schrift.groesse.normal))
                .foregroundStyle(Farbe.ink2)
            Spacer()
            if abmelden {
                Button("Abmelden") { Task { await sitzung.abmelden() } }
                    .font(Schrift.text(.fett, 16))
                    .foregroundStyle(Farbe.redInk)
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
        }
        .padding(Tokens.abstand.rand)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Farbe.bg)
    }
}
