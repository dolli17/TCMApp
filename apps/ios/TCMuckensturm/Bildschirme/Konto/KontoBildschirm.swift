/**
 * Konto (apps/mobile/app/(tabs)/konto.tsx, Entwurf AppKonto)
 *
 * Oben wer man ist, darunter was offen ist und der Arbeitsdienst. Die
 * Einstellungen stehen als gruppierte Liste; Meine Daten, Notfallkontakt,
 * Einwilligungen, Mandat, Passwort und die Kuendigung oeffnen je ein
 * eigenes Blatt (KontoBlaetter.swift), statt als lange Formulare die Seite
 * zu fuellen.
 *
 * Jede Quelle laedt fuer sich: schlaegt eine fehl (etwa das Mandat), zeigt
 * nur ihr Abschnitt den Fehler, und der Rest der Seite bleibt gefuellt.
 *
 * "Mitteilungen aufs Handy" fehlt noch: ohne APNs-Registrierung gaebe es
 * keine Marke, die der Schalter an- oder abmelden koennte.
 */

import SwiftUI

enum KontoBlatt: String, Identifiable {
    case daten, notfall, einwilligungen, bank, passwort, loeschen
    var id: String { rawValue }
}

struct KontoBildschirm: View {
    @Environment(Sitzung.self) private var sitzung
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
        NavigationStack {
            ScrollViewReader { leser in
                ScrollView {
                    VStack(alignment: .leading, spacing: Tokens.Abstand.m) {
                        // Kein grosser Titel: oben steht, wer man ist. Die Glocke bleibt
                        // rechts und scrollt mit dem Profil weg (U53).
                        HStack {
                            Spacer()
                            Glocke()
                        }
                        .padding(.top, 12)

                        if laedt && inhalt == nil {
                            ProgressView().tint(Farbe.muted).frame(maxWidth: .infinity).padding(.top, 40)
                        } else if let d = inhalt {
                            let erneut = Erneut(laeuft: aktualisiert) { Task { await laden(.nachladen) } }
                            Profilkopf(profil: d.profil, erneut: erneut)
                            if let meldung {
                                KontoHinweis(text: meldung, ok: true)
                            }
                            Abrechnung(forderungen: d.forderungen, getraenke: d.getraenke, erneut: erneut)
                            ArbeitsdienstKarte(dienst: d.dienst, erneut: erneut)
                            einstellungen(d)
                            rechtliches
                            // Abgesetzt, damit niemand sie beim Abmelden streift (U44).
                            KontoGruppe {
                                KontoVerweis(titel: Kontoloeschung.titel, pfeil: true) { blatt = .loeschen }
                            }
                            .padding(.top, Tokens.Abstand.abschnitt - Tokens.Abstand.m)
                        }
                    }
                    .padding(.horizontal, Tokens.Abstand.rand)
                    .padding(.bottom, Tokens.Abstand.abschnitt * 2)
                }
                .background(Farbe.bg)
                .refreshable { await laden(.nachladen) }
                .onChange(of: rollenZu) { _, ziel in
                    if let ziel { leser.scrollTo(ziel, anchor: UnitPoint(x: 0.5, y: 0.12)) }
                }
            }
            .toolbar(.hidden, for: .navigationBar)
        }
        .task {
            await laden(.erstes)
            #if DEBUG
            // Fuer Bildschirmfotos per simctl (README): `-TCMKontoBlatt daten` oeffnet ein Blatt.
            let argumente = ProcessInfo.processInfo.arguments
            if let i = argumente.firstIndex(of: "-TCMKontoBlatt"), i + 1 < argumente.count {
                blatt = KontoBlatt(rawValue: argumente[i + 1])
            }
            // `-TCMKontoRollen einstellungen` rollt zu den Einstellungen.
            if let i = argumente.firstIndex(of: "-TCMKontoRollen"), i + 1 < argumente.count {
                rollenZu = argumente[i + 1]
            }
            #endif
        }
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
            Button("Abmelden", role: .destructive) { Task { await sitzung.abmelden() } }
        }
    }

    // MARK: - Einstellungen

    private func einstellungen(_ d: KontoInhalt) -> some View {
        Group {
            KontoAbschnitt(titel: "Einstellungen").id("einstellungen")
            KontoGruppe {
                KontoEintrag(titel: "Meine Daten", symbol: "person") { blatt = .daten }
                KontoLinie()
                KontoEintrag(titel: "Notfallkontakt", symbol: "phone") { blatt = .notfall }
                if KontoLogik.zeigeEinwilligungen(d.merkmale.wert) {
                    KontoLinie()
                    KontoEintrag(titel: "Einwilligungen", symbol: "checkmark.square") { blatt = .einwilligungen }
                }
                KontoLinie()
                KontoEintrag(titel: "Bankverbindung & Mandat", symbol: "building.columns") { blatt = .bank }
                KontoLinie()
                KontoEintrag(titel: "Passwort ändern", symbol: "lock") { blatt = .passwort }
                KontoLinie()
                VStack(alignment: .leading, spacing: 10) {
                    Text("Erscheinungsbild")
                        .font(Schrift.text(.halbfett, 15.5))
                        .foregroundStyle(Farbe.ink)
                    KontoSegmente(
                        beschriftung: "Erscheinungsbild",
                        optionen: Erscheinungsbild.allCases.map { ($0, $0.label) },
                        gewaehlt: erscheinungsbild
                    ) { erscheinungsbild = $0 }
                }
                .padding(.horizontal, 16)
                .padding(.top, 14)
                .padding(.bottom, 16)
            }
        }
    }

    // MARK: - Rechtliches und Abmelden

    /// Datenschutz und Impressum liegen im Web; ohne Basisadresse (lokal) fehlen die Zeilen.
    private var rechtliches: some View {
        let datenschutz = sitzung.umgebung.webLink("/datenschutz")
        let impressum = sitzung.umgebung.webLink("/impressum")
        return KontoGruppe {
            if let datenschutz, let impressum {
                Link(destination: datenschutz) { verweisZeile("Datenschutz") }
                    .buttonStyle(ZeilenDruck())
                KontoLinie()
                Link(destination: impressum) { verweisZeile("Impressum") }
                    .buttonStyle(ZeilenDruck())
                KontoLinie()
            }
            KontoVerweis(titel: "Abmelden", rot: true) { abmeldenFragen = true }
        }
        .padding(.top, Tokens.Abstand.s)
    }

    private func verweisZeile(_ titel: String) -> some View {
        Text(titel)
            .font(Schrift.text(.halbfett, 15.5))
            .foregroundStyle(Farbe.ink)
            .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
            .padding(.horizontal, 16)
    }

    // MARK: - Laden

    private enum Art { case erstes, nachladen, still }

    private func laden(_ art: Art) async {
        if art == .nachladen { aktualisiert = true }
        if art != .still { meldung = nil }
        inhalt = await Self.lade(Kontodaten(client: sitzung.client), Startdaten(client: sitzung.client))
        laedt = false
        aktualisiert = false
    }

    nonisolated static func lade(_ k: Kontodaten, _ s: Startdaten) async -> KontoInhalt {
        async let profil = Abschnitt.von { try await k.profil() }
        async let forderungen = Abschnitt.von { try await k.forderungen() }
        async let getraenke = Abschnitt.von { try await s.eigeneGetraenke() }
        async let dienst = Abschnitt.von { try await s.arbeitsdienst() }
        async let mandat = Abschnitt.von { try await k.mandat() }
        async let merkmale = Abschnitt.von { try await k.merkmale() }
        return await KontoInhalt(
            profil: profil,
            forderungen: forderungen,
            getraenke: getraenke,
            dienst: dienst,
            mandat: mandat,
            merkmale: merkmale
        )
    }
}

