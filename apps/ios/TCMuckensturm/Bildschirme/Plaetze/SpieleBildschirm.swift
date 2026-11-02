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

/// Die offene Rueckfrage: welche Buchung und was damit geschehen soll.
private struct Nachfrage: Identifiable {
    let buchung: MeineBuchung
    let aktion: TerminAktion
    var id: String { buchung.id }
    var frage: Rueckfrage { SpieleLogik.rueckfrage(aktion) }
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
    @State private var nachfrage: Nachfrage?
    @State private var jetzt = Date()

    private var daten: Platzdaten { Platzdaten(client: sitzung.client) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Tokens.Abstand.m) {
                    PlaetzeKopf(name: inhalt?.name)
                    if laedt && inhalt == nil {
                        ProgressView().tint(Farbe.muted).frame(maxWidth: .infinity).padding(.top, 40)
                    } else if let d = inhalt {
                        let erneut = Erneut(laeuft: aktualisiert) { Task { await laden(.nachladen) } }
                        let eigene = SpieleLogik.eigene(d.meine.wert ?? [])
                        ForEach(SpieleLogik.abschnitte(offeneZuerst: zustand.offeneZuerst), id: \.self) { a in
                            switch a {
                            case .meine:
                                DeineTermine(termine: d.meine, jetzt: jetzt, laeuft: laeuft, erneut: erneut) { b, aktion in
                                    nachfrage = Nachfrage(buchung: b, aktion: aktion)
                                }
                            case .offen:
                                OffeneSpieleListe(offen: d.offen, eigene: eigene, jetzt: jetzt, laeuft: laeuft, erneut: erneut) { o in
                                    Task { await ausfuehren { await daten.spieleMit(o.bookingId) } }
                                }
                            }
                        }
                    } else {
                        Text("Die Spiele konnten nicht geladen werden.").leise()
                    }
                }
                .padding(.horizontal, Tokens.Abstand.rand)
                .padding(.bottom, Tokens.Abstand.abschnitt * 2)
            }
            .background(Farbe.bg)
            // Was nach oben scrollt, laeuft nicht unter die Uhr der Statusleiste.
            .overlay(alignment: .top) { Farbe.bg.frame(height: 0).ignoresSafeArea(edges: .top) }
            .refreshable { await laden(.nachladen) }
            .toolbar(.hidden, for: .navigationBar)
            .safeAreaInset(edge: .bottom) {
                VStack(spacing: 8) {
                    if let meldung { Toast(meldung: meldung) { self.meldung = nil } }
                }
                .padding(.horizontal, Tokens.Abstand.m)
                .padding(.bottom, 8)
                .animation(.snappy, value: meldung)
            }
        }
        .alert(
            nachfrage?.frage.titel ?? "",
            isPresented: Binding(get: { nachfrage != nil }, set: { if !$0 { nachfrage = nil } }),
            presenting: nachfrage
        ) { n in
            Button(n.frage.knopf, role: .destructive) {
                Task { await ausfuehren { await aendern(n) } }
            }
            Button("Abbrechen", role: .cancel) {}
        } message: { n in
            Text(n.frage.text)
        }
        .sensoryFeedback(trigger: meldung) { _, neu in
            guard let neu else { return nil }
            return neu.ok ? .success : .error
        }
        .task { await laden(.erstes) }
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

    private func aendern(_ n: Nachfrage) async -> PlatzErgebnis {
        switch n.aktion {
        case .stornieren: await daten.storniereBuchung(n.buchung.bookingId, grund: nil)
        case .austragen: await daten.verlasseBuchung(n.buchung.bookingId)
        }
    }

    /// Eine Aktion nach der anderen; danach beide Listen neu.
    private func ausfuehren(_ arbeit: () async -> PlatzErgebnis) async {
        guard !laeuft else { return }
        laeuft = true
        let r = await arbeit()
        nachfrage = nil
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
    let laeuft: Bool
    let erneut: Erneut
    let fragen: (MeineBuchung, TerminAktion) -> Void

    var body: some View {
        let liste = SpieleLogik.termine(termine.wert ?? [], jetzt: jetzt)
        KontoAbschnitt(titel: "Deine Termine")
        if let f = termine.fehler {
            Fehlerzeile(text: f, laeuft: erneut.laeuft, onErneut: erneut.aktion)
        }
        if termine.wert != nil && liste.isEmpty {
            Leerzustand(
                text: "Für dich steht gerade nichts an. In der Belegung findest du die freien Plätze.",
                handlung: ("Belegung ansehen", { zustand.wechsle(zu: .belegung) })
            )
        }
        ForEach(Array(liste.enumerated()), id: \.element.id) { i, b in
            TerminZeile(
                b: b, hervorgehoben: SpieleLogik.hervorgehoben(b, index: i, jetzt: jetzt),
                jetzt: jetzt, laeuft: laeuft, fragen: fragen
            )
        }
    }
}

