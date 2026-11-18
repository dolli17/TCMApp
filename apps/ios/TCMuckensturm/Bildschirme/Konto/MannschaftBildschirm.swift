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
 * Gestaltet als gruppierte Liste wie Kontakte: oben Kacheln mit dem Ueberblick
 * (und fuer den MF "Einladen"), dann der Kader getrennt nach MF und Spielern
 * mit blauen Initialen wie im Konto, LK als Marke und Anrufknopf. Austragen und
 * Zurueckziehen per Wischen (und lange druecken), Rueckfragen als Action
 * Sheet. Die Suche nach neuen Spielern liegt als Blatt darueber.
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
        List {
            if laedt && mannschaft == nil {
                Section { ProgressView().tint(Farbe.muted).frame(maxWidth: .infinity).padding(.vertical, 24) }
                    .listRowBackground(Color.clear)
            } else {
                einladungenAbschnitt
                mannschaftAbschnitt
            }
        }
        .gruppenListe()
        .listSectionSpacing(20)
        .refreshable { await laden(nachladen: true) }
        .navigationTitle(aktuell?.name ?? MannschaftLogik.titel)
        .navigationBarTitleDisplayMode(.large)
        .sheet(isPresented: $sucheOffen) {
            KandidatenSuche(daten: daten) { Task { await laden(nachladen: false) } }
        }
        .task { await laden(nachladen: false) }
        // Unten statt oben in der Liste: Zurueckziehen und Austragen stehen weit unten.
        .bestaetigung(Binding(get: { meldung?.meldung }, set: { if $0 == nil { meldung = nil } }), ok: meldung?.ok ?? true)
        .sensoryFeedback(trigger: meldung) { _, neu in
            guard let neu else { return nil }
            return neu.ok ? .success : .error
        }
        // Destruktives als Action Sheet, der rote Knopf oben (HIG).
        .confirmationDialog(
            austragenFrage.map { MannschaftLogik.austragenFrage($0, team: teamName) } ?? "",
            isPresented: Binding(get: { austragenFrage != nil }, set: { if !$0 { austragenFrage = nil } }),
            titleVisibility: .visible,
            presenting: austragenFrage
        ) { k in
            Button("Austragen", role: .destructive) { ausfuehren { await daten.austragen(k) } }
            Button("Abbrechen", role: .cancel) {}
        } message: { k in
            Text(MannschaftLogik.austragenText(k))
        }
        .confirmationDialog(MannschaftLogik.austretenFrage(teamName), isPresented: $austretenFrage, titleVisibility: .visible) {
            Button("Austreten", role: .destructive) {
                let team = teamName
                ausfuehren { await daten.austreten(team: team) }
            }
            Button("Abbrechen", role: .cancel) {}
        } message: {
            Text(MannschaftLogik.austretenText)
        }
    }

    private var aktuell: MeineMannschaft? { mannschaft?.wert ?? nil }
    private var teamName: String { aktuell?.name ?? MannschaftLogik.titel }
    private var erneut: Erneut { Erneut(laeuft: aktualisiert) { Task { await laden(nachladen: true) } } }

    // MARK: - Einladungen an mich

    @ViewBuilder private var einladungenAbschnitt: some View {
        if let f = einladungen?.fehler {
            Section { FehlerZeile(text: "Einladungen: \(f)", erneut: erneut).gruppenZeile() }
        }
        ForEach(einladungen?.wert ?? []) { e in einladung(e) }
    }

    /// Eine Karte wie eine Einladung in Kalender: Mannschaft, wer einlaedt, zwei Knoepfe.
    @ViewBuilder private func einladung(_ e: MannschaftEinladung) -> some View {
        let offen = annehmenBei == e.id
        let hinweis = MannschaftLogik.hinweis(e)
        Section {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 12) {
                    Image(systemName: "person.3.fill")
                        .font(.title3)
                        .foregroundStyle(.white)
                        .frame(width: 48, height: 48)
                        .background(
                            LinearGradient(colors: [Farbe.blue.opacity(0.75), Farbe.blue], startPoint: .top, endPoint: .bottom),
                            in: Circle()
                        )
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Einladung").font(.footnote.weight(.semibold)).foregroundStyle(Farbe.blueInk)
                        Text(e.teamName).font(.title3.weight(.bold)).foregroundStyle(Farbe.ink)
                        let unter = MannschaftLogik.einladungUnterzeile(e)
                        if !unter.isEmpty {
                            Text(unter).font(.subheadline).foregroundStyle(Farbe.muted).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
                .accessibilityElement(children: .combine)
                if let hinweis, !e.annehmenMoeglich || offen {
                    Label(hinweis, systemImage: e.annehmenMoeglich ? "info.circle" : "exclamationmark.triangle.fill")
                        .font(.subheadline)
                        .foregroundStyle(e.annehmenMoeglich ? Farbe.ink2 : Farbe.redInk)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if offen {
                    Toggle(isOn: $telefonSichtbar) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(MannschaftLogik.telefonLabel).font(.subheadline).foregroundStyle(Farbe.ink)
                            Text(MannschaftLogik.telefonBeschreibung).font(.footnote).foregroundStyle(Farbe.muted)
                        }
                    }
                    .disabled(laeuft)
                    knoepfe(links: "Abbrechen", rechts: "Einladung annehmen") {
                        annehmenBei = nil
                    } rechtsAktion: {
                        beantworten(e, annehmen: true)
                    }
                } else if e.annehmenMoeglich {
                    knoepfe(links: "Ablehnen", rechts: "Annehmen", linksRot: true) {
                        beantworten(e, annehmen: false)
                    } rechtsAktion: {
                        telefonSichtbar = false
                        annehmenBei = e.id
                    }
                } else {
                    Button(role: .destructive) { beantworten(e, annehmen: false) } label: {
                        Text("Ablehnen").font(.headline).frame(maxWidth: .infinity, minHeight: 36)
                    }
                    .buttonStyle(.bordered)
                    .buttonBorderShape(.capsule)
                    .disabled(laeuft)
                }
            }
            .padding(.vertical, 8)
            .gruppenZeile()
        }
    }

    private func knoepfe(
        links: String, rechts: String, linksRot: Bool = false,
        linksAktion: @escaping () -> Void, rechtsAktion: @escaping () -> Void
    ) -> some View {
        HStack(spacing: 10) {
            Button(role: linksRot ? .destructive : nil, action: linksAktion) {
                Text(links).font(.headline).frame(maxWidth: .infinity, minHeight: 36)
            }
            .buttonStyle(.bordered)
            .tint(linksRot ? Farbe.red : Farbe.ink2)
            Button(action: rechtsAktion) {
                Group {
                    if laeuft { ProgressView().tint(.white) } else { Text(rechts).font(.headline) }
                }
                .frame(maxWidth: .infinity, minHeight: 36)
            }
            .buttonStyle(.borderedProminent)
            .tint(Farbe.blue)
        }
        .buttonBorderShape(.capsule)
        .disabled(laeuft)
    }

    // MARK: - Mannschaft

    @ViewBuilder private var mannschaftAbschnitt: some View {
        if let f = mannschaft?.fehler {
            Section { FehlerZeile(text: f, erneut: erneut).gruppenZeile() }
        } else if let m = aktuell {
            ueberblick(m)
            kader(m)
            if m.ichBinMf {
                offeneEinladungen(m)
            } else {
                Section {
                    Button(role: .destructive) { austretenFrage = true } label: {
                        Text("Aus Mannschaft austreten").frame(maxWidth: .infinity)
                    }
                    .disabled(laeuft)
                    .gruppenZeile()
                }
            }
        } else if (einladungen?.wert ?? []).isEmpty {
            Section {
                ContentUnavailableView {
                    Label("Keine Mannschaft", systemImage: "person.3")
                } description: {
                    Text(MannschaftLogik.keineMannschaft)
                }
            }
            .listRowBackground(Color.clear)
        }
    }

    /// Kacheln ueber dem Kader: wie viele, wer fuehrt, fuer den MF das Einladen.
    private func ueberblick(_ m: MeineMannschaft) -> some View {
        let mf = m.kader.first { $0.isTeamCaptain == true }
        let offen = m.offeneEinladungen?.count ?? 0
        return Section {
            HStack(spacing: 10) {
                Kennzahl(wert: "\(m.kader.count)", titel: m.kader.count == 1 ? "Spieler" : "Spieler")
                if m.ichBinMf {
                    Kennzahl(wert: "\(offen)", titel: offen == 1 ? "Einladung offen" : "Einladungen offen")
                    Button { sucheOffen = true } label: {
                        VStack(spacing: 4) {
                            Image(systemName: "person.badge.plus").font(.title3)
                            Text("Einladen").font(.footnote.weight(.semibold))
                        }
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity, minHeight: 64)
                        .background(Farbe.blue, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Spieler einladen")
                } else if let mf {
                    Kennzahl(wert: mf.firstName ?? MannschaftLogik.name(mf.firstName, mf.lastName), titel: "Mannschaftsführer")
                }
            }
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets())
        }
    }

    @ViewBuilder private func kader(_ m: MeineMannschaft) -> some View {
        let fuehrer = m.kader.filter { $0.isTeamCaptain == true }
        let spieler = m.kader.filter { $0.isTeamCaptain != true }
        if !fuehrer.isEmpty {
            Section {
                ForEach(fuehrer) { k in kaderZeile(k, m) }
            } header: {
                GruppenKopf(titel: "Mannschaftsführer")
            }
        }
        Section {
            if spieler.isEmpty {
                Text("Noch niemand im Kader.").foregroundStyle(Farbe.muted).gruppenZeile()
            }
            ForEach(spieler) { k in kaderZeile(k, m) }
        } header: {
            GruppenKopf(titel: "Spieler", zusatz: spieler.isEmpty ? nil : "\(spieler.count)")
        } footer: {
            if m.ichBinMf && !spieler.isEmpty {
                Text("Zum Austragen nach links wischen. Nummern siehst du nur, wenn Spieler sie freigegeben haben.")
                    .foregroundStyle(Farbe.muted)
            }
        }
    }

    private func kaderZeile(_ k: KaderMitglied, _ m: MeineMannschaft) -> some View {
        let name = MannschaftLogik.name(k.firstName, k.lastName)
        let darf = MannschaftLogik.darfAustragen(k, in: m)
        let ich = m.ichBinMf && k.isTeamCaptain == true
        let anruf = m.ichBinMf && !ich ? MannschaftLogik.telefonLink(k.telefon) : nil
        return HStack(spacing: 12) {
            Kuerzel(vorname: k.firstName, nachname: k.lastName, schluessel: k.memberId)
            HStack(spacing: 6) {
                Text(name).foregroundStyle(Farbe.ink).lineLimit(1)
                if ich { DeinMarker("du") }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if let lk = MannschaftLogik.lk(k.tennisLk) {
                Text(lk)
                    .font(.subheadline.weight(.semibold))
                    .monospacedDigit()
                    .foregroundStyle(Farbe.ink2)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Farbe.surf3, in: Capsule())
                    .accessibilityLabel("LK \(lk)")
            }
            if let anruf {
                Link(destination: anruf) {
                    Image(systemName: "phone.fill")
                        .font(.subheadline)
                        .foregroundStyle(Farbe.blueInk)
                        .frame(width: 34, height: 34)
                        .background(Farbe.blueSoft, in: Circle())
                }
                .buttonStyle(.borderless)
                .accessibilityLabel("\(name) anrufen")
            }
        }
        .padding(.vertical, 2)
        .gruppenZeile()
        .swipeActions(edge: .trailing) {
            if darf {
                Button("Austragen", role: .destructive) { austragenFrage = k }
            }
        }
        .contextMenu {
            if let anruf {
                Link(destination: anruf) { Label("Anrufen", systemImage: "phone") }
            }
            if darf {
                Button("Austragen", systemImage: "person.badge.minus", role: .destructive) { austragenFrage = k }
            }
        }
        .accessibilityActions {
            if darf { Button("\(name) austragen") { austragenFrage = k } }
        }
    }

    @ViewBuilder private func offeneEinladungen(_ m: MeineMannschaft) -> some View {
        let liste = m.offeneEinladungen ?? []
        if !liste.isEmpty {
            Section {
                ForEach(liste) { e in
                    let name = MannschaftLogik.name(e.firstName, e.lastName)
                    HStack(spacing: 12) {
                        Image(systemName: "clock")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Farbe.muted)
                            .frame(width: 36, height: 36)
                            .background(Farbe.surf3, in: Circle())
                            .accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(name).foregroundStyle(Farbe.ink)
                            Text(MannschaftLogik.offeneUnterzeile(e)).font(.footnote).foregroundStyle(Farbe.muted)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .accessibilityElement(children: .combine)
                        Button("Zurückziehen") { ausfuehren { await daten.zurueckziehen(e) } }
                            .buttonStyle(.bordered)
                            .buttonBorderShape(.capsule)
                            .controlSize(.small)
                            .tint(Farbe.red)
                            .disabled(laeuft)
                            .accessibilityLabel("Einladung an \(name) zurückziehen")
                    }
                    .gruppenZeile()
                }
            } header: {
                GruppenKopf(titel: "Eingeladen", zusatz: "\(liste.count)")
            } footer: {
                Text(MannschaftLogik.mfKannNichtAustreten).foregroundStyle(Farbe.muted)
            }
        } else {
            Section {} footer: {
                Text(MannschaftLogik.mfKannNichtAustreten).foregroundStyle(Farbe.muted)
            }
        }
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

