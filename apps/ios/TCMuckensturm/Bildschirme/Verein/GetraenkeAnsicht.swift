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
        List {
            VereinKopf()
            if let fehler {
                Section {
                    FehlerZeile(text: fehler, erneut: Erneut(laeuft: aktualisiert) { Task { await laden(.nachladen) } })
                        .gruppenZeile()
                }
            }
            if laedt && inhalt == nil {
                Section {
                    ProgressView().tint(Farbe.muted).frame(maxWidth: .infinity).padding(.vertical, 24)
                }
                .listRowBackground(Color.clear)
            } else if let inhalt {
                Section {
                    NavigationLink {
                        ZuletztSeite(
                            buchungen: buchungen, fenster: inhalt.stornoFenster, jetzt: jetzt,
                            laeuft: laeuft, markiert: markiert
                        ) { id in Task { await zuruecknehmen(id) } }
                    } label: {
                        Monatszeile(buchungen: buchungen, jetzt: jetzt)
                    }
                    .gruppenZeile()
                } header: {
                    GruppenKopf(titel: "Dein Monat")
                } footer: {
                    Text("Wird mit der Monatsabrechnung eingezogen.").foregroundStyle(Farbe.muted)
                }
                ForEach(Self.abschnitte(inhalt.karte), id: \.titel) { g in
                    Section {
                        ForEach(g.artikel) { zeile($0) }
                    } header: {
                        GruppenKopf(titel: g.titel)
                    } footer: {
                        if g.titel == Self.abschnitte(inhalt.karte).last?.titel {
                            Text("Mit + sammelst du. Gebucht ist erst, was du unten einträgst.")
                                .foregroundStyle(Farbe.muted)
                        }
                    }
                }
            }
        }
        .gruppenListe()
        .listSectionSpacing(20)
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

    private struct Gruppe { let titel: String; let artikel: [Getraenk] }

    /// Nach Kategorie in der Reihenfolge der Karte; ohne Kategorien ein Abschnitt "Getränkekarte".
    /// Die Kategorien der Karte (drink_items.category) auf Deutsch.
    private static let kategorie = ["drink": "Getränke", "food": "Essen & Snacks"]

    private static func abschnitte(_ karte: [Getraenk]) -> [Gruppe] {
        var gruppen: [Gruppe] = []
        for a in karte {
            let titel = Self.kategorie[a.category ?? ""] ?? Platzplan.nichtLeer(a.category) ?? "Weiteres"
            if let i = gruppen.firstIndex(where: { $0.titel == titel }) {
                gruppen[i] = Gruppe(titel: titel, artikel: gruppen[i].artikel + [a])
            } else {
                gruppen.append(Gruppe(titel: titel, artikel: [a]))
            }
        }
        if gruppen.count <= 1 { return karte.isEmpty ? [] : [Gruppe(titel: "Getränkekarte", artikel: karte)] }
        return gruppen
    }

    private func zeile(_ a: Getraenk) -> some View {
        let menge = zustand.korb[a.id] ?? 0
        let name = a.name ?? ""
        return HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(name).font(.body.weight(menge > 0 ? .semibold : .regular)).foregroundStyle(Farbe.ink)
                Text(VereinLogik.artikelZeile(a)).font(.subheadline).foregroundStyle(Farbe.muted)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if menge > 0 {
                // Gesammeltes: Minus, Zahl und Plus in einer Kapsel wie die Mengenwahl im Apple Store.
                HStack(spacing: 0) {
                    mengenKnopf("minus", "\(name): eins weniger", aus: laeuft) { aendern(a.id, -1) }
                    Text("\(menge)")
                        .font(.body.weight(.semibold))
                        .monospacedDigit()
                        .foregroundStyle(Farbe.blueInk)
                        .frame(minWidth: 22)
                        .accessibilityLabel("\(menge) gewählt, noch nicht eingetragen")
                    mengenKnopf("plus", "\(name): eins mehr", aus: laeuft || menge >= Getraenke.maxMenge) { aendern(a.id, 1) }
                }
                .background(Farbe.blueSoft, in: Capsule())
                .transition(.scale(scale: 0.8).combined(with: .opacity))
            } else {
                Button { aendern(a.id, 1) } label: {
                    Image(systemName: "plus.circle.fill")
                        .font(.title2)
                        .symbolRenderingMode(.hierarchical)
                        .foregroundStyle(Farbe.blue)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.borderless)
                .disabled(laeuft)
                .accessibilityLabel("\(name): eins mehr")
            }
        }
        .gruppenZeile()
        .animation(.snappy(duration: 0.2), value: menge > 0)
    }

    private func mengenKnopf(_ symbol: String, _ label: String, aus: Bool, aktion: @escaping () -> Void) -> some View {
        Button(action: aktion) {
            Image(systemName: symbol)
                .font(.subheadline.weight(.bold))
                .foregroundStyle(Farbe.blueInk)
                .frame(width: 40, height: 36)
                .contentShape(Rectangle())
        }
        .buttonStyle(.borderless)
        .disabled(aus)
        .opacity(aus ? 0.4 : 1)
        .accessibilityLabel(label)
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

/// Eine Zeile wie die Abrechnung im Konto: Summe gross, Entnahmen klein; fuehrt zu "Zuletzt".
private struct Monatszeile: View {
    let buchungen: [EigenesGetraenk]
    let jetzt: Date

    var body: some View {
        let summe = Geld.formatCents(Startseite.sumOpenDrinks(buchungen))
        let aktive = buchungen.filter { $0.voidedAt == nil }.count
        HStack(spacing: 12) {
            IconKachel(symbol: "cup.and.saucer.fill")
            VStack(alignment: .leading, spacing: 2) {
                Text(VereinLogik.monatKicker(jetzt)).foregroundStyle(Farbe.ink)
                Text(aktive == 1 ? "1 Entnahme" : "\(aktive) Entnahmen").font(.subheadline).foregroundStyle(Farbe.muted)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Text(summe)
                .font(.title2.weight(.bold))
                .monospacedDigit()
                .foregroundStyle(Farbe.ink)
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Summe diesen Monat: \(summe), \(VereinLogik.entnahmenText(aktive))")
    }
}

/// Die Entnahmen des Monats; zuruecknehmen geht nur im Stornofenster.
private struct ZuletztSeite: View {
    let buchungen: [EigenesGetraenk]
    let fenster: Int
    let jetzt: Date
    let laeuft: Bool
    let markiert: Hervorhebung?
    let zuruecknehmen: (String) -> Void

    var body: some View {
        List {
            Section {
                if buchungen.isEmpty {
                    Text("Noch nichts entnommen.").foregroundStyle(Farbe.muted).gruppenZeile()
                }
                ForEach(buchungen) { zeile($0) }
            } header: {
                GruppenKopf(titel: "Zuletzt")
            } footer: {
                Text(VereinLogik.stornoHinweis(fenster)).foregroundStyle(Farbe.muted)
            }
        }
        .gruppenListe()
        .navigationTitle(Zeit.monatLang(jetzt))
        .navigationBarTitleDisplayMode(.inline)
    }

    private func zeile(_ b: EigenesGetraenk) -> some View {
        let zurueck = b.voidedAt != nil
        let stornierbar = Getraenke.canVoidSelf(createdAt: b.createdAt, voidedAt: b.voidedAt, fensterMinuten: fenster, now: jetzt)
        return HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(VereinLogik.entnahmeTitel(b)).foregroundStyle(Farbe.ink).strikethrough(zurueck)
                Text(VereinLogik.entnahmeZeile(b)).font(.footnote).foregroundStyle(Farbe.muted)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if stornierbar {
                Button("Zurücknehmen") { zuruecknehmen(b.id) }
                    .buttonStyle(.borderless)
                    .font(.subheadline.weight(.semibold))
                    .tint(Farbe.blueInk)
                    .disabled(laeuft)
                    .accessibilityLabel("\(b.itemName ?? "") zurücknehmen")
            }
            Text(Geld.formatCents(b.totalCents ?? 0))
                .font(.body.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(Farbe.ink)
                .strikethrough(zurueck)
        }
        .opacity(zurueck ? 0.55 : 1)
        .listRowBackground(markiert?.trifft(b.id) == true ? Farbe.blueSoft : Farbe.surf)
        .listRowSeparatorTint(Farbe.line2)
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
                    .font(.headline)
                    .monospacedDigit()
                    .foregroundStyle(Farbe.ink)
                Text("Noch nicht eingetragen").font(.footnote).foregroundStyle(Farbe.muted)
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
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 34))
        .overlay(RoundedRectangle(cornerRadius: 34).strokeBorder(Farbe.line2, lineWidth: 0.5))
        .shadow(color: .black.opacity(0.14), radius: 12, y: 8)
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }
}
