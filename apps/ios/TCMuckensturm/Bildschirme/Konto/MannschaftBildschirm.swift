/**
 * Konto -> Mannschaft
 *
 * Ganz oben die offenen Einladungen an mich mit Annehmen und Ablehnen. Erst
 * beim Annehmen erscheinen das Telefon-Haekchen (Standard aus) und, wenn es
 * einen gibt, der Wechselhinweis; geht Annehmen nicht (MF einer anderen
 * Mannschaft), steht der Grund da und nur Ablehnen bleibt.
 *
 * Darunter der Kader mit Name und LK. Der Mannschaftsfuehrer (MF) sieht
 * zusaetzlich die Telefonnummer, wenn der Spieler zugestimmt hat (antippbar),
 * kann Spieler austragen, Spieler hinzufuegen (Suche ueber
 * mannschaft_kandidaten, eigenes Blatt) und offene Einladungen zurueckziehen.
 * Spieler koennen austreten. Austragen und Austreten fragen vorher nach.
 *
 * Ein eigener Bildschirm im NavigationStack des Kontos statt eines Blatts:
 * so fuehren Push und Neuigkeiten hin, ohne mit einem offenen Blatt (Glocke)
 * zu kollidieren, und die Suche kann als Blatt darueber liegen.
 */

import SwiftUI

struct MannschaftBildschirm: View {
    @Environment(Sitzung.self) private var sitzung
    @State private var mannschaft: Abschnitt<MeineMannschaft?>?
    @State private var einladungen: Abschnitt<[MannschaftEinladung]>?
    @State private var laedt = true
    @State private var aktualisiert = false
    @State private var laeuft = false
    @State private var meldung: Ergebnis?
    /// Die Einladung, bei der gerade "Annehmen" offen ist.
    @State private var annehmenBei: String?
    @State private var telefonSichtbar = false
    @State private var austragenFrage: KaderMitglied?
    @State private var austretenFrage = false
    @State private var sucheOffen = false

