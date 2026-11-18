/**
 * Meine & offene Spiele (apps/mobile/app/(tabs)/plaetze/spiele.tsx), die
 * zweite Sicht im Tab Plaetze
 *
 * Beantwortet zwei Fragen: wann spiele ich, und wo fehlt noch jemand?
 * "Deine Termine" aus my_bookings, "Offene Spiele" aus open_matches. Beide
 * laden fuer sich: schlaegt einer fehl, steht dort der Fehler, und der
 * andere bleibt gefuellt.
 *
 * Gebucht oder eingetragen bestimmt, was der Knopf an der Karte anbietet
 * (SpieleLogik.aktion): der Bucher storniert, ein Mitspieler traegt sich aus.
 * Austragen storniert die ganze Buchung - die Rueckfrage sagt das. Danach
 * laden beide Listen neu.
 *
 * Kommt man ueber "Mitspielen" oder "Alle" bei den offenen Spielen, stehen
 * diese oben (PlaetzeZustand.offeneZuerst, U75). Ist die Liste leer,
 * fuehrt der Leerzustand zur Belegung - ein offenes Spiel entsteht nur dort.
 */

import SwiftUI

private struct SpieleInhalt: Sendable {
    let name: MeinName?
    let meine: Abschnitt<[MeineBuchung]>
    let offen: Abschnitt<[OffenesSpiel]>
}

struct SpieleBildschirm: View {
    @Environment(Sitzung.self) private var sitzung
    @Environment(PlaetzeZustand.self) private var zustand
    @Environment(\.scenePhase) private var phase
    @State private var inhalt: SpieleInhalt?
    @State private var laedt = true
    @State private var aktualisiert = false
    @State private var laeuft = false
    @State private var meldung: ToastMeldung?
    /// Fuer die Karte eines eigenen Spiels: dasselbe Modell wie der Belegungsplan, auf den Tag des Spiels geladen.
    @State private var karte: PlaetzeModell?
    @State private var jetzt = Date()

    private var daten: Platzdaten { Platzdaten(client: sitzung.client) }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    PlaetzeKopf()
                }
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
                if laedt && inhalt == nil {
                    Section {
                        ProgressView().tint(Farbe.muted).frame(maxWidth: .infinity).padding(.vertical, 24)
                    }
                    .listRowBackground(Color.clear)
                } else if let d = inhalt {
                        let erneut = Erneut(laeuft: aktualisiert) { Task { await laden(.nachladen) } }
                        let eigene = SpieleLogik.eigene(d.meine.wert ?? [])
                        ForEach(SpieleLogik.abschnitte(offeneZuerst: zustand.offeneZuerst), id: \.self) { a in
                            switch a {
                            case .meine:
                                DeineTermine(termine: d.meine, jetzt: jetzt, erneut: erneut) { oeffneKarte($0) }
                            case .offen:
                                OffeneSpieleListe(offen: d.offen, eigene: eigene, jetzt: jetzt, laeuft: laeuft, erneut: erneut) { o in
                                    Task { await ausfuehren { await daten.spieleMit(o.bookingId) } }
                                }
                            }
                        }
                } else {
                    Section { Text("Die Spiele konnten nicht geladen werden.").foregroundStyle(Farbe.muted).gruppenZeile() }
                }
            }
            .gruppenListe()
            .listSectionSpacing(20)
            .refreshable { await laden(.nachladen) }
            .plaetzeTitel()
            .safeAreaInset(edge: .bottom) {
                VStack(spacing: 8) {
                    if let meldung { Toast(meldung: meldung) { self.meldung = nil } }
                }
                .padding(.horizontal, Tokens.Abstand.m)
                .padding(.bottom, 8)
                .animation(.snappy, value: meldung)
            }
        }
        // Ein eigenes Spiel oeffnet dieselbe Karte wie im Belegungsplan (Buchungsblatt).
        .sheet(
            item: Binding(get: { karte?.fenster }, set: { if $0 == nil { karte?.schliesseFenster() } }),
            onDismiss: {
                if let t = karte?.meldung {
                    meldung = t
                    karte?.meldung = nil
                }
                Task { await laden(.still) }
            }
        ) { f in
            if let k = karte { Buchungsblatt(modell: k, fenster: f) }
        }
        .sensoryFeedback(trigger: meldung) { _, neu in
            guard let neu else { return nil }
            return neu.ok ? .success : .error
        }
        .task {
            await laden(.erstes)
            #if DEBUG
            // Fuer Bildschirmfotos per simctl: `-TCMSpielKarte` oeffnet das erste eigene Spiel als Karte.
            if ProcessInfo.processInfo.arguments.contains("-TCMSpielKarte"), let t = inhalt?.meine.wert?.first {
                oeffneKarte(t)
            }
            #endif
        }
        // Zurueck in den Vordergrund: still nachladen, ohne Ladekreis.
        .onChange(of: phase) { _, neu in
            if neu == .active && inhalt != nil { Task { await laden(.still) } }
        }
        // Taktgeber: Knoepfe verschwinden mit Spielbeginn, "Heute" wird zu "Morgen".
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(30))
                jetzt = Date()
            }
        }
        // Erfolg verschwindet nach ein paar Sekunden, ein Fehler bleibt, bis man ihn schliesst.
        .task(id: meldung) {
            guard let m = meldung, m.ok else { return }
            try? await Task.sleep(for: .seconds(4))
            if !Task.isCancelled { meldung = nil }
        }
    }

    private enum Art { case erstes, nachladen, still }

    private func laden(_ art: Art) async {
        if art == .nachladen { aktualisiert = true }
        inhalt = await Self.lade(daten.start)
        jetzt = Date()
        laedt = false
        aktualisiert = false
    }

    nonisolated private static func lade(_ d: Startdaten) async -> SpieleInhalt {
        async let name = Abschnitt.von { try await d.meinName() }
        async let meine = Abschnitt.von { try await d.meineBuchungen() }
        async let offen = Abschnitt.von { try await d.offeneSpiele() }
        return await SpieleInhalt(name: name.wert ?? nil, meine: meine, offen: offen)
    }

    /// Laedt den Tag des Spiels und oeffnet darauf die Buchung als Karte.
    private func oeffneKarte(_ t: MeineBuchung) {
        guard let beginn = Zeit.datum(t.startsAt) else { return }
        let m = karte ?? PlaetzeModell(client: sitzung.client)
        karte = m
        Task {
            m.datum = Zeit.berlinDay(beginn)
            await m.laden()
            if let b = m.belegung.first(where: { $0.bookingId == t.bookingId }) {
                m.oeffne(b)
            } else {
                meldung = ToastMeldung(ok: false, text: m.ladeFehler ?? "Das Spiel konnte nicht geöffnet werden.")
            }
        }
    }

    /// Eine Aktion nach der anderen; danach beide Listen neu.
    private func ausfuehren(_ arbeit: () async -> PlatzErgebnis) async {
        guard !laeuft else { return }
        laeuft = true
        let r = await arbeit()
        meldung = ToastMeldung(ok: r.ok, text: r.meldung)
        if r.ok { await laden(.still) }
        laeuft = false
    }
}

