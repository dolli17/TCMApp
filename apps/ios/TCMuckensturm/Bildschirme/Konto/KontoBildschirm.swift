/**
 * Konto (apps/mobile/app/(tabs)/konto.tsx, Entwurf AppKonto)
 *
 * Oben wer man ist, darunter was offen ist und der Arbeitsdienst. Die
 * Einstellungen stehen als gruppierte Liste; Meine Daten, Notfallkontakt,
 * Tennis (LK, nuLiga-ID, Mannschaftsinteresse), Einwilligungen, Mandat, Passwort und die Kuendigung oeffnen je ein
 * eigenes Blatt (KontoBlaetter.swift), statt als lange Formulare die Seite
 * zu fuellen.
 *
 * Jede Quelle laedt fuer sich: schlaegt eine fehl (etwa das Mandat), zeigt
 * nur ihr Abschnitt den Fehler, und der Rest der Seite bleibt gefuellt.
 *
 * "Mannschaft" erscheint mit Mannschaft oder offenen Einladungen und fuehrt
 * auf einen eigenen Bildschirm (MannschaftBildschirm.swift). Dorthin geht es
 * auch aus Push und Neuigkeiten ueber `zuMannschaft` (kontoTab).
 *
 * "Mitteilungen aufs Handy" meldet die APNs-Marke an und ab (App/PushSchalter.swift).
 */

import SwiftUI

enum KontoBlatt: String, Identifiable {
    case daten, notfall, tennis, einwilligungen, bank, passwort, loeschen
    var id: String { rawValue }
}

/// Der Pfad im Konto; HauptTabs haelt ihn, damit Push und Neuigkeiten hinfuehren.
@MainActor @Observable
final class KontoZustand {
    var pfad: [KontoZiel] = []

    func oeffne(_ ziel: KontoZiel) {
        pfad = [ziel]
    }
}

extension View {
    /// Haengt das Konto an die Tabs (HauptTabs): stellt den Zustand und `zuMannschaft` bereit.
    func kontoTab(_ zustand: KontoZustand, tab: Binding<HauptTab>) -> some View {
        environment(zustand)
            .environment(\.zuMannschaft) {
                zustand.oeffne(.mannschaft)
                tab.wrappedValue = .konto
            }
    }
}

struct KontoBildschirm: View {
    @Environment(Sitzung.self) private var sitzung
    @Environment(KontoZustand.self) private var zustand
    @AppStorage(Erscheinungsbild.schluessel) private var erscheinungsbild: Erscheinungsbild = .system
    @State private var inhalt: KontoInhalt?
    @State private var laedt = true
    @State private var aktualisiert = false
    @State private var blatt: KontoBlatt?
    @State private var meldung: String?
    @State private var abmeldenFragen = false
    /// Nur fuer Bildschirmfotos (DEBUG): wohin die Seite nach dem Laden rollt.
    @State private var rollenZu: String?

