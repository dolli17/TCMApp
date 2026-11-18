/**
 * Arbeitsdienst, der dritte Reiter von "Verein"
 *
 * Oben der eigene Stand des Jahres (my_work_duty) mit Balken, darunter die
 * kommenden Einsaetze - Veranstaltungen der Art "arbeitsdienst" mit den
 * Stunden, die es dafuer gibt -, ganz unten was schon gutgeschrieben ist
 * (my_work_duty_entries). Ein Einsatz fuehrt ins Detail der Veranstaltung,
 * dort meldet man sich an. Aus dem Konto fuehrt die Zeile "Arbeitsdienst"
 * hierher.
 *
 * Jede Quelle laedt fuer sich: schlaegt eine fehl, steht dort der Fehler.
 */

import SwiftUI

private struct ArbeitsdienstInhalt: Sendable {
    let stand: Abschnitt<Arbeitsdienst?>
    let einsaetze: Abschnitt<[MitgliedEvent]>
    let eintraege: Abschnitt<[ArbeitsdienstEintrag]>
}

struct ArbeitsdienstAnsicht: View {
    @Environment(Sitzung.self) private var sitzung
    @Environment(VereinZustand.self) private var zustand
    @State private var inhalt: ArbeitsdienstInhalt?
    @State private var aktualisiert = false
    @State private var vergangen = false

    var body: some View {
        let jetzt = Date()
        let erneut = Erneut(laeuft: aktualisiert) { Task { await laden(.nachladen) } }
        List {
            VereinKopf()
            if let d = inhalt {
                stand(d.stand, erneut: erneut)
                einsaetze(d.einsaetze, jetzt: jetzt, erneut: erneut)
                eintraege(d.eintraege, erneut: erneut)
            } else {
                Section {
                    ProgressView().tint(Farbe.muted).frame(maxWidth: .infinity).padding(.vertical, 24)
                }
                .listRowBackground(Color.clear)
            }
        }
        .gruppenListe()
        .listSectionSpacing(20)
        .refreshable { await laden(.nachladen) }
        .task { await laden(.erstes) }
        // Zurueck aus dem Detail, etwa nach dem Anmelden: still nachladen.
        .onAppear { if inhalt != nil { Task { await laden(.still) } } }
    }

    // MARK: - Stand