// MARK: - Deine Termine

private struct DeineTermine: View {
    @Environment(PlaetzeZustand.self) private var zustand
    let termine: Abschnitt<[MeineBuchung]>
    let jetzt: Date
    let erneut: Erneut
    let oeffnen: (MeineBuchung) -> Void

    var body: some View {
        let liste = SpieleLogik.termine(termine.wert ?? [], jetzt: jetzt)
        Section {
            if let f = termine.fehler {
                FehlerZeile(text: f, erneut: erneut).gruppenZeile()
            }
            if termine.wert != nil && liste.isEmpty {
                LeerZeile(
                    text: "Für dich steht gerade nichts an.",
                    knopf: "Freie Plätze ansehen"
                ) { zustand.wechsle(zu: .belegung) }
            }
            ForEach(liste) { b in
                TerminZeile(b: b, jetzt: jetzt) { oeffnen(b) }
            }
        } header: {
            GruppenKopf(titel: "Deine Termine", zusatz: liste.isEmpty ? nil : SpieleLogik.terminZaehler(liste.count))
        } footer: {
            if !liste.isEmpty {
                Text("Tippe auf ein Spiel für Mitspieler, Bearbeiten oder Stornieren.")
                    .foregroundStyle(Farbe.muted)
            }
        }
    }
}

/// Leerer Abschnitt: ein Satz und ein Weg weiter.
private struct LeerZeile: View {
    let text: String
    let knopf: String
    let aktion: () -> Void