    var body: some View {
        @Bindable var z = zustand
        NavigationStack(path: $z.pfad) {
            ScrollViewReader { leser in
                List {
                    if laedt && inhalt == nil {
                        Section {
                            ProgressView().tint(Farbe.muted).frame(maxWidth: .infinity).padding(.vertical, 24)
                        }
                        .listRowBackground(Color.clear)
                    } else if let d = inhalt {
                        let erneut = Erneut(laeuft: aktualisiert) { Task { await laden(.nachladen) } }
                        Profilkopf(profil: d.profil, erneut: erneut) { zustand.pfad.append(.profil) }
                        AbrechnungKurz(forderungen: d.forderungen, getraenke: d.getraenke, erneut: erneut) {
                            zustand.pfad.append(.abrechnung)
                        }
                        ArbeitsdienstAbschnitt(dienst: d.dienst, erneut: erneut)
                        rechtliches
                        // Abgesetzt, damit niemand sie beim Abmelden streift (U44).
                        Section {
                            Button(role: .destructive) { blatt = .loeschen } label: {
                                Text(Kontoloeschung.titel).foregroundStyle(Farbe.redInk)
                            }
                            .gruppenZeile()
                        }
                    }
                }
                .gruppenListe()
                .refreshable { await laden(.nachladen) }
                .onChange(of: rollenZu) { _, ziel in
                    if let ziel { leser.scrollTo(ziel, anchor: UnitPoint(x: 0.5, y: 0.12)) }
                }
            }
            .navigationTitle("Konto")
            .navigationBarTitleDisplayMode(.large)
            .navigationDestination(for: KontoZiel.self) { ziel in
                switch ziel {
                case .mannschaft: MannschaftBildschirm()
                case .profil: profilSeite
                case .abrechnung: abrechnungSeite
                }
            }
        }
        .task {
            await laden(.erstes)
            #if DEBUG
            // Fuer Bildschirmfotos per simctl (README): `-TCMKontoBlatt daten` oeffnet ein Blatt.
            let argumente = ProcessInfo.processInfo.arguments
            if let i = argumente.firstIndex(of: "-TCMKontoBlatt"), i + 1 < argumente.count {
                blatt = KontoBlatt(rawValue: argumente[i + 1])
            }
            // `-TCMKontoRollen einstellungen` oeffnet die Einstellungen (hinter der Profilkarte).
            if let i = argumente.firstIndex(of: "-TCMKontoRollen"), i + 1 < argumente.count {
                switch argumente[i + 1] {
                case "einstellungen": zustand.pfad.append(.profil)
                case "abrechnung": zustand.pfad.append(.abrechnung)
                default: rollenZu = argumente[i + 1]
                }
            }
            #endif
        }
        // Ueber jeder Unterseite: gespeichert wird meist aus dem Profil heraus.
        .bestaetigung($meldung)
        // Zurueck auf den Tab, etwa nach einem Getraenk: die Forderungen stimmen sonst nicht mehr (B19).
        .onAppear { if inhalt != nil { Task { await laden(.still) } } }
        .sheet(item: $blatt) { art in
            KontoBlattInhalt(art: art, inhalt: inhalt, zu: { blatt = nil }) { text in
                blatt = nil
                meldung = text
                Task { await laden(.still) }
            } geaendert: {
                Task { await laden(.still) }
            } erneut: {
                Task { await laden(.nachladen) }
            }
            .environment(sitzung)
        }
        // Ein Fehltipp am Ende der Liste meldete sofort ab (U28).
        .alert("Wirklich abmelden?", isPresented: $abmeldenFragen) {
            Button("Abbrechen", role: .cancel) {}
            // Sitzung.abmelden meldet vorher das Geraet fuer Push ab.
            Button("Abmelden", role: .destructive) { Task { await sitzung.abmelden() } }
        }
    }

    // MARK: - Profil (Persoenlich und Einstellungen)

