/**
 * Die Blaetter der Verwaltung (apps/mobile/src/components/verwaltung/plaetze)
 *
 * Plaetze sperren, Serie anlegen und eine Serie aendern oder beenden. Alle
 * drei zweistufig wie im Web: erst zaehlen bzw. die Vorschau, dann fragen,
 * dann verdraengen. Wer danach etwas aendert, muss neu pruefen - sonst
 * gaelte eine alte Zahl. Scheitert eine Aktion, bleibt das Blatt offen und
 * der Grund der Datenbank steht ueber dem Knopf; klappt sie, schliesst es
 * und die Meldung steht auf der Seite.
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
        .presentationCornerRadius(Tokens.Radius.blatt)
        .presentationBackground(Farbe.surf)
    }
}

// MARK: - Bausteine

/// Rahmen eines Blatts: Kopf, Unterzeile, Inhalt zum Rollen.
private struct BlattRahmen<Inhalt: View>: View {
    let titel: String
    var unterzeile: String?
    let zu: () -> Void
    @ViewBuilder let inhalt: Inhalt

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                BlattKopf(titel: titel, zu: zu)
                if let unterzeile {
                    Text(unterzeile)
                        .font(Schrift.text(.normal, 14))
                        .foregroundStyle(Farbe.ink2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                inhalt
            }
            .padding(.horizontal, Tokens.Abstand.rand)
            .padding(.top, 24)
            .padding(.bottom, 32)
        }
        .scrollDismissesKeyboard(.interactively)
    }
}

/// Beschriftung ueber einer Chipwahl.
private struct Feldname: View {
    let text: String

    var body: some View {
        Text(text)
            .font(Schrift.text(.halbfett, Tokens.Schrift.klein, relativeTo: .footnote))
            .foregroundStyle(Farbe.ink2)
            .accessibilityAddTraits(.isHeader)
    }
}

/// Chips zum Antippen, gewaehlt in Gold (Chipwahl in Formular.tsx).
private struct Chips<Wert: Hashable>: View {
    let label: String
    let optionen: [(wert: Wert, label: String)]
    let gewaehlt: (Wert) -> Bool
    let wahl: (Wert) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Feldname(text: label)
            UmbruchStapel(abstand: 8, zeilenabstand: 8) {
                ForEach(optionen, id: \.wert) { o in
                    let aktiv = gewaehlt(o.wert)
                    Button { wahl(o.wert) } label: {
                        Text(o.label)
                            .font(Schrift.text(.halbfett, 14.5))
                            .foregroundStyle(aktiv ? Farbe.onGold : Farbe.ink)
                            .padding(.horizontal, 14)
                            .frame(minWidth: 44, minHeight: 40)
                            .background(aktiv ? Farbe.gold : Farbe.surf2, in: Capsule())
                            .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(label) \(o.label)")
                    .accessibilityAddTraits(aktiv ? [.isSelected] : [])
                }
            }
        }
    }
}

/// Die Folgen vor dem Bestaetigen: was im Weg liegt (Folgen in Formular.tsx).
private struct Folgen: View {
    let text: String
    var zeilen: [String] = []

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(text)
                .font(Schrift.text(.fett, 14))
                .foregroundStyle(Farbe.ink)
                .fixedSize(horizontal: false, vertical: true)
            ForEach(zeilen, id: \.self) { z in
                Text(z).font(Schrift.text(.normal, 13.5)).foregroundStyle(Farbe.ink).monospacedDigit()
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Farbe.goldSoft, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Farbe.goldLine, lineWidth: 1))
        .accessibilityElement(children: .combine)
    }
}

/// Rot als Flaeche mit weisser Schrift: Verdraengen und Beenden.
private struct GefahrKnopf: View {
    let text: String
    var gesperrt = false
    let aktion: () -> Void

    var body: some View {
        Button(action: aktion) {
            Text(text)
                .font(Schrift.text(.extrafett, 16))
                .multilineTextAlignment(.center)
                .foregroundStyle(Farbe.onBrand)
                .padding(.horizontal, 12)
                .frame(maxWidth: .infinity, minHeight: 52)
                .background(Farbe.red, in: RoundedRectangle(cornerRadius: 16))
        }
        .buttonStyle(.plain)
        .disabled(gesperrt)
        .opacity(gesperrt ? 0.6 : 1)
    }
}

// MARK: - Plaetze sperren

private struct SperrenBlatt: View {
    static let alle = "__alle"

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
        BlattRahmen(
            titel: "Plätze sperren",
            unterzeile: "Regen, Turnier, Platzpflege. Bestehende Buchungen werden erst nach Rückfrage verdrängt.",
            zu: { modell.blatt = nil }
        ) {
            Chips(
                label: "Plätze",
                optionen: plaetze.map { ($0.id, VerwaltungLogik.platzChip($0.shortName)) } + [(Self.alle, alleGewaehlt ? "Keinen" : "Alle")],
                gewaehlt: { $0 == Self.alle ? alleGewaehlt : gewaehlt.contains($0) }
            ) { id in
                kollisionen = nil
                if id == Self.alle {
                    gewaehlt = alleGewaehlt ? [] : plaetze.map(\.id)
                } else if gewaehlt.contains(id) {
                    gewaehlt.removeAll { $0 == id }
                } else {
                    gewaehlt.append(id)
                }
            }
            KontoFeld(label: "Tag (TT.MM.JJJJ)", text: geaendert($tag), tastatur: .numbersAndPunctuation)
            HStack(spacing: 12) {
                KontoFeld(label: "Von (HH:MM)", text: geaendert($von), tastatur: .numbersAndPunctuation)
                KontoFeld(label: "Bis (HH:MM)", text: geaendert($bis), tastatur: .numbersAndPunctuation)
            }
            Chips(label: "Kategorie", optionen: stand.blockungsarten.map { ($0.code, $0.name ?? $0.code) }, gewaehlt: { $0 == art }) {
                art = $0
                kollisionen = nil
            }
            KontoFeld(label: "Grund (freiwillig)", text: $grund)

            if let fehler { KontoHinweis(text: fehler) }
            if let kollisionen { Folgen(text: PlaetzeLogik.imWegText(kollisionen)) }

            if let kollisionen {
                GefahrKnopf(text: PlaetzeLogik.verdraengenText(kollisionen), gesperrt: laeuft) { absenden(verdraengen: true) }
                LeiserKnopf(text: "Doch nicht") { self.kollisionen = nil }
            } else {
                GelberKnopf(
                    text: laeuft ? "Wird gesperrt…" : "Sperren",
                    // Der Grund ist freiwillig; was die Sperrung ist, sagt die Art.
                    gesperrt: laeuft || gewaehlt.isEmpty || tag.trimmingCharacters(in: .whitespaces).isEmpty
                ) { absenden(verdraengen: false) }
            }
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
        BlattRahmen(titel: "Serie anlegen", zu: { modell.blatt = nil }) {
            KontoFeld(label: "Titel", text: feld(\.title))
            Chips(label: "Art", optionen: stand.blockungsarten.map { ($0.code, $0.name ?? $0.code) }, gewaehlt: { $0 == form.bookingTypeCode }) {
                setze(\.bookingTypeCode, $0)
            }
            Chips(label: "Wochentag", optionen: VerwaltungLogik.wochentagWahl, gewaehlt: { $0 == form.weekday }) {
                setze(\.weekday, $0)
            }
            HStack(spacing: 12) {
                KontoFeld(label: "Von (HH:MM)", text: feld(\.startTime), tastatur: .numbersAndPunctuation)
                KontoFeld(label: "Bis (HH:MM)", text: feld(\.endTime), tastatur: .numbersAndPunctuation)
            }
            Chips(
                label: "Platz",
                optionen: stand.aktivePlaetze.map { ($0.id, VerwaltungLogik.platzOhneWort($0.name)) },
                gewaehlt: { $0 == form.courtId }
            ) { setze(\.courtId, $0) }
            HStack(spacing: 12) {
                KontoFeld(label: "Ab (TT.MM.JJJJ)", text: feld(\.validFrom), tastatur: .numbersAndPunctuation)
                KontoFeld(label: "Bis (TT.MM.JJJJ)", text: feld(\.validTo), tastatur: .numbersAndPunctuation)
            }

            if let fehler { KontoHinweis(text: fehler) }
            if let vorschau {
                Folgen(
                    text: VerwaltungLogik.vorschauText(termine: vorschau.count, kollisionen: kollisionen.count),
                    zeilen: kollisionen.map {
                        VerwaltungLogik.kollisionsZeile(startsAt: $0.startsAt, mitglied: $0.conflictMemberName, art: $0.conflictKind)
                    }
                )
                GelberKnopf(
                    text: laeuft ? "Wird angelegt…" : VerwaltungLogik.anlegenText(termine: vorschau.count, kollisionen: kollisionen.count),
                    gesperrt: laeuft
                ) { anlegen(verdraengen: !kollisionen.isEmpty) }
            } else {
                GelberKnopf(
                    text: laeuft ? "Wird geprüft…" : "Vorschau",
                    gesperrt: laeuft || form.title.trimmingCharacters(in: .whitespaces).isEmpty
                ) { pruefen() }
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

    private func feld(_ pfad: WritableKeyPath<SerienEingabe, String>) -> Binding<String> {
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

    init(modell: VerwaltungModell, serie: Serie) {
        self.modell = modell
        self.serie = serie
        _von = State(initialValue: String((serie.startTime ?? "").prefix(5)))
        _bis = State(initialValue: String((serie.endTime ?? "").prefix(5)))
        _titel = State(initialValue: serie.title ?? "")
        _ende = State(initialValue: VerwaltungLogik.isoZuDeutsch(serie.validTo))
    }

    var body: some View {
        let tag = (0...6).contains(serie.weekday ?? -1) ? Zeit.wochentageLang[serie.weekday!] : ""
        BlattRahmen(
            titel: serie.title ?? "Serie",
            unterzeile: [serie.courtName, tag, serie.typeName].compactMap { $0 }.joined(separator: " · "),
            zu: { modell.blatt = nil }
        ) {
            Text("Vergangene Termine bleiben stehen. Geändert wird ab heute: die künftigen werden abgesagt und in der neuen Lage neu angelegt.")
                .leise()
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 12) {
                KontoFeld(label: "Von (HH:MM)", text: $von, tastatur: .numbersAndPunctuation)
                KontoFeld(label: "Bis (HH:MM)", text: $bis, tastatur: .numbersAndPunctuation)
            }
            KontoFeld(label: "Läuft bis (TT.MM.JJJJ)", text: $ende, tastatur: .numbersAndPunctuation)
            KontoFeld(label: "Titel", text: $titel)

            if let fehler { KontoHinweis(text: fehler) }
            if let kollisionen {
                Folgen(text: PlaetzeLogik.imWegText(kollisionen))
                GefahrKnopf(text: PlaetzeLogik.verdraengenText(kollisionen), gesperrt: laeuft) { speichern(verdraengen: true) }
            } else {
                GelberKnopf(
                    text: laeuft ? "Wird gespeichert…" : "Änderung speichern",
                    gesperrt: laeuft || titel.trimmingCharacters(in: .whitespaces).isEmpty
                ) { speichern(verdraengen: false) }
            }
            LeiserKnopf(text: "Abbrechen") { modell.blatt = nil }

            // Zerstoerendes am Ende, mit Rueckfrage im Blatt (Regel 4).
            KontoGruppe {
                if beendenFrage {
                    HStack(spacing: 8) {
                        GefahrKnopf(text: "\(serie.kuenftige ?? 0) Termine absagen", gesperrt: laeuft) { beenden() }
                        LeiserKnopf(text: "Doch nicht") { beendenFrage = false }
                    }
                    .padding(12)
                } else {
                    KontoVerweis(titel: "Serie beenden", rot: true) { beendenFrage = true }
                }
            }
            .padding(.top, Tokens.Abstand.s)
        }
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
