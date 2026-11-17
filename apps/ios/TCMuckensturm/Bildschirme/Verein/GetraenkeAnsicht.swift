/**
 * Getraenke (apps/mobile/app/(tabs)/verein/(reiter)/getraenke.tsx), ein Reiter von "Verein"
 *
 * Oben der laufende Monat, darunter die Karte als Liste mit Zaehler: man
 * sammelt, was man genommen hat, und traegt es ueber die Leiste unten auf
 * einmal ein. Gebucht wird dabei je Artikel (record_drink_purchase), es gibt
 * keinen Sammelauftrag. Schlaegt einer fehl, sagt die Meldung welcher, und
 * er bleibt zum erneuten Versuch gewaehlt. Waehrend des Sendens ist die
 * Karte gesperrt.
 *
 * "Zuletzt" zeigt die eigenen Entnahmen des Monats; zuruecknehmen geht nur
 * im Stornofenster (drink_void_window_minutes). Ein Takt alle 30 Sekunden
 * blendet den Knopf rechtzeitig aus - sonst tippt jemand nach zwanzig
 * Minuten auf etwas, das die Datenbank abweist.
 */

import SwiftUI

private struct GetraenkeInhalt: Sendable {
    let karte: [Getraenk]
    let buchungen: [EigenesGetraenk]
    let stornoFenster: Int
}

/// Was unter "Zuletzt" kurz hervorgehoben ist (U16).
private enum Hervorhebung: Equatable {
    /// alles, was es vor dem Eintragen nicht gab
    case neu(vorher: Set<String>)
    /// die eine zurueckgenommene Zeile
    case eine(String)

    func trifft(_ id: String) -> Bool {
        switch self {
        case let .neu(vorher): !vorher.contains(id)
        case let .eine(eine): eine == id
        }
    }
}

struct GetraenkeAnsicht: View {
    @Environment(Sitzung.self) private var sitzung
    @Environment(VereinZustand.self) private var zustand
    @Environment(\.dynamicTypeSize) private var textgroesse
    @State private var inhalt: GetraenkeInhalt?
    @State private var fehler: String?
    @State private var laedt = true
    @State private var aktualisiert = false
    @State private var laeuft = false
    @State private var meldung: ToastMeldung?
    @State private var markiert: Hervorhebung?
    @State private var jetzt = Date()
    @State private var getippt = 0

    private var daten: Vereinsdaten { Vereinsdaten(client: sitzung.client) }