    private var daten: Mannschaftsdaten { Mannschaftsdaten(client: sitzung.client) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Tokens.Abstand.m) {
                kopf
                if let meldung {
                    KontoHinweis(text: meldung.meldung, ok: meldung.ok)
                }
                if laedt && mannschaft == nil {
                    ProgressView().tint(Farbe.muted).frame(maxWidth: .infinity).padding(.top, 40)
                } else {
                    einladungenAbschnitt
                    mannschaftAbschnitt
                }
            }
            .padding(.horizontal, Tokens.Abstand.rand)
            .padding(.bottom, Tokens.Abstand.abschnitt * 2)
        }
        .background(Farbe.bg)
        .refreshable { await laden(nachladen: true) }
        .navigationTitle(MannschaftLogik.titel)
        .navigationBarTitleDisplayMode(.inline)
        .tint(Farbe.blueInk)
        .task { await laden(nachladen: false) }
        .sheet(isPresented: $sucheOffen, onDismiss: { Task { await laden(nachladen: false) } }) {
            KandidatenSuche(daten: daten) { sucheOffen = false }
                .background(Farbe.bg)
                .presentationDragIndicator(.visible)
                .presentationCornerRadius(Tokens.Radius.blatt)
        }
        .alert(
            austragenFrage.map { MannschaftLogik.austragenFrage($0, team: teamName) } ?? "",
            isPresented: Binding(get: { austragenFrage != nil }, set: { if !$0 { austragenFrage = nil } }),
            presenting: austragenFrage
        ) { k in
            Button("Abbrechen", role: .cancel) {}
            Button("Austragen", role: .destructive) { ausfuehren { await daten.austragen(k) } }
        } message: { k in
            Text(MannschaftLogik.austragenText(k))
        }
        .alert(MannschaftLogik.austretenFrage(teamName), isPresented: $austretenFrage) {
            Button("Abbrechen", role: .cancel) {}
            Button("Austreten", role: .destructive) {
                let team = teamName
                ausfuehren { await daten.austreten(team: team) }
            }
        } message: {
            Text(MannschaftLogik.austretenText)
        }
    }

    private var aktuell: MeineMannschaft? { mannschaft?.wert ?? nil }
    private var teamName: String { aktuell?.name ?? MannschaftLogik.titel }

    // MARK: - Kopf

    private var kopf: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(MannschaftLogik.titel).kicker()
            Text(aktuell?.name ?? "Meine Mannschaft")
                .font(Schrift.text(.extrafett, Tokens.Schrift.seitentitel, relativeTo: .largeTitle))
                .tracking(Tokens.Schrift.laufweiteTitel)
                .foregroundStyle(Farbe.ink)
                .lineLimit(2)
                .minimumScaleFactor(0.8)
                .accessibilityAddTraits(.isHeader)
            if aktuell?.ichBinMf == true {
                KontoMarke(text: "Du bist Mannschaftsführer")
            }
        }
        .padding(.top, Tokens.Abstand.s)
    }

    // MARK: - Einladungen an mich

    @ViewBuilder private var einladungenAbschnitt: some View {
        if let f = einladungen?.fehler {
            Fehlerzeile(text: "Einladungen: \(f)", laeuft: aktualisiert) { Task { await laden(nachladen: true) } }
        }
        let liste = einladungen?.wert ?? []
        if !liste.isEmpty {
            KontoAbschnitt(titel: liste.count == 1 ? "Einladung" : "Einladungen")
            ForEach(liste) { e in einladungKarte(e) }
        }
    }

    private func einladungKarte(_ e: MannschaftEinladung) -> some View {
        let offen = annehmenBei == e.id
        let hinweis = MannschaftLogik.hinweis(e)
        return VStack(alignment: .leading, spacing: Tokens.Abstand.s) {
            VStack(alignment: .leading, spacing: 3) {
                Text(e.teamName)
                    .font(Schrift.text(.fett, 17))
                    .foregroundStyle(Farbe.ink)
                let unter = MannschaftLogik.einladungUnterzeile(e)
                if !unter.isEmpty { Text(unter).leise() }
            }
            .accessibilityElement(children: .combine)
            if !e.annehmenMoeglich {
                if let hinweis { KontoHinweis(text: hinweis) }
                LeiserKnopf(text: "Ablehnen", gesperrt: laeuft) { beantworten(e, annehmen: false) }
            } else if offen {
                if let hinweis { Hinweiszeile(text: hinweis) }
                KontoGruppe {
                    OnboardingSchalter(
                        label: MannschaftLogik.telefonLabel,
                        beschreibung: MannschaftLogik.telefonBeschreibung,
                        an: $telefonSichtbar,
                        gesperrt: laeuft
                    )
                }
                GelberKnopf(text: laeuft ? "Wird gespeichert…" : "Einladung annehmen", gesperrt: laeuft) {
                    beantworten(e, annehmen: true)
                }
                LeiserKnopf(text: "Abbrechen", gesperrt: laeuft) { annehmenBei = nil }
            } else {
                HStack(spacing: Tokens.Abstand.s) {
                    LeiserKnopf(text: "Ablehnen", gesperrt: laeuft) { beantworten(e, annehmen: false) }
                    Button {
                        telefonSichtbar = false
                        annehmenBei = e.id
                    } label: {
                        Text("Annehmen")
                            .font(Schrift.text(.fett, 16))
                            .foregroundStyle(Farbe.onGold)
                            .frame(maxWidth: .infinity, minHeight: 52)
                            .background(Farbe.gold, in: RoundedRectangle(cornerRadius: Tokens.Radius.knopf))
                    }
                    .buttonStyle(.plain)
                    .disabled(laeuft)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .karte(radius: Tokens.Radius.karte, padding: 16)
    }

    // MARK: - Mannschaft

    @ViewBuilder private var mannschaftAbschnitt: some View {
        if let f = mannschaft?.fehler {
            Fehlerzeile(text: f, laeuft: aktualisiert) { Task { await laden(nachladen: true) } }
        } else if let m = aktuell {
            if m.ichBinMf {
                Text(MannschaftLogik.mfErklaerung).leise().fixedSize(horizontal: false, vertical: true)
                    .padding(.top, Tokens.Abstand.xs)
                GelberKnopf(text: "Spieler hinzufügen", gesperrt: laeuft) { sucheOffen = true }
                offeneEinladungen(m)
            }
            kader(m)
            if m.ichBinMf {
                Text(MannschaftLogik.mfKannNichtAustreten).leise().fixedSize(horizontal: false, vertical: true)
            } else {
                LeiserKnopf(text: "Aus Mannschaft austreten", rot: true, gesperrt: laeuft) { austretenFrage = true }
                    .padding(.top, Tokens.Abstand.s)
            }
        } else if (einladungen?.wert ?? []).isEmpty {
            Leerzustand(text: MannschaftLogik.keineMannschaft)
        }
    }

    @ViewBuilder private func offeneEinladungen(_ m: MeineMannschaft) -> some View {
        let liste = m.offeneEinladungen ?? []
        if !liste.isEmpty {
            KontoAbschnitt(titel: "Offene Einladungen")
            KontoGruppe {
                ForEach(Array(liste.enumerated()), id: \.element.id) { i, e in
                    if i > 0 { KontoLinie() }
                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(MannschaftLogik.name(e.firstName, e.lastName))
                                .font(Schrift.text(.halbfett, 15.5))
                                .foregroundStyle(Farbe.ink)
                            Text(MannschaftLogik.offeneUnterzeile(e)).leise()
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .accessibilityElement(children: .combine)
                        KleinerKnopf(text: "Zurückziehen", gesperrt: laeuft) {
                            ausfuehren { await daten.zurueckziehen(e) }
                        }
                        .accessibilityLabel("Einladung an \(MannschaftLogik.name(e.firstName, e.lastName)) zurückziehen")
                    }
                    .padding(.vertical, 10)
                    .padding(.horizontal, 16)
                    .frame(minHeight: 60)
                }
            }
        }
    }

    private func kader(_ m: MeineMannschaft) -> some View {
        Group {
            KontoAbschnitt(titel: "Kader")
            KontoGruppe {
                if m.kader.isEmpty {
                    Text("Noch niemand im Kader.").leise()
                        .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
                        .padding(.horizontal, 16)
                }
                ForEach(Array(m.kader.enumerated()), id: \.element.id) { i, k in
                    if i > 0 { KontoLinie() }
                    kaderZeile(k, m)
                }
            }
        }
    }

    private func kaderZeile(_ k: KaderMitglied, _ m: MeineMannschaft) -> some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(MannschaftLogik.name(k.firstName, k.lastName))
                    .font(Schrift.text(.halbfett, 15.5))
                    .foregroundStyle(Farbe.ink)
                Text(MannschaftLogik.kaderUnterzeile(k)).leise()
                if let telefon = MannschaftLogik.telefonZeile(k, in: m) {
                    if let link = MannschaftLogik.telefonLink(k.telefon) {
                        Link(destination: link) {
                            Label(telefon, systemImage: "phone")
                                .font(Schrift.text(.halbfett, 14))
                                .foregroundStyle(Farbe.blueInk)
                                .frame(minHeight: 32)
                        }
                        .accessibilityLabel("\(telefon) anrufen")
                    } else {
                        Text(telefon).leise()
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if MannschaftLogik.darfAustragen(k, in: m) {
                KleinerKnopf(text: "Austragen", rot: true, gesperrt: laeuft) { austragenFrage = k }
                    .accessibilityLabel("\(MannschaftLogik.name(k.firstName, k.lastName)) austragen")
            }
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 16)
        .frame(minHeight: 60)
    }

    // MARK: - Aktionen

    private func beantworten(_ e: MannschaftEinladung, annehmen: Bool) {
        let telefon = telefonSichtbar
        ausfuehren {
            await daten.beantworten(e, annehmen: annehmen, telefonSichtbar: telefon)
        } danach: { ok in
            if ok { annehmenBei = nil }
        }
    }

    private func ausfuehren(_ tun: @escaping () async -> Ergebnis, danach: ((Bool) -> Void)? = nil) {
        guard !laeuft else { return }
        laeuft = true
        Task {
            let r = await tun()
            laeuft = false
            meldung = r
            danach?(r.ok)
            if r.ok { await laden(nachladen: false) }
        }
    }

    private func laden(nachladen: Bool) async {
        if nachladen {
            aktualisiert = true
            meldung = nil
        }
        let daten = daten
        async let m = Abschnitt.von { try await daten.mannschaft() }
        async let e = Abschnitt.von { try await daten.einladungen() }
        (mannschaft, einladungen) = await (m, e)
        laedt = false
        aktualisiert = false
    }
}

// MARK: - Spieler hinzufuegen

/**
 * Suche ueber mannschaft_kandidaten: Interessenten zuerst (Marke
 * "Interesse"), wer woanders spielt, traegt "spielt in <X>". Schon
 * Eingeladene sind ausgegraut. Gesucht wird kurz nach dem letzten Tippen.
 */
private struct KandidatenSuche: View {
    let daten: Mannschaftsdaten
    let zu: () -> Void

    @State private var suche = ""
    @State private var liste: [MannschaftKandidat]?
    @State private var fehler: String?
    @State private var meldung: Ergebnis?
    @State private var laeuft: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Tokens.Abstand.m) {
                BlattKopf(titel: "Spieler hinzufügen", zu: zu)
                KontoFeld(label: MannschaftLogik.sucheLabel, text: $suche, inhaltsTyp: .name, grossschreibung: .words)
                if let meldung {
                    KontoHinweis(text: meldung.meldung, ok: meldung.ok)
                }
                if let fehler {
                    Fehlerzeile(text: fehler) { Task { await suchen(sofort: true) } }
                } else if let liste {
                    if liste.isEmpty {
                        Leerzustand(text: MannschaftLogik.keineKandidaten)
                    } else {
                        KontoGruppe {
                            ForEach(Array(liste.enumerated()), id: \.element.id) { i, k in
                                if i > 0 { KontoLinie() }
                                zeile(k)
                            }
                        }
                    }
                } else {
                    ProgressView().tint(Farbe.muted).frame(maxWidth: .infinity).padding(.top, 24)
                }
            }
            .padding(Tokens.Abstand.rand)
        }
        .scrollDismissesKeyboard(.interactively)
        .task(id: suche) { await suchen(sofort: false) }
    }

    private func zeile(_ k: MannschaftKandidat) -> some View {
        let frei = MannschaftLogik.kannEinladen(k)
        return HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(MannschaftLogik.name(k.firstName, k.lastName))
                    .font(Schrift.text(.halbfett, 15.5))
                    .foregroundStyle(Farbe.ink)
                Text(MannschaftLogik.kandidatUnterzeile(k)).leise()
                let marken = MannschaftLogik.kandidatMarken(k)
                if !marken.isEmpty {
                    HStack(spacing: 6) {
                        ForEach(marken, id: \.text) { m in
                            MarkeKlein(text: m.text, ton: m.ton == .gruen ? .gruen : .grau)
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
            KleinerKnopf(
                text: laeuft == k.memberId ? "Lädt…" : MannschaftLogik.einladenKnopf(k),
                gesperrt: !frei || laeuft != nil
            ) { einladen(k) }
            .accessibilityLabel(frei ? "\(MannschaftLogik.name(k.firstName, k.lastName)) einladen" : "Schon eingeladen")
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 16)
        .frame(minHeight: 60)
        .opacity(frei ? 1 : 0.5)
    }

    private func einladen(_ k: MannschaftKandidat) {
        guard laeuft == nil else { return }
        laeuft = k.memberId
        Task {
            let r = await daten.einladen(k)
            laeuft = nil
            meldung = r
            if r.ok, let l = liste { liste = MannschaftLogik.alsEingeladen(l, k.memberId) }
        }
    }

    private func suchen(sofort: Bool) async {
        if !sofort {
            // Erst suchen, wenn das Tippen kurz ruht; ein neues Zeichen bricht diese Aufgabe ab.
            try? await Task.sleep(for: .milliseconds(300))
            if Task.isCancelled { return }
        }
        do {
            let neu = try await daten.kandidaten(suche: suche)
            if Task.isCancelled { return }
            liste = neu
            fehler = nil
        } catch {
            if Task.isCancelled { return }
            fehler = Meldung.aus(error).text
        }
    }
}

// MARK: - Bausteine

/// Ein kleiner Knopf rechts in einer Zeile: Zurueckziehen, Austragen, Einladen.
private struct KleinerKnopf: View {
    let text: String
    var rot = false
    var gesperrt = false
    let aktion: () -> Void

    var body: some View {
        Button(action: aktion) {
            Text(text)
                .font(Schrift.text(.fett, 14))
                .foregroundStyle(rot ? Farbe.redInk : Farbe.blueInk)
                .padding(.horizontal, 12)
                .frame(minHeight: 44)
                .overlay(
                    Capsule().strokeBorder(rot ? Farbe.red.opacity(0.5) : Farbe.line2, lineWidth: 1.5)
                        .padding(.vertical, 4)
                )
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(gesperrt)
        .opacity(gesperrt ? 0.5 : 1)
    }
}

/// Ein neutraler Satz vor dem Annehmen, etwa der Wechselhinweis.
private struct Hinweiszeile: View {
    let text: String

    var body: some View {
        Text(text)
            .font(Schrift.text(.halbfett, Tokens.Schrift.normal))
            .foregroundStyle(Farbe.ink)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(Farbe.goldSoft, in: RoundedRectangle(cornerRadius: Tokens.Radius.feld))
    }
}
