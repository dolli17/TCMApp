/**
 * Das Ziel einer angetippten Push-Nachricht oeffnen
 *
 * Wie usePushZiel in apps/mobile/src/lib/push.ts. Das Ziel wartet in der
 * PushZentrale, bis die Tabs stehen - auch beim Kaltstart, wenn das Tippen
 * die App erst geoeffnet hat und die Weiche noch laedt. Jedes Ziel wird nur
 * einmal geoeffnet.
 *
 * Neuigkeiten kommen als Blatt ueber den aktuellen Tab; eine Veranstaltung
 * oeffnet im Tab Verein ihr Detail (zuVerein aus Bildschirme/Verein).
 */

import SwiftUI

extension View {
    /// An HauptTabs: oeffnet Push-Ziele und frischt die APNs-Marke auf.
    func pushZiele(_ tab: Binding<HauptTab>) -> some View {
        modifier(PushZieleOeffnen(tab: tab))
    }
}

private struct PushZieleOeffnen: ViewModifier {
    @Environment(Sitzung.self) private var sitzung
    @Environment(\.zuVerein) private var zuVerein
    @Binding var tab: HauptTab
    @State private var nachrichtenOffen = false

    func body(content: Content) -> some View {
        let zentrale = PushZentrale.shared
        content
            .onChange(of: zentrale.offenesZiel, initial: true) { _, ziel in
                guard let ziel else { return }
                zentrale.offenesZiel = nil
                oeffnen(ziel)
            }
            .task { await zentrale.auffrischen(Pushdaten(client: sitzung.client)) }
            .sheet(isPresented: $nachrichtenOffen) {
                NavigationStack {
                    NachrichtenBildschirm()
                        .toolbar {
                            ToolbarItem(placement: .cancellationAction) {
                                Button("Schließen") { nachrichtenOffen = false }
                            }
                        }
                }
                .environment(sitzung)
                // Aus den Neuigkeiten auf einen Tab oder in den Verein: erst das Blatt schliessen.
                .environment(\.zuTab) { neu in
                    nachrichtenOffen = false
                    tab = neu
                }
                .environment(\.zuVerein) { ziel in
                    nachrichtenOffen = false
                    zuVerein(ziel)
                }
            }
    }

    private func oeffnen(_ ziel: PushZiel) {
        switch ziel {
        case .nachrichten:
            nachrichtenOffen = true
        case let .veranstaltung(id):
            nachrichtenOffen = false
            zuVerein(.veranstaltung(id))
        case let .tab(neu):
            nachrichtenOffen = false
            tab = neu
        }
    }
}
