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
                    PlaetzeKopf()
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
        Kopfzeile(titel: "Deine Termine", zaehler: liste.isEmpty ? nil : SpieleLogik.terminZaehler(liste.count))
            .padding(.top, Tokens.Abstand.s)
        if let f = termine.fehler {
            Fehlerzeile(text: f, laeuft: erneut.laeuft, onErneut: erneut.aktion)
        }
        if termine.wert != nil && liste.isEmpty {
            Leerzustand(
                text: "Für dich steht gerade nichts an. In der Belegung findest du die freien Plätze.",
                handlung: ("Belegung ansehen", { zustand.wechsle(zu: .belegung) })
            )
        }
        ForEach(liste) { b in
            TerminKarte(b: b, jetzt: jetzt, laeuft: laeuft, fragen: fragen)
        }
    }
}

/**
 * Ein eigener Termin (docs/design/stitch, "Meine & offene Spiele"): gross die
 * Uhrzeit, rechts der gelbe Marker, darunter Tag, Platz und Mitspieler; im
 * Fuss der Karte der Weg zum Stornieren bzw. Austragen.
 */
private struct TerminKarte: View {
    let b: MeineBuchung
    let jetzt: Date
    let laeuft: Bool
    let fragen: (MeineBuchung, TerminAktion) -> Void

    var body: some View {
        let aktion = SpieleLogik.aktion(b, jetzt: jetzt)
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 6) {
                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .center, spacing: 10) { zeit; Spacer(minLength: 0); marker }
                    VStack(alignment: .leading, spacing: 6) { zeit; marker }
                }
                (Text(Startseite.dayLabel(startsAt: b.startsAt, now: jetzt)).foregroundStyle(Farbe.ink)
                    + Text(" · \(SpieleLogik.terminTitel(b)) · \(SpieleLogik.terminZeile(b))").foregroundStyle(Farbe.muted))
                    .font(Schrift.text(.normal, 15.5))
                    .lineSpacing(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(SpieleLogik.terminLabel(b, jetzt: jetzt))

            Farbe.line.frame(height: 1).padding(.top, 16)
            HStack(spacing: 10) {
                if let aktion {
                    if aktion == .stornieren {
                        Text("Stornieren geht bis Spielbeginn")
                            .font(Schrift.text(.normal, Tokens.Schrift.klein))
                            .foregroundStyle(Farbe.muted)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                    }
                    Spacer(minLength: 0)
                    Button { fragen(b, aktion) } label: {
                        Text(SpieleLogik.aktionText(aktion))
                            .font(Schrift.display(.halbfett, 15))
                            .foregroundStyle(Farbe.redInk)
                            .frame(minHeight: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .disabled(laeuft)
                    .opacity(laeuft ? 0.5 : 1)
                    .accessibilityLabel(SpieleLogik.optionenLabel(b, jetzt: jetzt))
                } else {
                    Text("läuft").leise().frame(minHeight: 44)
                    Spacer(minLength: 0)
                }
            }
            .padding(.top, 4)
        }
        .padding(.horizontal, 20)
        .padding(.top, 20)
        .padding(.bottom, 6)
        .karte(radius: Tokens.Radius.karte, padding: nil)
    }

    private var zeit: some View {
        Text(HomeLogik.zeitSpanne(b))
            .font(Schrift.display(.fett, 26, relativeTo: .title))
            .tracking(-0.6)
            .monospacedDigit()
            .foregroundStyle(Farbe.ink)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
    }

    /// Gelb heisst "deins": das selbst gebuchte Spiel und das, bei dem man eingetragen ist.
    private var marker: some View {
        DeinMarker(b.binBucher == true ? "Dein Spiel" : "Du bist dabei")
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
            Kopfzeile(titel: "Offene Spiele", zaehler: "Mitspieler gesucht")
            Text("Hier fehlt noch jemand. Ein Tipp genügt.").leise()
        }
        .padding(.top, Tokens.Abstand.m)
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

/**
 * Ein offenes Spiel wie auf der Startseite: "Morgen, 10:00" mit der Spielform
 * als hellblauer Marke, darunter Platz und wer dabei ist, rechts "Mitspielen"
 * oder der gelbe Marker "Du bist dabei".
 */
private struct SpielKarte: View {
    let o: OffenesSpiel
    let eigene: Set<String>
    let jetzt: Date
    let laeuft: Bool
    let mitspielen: () -> Void

    var body: some View {
        let text = SpieleLogik.offenesSpielText(o, eigene: eigene)
        let wann = HomeLogik.offenesSpielWann(o, jetzt: jetzt)
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 8) { wannText(wann); BlaueMarke(o.typeName ?? "") }
                    VStack(alignment: .leading, spacing: 4) { wannText(wann); BlaueMarke(o.typeName ?? "") }
                }
                Text(text.kopf)
                    .font(Schrift.text(.normal, 14.5))
                    .foregroundStyle(Farbe.ink2)
                    .fixedSize(horizontal: false, vertical: true)
                Text("\(Platzplan.nichtLeer(o.courtName) ?? "") · \(SpieleLogik.besetzung(o))")
                    .font(Schrift.text(.normal, 14))
                    .foregroundStyle(Farbe.muted)
                    .fixedSize(horizontal: false, vertical: true)
                if let zusatz = SpieleLogik.filterZusatz(o) {
                    Text(zusatz)
                        .font(Schrift.text(.halbfett, Tokens.Schrift.klein))
                        .foregroundStyle(Farbe.blueInk)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityLabel("Nur für \(o.suchfilter.vorleseText)")
                }
                if let dabei = text.dabei {
                    Text(dabei)
                        .font(Schrift.text(.normal, 14))
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
                Knopf("Mitspielen", groesse: .klein, gesperrt: laeuft, aktion: mitspielen)
                    .accessibilityLabel(SpieleLogik.mitspielenLabel(o, jetzt: jetzt))
            }
        }
        .padding(.leading, 20)
        .padding(.trailing, 16)
        .padding(.vertical, 16)
        .karte(radius: Tokens.Radius.karte, padding: nil)
    }

    private func wannText(_ wann: String) -> some View {
        Text(wann)
            .font(Schrift.display(.halbfett, 17))
            .monospacedDigit()
            .foregroundStyle(Farbe.ink)
            .lineLimit(1)
            .accessibilityAddTraits(.isHeader)
    }
}
