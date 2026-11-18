/**
 * Die Blaetter der Verwaltung (apps/mobile/src/components/verwaltung/plaetze)
 *
 * Plaetze sperren, Serie anlegen und eine Serie aendern oder beenden. Alle
 * drei zweistufig wie im Web: erst zaehlen bzw. die Vorschau, dann fragen,
 * dann verdraengen. Wer danach etwas aendert, muss neu pruefen - sonst
 * gaelte eine alte Zahl. Scheitert eine Aktion, bleibt das Blatt offen und
 * der Grund der Datenbank steht im Formular; klappt sie, schliesst es und
 * die Meldung steht auf der Seite. Gestaltet als native Formulare: ✕ links,
 * ✓ rechts, Datum und Uhrzeit ueber die System-Picker, Rueckfragen als
 * Action Sheet.
 */

import SwiftUI

struct VerwaltungBlattInhalt: View {
    let modell: VerwaltungModell
    let blatt: VerwaltungBlatt

    var body: some View {
        Group {
            if let s = modell.stand {
                switch blatt {
                case .sperren: SperrenBlatt(modell: modell, stand: s)
                case .serieAnlegen: SerieAnlegenBlatt(modell: modell, stand: s)
                case let .serie(serie): SerieBlatt(modell: modell, serie: serie)
                }
            }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }
}

// MARK: - Bausteine

/// Datum und Uhrzeit liegen als Text vor (TT.MM.JJJJ, HH:MM); die Picker arbeiten mit Date.
enum VerwaltungZeitwahl {
    private static func format(_ muster: String) -> DateFormatter {
        let f = DateFormatter()
        f.locale = Locale(identifier: "de_DE")
        f.timeZone = TimeZone(identifier: "Europe/Berlin")
        f.dateFormat = muster
        return f
    }
    private static let tagFormat = format("dd.MM.yyyy")
    private static let zeitFormat = format("HH:mm")

    static func tag(_ text: Binding<String>) -> Binding<Date> {
        Binding(
            get: { tagFormat.date(from: text.wrappedValue) ?? Date() },
            set: { text.wrappedValue = tagFormat.string(from: $0) }
        )
    }

    static func zeit(_ text: Binding<String>) -> Binding<Date> {
        Binding(
            get: { zeitFormat.date(from: VerwaltungLogik.normZeit(text.wrappedValue) ?? text.wrappedValue) ?? zeitFormat.date(from: "08:00")! },
            set: { text.wrappedValue = zeitFormat.string(from: $0) }
        )
    }
}

/// Fehler der Datenbank als rote Zeile im Formular.
private struct BlattFehler: View {
    let text: String

    var body: some View {
        Section {
            Label(text, systemImage: "exclamationmark.triangle.fill")
                .foregroundStyle(Farbe.redInk)
                .gruppenZeile()
                .onAppear { UIAccessibility.post(notification: .announcement, argument: text) }
        }
    }
}

/// Zeit von/bis mit dem System-Picker (Rad im Popover).
private struct VonBis: View {
    @Binding var von: String
    @Binding var bis: String

    var body: some View {
        DatePicker("Von", selection: VerwaltungZeitwahl.zeit($von), displayedComponents: .hourAndMinute)
            .environment(\.locale, Locale(identifier: "de_DE"))
            .gruppenZeile()
        DatePicker("Bis", selection: VerwaltungZeitwahl.zeit($bis), displayedComponents: .hourAndMinute)
            .environment(\.locale, Locale(identifier: "de_DE"))
            .gruppenZeile()
    }
}

/// Eine Zeile mit Haken rechts, wie in den Einstellungen.
private struct HakenZeile: View {
    let titel: String
    var unter: String?
    let gewaehlt: Bool
    var bedienName: String?
    let aktion: () -> Void

