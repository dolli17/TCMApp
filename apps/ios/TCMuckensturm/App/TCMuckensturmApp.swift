/**
 * Einstieg der nativen iOS-App
 *
 * Liest die Umgebung aus der Info.plist und zeigt dann, was die Weiche
 * (Sitzung, StartLogik) entscheidet. Fehlt die Konfiguration, erscheint ein
 * Hinweis statt eines Absturzes - wie in apps/mobile/src/lib/supabase.ts.
 */

import SwiftUI

@main
struct TCMuckensturmApp: App {
    @State private var sitzung: Sitzung?
    private let konfigurationsFehler: Umgebung.Fehler?

    init() {
        do {
            _sitzung = State(initialValue: Sitzung(umgebung: try Umgebung.ausBundle()))
            konfigurationsFehler = nil
        } catch {
            _sitzung = State(initialValue: nil)
            konfigurationsFehler = error as? Umgebung.Fehler ?? .fehlt("Info.plist")
        }
    }

    private static let unterTests = ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil

    var body: some Scene {
        WindowGroup {
            if Self.unterTests {
                // Die Unit-Tests laufen in der App; die soll dabei nicht mit Supabase sprechen.
                Color.clear
            } else if let sitzung {
                StartAnsicht()
                    .environment(sitzung)
                    .task { sitzung.starten() }
            } else {
                KonfigurationFehlt(fehler: konfigurationsFehler)
            }
        }
    }
}

/// Zeigt den Bildschirm, den die Weiche gewaehlt hat.
struct StartAnsicht: View {
    @Environment(Sitzung.self) private var sitzung

    var body: some View {
        Group {
            switch sitzung.ziel {
            case .laden:
                // Derselbe Grund wie der Startbildschirm, damit nichts aufblitzt.
                ProgressView()
                    .tint(Farbe.gold)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color("Markenblau"))
                    .ignoresSafeArea()
            case .anmelden:
                AnmeldenBildschirm()
            case let .keinZugang(grund):
                KeinZugangBildschirm(grund: grund)
            case .onboarding:
                OnboardingPlatzhalter()
            case .tabs:
                HauptTabs()
            }
        }
        .animation(.default, value: sitzung.ziel)
    }
}

private struct KonfigurationFehlt: View {
    let fehler: Umgebung.Fehler?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Konfiguration fehlt")
                .font(Schrift.text(.extrafett, 28, relativeTo: .title))
            Text(beschreibung)
                .font(Schrift.text(.normal, 16))
            Text("Für „Lokal“: apps/ios/scripts/lokal-konfigurieren.sh ausführen und neu bauen (siehe apps/ios/README.md).")
                .font(Schrift.text(.normal, 14))
                .foregroundStyle(Farbe.ink2)
        }
        .padding(Tokens.abstand.rand)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .foregroundStyle(Farbe.ink)
        .background(Farbe.bg)
    }

    private var beschreibung: String {
        switch fehler {
        case let .fehlt(schluessel): "In der Info.plist fehlt \(schluessel)."
        case let .ungueltig(schluessel): "\(schluessel) in der Info.plist ist keine gültige Adresse."
        case nil: "Die Umgebung ließ sich nicht lesen."
        }
    }
}