    /// Hinter der Profilkarte, wie die Apple-ID-Seite in den Einstellungen.
    @ViewBuilder private var profilSeite: some View {
        List {
            if let d = inhalt {
                persoenlich(d)
                einstellungen(d)
            }
        }
        .gruppenListe()
        .navigationTitle("Profil")
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - Abrechnung im Einzelnen

    @ViewBuilder private var abrechnungSeite: some View {
        List {
            if let d = inhalt {
                let erneut = Erneut(laeuft: aktualisiert) { Task { await laden(.nachladen) } }
                Abrechnung(forderungen: d.forderungen, getraenke: d.getraenke, erneut: erneut)
            }
        }
        .gruppenListe()
        .refreshable { await laden(.nachladen) }
        .navigationTitle("Abrechnung")
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - Persoenlich

    @ViewBuilder private func persoenlich(_ d: KontoInhalt) -> some View {
        Section {
            Zeile(titel: "Meine Daten", symbol: "person.fill") { blatt = .daten }
            Zeile(titel: "Notfallkontakt", symbol: "cross.case.fill") { blatt = .notfall }
            Zeile(
                titel: TennisLogik.titel,
                symbol: "tennis.racket",
                wert: d.tennis.fehler == nil ? TennisLogik.uebersicht(d.tennis.wert ?? nil) : nil
            ) { blatt = .tennis }
            if MannschaftLogik.zeigeEintrag(
                profilTeam: d.profil.wert??.teamName,
                mannschaft: d.mannschaft.wert ?? nil,
                einladungen: d.einladungen.wert?.count ?? 0
            ) {
                Zeile(
                    titel: MannschaftLogik.titel,
                    symbol: "person.3.fill",
                    wert: MannschaftLogik.uebersicht(
                        mannschaft: d.mannschaft.wert ?? nil,
                        profilTeam: d.profil.wert??.teamName,
                        einladungen: d.einladungen.wert?.count ?? 0
                    )
                ) { zustand.pfad.append(.mannschaft) }
            }
            Zeile(titel: "Bankverbindung & Mandat", symbol: "creditcard.fill") { blatt = .bank }
        } header: {
            GruppenKopf(titel: "Persönlich")
        }
    }

    // MARK: - Einstellungen

    private func einstellungen(_ d: KontoInhalt) -> some View {
        Section {
            PushSchalter(symbol: "bell.fill", inListe: true).gruppenZeile()
            if KontoLogik.zeigeEinwilligungen(d.merkmale.wert) {
                Zeile(titel: "Einwilligungen", symbol: "hand.raised.fill") { blatt = .einwilligungen }
            }
            Zeile(titel: "Passwort ändern", symbol: "key.fill") { blatt = .passwort }
            Picker(selection: $erscheinungsbild) {
                ForEach(Erscheinungsbild.allCases, id: \.self) { Text($0.label).tag($0) }
            } label: {
                HStack(spacing: 14) {
                    IconKachel(symbol: "circle.lefthalf.filled")
                    Text("Erscheinungsbild").foregroundStyle(Farbe.ink)
                }
            }
            .pickerStyle(.menu)
            .gruppenZeile()
        } header: {
            GruppenKopf(titel: "Einstellungen")
        }
    }

    // MARK: - Rechtliches und Abmelden

    /// Datenschutz und Impressum liegen im Web; ohne Basisadresse (lokal) fehlen die Zeilen.
    @ViewBuilder private var rechtliches: some View {
        let datenschutz = sitzung.umgebung.webLink("/datenschutz")
        let impressum = sitzung.umgebung.webLink("/impressum")
        if let datenschutz, let impressum {
            Section {
                Link(destination: datenschutz) { linkZeile("Datenschutz", symbol: "lock.fill") }.gruppenZeile()
                Link(destination: impressum) { linkZeile("Impressum", symbol: "info.circle.fill") }.gruppenZeile()
            }
        }
        Section {
            Button("Abmelden") { abmeldenFragen = true }
                .foregroundStyle(Farbe.redInk)
                .gruppenZeile()
        }
    }

    private func linkZeile(_ titel: String, symbol: String) -> some View {
        HStack(spacing: 14) {
            IconKachel(symbol: symbol, farbe: Farbe.muted)
            Text(titel).foregroundStyle(Farbe.ink).frame(maxWidth: .infinity, alignment: .leading)
            Image(systemName: "arrow.up.forward")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(Farbe.line2)
                .accessibilityHidden(true)
        }
    }

    // MARK: - Laden

    private enum Art { case erstes, nachladen, still }

    private func laden(_ art: Art) async {
        if art == .nachladen { aktualisiert = true }
        if art != .still { meldung = nil }
        inhalt = await Self.lade(
            Kontodaten(client: sitzung.client), Startdaten(client: sitzung.client), Onboardingdaten(client: sitzung.client),
            Mannschaftsdaten(client: sitzung.client)
        )
        laedt = false
        aktualisiert = false
    }

    nonisolated static func lade(
        _ k: Kontodaten, _ s: Startdaten, _ o: Onboardingdaten, _ m: Mannschaftsdaten
    ) async -> KontoInhalt {
        async let profil = Abschnitt.von { try await k.profil() }
        async let forderungen = Abschnitt.von { try await k.forderungen() }
        async let getraenke = Abschnitt.von { try await s.eigeneGetraenke() }
        async let dienst = Abschnitt.von { try await s.arbeitsdienst() }
        async let mandat = Abschnitt.von { try await k.mandat() }
        async let merkmale = Abschnitt.von { try await k.merkmale() }
        async let tennis = Abschnitt.von { try await o.laden()?.tennis }
        async let mannschaft = Abschnitt.von { try await m.mannschaft() }
        async let einladungen = Abschnitt.von { try await m.einladungen() }
        return await KontoInhalt(
            profil: profil,
            forderungen: forderungen,
            getraenke: getraenke,
            dienst: dienst,
            mandat: mandat,
            merkmale: merkmale,
            tennis: tennis,
            mannschaft: mannschaft,
            einladungen: einladungen
        )
    }
}

// MARK: - Zeile

/// Eine Einstellungszeile wie in iOS: Kachel, Titel, grauer Stand rechts, Pfeil.
private struct Zeile: View {
    let titel: String
    let symbol: String
    var wert: String?
    let aktion: () -> Void

    var body: some View {
        Button(action: aktion) {
            HStack(spacing: 14) {
                IconKachel(symbol: symbol)
                Text(titel).foregroundStyle(Farbe.ink).lineLimit(1).layoutPriority(1)
                Spacer(minLength: 8)
                if let wert, !wert.isEmpty {
                    Text(wert).foregroundStyle(Farbe.muted).lineLimit(1)
                }
                ZeilenPfeil()
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .gruppenZeile()
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
    }
}

// MARK: - Profilkopf

/// Wer man ist, wie die Apple-ID-Zeile oben in den Einstellungen; ein Tippen oeffnet Persoenliches und Einstellungen.
private struct Profilkopf: View {
    let profil: Abschnitt<MeinProfil?>
    let erneut: Erneut
    let aktion: () -> Void

    var body: some View {
        let p = profil.wert ?? nil
        let vorname = p?.firstName ?? ""
        let nachname = p?.lastName ?? ""
        Section {
            Button(action: aktion) {
                HStack(spacing: 14) {
                    Text(KontoLogik.initialen(vorname: vorname, nachname: nachname))
                        .font(.title2.weight(.semibold))
                        .dynamicTypeSize(...DynamicTypeSize.xLarge)
                        .foregroundStyle(.white)
                        .frame(width: 60, height: 60)
                        .background(
                            LinearGradient(colors: [Farbe.blue.opacity(0.75), Farbe.blue], startPoint: .top, endPoint: .bottom),
                            in: Circle()
                        )
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 3) {
                        Text("\(vorname) \(nachname)")
                            .font(.title3.weight(.semibold))
                            .foregroundStyle(Farbe.ink)
                        let marken = KontoLogik.marken(p)
                        if !marken.isEmpty {
                            Text(marken.joined(separator: " · "))
                                .font(.subheadline)
                                .foregroundStyle(Farbe.muted)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    ZeilenPfeil()
                }
                .padding(.vertical, 6)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .gruppenZeile()
            .accessibilityElement(children: .combine)
            .accessibilityHint("Öffnet Persönliches und Einstellungen")
            if let f = profil.fehler {
                FehlerZeile(text: f, erneut: erneut).gruppenZeile()
            }
        }
    }
}

// MARK: - Abrechnung

/// Im Konto nur der Stand: was zusammen offen ist; ein Tippen zeigt die Posten (Abrechnung).
private struct AbrechnungKurz: View {
    let forderungen: Abschnitt<[Forderung]>
    let getraenke: Abschnitt<[EigenesGetraenk]>
    let erneut: Erneut
    let aktion: () -> Void

    var body: some View {
        let fehler = forderungen.fehler ?? getraenke.fehler
        let offen = KontoLogik.offen(forderungen.wert ?? [])
        let zurueck = offen.filter { $0.status == "returned" }.count
        let laufend = Startseite.sumOpenDrinks(getraenke.wert ?? [])
        let summe = KontoLogik.summe(offen: offen, getraenkeLaufend: laufend)
        let posten = offen.count + (laufend > 0 ? 1 : 0)

        Section {
            if let fehler {
                FehlerZeile(text: fehler, erneut: erneut).gruppenZeile()
            }
            if let text = KontoLogik.zurueckText(zurueck) {
                Label(text, systemImage: "exclamationmark.circle.fill")
                    .font(.subheadline)
                    .foregroundStyle(Farbe.redInk)
                    .gruppenZeile()
            }
            // Nach einem Ladefehler waere "Nichts offen" falsch beruhigend.
            if fehler == nil || posten > 0 {
                Button(action: aktion) {
                    HStack(spacing: 14) {
                        IconKachel(symbol: "eurosign", farbe: zurueck > 0 ? Farbe.red : Farbe.blue)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(posten == 0 ? "Nichts offen" : "Offen").foregroundStyle(Farbe.ink)
                            if posten > 0 {
                                Text(posten == 1 ? "1 Posten" : "\(posten) Posten")
                                    .font(.subheadline)
                                    .foregroundStyle(Farbe.muted)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        Text(Geld.formatCents(summe))
                            .font(.headline)
                            .monospacedDigit()
                            .foregroundStyle(Farbe.ink)
                        ZeilenPfeil()
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .gruppenZeile()
                .accessibilityElement(children: .combine)
                .accessibilityHint("Zeigt die einzelnen Posten")
            }
        } header: {
            GruppenKopf(titel: "Abrechnung")
        }
    }
}

/**
 * "Abrechnung" statt "Offene Forderungen" wie im Web: der laufende
 * Getraenkemonat steht hier als Normalfall ("läuft noch") und ist keine
 * Schuld (U76).
 */
private struct Abrechnung: View {
    let forderungen: Abschnitt<[Forderung]>
    let getraenke: Abschnitt<[EigenesGetraenk]>
    let erneut: Erneut

    var body: some View {
        let fehler = forderungen.fehler ?? getraenke.fehler
        let offen = KontoLogik.offen(forderungen.wert ?? [])
        let zurueck = offen.filter { $0.status == "returned" }.count
        // Die Getraenke des laufenden Monats sind noch keine Forderung - sie stehen trotzdem da.
        let laufend = Startseite.sumOpenDrinks(getraenke.wert ?? [])
        let summe = KontoLogik.summe(offen: offen, getraenkeLaufend: laufend)

        Section {
            if let fehler {
                FehlerZeile(text: fehler, erneut: erneut).gruppenZeile()
            }
            if let text = KontoLogik.zurueckText(zurueck) {
                Label(text, systemImage: "exclamationmark.circle.fill")
                    .font(.subheadline)
                    .foregroundStyle(Farbe.redInk)
                    .gruppenZeile()
            }
            // Nach einem Ladefehler waere "Nichts offen" falsch beruhigend.
            if fehler == nil || !offen.isEmpty || laufend > 0 {
                ForEach(offen, id: \.id) { f in
                    zeile(
                        titel: KontoLogik.forderungTitel(f),
                        beschreibung: f.description,
                        marke: KontoLogik.statusmarke(status: f.status ?? "", faellig: f.dueDate),
                        betrag: f.amountCents ?? 0
                    )
                }
                if laufend > 0 {
                    zeile(
                        titel: KontoLogik.getraenkeTitel(Date()),
                        beschreibung: nil,
                        marke: KontoLogik.statusmarke(status: "laufend", faellig: nil),
                        betrag: laufend
                    )
                }
                if offen.isEmpty && laufend == 0 {
                    Text("Nichts offen.").foregroundStyle(Farbe.muted).gruppenZeile()
                } else {
                    HStack {
                        Text("Zusammen").font(.headline).foregroundStyle(Farbe.ink)
                        Spacer()
                        Text(Geld.formatCents(summe)).font(.headline).monospacedDigit().foregroundStyle(Farbe.ink)
                    }
                    .gruppenZeile()
                    .accessibilityElement(children: .combine)
                }
            }
        } header: {
            GruppenKopf(titel: "Abrechnung")
        }
    }

    private func zeile(titel: String, beschreibung: String?, marke: Statusmarke, betrag: Int) -> some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(titel).foregroundStyle(Farbe.ink).lineLimit(1)
                HStack(spacing: 6) {
                    StatusmarkeAnsicht(marke: marke).padding(.top, -5)
                    if let b = beschreibung, !b.isEmpty {
                        Text(b).font(.footnote).foregroundStyle(Farbe.muted).lineLimit(1)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Text(Geld.formatCents(betrag)).monospacedDigit().foregroundStyle(Farbe.ink)
        }
        .padding(.vertical, 2)
        .gruppenZeile()
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Arbeitsdienst

/// Der Stand; ein Tipp fuehrt in den Reiter Arbeitsdienst im Verein.
private struct ArbeitsdienstAbschnitt: View {
    let dienst: Abschnitt<Arbeitsdienst?>
    let erneut: Erneut
    @Environment(\.zuVerein) private var zuVerein

    var body: some View {
        if let f = dienst.fehler {
            Section {
                FehlerZeile(text: f, erneut: erneut).gruppenZeile()
            } header: {
                GruppenKopf(titel: "Arbeitsdienst")
            }
        } else if let d = dienst.wert ?? nil {
            let soll = d.requiredHours ?? 0
            Section {
                Button { zuVerein(.arbeitsdienst) } label: {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(alignment: .firstTextBaseline) {
                        Text("Stunden \(d.year.map(String.init) ?? "")").foregroundStyle(Farbe.ink)
                        Spacer()
                        Text(KontoLogik.dienstWert(d)).monospacedDigit().foregroundStyle(Farbe.muted)
                        ZeilenPfeil()
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
                .padding(.vertical, 4)
                .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .gruppenZeile()
            } header: {
                GruppenKopf(titel: "Arbeitsdienst")
            } footer: {
                Text(KontoLogik.dienstText(d)).foregroundStyle(Farbe.muted)
            }
        }
    }
}