    var body: some View {
        Button(action: aktion) {
            HStack {
                VStack(alignment: .leading, spacing: 1) {
                    Text(titel).foregroundStyle(Farbe.ink)
                    if let unter, !unter.isEmpty { Text(unter).font(.footnote).foregroundStyle(Farbe.muted) }
                }
                Spacer()
                if gewaehlt {
                    Image(systemName: "checkmark").font(.body.weight(.semibold)).foregroundStyle(Farbe.blue)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .gruppenZeile()
        .accessibilityLabel(bedienName ?? titel)
        .accessibilityAddTraits(gewaehlt ? [.isSelected] : [])
    }
}

// MARK: - Plaetze sperren

private struct SperrenBlatt: View {
    let modell: VerwaltungModell
    let stand: VerwaltungsStand

    @State private var gewaehlt: [String] = []
    @State private var tag = VerwaltungLogik.isoZuDeutsch(Zeit.berlinDay(Date()))
    @State private var von = ""
    @State private var bis = ""
    @State private var art = ""
    @State private var grund = ""
    @State private var kollisionen: Int?
    @State private var fehler: String?
    @State private var laeuft = false

    var body: some View {
        let plaetze = stand.aktivePlaetze
        let alleGewaehlt = !plaetze.isEmpty && gewaehlt.count == plaetze.count
        FormBlatt(
            titel: "Plätze sperren",
            geaendert: !gewaehlt.isEmpty || !grund.isEmpty,
            laeuft: laeuft,
            speichern: { absenden(verdraengen: false) },
            speichernLabel: "Sperren",
            speichernGesperrt: gewaehlt.isEmpty,
            zu: { modell.blatt = nil }
        ) {
            if let fehler { BlattFehler(text: fehler) }
            Section {
                ForEach(plaetze) { p in
                    HakenZeile(
                        titel: p.name ?? VerwaltungLogik.platzChip(p.shortName),
                        unter: p.subline,
                        gewaehlt: gewaehlt.contains(p.id),
                        bedienName: "Plätze \(VerwaltungLogik.platzChip(p.shortName))"
                    ) {
                        kollisionen = nil
                        if gewaehlt.contains(p.id) { gewaehlt.removeAll { $0 == p.id } } else { gewaehlt.append(p.id) }
                    }
                }
            } header: {
                HStack {
                    GruppenKopf(titel: "Plätze")
                    Spacer()
                    Button(alleGewaehlt ? "Keinen" : "Alle") {
                        kollisionen = nil
                        gewaehlt = alleGewaehlt ? [] : plaetze.map(\.id)
                    }
                    .font(.subheadline)
                    .textCase(nil)
                    .accessibilityLabel(alleGewaehlt ? "Keinen Platz wählen" : "Alle Plätze wählen")
                }
            }
            Section {
                DatePicker("Tag", selection: VerwaltungZeitwahl.tag(geaendert($tag)), displayedComponents: .date)
                    .environment(\.locale, Locale(identifier: "de_DE"))
                    .gruppenZeile()
                VonBis(von: geaendert($von), bis: geaendert($bis))
            } header: {
                GruppenKopf(titel: "Zeit")
            }
            Section {
                Picker("Kategorie", selection: geaendert($art)) {
                    ForEach(stand.blockungsarten, id: \.code) { a in Text(a.name ?? a.code).tag(a.code) }
                }
                .pickerStyle(.menu)
                .tint(Farbe.ink2)
                .gruppenZeile()
                FormFeld(label: "Grund", text: $grund, platzhalter: "Freiwillig")
            } header: {
                GruppenKopf(titel: "Art")
            } footer: {
                Text("Regen, Turnier, Platzpflege. Bestehende Buchungen werden erst nach Rückfrage verdrängt.")
                    .foregroundStyle(Farbe.muted)
            }
        }
        .confirmationDialog(
            kollisionen.map { PlaetzeLogik.imWegText($0) } ?? "",
            isPresented: Binding(get: { kollisionen != nil }, set: { if !$0 { kollisionen = nil } }),
            titleVisibility: .visible
        ) {
            if let k = kollisionen {
                Button(PlaetzeLogik.verdraengenText(k), role: .destructive) { absenden(verdraengen: true) }
            }
            Button("Doch nicht", role: .cancel) { kollisionen = nil }
        }
        .onAppear {
            // Vorgabe aus den Einstellungen, nicht fest eingetippt.
            if von.isEmpty { von = stand.oeffnung }
            if bis.isEmpty { bis = stand.schluss }
            if art.isEmpty { art = stand.blockungsarten.first?.code ?? "platzpflege" }
        }
    }

    /// Jede Aenderung macht eine alte Kollisionszahl ungueltig.
    private func geaendert(_ wert: Binding<String>) -> Binding<String> {
        Binding(get: { wert.wrappedValue }, set: {
            wert.wrappedValue = $0
            kollisionen = nil
        })
    }

    private func absenden(verdraengen: Bool) {
        guard !laeuft else { return }
        laeuft = true
        Task {
            let e = await modell.daten.sperre(
                platzIds: gewaehlt, tag: tag, von: von, bis: bis, artCode: art, grund: grund, verdraengen: verdraengen
            )
            laeuft = false
            if e.ok {
                await modell.erledigt(e)
            } else {
                kollisionen = e.kollisionen
                fehler = e.kollisionen == nil ? e.meldung : nil
            }
        }
    }
}

// MARK: - Serie anlegen

private struct SerieAnlegenBlatt: View {
    let modell: VerwaltungModell
    let stand: VerwaltungsStand

    @State private var form = SerienEingabe(
        courtId: "", bookingTypeCode: "", weekday: 2, startTime: "18:30", endTime: "20:00",
        validFrom: "", validTo: "", title: ""
    )
    @State private var vorschau: [SerienTermin]?
    @State private var fehler: String?
    @State private var laeuft = false

    var body: some View {
        let kollisionen = (vorschau ?? []).filter { $0.conflictBookingId != nil }
        FormBlatt(
            titel: "Serie anlegen",
            geaendert: !form.title.isEmpty,
            laeuft: laeuft,
            speichern: { vorschau == nil ? pruefen() : anlegen(verdraengen: !kollisionen.isEmpty) },
            speichernLabel: vorschau == nil ? "Vorschau" : "Anlegen",
            speichernGesperrt: form.title.trimmingCharacters(in: .whitespaces).isEmpty,
            zu: { modell.blatt = nil }
        ) {
            if let fehler { BlattFehler(text: fehler) }
            Section {
                FormFeld(label: "Titel", text: feld(\.title), platzhalter: "etwa Jugendtraining")
                Picker("Art", selection: feld(\.bookingTypeCode)) {
                    ForEach(stand.blockungsarten, id: \.code) { Text($0.name ?? $0.code).tag($0.code) }
                }
                .pickerStyle(.menu)
                .tint(Farbe.ink2)
                .gruppenZeile()
                Picker("Platz", selection: feld(\.courtId)) {
                    ForEach(stand.aktivePlaetze) { Text($0.name ?? VerwaltungLogik.platzChip($0.shortName)).tag($0.id) }
                }
                .pickerStyle(.menu)
                .tint(Farbe.ink2)
                .gruppenZeile()
            }
            Section {
                Picker("Wochentag", selection: feld(\.weekday)) {
                    ForEach(VerwaltungLogik.wochentagWahl, id: \.wert) { w in
                        Text(Zeit.wochentageLang[w.wert % 7]).tag(w.wert)
                    }
                }
                .pickerStyle(.menu)
                .tint(Farbe.ink2)
                .gruppenZeile()
                VonBis(von: feld(\.startTime), bis: feld(\.endTime))
            } header: {
                GruppenKopf(titel: "Wann")
            }
            Section {
                DatePicker("Ab", selection: VerwaltungZeitwahl.tag(feld(\.validFrom)), displayedComponents: .date)
                    .gruppenZeile()
                DatePicker("Bis", selection: VerwaltungZeitwahl.tag(feld(\.validTo)), displayedComponents: .date)
                    .gruppenZeile()
            } header: {
                GruppenKopf(titel: "Zeitraum")
            } footer: {
                if vorschau == nil {
                    Text("Mit ✓ kommt erst die Vorschau: wie viele Termine es werden und was im Weg liegt.")
                        .foregroundStyle(Farbe.muted)
                }
            }
            .environment(\.locale, Locale(identifier: "de_DE"))
            if let vorschau {
                Section {
                    Label(
                        VerwaltungLogik.vorschauText(termine: vorschau.count, kollisionen: kollisionen.count),
                        systemImage: kollisionen.isEmpty ? "checkmark.circle.fill" : "exclamationmark.triangle.fill"
                    )
                    .foregroundStyle(kollisionen.isEmpty ? Farbe.greenInk : Farbe.redInk)
                    .gruppenZeile()
                    ForEach(kollisionen, id: \.startsAt) { k in
                        Text(VerwaltungLogik.kollisionsZeile(startsAt: k.startsAt, mitglied: k.conflictMemberName, art: k.conflictKind))
                            .font(.subheadline)
                            .monospacedDigit()
                            .foregroundStyle(Farbe.ink)
                            .gruppenZeile()
                    }
                } header: {
                    GruppenKopf(titel: "Vorschau")
                } footer: {
                    Text("✓ \(VerwaltungLogik.anlegenText(termine: vorschau.count, kollisionen: kollisionen.count)).")
                        .foregroundStyle(Farbe.muted)
                }
            }
        }
        .onAppear {
            guard form.courtId.isEmpty else { return }
            let heute = VerwaltungLogik.isoZuDeutsch(Zeit.berlinDay(Date()))
            form.courtId = stand.aktivePlaetze.first?.id ?? ""
            form.bookingTypeCode = stand.blockungsarten.first?.code ?? "training"
            form.validFrom = heute
            form.validTo = heute
        }
    }

    /// Jede Aenderung macht die Vorschau ungueltig.
    private func setze<T>(_ pfad: WritableKeyPath<SerienEingabe, T>, _ wert: T) {
        form[keyPath: pfad] = wert
        vorschau = nil
    }

    private func feld<T>(_ pfad: WritableKeyPath<SerienEingabe, T>) -> Binding<T> {
        Binding(get: { form[keyPath: pfad] }, set: { setze(pfad, $0) })
    }

    private func pruefen() {
        guard !laeuft else { return }
        laeuft = true
        Task {
            switch await modell.daten.vorschau(form) {
            case let .success(termine):
                vorschau = termine
                fehler = nil
            case let .failure(m):
                fehler = m.text
            }
            laeuft = false
        }
    }

    private func anlegen(verdraengen: Bool) {
        guard !laeuft else { return }
        laeuft = true
        Task {
            let e = await modell.daten.legeSerieAn(form, verdraengen: verdraengen)
            laeuft = false
            if e.ok {
                await modell.erledigt(e)
            } else {
                fehler = e.meldung
            }
        }
    }
}

// MARK: - Serie aendern oder beenden

/**
 * Platz und Wochentag lassen sich nicht aendern: wer die aendert, meint
 * eine andere Serie und legt sie besser neu an.
 */
private struct SerieBlatt: View {
    let modell: VerwaltungModell
    let serie: Serie

    @State private var von: String
    @State private var bis: String
    @State private var titel: String
    @State private var ende: String
    @State private var kollisionen: Int?
    @State private var beendenFrage = false
    @State private var fehler: String?
    @State private var laeuft = false
    private let anfang: [String]

    init(modell: VerwaltungModell, serie: Serie) {
        self.modell = modell
        self.serie = serie
        let von = String((serie.startTime ?? "").prefix(5))
        let bis = String((serie.endTime ?? "").prefix(5))
        let ende = VerwaltungLogik.isoZuDeutsch(serie.validTo)
        _von = State(initialValue: von)
        _bis = State(initialValue: bis)
        _titel = State(initialValue: serie.title ?? "")
        _ende = State(initialValue: ende)
        anfang = [von, bis, serie.title ?? "", ende]
    }

    var body: some View {
        let tag = (0...6).contains(serie.weekday ?? -1) ? Zeit.wochentageLang[serie.weekday!] : ""
        let geaendert = [von, bis, titel, ende] != anfang
        FormBlatt(
            titel: "Serie",
            geaendert: geaendert,
            laeuft: laeuft,
            speichern: { speichern(verdraengen: false) },
            speichernLabel: "Änderung speichern",
            speichernGesperrt: !geaendert || titel.trimmingCharacters(in: .whitespaces).isEmpty,
            zu: { modell.blatt = nil }
        ) {
            Section {
                VStack(alignment: .leading, spacing: 4) {
                    Text(serie.title ?? "Serie").font(.title2.weight(.bold)).foregroundStyle(Farbe.ink)
                    Text([serie.courtName, tag, serie.typeName].compactMap { $0 }.joined(separator: " · "))
                        .font(.subheadline)
                        .foregroundStyle(Farbe.muted)
                }
                .listRowBackground(Color.clear)
                .accessibilityElement(children: .combine)
            }
            if let fehler { BlattFehler(text: fehler) }
            Section {
                FormFeld(label: "Titel", text: $titel)
                VonBis(von: zuruecksetzend($von), bis: zuruecksetzend($bis))
                DatePicker("Läuft bis", selection: VerwaltungZeitwahl.tag(zuruecksetzend($ende)), displayedComponents: .date)
                    .environment(\.locale, Locale(identifier: "de_DE"))
                    .gruppenZeile()
            } footer: {
                Text("Vergangene Termine bleiben stehen. Geändert wird ab heute: die künftigen werden abgesagt und in der neuen Lage neu angelegt.")
                    .foregroundStyle(Farbe.muted)
            }
            Section {
                LabeledContent("Offene Termine", value: "\(serie.kuenftige ?? 0)").gruppenZeile()
            }
            Section {
                Button(role: .destructive) { beendenFrage = true } label: {
                    Text("Serie beenden").frame(maxWidth: .infinity)
                }
                .disabled(laeuft)
                .gruppenZeile()
            }
        }
        .confirmationDialog(
            "Serie beenden?",
            isPresented: $beendenFrage,
            titleVisibility: .visible
        ) {
            Button("\(serie.kuenftige ?? 0) Termine absagen", role: .destructive) { beenden() }
            Button("Doch nicht", role: .cancel) {}
        } message: {
            Text("Vergangene Termine bleiben stehen, die künftigen werden abgesagt.")
        }
        .confirmationDialog(
            kollisionen.map { PlaetzeLogik.imWegText($0) } ?? "",
            isPresented: Binding(get: { kollisionen != nil }, set: { if !$0 { kollisionen = nil } }),
            titleVisibility: .visible
        ) {
            if let k = kollisionen {
                Button(PlaetzeLogik.verdraengenText(k), role: .destructive) { speichern(verdraengen: true) }
            }
            Button("Doch nicht", role: .cancel) { kollisionen = nil }
        }
    }

    private func zuruecksetzend(_ wert: Binding<String>) -> Binding<String> {
        Binding(get: { wert.wrappedValue }, set: {
            wert.wrappedValue = $0
            kollisionen = nil
        })
    }

    private func speichern(verdraengen: Bool) {
        guard !laeuft else { return }
        laeuft = true
        Task {
            let e = await modell.daten.aendereSerie(
                id: serie.id, startTime: von, endTime: bis, titel: titel, validTo: ende, verdraengen: verdraengen
            )
            laeuft = false
            if e.ok {
                await modell.erledigt(e)
            } else {
                kollisionen = e.kollisionen
                fehler = e.kollisionen == nil ? e.meldung : nil
            }
        }
    }

    private func beenden() {
        guard !laeuft else { return }
        laeuft = true
        Task {
            let e = await modell.daten.beendeSerie(serie.id)
            laeuft = false
            if e.ok {
                await modell.erledigt(e)
            } else {
                fehler = e.meldung
            }
        }
    }
}