/// Eine Kachel mit Zahl oder Name gross und Beschriftung klein.
private struct Kennzahl: View {
    let wert: String
    let titel: String

    var body: some View {
        VStack(spacing: 2) {
            Text(wert)
                .font(.title2.weight(.bold))
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .foregroundStyle(Farbe.ink)
            Text(titel)
                .font(.footnote)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .foregroundStyle(Farbe.muted)
        }
        .frame(maxWidth: .infinity, minHeight: 64)
        .background(Farbe.surf, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Spieler hinzufuegen

/**
 * Suche ueber mannschaft_kandidaten als Blatt mit Suchfeld: Interessenten
 * zuerst (Marke "Interesse"), wer woanders spielt, traegt "spielt in <X>".
 * Schon Eingeladene sind ausgegraut. Gesucht wird kurz nach dem letzten Tippen.
 */
private struct KandidatenSuche: View {
    @Environment(\.dismiss) private var zu
    let daten: Mannschaftsdaten
    /// Nach einer Einladung: die offenen Einladungen im Bildschirm neu laden.
    let eingeladen: () -> Void

    @State private var suche = ""
    @State private var liste: [MannschaftKandidat]?
    @State private var fehler: String?
    @State private var meldung: Ergebnis?
    @State private var laeuft: String?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    if let fehler {
                        FehlerZeile(text: fehler, erneut: Erneut(laeuft: false) { Task { await suchen(sofort: true) } }).gruppenZeile()
                    } else if let liste {
                        if liste.isEmpty {
                            Text(MannschaftLogik.keineKandidaten).foregroundStyle(Farbe.muted).gruppenZeile()
                        }
                        ForEach(liste) { zeile($0) }
                    } else {
                        ProgressView().tint(Farbe.muted).frame(maxWidth: .infinity).gruppenZeile()
                    }
                } header: {
                    GruppenKopf(titel: suche.isEmpty ? "Vorschläge" : "Treffer")
                } footer: {
                    Text(MannschaftLogik.mfErklaerung).foregroundStyle(Farbe.muted)
                }
            }
            .gruppenListe()
            .searchable(text: $suche, placement: .navigationBarDrawer(displayMode: .always), prompt: MannschaftLogik.sucheLabel)
            .bestaetigung(Binding(get: { meldung?.meldung }, set: { if $0 == nil { meldung = nil } }), ok: meldung?.ok ?? true)
            .autocorrectionDisabled()
            .textInputAutocapitalization(.words)
            .navigationTitle("Spieler hinzufügen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Fertig") { zu() }
                }
            }
            .task(id: suche) { await suchen(sofort: false) }
            .sensoryFeedback(.success, trigger: meldung) { _, neu in neu?.ok == true }
        }
        .presentationDetents([.large])
    }

    private func zeile(_ k: MannschaftKandidat) -> some View {
        let frei = MannschaftLogik.kannEinladen(k)
        let name = MannschaftLogik.name(k.firstName, k.lastName)
        return HStack(spacing: 12) {
            Kuerzel(vorname: k.firstName, nachname: k.lastName, schluessel: k.memberId)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(name).foregroundStyle(Farbe.ink)
                    ForEach(MannschaftLogik.kandidatMarken(k), id: \.text) { m in
                        MarkeKlein(text: m.text, ton: m.ton == .gruen ? .blau : .grau)
                    }
                }
                Text(MannschaftLogik.kandidatUnterzeile(k)).font(.footnote).foregroundStyle(Farbe.muted)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
            if laeuft == k.memberId {
                ProgressView()
            } else if frei {
                Button("Einladen") { einladen(k) }
                    .buttonStyle(.bordered)
                    .buttonBorderShape(.capsule)
                    .controlSize(.small)
                    .tint(Farbe.blue)
                    .disabled(laeuft != nil)
                    .accessibilityLabel("\(name) einladen")
            } else {
                Label(MannschaftLogik.einladenKnopf(k), systemImage: "checkmark")
                    .font(.subheadline)
                    .foregroundStyle(Farbe.muted)
                    .accessibilityLabel("Schon eingeladen")
            }
        }
        .gruppenZeile()
        .opacity(frei ? 1 : 0.6)
    }

    private func einladen(_ k: MannschaftKandidat) {
        guard laeuft == nil else { return }
        laeuft = k.memberId
        Task {
            let r = await daten.einladen(k)
            laeuft = nil
            meldung = r
            if r.ok, let l = liste {
                liste = MannschaftLogik.alsEingeladen(l, k.memberId)
                eingeladen()
            }
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

/// Initialen im blauen Kreis mit leichtem Verlauf, wie das eigene Bild im Konto.
private struct Kuerzel: View {
    let vorname: String?
    let nachname: String?
    let schluessel: String

    var body: some View {
        Text(KontoLogik.initialen(vorname: vorname ?? "", nachname: nachname ?? ""))
            .font(.subheadline.weight(.semibold))
            .dynamicTypeSize(...DynamicTypeSize.xLarge)
            .foregroundStyle(.white)
            .frame(width: 38, height: 38)
            .background(
                LinearGradient(colors: [Farbe.blue.opacity(0.75), Farbe.blue], startPoint: .top, endPoint: .bottom),
                in: Circle()
            )
            .accessibilityHidden(true)
    }
}
