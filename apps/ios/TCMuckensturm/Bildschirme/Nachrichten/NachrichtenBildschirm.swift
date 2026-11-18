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
    @Environment(\.zuVerein) private var zuVerein
    @State private var nachrichten: [Benachrichtigung]?
    @State private var fehler: String?
    @State private var laedt = true
    @State private var aktualisiert = false
    @State private var schonAbgehakt = false
    @State private var alleGesehen = false

    var body: some View {
        List {
            if laedt {
                Section { ProgressView().tint(Farbe.muted).frame(maxWidth: .infinity).padding(.vertical, 24) }
                    .listRowBackground(Color.clear)
            } else {
                if let fehler {
                    Section {
                        FehlerZeile(text: fehler, erneut: Erneut(laeuft: aktualisiert) { Task { await laden(nachladen: true) } })
                            .gruppenZeile()
                    }
                }
                if let nachrichten {
                    NachrichtenListe(liste: nachrichten, alleGesehen: alleGesehen) { zuVerein(.veranstaltung($0)) }
                }
            }
        }
        .gruppenListe()
        .listSectionSpacing(20)
        .refreshable { await laden(nachladen: true) }
        .navigationTitle("Neuigkeiten")
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            if !laedt && HomeLogik.zeigeAlleGelesen(nachrichten, alleGesehen: alleGesehen) {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Alle als gelesen") { alleGesehen = true }
                }
            }
        }
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