// MARK: - Profilkopf

private struct Profilkopf: View {
    let profil: Abschnitt<MeinProfil?>
    let erneut: Erneut

    var body: some View {
        let p = profil.wert ?? nil
        let vorname = p?.firstName ?? ""
        let nachname = p?.lastName ?? ""
        VStack(spacing: 0) {
            Text(KontoLogik.initialen(vorname: vorname, nachname: nachname))
                .font(Schrift.text(.extrafett, 30))
                .dynamicTypeSize(...DynamicTypeSize.xLarge)
                .foregroundStyle(Farbe.onBrand)
                .frame(width: 88, height: 88)
                .background(Farbe.brand, in: Circle())
                .accessibilityHidden(true)
            Text("\(vorname) \(nachname)")
                .font(Schrift.text(.extrafett, 28, relativeTo: .title))
                .foregroundStyle(Farbe.ink)
                .multilineTextAlignment(.center)
                .padding(.top, 14)
                .accessibilityAddTraits(.isHeader)
            let marken = KontoLogik.marken(p)
            if !marken.isEmpty {
                HStack(spacing: 6) {
                    ForEach(marken, id: \.self) { KontoMarke(text: $0) }
                }
                .padding(.top, 10)
            }
            if let f = profil.fehler {
                Fehlerzeile(text: f, laeuft: erneut.laeuft, onErneut: erneut.aktion)
                    .padding(.top, 10)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, -8)
    }
}

// MARK: - Abrechnung

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