    var body: some View {
        Text(text).foregroundStyle(Farbe.muted).gruppenZeile()
        Button(action: aktion) {
            HStack {
                Text(knopf).foregroundStyle(Farbe.blueInk)
                Spacer()
                ZeilenPfeil()
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .gruppenZeile()
    }
}

/// Ein eigener Termin als Zeile: gross die Uhrzeit, rechts der gelbe Marker ("deins"); ein Tippen oeffnet die Karte.
private struct TerminZeile: View {
    let b: MeineBuchung
    let jetzt: Date
    let oeffnen: () -> Void

    var body: some View {
        let laeuftSchon = SpieleLogik.aktion(b, jetzt: jetzt) == nil
        Button(action: oeffnen) {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Text(HomeLogik.zeitSpanne(b))
                            .font(.title3.weight(.bold))
                            .monospacedDigit()
                            .foregroundStyle(Farbe.ink)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                        Spacer(minLength: 0)
                        if laeuftSchon {
                            Text("läuft").font(.subheadline).foregroundStyle(Farbe.muted)
                        } else {
                            // Gelb heisst "deins": das selbst gebuchte Spiel und das, bei dem man eingetragen ist.
                            DeinMarker(b.binBucher == true ? "Dein Spiel" : "Du bist dabei")
                        }
                    }
                    Text(Startseite.dayLabel(startsAt: b.startsAt, now: jetzt))
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Farbe.ink2)
                    Text("\(SpieleLogik.terminTitel(b)) · \(SpieleLogik.terminZeile(b))")
                        .font(.subheadline)
                        .foregroundStyle(Farbe.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                ZeilenPfeil()
            }
            .padding(.vertical, 6)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .gruppenZeile()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(SpieleLogik.terminLabel(b, jetzt: jetzt))
        .accessibilityHint("Öffnet das Spiel")
        .accessibilityAddTraits(.isButton)
    }
}

// MARK: - Offene Spiele

private struct OffeneSpieleListe: View {
    @Environment(PlaetzeZustand.self) private var zustand
    let offen: Abschnitt<[OffenesSpiel]>
    let eigene: Set<String>
    let jetzt: Date
    let laeuft: Bool
    let erneut: Erneut
    let mitspielen: (OffenesSpiel) -> Void

    var body: some View {
        Section {
            if let f = offen.fehler {
                FehlerZeile(text: f, erneut: erneut).gruppenZeile()
            }
            if let liste = offen.wert, liste.isEmpty {
                LeerZeile(
                    text: "Gerade sucht niemand Mitspieler. Wenn du selbst buchst, schalte „Mitspieler gesucht“ ein – dann steht dein Spiel hier.",
                    knopf: "Platz buchen"
                ) { zustand.wechsle(zu: .belegung) }
            }
            ForEach(offen.wert ?? []) { o in
                OffeneSpielZeile(o: o, eigene: eigene, jetzt: jetzt, laeuft: laeuft) { mitspielen(o) }
            }
        } header: {
            GruppenKopf(titel: "Offene Spiele", zusatz: "Mitspieler gesucht")
        } footer: {
            if !(offen.wert ?? []).isEmpty {
                Text("Hier fehlt noch jemand. Ein Tipp genügt.").foregroundStyle(Farbe.muted)
            }
        }
    }
}

/// Ein offenes Spiel wie auf der Startseite: wann, Spielform und Platz, wer dabei ist; rechts "Mitspielen" oder "Du bist dabei".
private struct OffeneSpielZeile: View {
    let o: OffenesSpiel
    let eigene: Set<String>
    let jetzt: Date
    let laeuft: Bool
    let mitspielen: () -> Void

    var body: some View {
        let text = SpieleLogik.offenesSpielText(o, eigene: eigene)
        let wann = HomeLogik.offenesSpielWann(o, jetzt: jetzt)
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(wann)
                    .font(.headline)
                    .monospacedDigit()
                    .foregroundStyle(Farbe.ink)
                    .lineLimit(1)
                    .accessibilityAddTraits(.isHeader)
                // Die Besetzung nennt die Spielform schon ("Doppel · 3 von 4 dabei").
                Text([Platzplan.nichtLeer(o.courtName), SpieleLogik.besetzung(o)].compactMap { $0 }.joined(separator: " · "))
                    .font(.subheadline)
                    .foregroundStyle(Farbe.ink2)
                Text(text.kopf)
                    .font(.subheadline)
                    .foregroundStyle(Farbe.muted)
                    .fixedSize(horizontal: false, vertical: true)
                if let zusatz = SpieleLogik.filterZusatz(o) {
                    Text(zusatz)
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(Farbe.blueInk)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityLabel("Nur für \(o.suchfilter.vorleseText)")
                }
                if let dabei = text.dabei {
                    Text(dabei)
                        .font(.footnote)
                        .foregroundStyle(Farbe.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
            if o.binDabei == true {
                // Gelb heisst "deins".
                DeinMarker("Du bist dabei")
            } else if SpieleLogik.darfMitspielen(o, eigene: eigene, jetzt: jetzt) {
                Button("Mitspielen", action: mitspielen)
                    .font(.subheadline.weight(.semibold))
                    .buttonStyle(.bordered)
                    .buttonBorderShape(.capsule)
                    .tint(Farbe.blue)
                    .disabled(laeuft)
                    .accessibilityLabel(SpieleLogik.mitspielenLabel(o, jetzt: jetzt))
            }
        }
        .padding(.vertical, 6)
        .gruppenZeile()
    }
}