private struct TerminZeile: View {
    let b: MeineBuchung
    let hervorgehoben: Bool
    let jetzt: Date
    let laeuft: Bool
    let fragen: (MeineBuchung, TerminAktion) -> Void

    var body: some View {
        let aktion = SpieleLogik.aktion(b, jetzt: jetzt)
        let tinte = hervorgehoben ? Farbe.onGold : Farbe.ink
        HStack(spacing: 14) {
            VStack(spacing: 1) {
                Text(SpieleLogik.kachelTag(b, jetzt: jetzt))
                    .font(Schrift.display(.fett, Tokens.Schrift.kicker))
                    .tracking(0.8)
                Text(SpieleLogik.uhrzeit(b.startsAt))
                    .font(Schrift.display(.fett, 21))
                    .monospacedDigit()
            }
            .foregroundStyle(tinte)
            .dynamicTypeSize(...DynamicTypeSize.xLarge)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            .frame(width: 60, height: 64)
            .background(hervorgehoben ? Farbe.gold : Farbe.surf2, in: RoundedRectangle(cornerRadius: 16))

            VStack(alignment: .leading, spacing: 2) {
                Text(SpieleLogik.terminTitel(b))
                    .font(Schrift.text(.fett, Tokens.Schrift.normal))
                    .foregroundStyle(Farbe.ink)
                    .lineLimit(2)
                Text(SpieleLogik.terminZeile(b)).leise().lineLimit(3)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(SpieleLogik.terminLabel(b, jetzt: jetzt))

            if let aktion {
                Menu {
                    Button(SpieleLogik.aktionText(aktion), systemImage: aktion == .stornieren ? "xmark.circle" : "person.badge.minus", role: .destructive) {
                        fragen(b, aktion)
                    }
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 17, weight: .bold))
                        .foregroundStyle(Farbe.ink2)
                        .frame(width: 44, height: 44)
                        .background(Farbe.surf2, in: Circle())
                }
                .disabled(laeuft)
                .opacity(laeuft ? 0.5 : 1)
                .accessibilityLabel(SpieleLogik.optionenLabel(b, jetzt: jetzt))
            } else {
                Text("läuft").leise().accessibilityHidden(true)
            }
        }
        .karte(radius: Tokens.Radius.karte, padding: 14)
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
        VStack(alignment: .leading, spacing: 4) {
            KontoAbschnitt(titel: "Offene Spiele")
            Text("Hier fehlt noch jemand. Ein Tipp genügt.").leise()
        }
        if let f = offen.fehler {
            Fehlerzeile(text: f, laeuft: erneut.laeuft, onErneut: erneut.aktion)
        }
        if let liste = offen.wert, liste.isEmpty {
            Leerzustand(
                text: "Gerade sucht niemand Mitspieler. Wenn du selbst buchst, schalte im Blatt „Mitspieler gesucht“ ein – dann steht dein Spiel hier.",
                handlung: ("Platz buchen", { zustand.wechsle(zu: .belegung) })
            )
        }
        ForEach(offen.wert ?? []) { o in
            SpielKarte(o: o, eigene: eigene, jetzt: jetzt, laeuft: laeuft) { mitspielen(o) }
        }
    }
}

