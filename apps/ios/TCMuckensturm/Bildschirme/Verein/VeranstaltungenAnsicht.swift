/**
 * Veranstaltungen (apps/mobile/app/(tabs)/verein/(reiter)/veranstaltungen.tsx)
 *
 * Kommendes nach Monat, darunter ein Schalter fuer Vergangenes. Gruppierung
 * und Texte kommen aus dem Kern (eventMonatsGruppen, eventKartenZeile) -
 * dieselben wie im Web. Eine Karte fuehrt ins Detail; zurueck von dort wird
 * still nachgeladen, etwa nach dem Anmelden.
 */

import SwiftUI

struct VeranstaltungenAnsicht: View {
    @Environment(Sitzung.self) private var sitzung
    @Environment(VereinZustand.self) private var zustand
    @State private var events: [MitgliedEvent]?
    @State private var fehler: String?
    @State private var laedt = true
    @State private var aktualisiert = false
    @State private var vergangen = false

    var body: some View {
        let jetzt = Date()
        // Arbeitsdienste haben ihren eigenen Reiter.
        let liste = (events ?? []).filter { $0.kind != "arbeitsdienst" }
        let gruppen = Veranstaltungen.eventMonatsGruppen(liste, now: jetzt, vergangen: vergangen)
        List {
            VereinKopf()
            if let fehler {
                Section {
                    FehlerZeile(text: fehler, erneut: Erneut(laeuft: aktualisiert) { Task { await laden(.nachladen) } })
                        .gruppenZeile()
                }
            }
            if laedt && events == nil {
                Section {
                    ProgressView().tint(Farbe.muted).frame(maxWidth: .infinity).padding(.vertical, 24)
                }
                .listRowBackground(Color.clear)
            } else if events != nil {
                if gruppen.isEmpty {
                    Section {
                        Text(vergangen ? "Noch keine vergangenen Veranstaltungen." : "Gerade ist nichts geplant.")
                            .foregroundStyle(Farbe.muted)
                            .gruppenZeile()
                    }
                }
                ForEach(gruppen, id: \.schluessel) { g in
                    Section {
                        ForEach(g.events) { e in
                            EventZeile(e: e, jetzt: jetzt) { zustand.pfad.append(e.id) }
                        }
                    } header: {
                        GruppenKopf(titel: g.titel)
                    }
                }
                Section {
                    Button { vergangen.toggle() } label: {
                        HStack {
                            Text(vergangen ? "Kommende Veranstaltungen" : "Vergangene Veranstaltungen")
                                .foregroundStyle(Farbe.blueInk)
                            Spacer()
                            ZeilenPfeil()
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .gruppenZeile()
                }
            }
        }
        .gruppenListe()
        .listSectionSpacing(20)
        .refreshable { await laden(.nachladen) }
        .task { await laden(.erstes) }
        // Zurueck aus dem Detail oder auf den Tab: still nachladen.
        .onAppear { if events != nil { Task { await laden(.still) } } }
    }

    private enum Art { case erstes, nachladen, still }

    private func laden(_ art: Art) async {
        if art == .nachladen { aktualisiert = true }
        let d = Vereinsdaten(client: sitzung.client)
        do {
            events = try await d.veranstaltungen()
            fehler = nil
        } catch {
            fehler = Meldung.aus(error).text
        }
        laedt = false
        aktualisiert = false
    }
}