    @ViewBuilder private func stand(_ stand: Abschnitt<Arbeitsdienst?>, erneut: Erneut) -> some View {
        if let f = stand.fehler {
            Section { FehlerZeile(text: f, erneut: erneut).gruppenZeile() } header: { GruppenKopf(titel: "Dein Stand") }
        } else if let d = stand.wert ?? nil {
            let soll = d.requiredHours ?? 0
            Section {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(KontoLogik.dienstWert(d))
                            .font(.largeTitle.weight(.bold))
                            .monospacedDigit()
                            .foregroundStyle(Farbe.ink)
                        Spacer()
                        if soll > 0 && (d.completedHours ?? 0) >= soll {
                            Label("Erledigt", systemImage: "checkmark.circle.fill")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(Farbe.greenInk)
                        }
                    }
                    if soll > 0 {
                        ProgressView(value: KontoLogik.dienstAnteil(d))
                            .tint(Farbe.blue)
                            .accessibilityLabel("Arbeitsdienst")
                            .accessibilityValue(
                                "\(HomeLogik.jsZahl(d.completedHours ?? 0)) von \(HomeLogik.jsZahl(soll)) Stunden geleistet"
                            )
                    }
                }
                .padding(.vertical, 6)
                .gruppenZeile()
            } header: {
                GruppenKopf(titel: "Dein Stand \(d.year.map(String.init) ?? "")")
            } footer: {
                Text(KontoLogik.dienstText(d)).foregroundStyle(Farbe.muted)
            }
        }
    }

    // MARK: - Einsaetze

    @ViewBuilder private func einsaetze(_ einsaetze: Abschnitt<[MitgliedEvent]>, jetzt: Date, erneut: Erneut) -> some View {
        let gruppen = Veranstaltungen.eventMonatsGruppen(einsaetze.wert ?? [], now: jetzt, vergangen: vergangen)
        if let f = einsaetze.fehler {
            Section { FehlerZeile(text: f, erneut: erneut).gruppenZeile() } header: { GruppenKopf(titel: "Einsätze") }
        } else if gruppen.isEmpty {
            Section {
                Text(vergangen ? "Noch keine vergangenen Einsätze." : "Gerade ist kein Arbeitsdienst geplant.")
                    .foregroundStyle(Farbe.muted)
                    .gruppenZeile()
            } header: {
                GruppenKopf(titel: vergangen ? "Vergangene Einsätze" : "Kommende Einsätze")
            }
        } else {
            ForEach(Array(gruppen.enumerated()), id: \.element.schluessel) { i, g in
                Section {
                    ForEach(g.events) { e in
                        EventZeile(e: e, jetzt: jetzt) { zustand.pfad.append(e.id) }
                    }
                } header: {
                    GruppenKopf(
                        titel: i == 0 ? (vergangen ? "Vergangene Einsätze · \(g.titel)" : "Kommende Einsätze · \(g.titel)") : g.titel
                    )
                }
            }
        }
        Section {
            Button { vergangen.toggle() } label: {
                HStack {
                    Text(vergangen ? "Kommende Einsätze" : "Vergangene Einsätze").foregroundStyle(Farbe.blueInk)
                    Spacer()
                    ZeilenPfeil()
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .gruppenZeile()
        }
    }

    // MARK: - Gutschriften

    @ViewBuilder private func eintraege(_ eintraege: Abschnitt<[ArbeitsdienstEintrag]>, erneut: Erneut) -> some View {
        Section {
            if let f = eintraege.fehler {
                FehlerZeile(text: f, erneut: erneut).gruppenZeile()
            } else if let liste = eintraege.wert, liste.isEmpty {
                Text("Noch keine Stunden eingetragen.").foregroundStyle(Farbe.muted).gruppenZeile()
            }
            ForEach(eintraege.wert ?? []) { e in
                HStack(spacing: 12) {
                    Image(systemName: e.bestaetigt == true ? "checkmark.circle.fill" : "clock")
                        .font(.title3)
                        .foregroundStyle(e.bestaetigt == true ? Farbe.green : Farbe.muted)
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(Platzplan.nichtLeer(e.description) ?? "Arbeitsdienst").foregroundStyle(Farbe.ink)
                        Text(ArbeitsdienstLogik.zeile(e)).font(.footnote).foregroundStyle(Farbe.muted)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Text("\(Veranstaltungen.stundenText(e.hours ?? 0)) h")
                        .font(.headline)
                        .monospacedDigit()
                        .foregroundStyle(e.bestaetigt == true ? Farbe.ink : Farbe.muted)
                }
                .gruppenZeile()
                .accessibilityElement(children: .combine)
            }
        } header: {
            GruppenKopf(titel: "Geleistet \(ArbeitsdienstLogik.jahr(Date()))")
        }
    }

    // MARK: - Laden

    private enum Art { case erstes, nachladen, still }

    private func laden(_ art: Art) async {
        if art == .nachladen { aktualisiert = true }
        let d = Vereinsdaten(client: sitzung.client)
        let jahr = ArbeitsdienstLogik.jahr(Date())
        async let stand = Abschnitt.von { try await d.arbeitsdienst() }
        async let einsaetze = Abschnitt.von { try await d.veranstaltungen().filter { $0.kind == "arbeitsdienst" } }
        async let eintraege = Abschnitt.von { try await d.arbeitsdienstEintraege(jahr: jahr) }
        inhalt = await ArbeitsdienstInhalt(stand: stand, einsaetze: einsaetze, eintraege: eintraege)
        aktualisiert = false
    }
}

enum ArbeitsdienstLogik {
    /// Das laufende Jahr in Berliner Zeit.
    static func jahr(_ jetzt: Date) -> Int {
        Int(Zeit.berlinDay(jetzt).prefix(4)) ?? 0
    }

    /// "15.03. · bestätigt von Uwe Engel" bzw. "15.03. · noch nicht bestätigt"
    static func zeile(_ e: ArbeitsdienstEintrag) -> String {
        let datum = e.workedOn.map { tag -> String in
            let teile = tag.split(separator: "-")
            return teile.count == 3 ? "\(teile[2]).\(teile[1])." : tag
        }
        let stand = e.bestaetigt == true
            ? (Platzplan.nichtLeer(e.erfasstVon).map { "bestätigt von \($0)" } ?? "bestätigt")
            : "noch nicht bestätigt"
        return [datum, stand].compactMap { $0 }.joined(separator: " · ")
    }
}
