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
                    // Universal Links und das eigene Schema (Passwortlink)
                    .onOpenURL { sitzung.linkOeffnen($0) }
                    #if DEBUG
                    // Fuer Bildschirmfotos per simctl (README): `-TCMLink <url>` oeffnet den Link
                    // wie onOpenURL - ohne die Systemfrage "In … oeffnen?" beim eigenen Schema.
                    .task {
                        let argumente = ProcessInfo.processInfo.arguments
                        if let i = argumente.firstIndex(of: "-TCMLink"), i + 1 < argumente.count,
                           let url = URL(string: argumente[i + 1]) {
                            sitzung.linkOeffnen(url)
                        }
                    }
                    #endif
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
            if let passwort = sitzung.passwort {
                // Der Link aus der E-Mail geht vor, bis das Passwort steht.
                PasswortSetzenBildschirm(zustand: passwort)
            } else {
                weiche
            }
        }
        .animation(.default, value: sitzung.ziel)
        .animation(.default, value: sitzung.passwort == nil)
    }

    @ViewBuilder private var weiche: some View {
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
