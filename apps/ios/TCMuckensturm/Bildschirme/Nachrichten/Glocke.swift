/**
 * Die Benachrichtigungsglocke (Glocke.tsx)
 *
 * Rund, 44 Punkt, im grossen Kopf neben dem Avatar. Der Zaehler wird bei
 * jedem Erscheinen neu geholt, sonst bliebe die rote Marke stehen, nachdem
 * die Nachrichten gelesen wurden. Ein Fehler beim Zaehlen zaehlt als 0.
 *
 * Ein Tippen oeffnet die Nachrichten als Blatt und markiert sie gelesen;
 * die Hervorhebung bleibt, bis "Alle als gelesen" sie wegnimmt.
 */

import SwiftUI

struct Glocke: View {
    @Environment(Sitzung.self) private var sitzung
    @Environment(\.zuVerein) private var zuVerein
    @State private var ungelesen = 0
    @State private var offen = false
    @State private var liste: [Benachrichtigung]?
    @State private var fehler: String?
    @State private var alleGesehen = false

    private var daten: Startdaten { Startdaten(client: sitzung.client) }

    var body: some View {
        Button(action: oeffnen) {
            Image(systemName: "bell")
                .font(.system(size: 19, weight: .medium))
                .foregroundStyle(Farbe.ink)
                .frame(width: 44, height: 44)
                .background(Farbe.surf2, in: Circle())
                .overlay(Circle().strokeBorder(Farbe.line, lineWidth: 1))
                .overlay(alignment: .topTrailing) {
                    if ungelesen > 0 {
                        Text(HomeLogik.glockenZahl(ungelesen))
                            .font(Schrift.text(.fett, Tokens.Schrift.kicker))
                            .monospacedDigit()
                            .dynamicTypeSize(...DynamicTypeSize.xLarge)
                            .foregroundStyle(Farbe.onBrand)
                            .padding(.horizontal, 4)
                            .frame(minWidth: 18, minHeight: 18)
                            .background(Farbe.red, in: Capsule())
                            .offset(x: 3, y: -3)
                    }
                }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(HomeLogik.glockenLabel(ungelesen))
        .onAppear { Task { await zaehlen() } }
        .sheet(isPresented: $offen, onDismiss: { Task { await zaehlen() } }) {
            blatt
        }
    }

    private var blatt: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Tokens.Abstand.m) {
                HStack {
                    Text("Benachrichtigungen")
                        .font(Schrift.text(.extrafett, Tokens.Schrift.titel, relativeTo: .title2))
                        .foregroundStyle(Farbe.ink)
                        .accessibilityAddTraits(.isHeader)
                    Spacer()
                    Button { offen = false } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(Farbe.ink)
                            .frame(width: 44, height: 44)
                            .background(Farbe.surf2, in: Circle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Schließen")
                }
                if HomeLogik.zeigeAlleGelesen(liste, alleGesehen: alleGesehen) {
                    AlleGelesenKnopf { alleGesehen = true }
                }
                if let fehler {
                    Text(fehler).font(Schrift.text(.halbfett, 16)).foregroundStyle(Farbe.redInk)
                } else if let liste {
                    NachrichtenListe(liste: liste, alleGesehen: alleGesehen) {
                        offen = false
                        zuVerein(.veranstaltung($0))
                    }
                } else {
                    ProgressView().tint(Farbe.muted).frame(maxWidth: .infinity)
                }
            }
            .padding(Tokens.Abstand.rand)
        }
        .background(Farbe.bg)
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
