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
        let gruppen = Veranstaltungen.eventMonatsGruppen(events ?? [], now: jetzt, vergangen: vergangen)
        ScrollView {
            VStack(alignment: .leading, spacing: Tokens.Abstand.m) {
                VereinKopf()
                if let fehler {
                    Fehlerzeile(text: fehler, laeuft: aktualisiert) { Task { await laden(.nachladen) } }
                }
                if laedt && events == nil {
                    ProgressView().tint(Farbe.muted).frame(maxWidth: .infinity).padding(.top, 40)
                } else if events != nil {
                    if vergangen {
                        Text("Vergangene Veranstaltungen")
                            .font(Schrift.text(.fett, Tokens.Schrift.titel, relativeTo: .title2))
                            .tracking(-0.2)
                            .foregroundStyle(Farbe.ink)
                            .accessibilityAddTraits(.isHeader)
                    }
                    if gruppen.isEmpty {
                        Leerzustand(text: vergangen ? "Noch keine vergangenen Veranstaltungen." : "Gerade ist nichts geplant.")
                    }
                    ForEach(gruppen, id: \.schluessel) { g in
                        VStack(alignment: .leading, spacing: 10) {
                            Text(g.titel)
                                .font(Schrift.text(.fett, 13))
                                .tracking(0.8)
                                .textCase(.uppercase)
                                .foregroundStyle(Farbe.muted)
                                .accessibilityAddTraits(.isHeader)
                            ForEach(g.events) { e in
                                EventKarte(e: e, jetzt: jetzt) { zustand.pfad.append(e.id) }
                            }
                        }
                        .padding(.bottom, Tokens.Abstand.s)
                    }
                    Button { vergangen.toggle() } label: {
                        Text(vergangen ? "Kommende Veranstaltungen" : "Vergangene Veranstaltungen")
                            .font(Schrift.text(.halbfett, 14))
                            .foregroundStyle(Farbe.blueInk)
                            .padding(.horizontal, 12)
                            .frame(minHeight: 44)
                    }
                    .buttonStyle(.plain)
                    .frame(maxWidth: .infinity)
                }
            }
            .padding(.horizontal, Tokens.Abstand.rand)
            .padding(.bottom, Tokens.Abstand.abschnitt * 2)
        }
        .background(Farbe.bg)
        .refreshable { await laden(.nachladen) }
        .task { await laden(.erstes) }
        // Zurueck aus dem Detail oder auf den Tab: still nachladen.
        .onAppear { if events != nil { Task { await laden(.still) } } }
    }

    private enum Art { case erstes, nachladen, still }

    private func laden(_ art: Art) async {
        if art == .nachladen { aktualisiert = true }
        let d = Vereinsdaten(client: sitzung.client)
        async let name = try? Startdaten(client: d.client).meinName()
        do {
            events = try await d.veranstaltungen()
            fehler = nil
        } catch {
            fehler = Meldung.aus(error).text
        }
        if let n = await name { zustand.name = n }
        laedt = false
        aktualisiert = false
    }
}