private struct SpielKarte: View {
    let o: OffenesSpiel
    let eigene: Set<String>
    let jetzt: Date
    let laeuft: Bool
    let mitspielen: () -> Void

    var body: some View {
        let text = SpieleLogik.offenesSpielText(o, eigene: eigene)
        let leute = SpieleLogik.leute(o)
        let frei = max(o.frei ?? 0, 0)
        VStack(alignment: .leading, spacing: 14) {
            Text(text.kopf)
                .font(Schrift.text(.fett, 17))
                .foregroundStyle(Farbe.ink)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            HStack(alignment: .top, spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(SpieleLogik.spielKicker(o, jetzt: jetzt)).kicker()
                    Text("\(SpieleLogik.uhrzeit(o.startsAt)) – \(SpieleLogik.uhrzeit(o.endsAt))")
                        .font(Schrift.display(.fett, 26, relativeTo: .title))
                        .monospacedDigit()
                        .foregroundStyle(Farbe.ink)
                        .padding(.top, 1)
                    Text(SpieleLogik.besetzung(o))
                        .font(Schrift.text(.normal, 14))
                        .foregroundStyle(Farbe.ink2)
                    if let dabei = text.dabei {
                        Text(dabei)
                            .font(Schrift.text(.normal, 14))
                            .foregroundStyle(Farbe.ink2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityElement(children: .combine)
                Text("sucht \(frei)")
                    .font(Schrift.text(.fett, Tokens.Schrift.klein))
                    .foregroundStyle(Farbe.goldInk)
                    .padding(.horizontal, 10)
                    .frame(minHeight: 28)
                    .background(Farbe.goldSoft, in: Capsule())
                    .accessibilityHidden(true)
            }
            HStack {
                HStack(spacing: -6) {
                    ForEach(Array(leute.enumerated()), id: \.offset) { _, n in
                        Text(SpieleLogik.initialen(n))
                            .font(Schrift.text(.fett, Tokens.Schrift.kicker))
                            .foregroundStyle(Farbe.onBrand)
                            .frame(width: 36, height: 36)
                            .background(Farbe.brand, in: Circle())
                            .overlay(Circle().strokeBorder(Farbe.surf, lineWidth: 2))
                    }
                    ForEach(0..<frei, id: \.self) { _ in
                        Circle()
                            .fill(Farbe.surf)
                            .overlay(Circle().strokeBorder(Farbe.goldLine, style: StrokeStyle(lineWidth: 1.5, dash: [3, 2])))
                            .frame(width: 36, height: 36)
                    }
                }
                .dynamicTypeSize(...DynamicTypeSize.xLarge)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Dabei: \(leute.joined(separator: ", "))")
                Spacer(minLength: 8)
                if o.binDabei == true {
                    Label("Du bist dabei", systemImage: "checkmark")
                        .font(Schrift.text(.fett, 14))
                        .foregroundStyle(Farbe.greenInk)
                        .padding(.horizontal, 16)
                        .frame(minHeight: 42)
                        .background(Farbe.surf2, in: Capsule())
                } else if SpieleLogik.darfMitspielen(o, eigene: eigene, jetzt: jetzt) {
                    Button(action: mitspielen) {
                        Text("Mitspielen")
                            .font(Schrift.text(.fett, 15))
                            .foregroundStyle(Farbe.onGold)
                            .padding(.horizontal, 18)
                            .frame(minHeight: 44)
                            .background(Farbe.gold, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .disabled(laeuft)
                    .opacity(laeuft ? 0.5 : 1)
                    .accessibilityLabel(SpieleLogik.mitspielenLabel(o, jetzt: jetzt))
                }
            }
        }
        .karte(radius: Tokens.Radius.karte + 2, padding: 16)
    }
}