    var body: some View {
        let buchungen = inhalt?.buchungen ?? []
        let summe = zustand.korbSumme
        ScrollViewReader { leser in
        ScrollView {
            VStack(alignment: .leading, spacing: Tokens.Abstand.m) {
                VereinKopf()
                if let fehler {
                    Fehlerzeile(text: fehler, laeuft: aktualisiert) { Task { await laden(.nachladen) } }
                }
                if laedt && inhalt == nil {
                    ProgressView().tint(Farbe.muted).frame(maxWidth: .infinity).padding(.top, 40)
                } else if let inhalt {
                    Monatskarte(buchungen: buchungen, jetzt: jetzt)

                    KontoAbschnitt(titel: "Was nimmst du?")
                    Text("Mit + sammelst du. Gebucht ist erst, was du unten einträgst.")
                        .leise().padding(.top, -4)
                    karte(inhalt.karte)

                    KontoAbschnitt(titel: "Zuletzt").id("zuletzt")
                    Text(VereinLogik.stornoHinweis(inhalt.stornoFenster)).leise().padding(.top, -4)
                    if buchungen.isEmpty {
                        Leerzustand(text: "Noch nichts entnommen.")
                    } else {
                        zuletzt(buchungen, fenster: inhalt.stornoFenster)
                    }
                }
            }
            .padding(.horizontal, Tokens.Abstand.rand)
            .padding(.bottom, Tokens.Abstand.abschnitt * 2)
        }
        #if DEBUG
        // Fuer Bildschirmfotos per simctl (README): `-TCMVereinRollen zuletzt` rollt nach dem Laden dorthin.
        .task(id: inhalt == nil) {
            let argumente = ProcessInfo.processInfo.arguments
            if inhalt != nil, let i = argumente.firstIndex(of: "-TCMVereinRollen"), i + 1 < argumente.count {
                try? await Task.sleep(for: .milliseconds(300))
                leser.scrollTo(argumente[i + 1], anchor: .top)
            }
        }
        #endif
        }
        .background(Farbe.bg)
        .refreshable { await laden(.nachladen) }
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: 8) {
                if let meldung { Toast(meldung: meldung) { self.meldung = nil } }
                if summe.stueck > 0 {
                    Korbleiste(stueck: summe.stueck, betrag: summe.betrag, laeuft: laeuft) { Task { await eintragen() } }
                }
            }
            .padding(.horizontal, Tokens.Abstand.m)
            .padding(.bottom, 8)
            .animation(.snappy, value: meldung)
            .animation(.snappy, value: summe.stueck > 0)
        }
        .sensoryFeedback(.impact(weight: .light), trigger: getippt)
        .sensoryFeedback(trigger: meldung) { _, neu in
            guard let neu else { return nil }
            return neu.ok ? .success : .error
        }
        .task { await laden(.erstes) }
        // Zurueck auf den Reiter oder Tab: still nachladen, ohne Ladekreis.
        .onAppear { if inhalt != nil { Task { await laden(.still) } } }
        // Taktgeber fuer das Stornofenster
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(30))
                jetzt = Date()
            }
        }
        .task(id: markiert) {
            guard markiert != nil else { return }
            try? await Task.sleep(for: .seconds(5))
            if !Task.isCancelled { markiert = nil }
        }
        // Erfolg verschwindet nach ein paar Sekunden, ein Fehler bleibt, bis man ihn schliesst.
        .task(id: meldung) {
            guard let m = meldung, m.ok else { return }
            try? await Task.sleep(for: .seconds(8))
            if !Task.isCancelled { meldung = nil }
        }
    }

    // MARK: - Die Karte

    /// Eine Liste in einer Karte; was im Korb liegt, ist hellblau hinterlegt.
    private func karte(_ karte: [Getraenk]) -> some View {
        VStack(spacing: 0) {
            ForEach(Array(karte.enumerated()), id: \.element.id) { i, a in
                if i > 0 { KontoLinie() }
                zeile(a)
            }
        }
        .karte(padding: 0)
    }

    private func zeile(_ a: Getraenk) -> some View {
        let menge = zustand.korb[a.id] ?? 0
        let name = a.name ?? ""
        // Bei grosser Schrift stehen die Knoepfe unter dem Namen.
        let layout = textgroesse >= .xxLarge
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8))
            : AnyLayout(HStackLayout(spacing: 12))
        return layout {
            VStack(alignment: .leading, spacing: 2) {
                Text(name)
                    .font(Schrift.display(.halbfett, 17))
                    .foregroundStyle(menge > 0 ? Farbe.blueInk : Farbe.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Text(VereinLogik.artikelZeile(a))
                    .font(Schrift.text(.normal, 14))
                    .foregroundStyle(menge > 0 ? Farbe.blueInk : Farbe.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            HStack(spacing: 4) {
                if menge > 0 {
                    Zaehlknopf(zeichen: .minus, beschriftung: "\(name): eins weniger", aus: laeuft) { aendern(a.id, -1) }
                    Zaehlerstand(wert: menge, label: "\(menge) gewählt, noch nicht eingetragen")
                }
                // Betont erst, wenn schon etwas gesammelt ist (U43).
                Zaehlknopf(
                    zeichen: .plus, betont: menge > 0, beschriftung: "\(name): eins mehr",
                    aus: laeuft || menge >= Getraenke.maxMenge
                ) { aendern(a.id, 1) }
            }
        }
        .padding(.vertical, 12)
        .padding(.leading, 20)
        .padding(.trailing, 14)
        .frame(minHeight: 72)
        .background(menge > 0 ? Farbe.blueSoft : Color.clear)
        .animation(.easeOut(duration: 0.15), value: menge > 0)
    }

    // MARK: - Zuletzt

    private func zuletzt(_ buchungen: [EigenesGetraenk], fenster: Int) -> some View {
        VStack(spacing: 0) {
            ForEach(Array(buchungen.enumerated()), id: \.element.id) { i, b in
                if i > 0 { KontoLinie() }
                entnahme(b, fenster: fenster)
            }
        }
        .karte(padding: 0)
    }

    private func entnahme(_ b: EigenesGetraenk, fenster: Int) -> some View {
        let zurueck = b.voidedAt != nil
        let stornierbar = Getraenke.canVoidSelf(createdAt: b.createdAt, voidedAt: b.voidedAt, fensterMinuten: fenster, now: jetzt)
        return HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(VereinLogik.entnahmeTitel(b))
                    .font(Schrift.display(.halbfett, 15.5))
                    .foregroundStyle(Farbe.ink)
                    .strikethrough(zurueck)
                Text(VereinLogik.entnahmeZeile(b))
                    .font(Schrift.text(.normal, Tokens.Schrift.klein))
                    .foregroundStyle(Farbe.muted)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if stornierbar {
                Button { Task { await zuruecknehmen(b.id) } } label: {
                    Text("Zurücknehmen")
                        .font(Schrift.display(.halbfett, 14))
                        .foregroundStyle(Farbe.blueInk)
                        .padding(.horizontal, 4)
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(laeuft)
                .opacity(laeuft ? 0.5 : 1)
                .accessibilityLabel("\(b.itemName ?? "") zurücknehmen")
            }
            Text(Geld.formatCents(b.totalCents ?? 0))
                .font(Schrift.display(.fett, 17))
                .monospacedDigit()
                .foregroundStyle(Farbe.ink)
                .strikethrough(zurueck)
        }
        .padding(.vertical, 14)
        .padding(.horizontal, 20)
        .opacity(zurueck ? 0.55 : 1)
        .background(markiert?.trifft(b.id) == true ? Farbe.blueSoft : Color.clear)
        .animation(.easeOut, value: markiert)
    }

    // MARK: - Handlungen

    private func aendern(_ id: String, _ um: Int) {
        // Waehrend des Sendens gesperrt: das Ergebnis setzt den Korb neu.
        guard !laeuft else { return }
        meldung = nil
        if um > 0 { getippt += 1 }
        zustand.korb = Getraenke.changeBasket(zustand.korb, itemId: id, delta: um)
    }

    private func eintragen() async {
        let vorher = Set((inhalt?.buchungen ?? []).map(\.id))
        let gewaehlt = Getraenke.basketSummary(zustand.karte, zustand.korb).lines
        laeuft = true
        var ergebnisse: [EintragErgebnis] = []
        // Nacheinander, nicht parallel: die Meldung folgt der Reihenfolge der
        // Karte, und die Datenbank sieht keine gleichzeitigen Buchungen.
        for a in gewaehlt {
            let menge = zustand.korb[a.id] ?? 0
            let r = await daten.bucheGetraenk(a.id, menge: menge)
            ergebnisse.append(EintragErgebnis(id: a.id, name: a.name ?? "", quantity: menge, ok: r.ok, message: r.ok ? nil : r.meldung))
        }
        laeuft = false
        let bericht = Getraenke.drinkBatchReport(ergebnisse)
        meldung = ToastMeldung(ok: bericht.ok, text: bericht.text)
        if ergebnisse.contains(where: \.ok) { markiert = .neu(vorher: vorher) }
        // Was geklappt hat, verlaesst den Korb; was nicht, bleibt zum erneuten Versuch.
        zustand.korb = Getraenke.basketAfterBatch(ergebnisse)
        await laden(.still)
    }

    private func zuruecknehmen(_ id: String) async {
        laeuft = true
        let r = await daten.storniereGetraenk(id)
        laeuft = false
        meldung = ToastMeldung(ok: r.ok, text: r.meldung)
        if r.ok {
            markiert = .eine(id)
            await laden(.still)
        }
    }

    // MARK: - Laden

    private enum Art { case erstes, nachladen, still }

    private func laden(_ art: Art) async {
        if art == .nachladen { aktualisiert = true }
        let d = daten
        async let karte = d.getraenkekarte()
        async let buchungen = d.eigeneGetraenke()
        async let fenster = d.stornoFenster()
        do {
            let neu = try await GetraenkeInhalt(karte: karte, buchungen: buchungen, stornoFenster: fenster)
            inhalt = neu
            zustand.karte = neu.karte
            fehler = nil
        } catch {
            // Still nachgeladen bleibt der alte Stand stehen; der Fehler steht oben.
            fehler = Meldung.aus(error).text
        }
        #if DEBUG
        // Fuer Bildschirmfotos per simctl (README): `-TCMVereinKorb` legt zwei Artikel in den Korb.
        if art == .erstes, zustand.korb.isEmpty, ProcessInfo.processInfo.arguments.contains("-TCMVereinKorb") {
            zustand.korb = Dictionary(uniqueKeysWithValues: zustand.karte.prefix(2).enumerated().map { ($1.id, 2 - $0) })
        }
        #endif
        jetzt = Date()
        laedt = false
        aktualisiert = false
    }
}

// MARK: - Der laufende Monat

private struct Monatskarte: View {
    let buchungen: [EigenesGetraenk]
    let jetzt: Date

    var body: some View {
        let summe = Geld.formatCents(Startseite.sumOpenDrinks(buchungen))
        let aktive = buchungen.filter { $0.voidedAt == nil }.count
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                Circle().fill(Farbe.blue).frame(width: 8, height: 8).accessibilityHidden(true)
                Text(VereinLogik.monatKicker(jetzt)).kicker()
            }
            Text(summe)
                .font(Schrift.display(.fett, Tokens.Schrift.hero, relativeTo: .largeTitle))
                .tracking(-1)
                .monospacedDigit()
                .foregroundStyle(Farbe.ink)
                .padding(.top, 6)
                .accessibilityLabel("Summe diesen Monat: \(summe)")
            Text(VereinLogik.entnahmenText(aktive))
                .font(Schrift.text(.normal, 15))
                .foregroundStyle(Farbe.ink2)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 6)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 22)
        .padding(.vertical, 20)
        .karte(radius: Tokens.Radius.karteGross, padding: nil)
    }
}

// MARK: - Eintragen-Leiste

/// Unten ueber dem Inhalt: was im Korb liegt und "Eintragen". Mit grosser Schrift zweizeilig.
private struct Korbleiste: View {
    let stueck: Int
    let betrag: Int
    let laeuft: Bool
    let aktion: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(VereinLogik.korbZeile(stueck: stueck, betrag: betrag))
                    .font(Schrift.display(.fett, 15.5))
                    .monospacedDigit()
                    .foregroundStyle(Farbe.ink)
                Text("Noch nicht eingetragen").kicker()
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
            // Die eine Hauptaktion des Screens
            Knopf(laeuft ? "Wird eingetragen …" : "Eintragen", stufe: .haupt, gesperrt: laeuft, aktion: aktion)
        }
        .padding(.leading, 22)
        .padding(.trailing, 8)
        .padding(.vertical, 8)
        .frame(minHeight: 68)
        .background(Farbe.surf, in: RoundedRectangle(cornerRadius: 34))
        .overlay(RoundedRectangle(cornerRadius: 34).strokeBorder(Farbe.line2, lineWidth: 1))
        .shadow(color: .black.opacity(0.14), radius: 12, y: 8)
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }
}
