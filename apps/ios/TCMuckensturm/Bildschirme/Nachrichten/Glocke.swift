/**
 * Die Benachrichtigungsglocke (Glocke.tsx)
 *
 * Rund, 44 Punkt, im grossen Kopf neben dem Avatar. Der Zaehler wird bei
 * jedem Erscheinen neu geholt, sonst bliebe die rote Marke stehen, nachdem
 * die Nachrichten gelesen wurden. Der Zaehler ist gelb ("deins"). Ein Fehler beim Zaehlen zaehlt als 0.
 *
 * Ein Tippen oeffnet die Nachrichten als Blatt und markiert sie gelesen;
 * die Hervorhebung bleibt, bis "Alle als gelesen" sie wegnimmt.
 */

import SwiftUI

struct Glocke: View {
    @Environment(Sitzung.self) private var sitzung
    @Environment(\.zuVerein) private var zuVerein
    @Environment(\.zuMannschaft) private var zuMannschaft
    @State private var ungelesen = 0
    @State private var offen = false
    @State private var liste: [Benachrichtigung]?
    @State private var fehler: String?
    @State private var alleGesehen = false
    /// In der Navigationsleiste: ohne eigenen Kreis, die Leiste gibt den Grund.
    var schlicht = false

    private var daten: Startdaten { Startdaten(client: sitzung.client) }

    var body: some View {
        Button(action: oeffnen) {
            Image(systemName: "bell")
                .font(.system(size: 19, weight: .medium))
                .foregroundStyle(Farbe.ink)
                .frame(width: 44, height: 44)
                .background(schlicht ? Color.clear : Farbe.surf2, in: Circle())
                .overlay(Circle().strokeBorder(schlicht ? Color.clear : Farbe.line, lineWidth: 1))
                .overlay(alignment: .topTrailing) {
                    if ungelesen > 0 {
                        Text(HomeLogik.glockenZahl(ungelesen))
                            .font(.caption2.weight(.bold))
                            .monospacedDigit()
                            .dynamicTypeSize(...DynamicTypeSize.xLarge)
                            // Gelb heisst "deins": deine ungelesenen Nachrichten.
                            .foregroundStyle(Farbe.onGold)
                            .padding(.horizontal, 4)
                            .frame(minWidth: 18, minHeight: 18)
                            .background(Farbe.gold, in: Capsule())
                            .offset(x: 3, y: -3)
                    }
                }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(HomeLogik.glockenLabel(ungelesen))
        .onAppear { Task { await zaehlen() } }
        .sheet(isPresented: $offen, onDismiss: { Task { await zaehlen() } }) {
            blatt
                // Zur Mannschaft: erst das Blatt schliessen.
                .environment(\.zuMannschaft) {
                    offen = false
                    zuMannschaft()
                }
        }
    }

    /// Die Mitteilungen als Blatt: Titel in der Leiste, ✕ links, "Alle gelesen" rechts.
    private var blatt: some View {
        NavigationStack {
            List {
                if let fehler {
                    Section {
                        Label(fehler, systemImage: "exclamationmark.triangle.fill").foregroundStyle(Farbe.redInk).gruppenZeile()
                    }
                } else if let liste {
                    NachrichtenListe(liste: liste, alleGesehen: alleGesehen) {
                        offen = false
                        zuVerein(.veranstaltung($0))
                    }
                } else {
                    Section { ProgressView().tint(Farbe.muted).frame(maxWidth: .infinity).padding(.vertical, 24) }
                        .listRowBackground(Color.clear)
                }
            }
            .gruppenListe()
            .listSectionSpacing(20)
            .navigationTitle("Benachrichtigungen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { offen = false } label: { Image(systemName: "xmark") }
                        .accessibilityLabel("Schließen")
                }
                if HomeLogik.zeigeAlleGelesen(liste, alleGesehen: alleGesehen) {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Alle als gelesen") { alleGesehen = true }
                    }
                }
            }
        }
        .tint(Farbe.blue)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private func zaehlen() async {
        ungelesen = await daten.ungelesen()
    }

    private func oeffnen() {
        offen = true
        liste = nil
        fehler = nil
        alleGesehen = false
        let daten = daten
        Task {
            do {
                let neu = try await daten.benachrichtigungen()
                liste = neu
                if neu.contains(where: { $0.readAt == nil }) {
                    // Die Liste steht sofort, das Abhaken laeuft nach.
                    if (try? await daten.markiereGelesen()) != nil { ungelesen = 0 }
                }
            } catch {
                fehler = Meldung.aus(error).text
            }
        }
    }
}
