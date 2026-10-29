/**
 * Neuigkeiten (app/nachrichten.tsx)
 *
 * Zwei Dinge sind anders als in einer gewoehnlichen Liste: Gelesen markiert
 * wird erst beim Oeffnen dieses Bildschirms, und der ungelesene Zustand
 * bleibt beim ersten Anzeigen sichtbar - erst anzeigen, dann abhaken. Beim
 * Herunterziehen unterbleibt das Abhaken ganz. "Alle als gelesen" nimmt die
 * Hervorhebung weg.
 */

import SwiftUI

struct NachrichtenBildschirm: View {
    @Environment(Sitzung.self) private var sitzung
    @Environment(\.zuTab) private var zuTab
    @State private var nachrichten: [Benachrichtigung]?
    @State private var fehler: String?
    @State private var laedt = true
    @State private var aktualisiert = false
    @State private var schonAbgehakt = false
    @State private var alleGesehen = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Tokens.Abstand.m) {
                Text("Neuigkeiten")
                    .font(Schrift.text(.extrafett, Tokens.Schrift.seitentitel, relativeTo: .largeTitle))
                    .tracking(Tokens.Schrift.laufweiteTitel)
                    .foregroundStyle(Farbe.ink)
                    .accessibilityAddTraits(.isHeader)
                    .padding(.bottom, Tokens.Abstand.s)

                if laedt {
                    ProgressView().tint(Farbe.muted).frame(maxWidth: .infinity).padding(.top, 40)
                } else {
                    if let fehler {
                        Fehlerzeile(text: fehler, laeuft: aktualisiert) { Task { await laden(nachladen: true) } }
                    }
                    if HomeLogik.zeigeAlleGelesen(nachrichten, alleGesehen: alleGesehen) {
                        HStack {
                            Spacer()
                            AlleGelesenKnopf { alleGesehen = true }
                        }
                        .padding(.bottom, -8)
                    }
                    if let nachrichten {
                        NachrichtenListe(liste: nachrichten, alleGesehen: alleGesehen) { _ in zuTab(.verein) }
                    }
                }
            }
            .padding(.horizontal, Tokens.Abstand.rand)
            .padding(.bottom, Tokens.Abstand.abschnitt)
        }
        .background(Farbe.bg)
        .refreshable { await laden(nachladen: true) }
        .navigationBarTitleDisplayMode(.inline)
        .task { await laden(nachladen: false) }
    }

    private func laden(nachladen: Bool) async {
        if nachladen { aktualisiert = true }
        defer {
            laedt = false
            aktualisiert = false
        }
        let daten = Startdaten(client: sitzung.client)
        do {
            let liste = try await daten.benachrichtigungen()
            nachrichten = liste
            fehler = nil
            if !schonAbgehakt && liste.contains(where: { $0.readAt == nil }) {
                schonAbgehakt = true
                // Ohne Warten: die Liste soll sofort stehen, das Abhaken darf nachlaufen.
                Task { try? await daten.markiereGelesen() }
            }
        } catch {
            fehler = Meldung.aus(error).text
        }
    }
}