        KontoAbschnitt(titel: "Abrechnung")
        if let fehler {
            Fehlerzeile(text: fehler, laeuft: erneut.laeuft, onErneut: erneut.aktion)
        }
        if let text = KontoLogik.zurueckText(zurueck) {
            KontoHinweis(text: text)
        }
        // Nach einem Ladefehler waere "Nichts offen" falsch beruhigend.
        if fehler == nil || !offen.isEmpty || laufend > 0 {
            KontoGruppe {
                ForEach(Array(offen.enumerated()), id: \.element.id) { i, f in
                    if i > 0 { KontoLinie() }
                    zeile(
                        titel: KontoLogik.forderungTitel(f),
                        beschreibung: f.description,
                        marke: KontoLogik.statusmarke(status: f.status ?? "", faellig: f.dueDate),
                        betrag: f.amountCents ?? 0
                    )
                }
                if laufend > 0 {
                    if !offen.isEmpty { KontoLinie() }
                    zeile(
                        titel: KontoLogik.getraenkeTitel(Date()),
                        beschreibung: nil,
                        marke: KontoLogik.statusmarke(status: "laufend", faellig: nil),
                        betrag: laufend
                    )
                }
                if offen.isEmpty && laufend == 0 {
                    Text("Nichts offen.").leise()
                        .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
                        .padding(.horizontal, 16)
                } else {
                    HStack {
                        Text("Zusammen").font(Schrift.text(.fett, 14)).foregroundStyle(Farbe.ink2)
                        Spacer()
                        Betrag(text: Geld.formatCents(summe), groesse: 21)
                    }
                    .padding(.vertical, 14)
                    .padding(.horizontal, 16)
                    .background(Farbe.surf2)
                    .accessibilityElement(children: .combine)
                }
            }
        }
    }

    private func zeile(titel: String, beschreibung: String?, marke: Statusmarke, betrag: Int) -> some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 0) {
                Text(titel)
                    .font(Schrift.text(.halbfett, 15.5))
                    .foregroundStyle(Farbe.ink)
                    .lineLimit(1)
                if let b = beschreibung, !b.isEmpty {
                    Text(b).leise().lineLimit(2).padding(.top, 2)
                }
                StatusmarkeAnsicht(marke: marke)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Betrag(text: Geld.formatCents(betrag))
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 16)
        .frame(minHeight: 64)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Arbeitsdienst

private struct ArbeitsdienstKarte: View {
    let dienst: Abschnitt<Arbeitsdienst?>
    let erneut: Erneut

    var body: some View {
        if let f = dienst.fehler {
            Fehlerzeile(text: "Arbeitsdienst: \(f)", laeuft: erneut.laeuft, onErneut: erneut.aktion)
        }
        if let d = dienst.wert ?? nil {
            let soll = d.requiredHours ?? 0
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .firstTextBaseline) {
                    Text("Arbeitsdienst \(d.year.map(String.init) ?? "")")
                        .font(Schrift.text(.fett, 15.5))
                        .foregroundStyle(Farbe.ink)
                    Spacer()
                    Betrag(text: KontoLogik.dienstWert(d))
                }
                if soll > 0 {
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule().fill(Farbe.surf2)
                            Capsule().fill(Farbe.green).frame(width: geo.size.width * KontoLogik.dienstAnteil(d))
                        }
                    }
                    .frame(height: 8)
                    .padding(.top, 12)
                    .accessibilityLabel(
                        "\(HomeLogik.jsZahl(d.completedHours ?? 0)) von \(HomeLogik.jsZahl(soll)) Stunden geleistet"
                    )
                }
                Text(KontoLogik.dienstText(d))
                    .leise()
                    .lineSpacing(3)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 10)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .karte(radius: Tokens.Radius.karte, padding: 16)
        }
    }
}
