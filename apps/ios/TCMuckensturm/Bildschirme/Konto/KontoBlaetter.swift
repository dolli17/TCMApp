/**
 * Die Blaetter des Kontos
 *
 * Meine Daten und Notfallkontakt (Stammdatenformular.tsx), Tennis (wie der
 * Onboarding-Schritt, TennisLogik; in einer Mannschaft dazu der Schalter
 * fuer die Telefonnummer), Einwilligungen (MerkmaleKarte.tsx),
 * Bankverbindung & Mandat (MandatAnsicht), Passwort aendern und die
 * Kuendigung (KontoloeschungFormular.tsx).
 *
 * Gestaltet wie die Formulare in Apples Kontakte und Einstellungen: ✕ links
 * schliesst, ✓ rechts speichert, die Felder stehen in gruppierten
 * Abschnitten mit dem Etikett links. Ein Fehler mit Feld steht unter dem
 * Feld, sonst oben. Wer etwas geaendert hat, wird vor dem Verwerfen gefragt.
 */

import SwiftUI

struct KontoBlattInhalt: View {
    @Environment(Sitzung.self) private var sitzung
    let art: KontoBlatt
    let inhalt: KontoInhalt?
    let zu: () -> Void
    /// Gespeichert: Blatt zu, die Meldung steht auf der Seite.
    let gespeichert: (String) -> Void
    /// Etwas hat sich geaendert, das Blatt bleibt offen (Einwilligungen).
    let geaendert: () -> Void
    let erneut: () -> Void

    private var daten: Kontodaten { Kontodaten(client: sitzung.client) }

    var body: some View {
        Group {
            switch art {
            case .daten, .notfall: formular
            case .tennis: tennis
            case .einwilligungen:
                FormBlatt(titel: titel, zu: zu) { einwilligungen }
            case .bank:
                FormBlatt(titel: titel, zu: zu) { bank }
            case .passwort: PasswortAendern(zu: zu, gespeichert: gespeichert)
            case .loeschen: KuendigungFormular(daten: daten, zu: zu)
            }
        }
        .presentationDragIndicator(.visible)
    }

    private var titel: String {
        switch art {
        case .daten: "Meine Daten"
        case .notfall: "Notfallkontakt"
        case .tennis: TennisLogik.titel
        case .einwilligungen: "Einwilligungen"
        case .bank: "Bankverbindung & Mandat"
        case .passwort: "Passwort ändern"
        case .loeschen: Kontoloeschung.titel
        }
    }

    // MARK: - Meine Daten und Notfallkontakt

    @ViewBuilder private var formular: some View {
        if let p = inhalt?.profil.wert ?? nil {
            if art == .daten {
                Stammdatenformular(
                    titel: titel,
                    erklaerung: "Änderungen sind sofort für den Verein sichtbar. E-Mail und Geburtsdatum ändert der Vorstand.",
                    abschnitte: [
                        ("Name", [
                            .init(name: "first_name", label: "Vorname", inhalt: .givenName, gross: .words),
                            .init(name: "last_name", label: "Nachname", inhalt: .familyName, gross: .words),
                            .init(name: "title", label: "Titel", inhalt: .namePrefix),
                        ]),
                        ("Telefon", [
                            .init(name: "phone", label: "Festnetz", inhalt: .telephoneNumber, tastatur: .phonePad),
                            .init(name: "mobile", label: "Mobil", inhalt: .telephoneNumber, tastatur: .phonePad),
                        ]),
                        ("Adresse", [
                            .init(name: "street", label: "Straße", inhalt: .streetAddressLine1, gross: .words),
                            .init(name: "postcode", label: "PLZ", inhalt: .postalCode, tastatur: .numberPad),
                            .init(name: "city", label: "Ort", inhalt: .addressCity, gross: .words),
                        ]),
                    ],
                    werte: p.werte,
                    zu: zu,
                    speichern: { neu in await daten.speichereProfil(neu: neu, alt: p.werte) },
                    gespeichert: gespeichert
                )
            } else {
                Stammdatenformular(
                    titel: titel,
                    erklaerung: "Wen sollen wir anrufen, wenn auf der Anlage etwas passiert?",
                    abschnitte: [
                        ("Kontakt", [
                            .init(name: "emergency_contact_name", label: "Name", inhalt: .name, gross: .words),
                            .init(name: "emergency_contact_phone", label: "Telefon", inhalt: .telephoneNumber, tastatur: .phonePad),
                            .init(name: "emergency_contact_relation", label: "Verhältnis", platzhalter: "etwa Mutter, Partner"),
                        ]),
                    ],
                    werte: p.werte,
                    zu: zu,
                    speichern: { neu in await daten.speichereNotfallkontakt(neu) },
                    gespeichert: gespeichert
                )
            }
        } else {
            FormBlatt(titel: titel, zu: zu) {
                Section {
                    FehlerZeile(
                        text: inhalt?.profil.fehler ?? "Deine Daten konnten nicht geladen werden.",
                        erneut: Erneut(laeuft: false, aktion: erneut)
                    )
                    .gruppenZeile()
                }
            }
        }
    }

    // MARK: - Tennis

    /// Erst wenn my_onboarding() geladen ist; sonst wuerde Speichern Leeres schicken.
    @ViewBuilder private var tennis: some View {
        if let f = inhalt?.tennis.fehler {
            FormBlatt(titel: TennisLogik.titel, zu: zu) {
                Section { FehlerZeile(text: f, erneut: Erneut(laeuft: false, aktion: erneut)).gruppenZeile() }
            }
        } else {
            // Nur wer in einer Mannschaft ist, bekommt den Telefon-Schalter (set_team_phone_visible).
            let telefonVorher = (inhalt?.mannschaft.wert ?? nil)?.telefonSichtbar
            TennisFormular(
                stand: inhalt?.tennis.wert ?? nil,
                telefonSichtbar: telefonVorher,
                mannschaft: (inhalt?.profil.wert ?? nil)?.teamName,
                zu: zu,
                speichern: { lk, nuliga, interesse, telefon in
                    let r = await Onboardingdaten(client: sitzung.client)
                        .speichereTennis(lk: lk, nuligaId: nuliga, mannschaftInteresse: interesse)
                    guard r.ok, let telefon, telefon != telefonVorher else { return r }
                    return await Mannschaftsdaten(client: sitzung.client).setzeTelefonSichtbar(telefon)
                },
                gespeichert: gespeichert
            )
        }
    }

    // MARK: - Einwilligungen

    @ViewBuilder private var einwilligungen: some View {
        if let f = inhalt?.merkmale.fehler {
            Section { FehlerZeile(text: f, erneut: Erneut(laeuft: false, aktion: erneut)).gruppenZeile() }
        } else {
            Einwilligungen(merkmale: KontoLogik.merkmale(inhalt?.merkmale.wert ?? []), daten: daten, geaendert: geaendert)
        }
    }

    // MARK: - Bankverbindung & Mandat

    /// Nur zum Lesen - geaendert wird es ueber den Vorstand.
    @ViewBuilder private var bank: some View {
        if let f = inhalt?.mandat.fehler {
            Section { FehlerZeile(text: f, erneut: Erneut(laeuft: false, aktion: erneut)).gruppenZeile() }
        } else if let m = inhalt?.mandat.wert ?? nil {
            Section {
                ForEach(Array(KontoLogik.mandatZeilen(m).enumerated()), id: \.offset) { _, zeile in
                    LabeledContent(zeile.0) {
                        Text(zeile.1).monospacedDigit().foregroundStyle(Farbe.ink).multilineTextAlignment(.trailing)
                    }
                    .foregroundStyle(Farbe.muted)
                    .gruppenZeile()
                }
            } header: {
                GruppenKopf(titel: "SEPA-Lastschriftmandat")
            } footer: {
                Text("Die Bankverbindung ändert der Vorstand – schreib ihm, wenn sich etwas geändert hat.")
                    .foregroundStyle(Farbe.muted)
            }
        } else {
            Section {
                Label("Es liegt noch kein SEPA-Mandat vor. Bitte wende dich an den Vorstand.", systemImage: "info.circle")
                    .foregroundStyle(Farbe.ink)
                    .gruppenZeile()
            }
        }
    }
}

// MARK: - Geruest der Formulare

/**
 * NavigationStack mit gruppierter Liste, ✕ links und - wenn es etwas zu
 * speichern gibt - ✓ rechts. Mit Aenderungen fragt ✕ erst nach, und das
 * Blatt laesst sich nicht wegwischen.
 */
struct FormBlatt<Inhalt: View>: View {
    let titel: String
    var geaendert = false
    var laeuft = false
    /// nil: nichts zu speichern, nur ✕.
    var speichern: (() -> Void)?
    var speichernLabel = "Speichern"
    var speichernGesperrt = false
    let zu: () -> Void
    @ViewBuilder var inhalt: Inhalt

    @State private var verwerfen = false

    var body: some View {
        NavigationStack {
            List { inhalt }
                .gruppenListe()
                .listSectionSpacing(20)
                .scrollDismissesKeyboard(.interactively)
                .navigationTitle(titel)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button { geaendert ? (verwerfen = true) : zu() } label: { Image(systemName: "xmark") }
                            .accessibilityLabel("Schließen")
                            .confirmationDialog("Änderungen verwerfen?", isPresented: $verwerfen, titleVisibility: .visible) {
                                Button("Verwerfen", role: .destructive, action: zu)
                                Button("Weiter bearbeiten", role: .cancel) {}
                            }
                    }
                    if let speichern {
                        ToolbarItem(placement: .confirmationAction) {
                            if laeuft {
                                ProgressView()
                            } else {
                                Button(action: speichern) { Image(systemName: "checkmark") }
                                    .disabled(speichernGesperrt)
                                    .accessibilityLabel(speichernLabel)
                            }
                        }
                    }
                }
        }
        .tint(Farbe.blue)
        .interactiveDismissDisabled(geaendert || laeuft)
    }
}

/// Eine Formularzeile wie in Kontakte: links das Etikett, rechts das Feld, darunter rot ein Fehler.
struct FormFeld: View {
    let label: String
    @Binding var text: String
    var platzhalter: String?
    var fehler: String?
    var inhaltsTyp: UITextContentType?
    var tastatur: UIKeyboardType = .default
    var gross: TextInputAutocapitalization = .sentences
    var geheim = false
    /// Was VoiceOver und UI-Tests als Namen des Felds hoeren, wenn es vom Etikett abweicht.
    var bedienName: String?

    @Environment(\.dynamicTypeSize) private var textgroesse

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            let layout = textgroesse >= .xxLarge
                ? AnyLayout(VStackLayout(alignment: .leading, spacing: 4))
                : AnyLayout(HStackLayout(spacing: 12))
            layout {
                Text(label)
                    .foregroundStyle(Farbe.ink)
                    .frame(minWidth: 96, alignment: .leading)
                    .accessibilityHidden(true)
                Group {
                    if geheim {
                        SecureField("", text: $text, prompt: Text(platzhalter ?? "Erforderlich").foregroundStyle(Farbe.muted))
                    } else {
                        TextField("", text: $text, prompt: Text(platzhalter ?? label).foregroundStyle(Farbe.muted))
                    }
                }
                .textContentType(inhaltsTyp)
                .keyboardType(tastatur)
                .textInputAutocapitalization(gross)
                .autocorrectionDisabled(inhaltsTyp != nil || geheim)
                .foregroundStyle(Farbe.ink)
                .accessibilityLabel(bedienName ?? label)
            }
            if let fehler {
                Text(fehler).font(.footnote).foregroundStyle(Farbe.redInk).fixedSize(horizontal: false, vertical: true)
            }
        }
        .gruppenZeile()
    }
}

/// Meldung oben im Formular: gruen bei Erfolg, rot bei Fehler.
private struct FormMeldung: View {
    let text: String
    var ok = false

    var body: some View {
        Section {
            Label(text, systemImage: ok ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                .foregroundStyle(ok ? Farbe.greenInk : Farbe.redInk)
                .gruppenZeile()
                .onAppear { UIAccessibility.post(notification: .announcement, argument: text) }
        }
    }
}

// MARK: - Formular

private struct Stammdatenformular: View {
    struct Feld {
        let name: String
        let label: String
        var inhalt: UITextContentType?
        var tastatur: UIKeyboardType = .default
        var gross: TextInputAutocapitalization = .sentences
        var platzhalter: String?
    }

    let titel: String
    let erklaerung: String
    let abschnitte: [(String, [Feld])]
    let werte: [String: String]
    let zu: () -> Void
    let speichern: ([String: String]) async -> Ergebnis
    let gespeichert: (String) -> Void

    @State private var entwurf: [String: String] = [:]
    @State private var fehlerFeld: String?
    @State private var meldung: Ergebnis?
    @State private var laeuft = false
    @State private var bereit = false

    private var geaendert: Bool {
        bereit && abschnitte.flatMap(\.1).contains { (entwurf[$0.name] ?? "") != (werte[$0.name] ?? "") }
    }

    var body: some View {
        FormBlatt(titel: titel, geaendert: geaendert, laeuft: laeuft, speichern: absenden, zu: zu) {
            if let meldung, fehlerFeld == nil {
                FormMeldung(text: meldung.meldung, ok: meldung.ok)
            }
            ForEach(Array(abschnitte.enumerated()), id: \.offset) { i, a in
                Section {
                    ForEach(a.1, id: \.name) { feld($0) }
                } header: {
                    GruppenKopf(titel: a.0)
                } footer: {
                    if i == abschnitte.count - 1 {
                        Text(erklaerung).foregroundStyle(Farbe.muted)
                    }
                }
            }
        }
        .sensoryFeedback(.error, trigger: meldung) { _, neu in neu?.ok == false }
        // Der Entwurf startet beim gespeicherten Stand.
        .onAppear {
            guard !bereit else { return }
            entwurf = werte
            bereit = true
        }
    }

    private func feld(_ f: Feld) -> some View {
        FormFeld(
            label: f.label,
            text: Binding(
                get: { entwurf[f.name] ?? "" },
                set: {
                    if fehlerFeld == f.name { fehlerFeld = nil }
                    entwurf[f.name] = $0
                }
            ),
            platzhalter: f.platzhalter,
            fehler: fehlerFeld == f.name ? meldung?.meldung : nil,
            inhaltsTyp: f.inhalt,
            tastatur: f.tastatur,
            gross: f.gross
        )
    }

    private func absenden() {
        guard !laeuft else { return }
        laeuft = true
        Task {
            let r = await speichern(entwurf)
            laeuft = false
            if r.ok {
                gespeichert(r.meldung)
            } else {
                meldung = r
                fehlerFeld = r.feld
            }
        }
    }
}

// MARK: - Tennis

/// Dieselben Felder wie der Onboarding-Schritt (SchrittTennis); der Fehler steht am Feld.
private struct TennisFormular: View {
    let stand: OnboardingZustand.Tennis?
    /// nil ohne Mannschaft: dann fehlt der Schalter fuer die Telefonnummer.
    let telefonSichtbar: Bool?
    var mannschaft: String?
    let zu: () -> Void
    let speichern: (String, String, Bool, Bool?) async -> Ergebnis
    let gespeichert: (String) -> Void

    @State private var lk = ""
    @State private var nuliga = ""
    @State private var interesse = false
    @State private var telefon = false
    @State private var bereit = false
    @State private var meldung: Ergebnis?
    @State private var laeuft = false

    @Environment(\.zuMannschaft) private var zuMannschaft

    private var geaendert: Bool {
        guard bereit else { return false }
        let (l, n, i) = TennisLogik.entwurf(stand)
        return lk != l || nuliga != n || interesse != i || (telefonSichtbar != nil && telefon != telefonSichtbar)
    }

    var body: some View {
        let gespeicherteLk = TennisLogik.entwurf(stand).0
        FormBlatt(titel: TennisLogik.titel, geaendert: geaendert, laeuft: laeuft, speichern: absenden, zu: zu) {
            if let meldung, meldung.feld == nil {
                FormMeldung(text: meldung.meldung, ok: meldung.ok)
            }
            // Der gespeicherte Stand gross, wie eine Kennzahl in Fitness.
            if !gespeicherteLk.isEmpty {
                Section {
                    HStack(alignment: .firstTextBaseline) {
                        Text("Aktuell").foregroundStyle(Farbe.muted)
                        Spacer()
                        Text("LK \(gespeicherteLk)")
                            .font(.largeTitle.weight(.bold))
                            .monospacedDigit()
                            .foregroundStyle(Farbe.ink)
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                    }
                    .gruppenZeile()
                    .accessibilityElement(children: .combine)
                }
            }
            Section {
                FormFeld(
                    label: "LK",
                    text: Binding(get: { lk }, set: { lk = $0; feldGeaendert(TennisLogik.feldLk) }),
                    platzhalter: "etwa 14,5",
                    fehler: fehler(TennisLogik.feldLk),
                    tastatur: .numbersAndPunctuation,
                    gross: .characters,
                    bedienName: LkEingabe.beschriftung
                )
                FormFeld(
                    label: TennisLogik.nuligaLabel,
                    text: Binding(get: { nuliga }, set: { nuliga = $0; feldGeaendert(TennisLogik.feldNuliga) }),
                    platzhalter: "freiwillig",
                    fehler: fehler(TennisLogik.feldNuliga),
                    gross: .never
                )
            } header: {
                GruppenKopf(titel: "Spielstärke")
            } footer: {
                Text("\(TennisLogik.lkWarum) \(LkEingabe.hinweis)").foregroundStyle(Farbe.muted)
            }
            Section {
                Toggle(TennisLogik.interesseLabel, isOn: $interesse)
                    .disabled(laeuft)
                    .gruppenZeile()
            }
            if telefonSichtbar != nil {
                Section {
                    Button {
                        zu()
                        zuMannschaft()
                    } label: {
                        HStack {
                            IconKachel(symbol: "person.3.fill")
                            Text(mannschaft ?? MannschaftLogik.titel).foregroundStyle(Farbe.ink)
                            Spacer()
                            Text("Zur Mannschaft").foregroundStyle(Farbe.muted)
                            ZeilenPfeil()
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .gruppenZeile()
                    Toggle(MannschaftLogik.telefonLabel, isOn: $telefon)
                        .disabled(laeuft)
                        .gruppenZeile()
                } header: {
                    GruppenKopf(titel: MannschaftLogik.titel)
                } footer: {
                    Text(MannschaftLogik.telefonBeschreibung).foregroundStyle(Farbe.muted)
                }
            }
        }
        // Der Entwurf startet beim gespeicherten Stand.
        .onAppear {
            guard !bereit else { return }
            (lk, nuliga, interesse) = TennisLogik.entwurf(stand)
            telefon = telefonSichtbar ?? false
            bereit = true
        }
    }

    private func fehler(_ feld: String) -> String? {
        meldung?.feld == feld ? meldung?.meldung : nil
    }

    private func feldGeaendert(_ feld: String) {
        if meldung?.feld == feld { meldung = nil }
    }

    private func absenden() {
        guard !laeuft else { return }
        laeuft = true
        Task {
            let r = await speichern(lk, nuliga, interesse, telefonSichtbar == nil ? nil : telefon)
            laeuft = false
            if r.ok {
                gespeichert(r.meldung)
            } else {
                meldung = r
            }
        }
    }
}

// MARK: - Einwilligungen

/**
 * Nur Merkmale, die das Mitglied selbst setzen darf. Ob es sie aendern darf,
 * entscheidet die Datenbank - darf_ich kommt fertig aus der RPC. Jede
 * Aenderung gilt sofort, wie ein Schalter in Einstellungen.
 */
private struct Einwilligungen: View {
    let merkmale: [Merkmal]
    let daten: Kontodaten
    let geaendert: () -> Void

    @State private var laeuft = false
    @State private var meldung: Ergebnis?
    @State private var texte: [String: String] = [:]

    var body: some View {
        if let meldung, !meldung.ok {
            FormMeldung(text: meldung.meldung)
        }
        ForEach(Array(merkmale.enumerated()), id: \.element.id) { i, m in
            Section {
                bedienung(m)
            } header: {
                if m.darstellung != .jaNein { GruppenKopf(titel: m.name) }
            } footer: {
                VStack(alignment: .leading, spacing: 4) {
                    if !m.beschreibung.isEmpty { Text(m.beschreibung) }
                    if m.darstellung == .jaNein, m.gesetzt, let seit = m.werte.first?.seit {
                        Text("Erteilt am \(KontoLogik.tagDatum(seit)).")
                    }
                    if i == merkmale.count - 1 {
                        Text("Was du hier setzt, kannst du jederzeit wieder zurücknehmen.").padding(.top, 8)
                    }
                }
                .foregroundStyle(Farbe.muted)
            }
        }
        .sensoryFeedback(trigger: meldung) { _, neu in
            guard let neu else { return nil }
            return neu.ok ? .success : .error
        }
    }

    @ViewBuilder private func bedienung(_ m: Merkmal) -> some View {
        switch m.darstellung {
        case .nurLesen:
            LabeledContent(m.name) { Text(KontoLogik.nurLesenText(m)).foregroundStyle(Farbe.muted) }
                .gruppenZeile()
        case .jaNein:
            Toggle(m.name, isOn: Binding(get: { m.gesetzt }, set: { ja in
                guard ja != m.gesetzt else { return }
                ausfuehren { ja ? await daten.setzeMerkmal(code: m.code, option: "true") : await daten.entferneMerkmal(code: m.code) }
            }))
            .disabled(laeuft)
            .gruppenZeile()
        case .einzelwahl:
            // Wie die Auswahl in Einstellungen: Haken rechts an der gewaehlten Zeile.
            ForEach(m.optionen, id: \.value) { o in
                wahlZeile(o.label ?? o.value, an: m.werte.first?.option == o.value) {
                    guard o.value != m.werte.first?.option else { return }
                    ausfuehren { await daten.setzeMerkmal(code: m.code, option: o.value) }
                }
            }
        case .liste:
            ForEach(m.optionen, id: \.value) { o in
                let an = m.werte.contains { $0.option == o.value }
                wahlZeile(o.label ?? o.value, an: an) {
                    ausfuehren {
                        an ? await daten.entferneMerkmal(code: m.code, option: o.value)
                            : await daten.setzeMerkmal(code: m.code, option: o.value)
                    }
                }
            }
        case .eingabe:
            HStack {
                TextField(
                    "", text: Binding(get: { texte[m.code] ?? m.werte.first?.text ?? "" }, set: { texte[m.code] = $0 }),
                    prompt: Text(m.name).foregroundStyle(Farbe.muted)
                )
                .keyboardType(m.art == "number" ? .decimalPad : .default)
                .accessibilityLabel(m.name)
                if let t = texte[m.code], t != (m.werte.first?.text ?? "") {
                    Button("Sichern") { ausfuehren { await daten.setzeMerkmal(code: m.code, text: t) } }
                        .buttonStyle(.borderless)
                        .font(.body.weight(.semibold))
                        .disabled(laeuft)
                }
            }
            .gruppenZeile()
        }
    }

    private func wahlZeile(_ text: String, an: Bool, aktion: @escaping () -> Void) -> some View {
        Button(action: aktion) {
            HStack {
                Text(text).foregroundStyle(Farbe.ink)
                Spacer()
                if an { Image(systemName: "checkmark").font(.body.weight(.semibold)).foregroundStyle(Farbe.blue) }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(laeuft)
        .gruppenZeile()
        .accessibilityAddTraits(an ? .isSelected : [])
    }

    private func ausfuehren(_ tun: @escaping () async -> Ergebnis) {
        guard !laeuft else { return }
        laeuft = true
        Task {
            let r = await tun()
            laeuft = false
            meldung = r
            if r.ok {
                texte = [:]
                geaendert()
            }
        }
    }
}

// MARK: - Passwort aendern

/// Neues Passwort fuer das angemeldete Konto, ohne Link aus der E-Mail.
private struct PasswortAendern: View {
    @Environment(Sitzung.self) private var sitzung
    let zu: () -> Void
    let gespeichert: (String) -> Void

    @State private var passwort = ""
    @State private var wiederholung = ""
    @State private var fehler: String?
    @State private var laeuft = false

    var body: some View {
        FormBlatt(
            titel: "Passwort ändern", geaendert: !passwort.isEmpty || !wiederholung.isEmpty, laeuft: laeuft,
            speichern: speichern, speichernGesperrt: passwort.isEmpty || wiederholung.isEmpty, zu: zu
        ) {
            if let fehler { FormMeldung(text: fehler) }
            Section {
                FormFeld(label: "Neu", text: $passwort, inhaltsTyp: .newPassword, gross: .never, geheim: true, bedienName: "Neues Passwort")
                FormFeld(
                    label: "Bestätigen", text: $wiederholung, inhaltsTyp: .newPassword, gross: .never, geheim: true,
                    bedienName: "Passwort wiederholen"
                )
                    .onSubmit(speichern)
            } header: {
                if let email = sitzung.client.auth.currentUser?.email {
                    GruppenKopf(titel: "Für \(email)")
                }
            } footer: {
                Text(PasswortTexte.setzenUnterzeile).foregroundStyle(Farbe.muted)
            }
        }
        .sensoryFeedback(.error, trigger: fehler) { _, neu in neu != nil }
    }

    private func speichern() {
        guard !laeuft else { return }
        fehler = PasswortRegeln.pruefen(passwort: passwort, wiederholung: wiederholung)
        guard fehler == nil else { return }
        laeuft = true
        Task {
            let meldung = await sitzung.passwortSpeichern(passwort, imKonto: true)
            laeuft = false
            if let meldung {
                fehler = meldung
            } else {
                gespeichert("Passwort gespeichert.")
            }
        }
    }
}

// MARK: - Kuendigung

/**
 * Erklaerung, freiwillige Nachricht und unten rot "Kündigung beantragen";
 * die Rueckfrage kommt als Action Sheet, das Destruktive oben.
 */
private struct KuendigungFormular: View {
    let daten: Kontodaten
    let zu: () -> Void

    @State private var nachricht = ""
    @State private var rueckfrage = false
    @State private var laeuft = false
    @State private var meldung: Ergebnis?

    var body: some View {
        FormBlatt(titel: "Kündigen", geaendert: !nachricht.isEmpty && meldung?.ok != true, laeuft: laeuft, zu: zu) {
            if let meldung {
                FormMeldung(text: meldung.meldung, ok: meldung.ok)
            }
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    Text(Kontoloeschung.titel).font(.headline).foregroundStyle(Farbe.ink)
                    if let erster = Kontoloeschung.erklaerung.first {
                        Text(erster).font(.subheadline).foregroundStyle(Farbe.ink2)
                    }
                }
                .padding(.vertical, 4)
                .gruppenZeile()
                ForEach(Kontoloeschung.erklaerung.dropFirst(), id: \.self) { satz in
                    Label { Text(satz).font(.subheadline).foregroundStyle(Farbe.ink2) } icon: {
                        Image(systemName: "info.circle").foregroundStyle(Farbe.muted)
                    }
                    .gruppenZeile()
                }
            }
            if meldung?.ok != true {
                Section {
                    TextField(
                        "", text: Binding(
                            get: { nachricht },
                            set: { nachricht = $0.utf16.count > Kontoloeschung.nachrichtMax ? String($0.prefix(Kontoloeschung.nachrichtMax)) : $0 }
                        ),
                        prompt: Text("Freiwillig").foregroundStyle(Farbe.muted),
                        axis: .vertical
                    )
                    .lineLimit(3...8)
                    .disabled(laeuft)
                    .accessibilityLabel(Kontoloeschung.nachrichtLabel)
                    .gruppenZeile()
                } header: {
                    GruppenKopf(titel: "Nachricht an den Vorstand")
                }
                Section {
                    Button(role: .destructive) { rueckfrage = true } label: {
                        HStack {
                            Spacer()
                            if laeuft { ProgressView() } else { Text(Kontoloeschung.absenden) }
                            Spacer()
                        }
                    }
                    .disabled(laeuft)
                    .gruppenZeile()
                    .confirmationDialog(Kontoloeschung.bestaetigungFrage, isPresented: $rueckfrage, titleVisibility: .visible) {
                        Button(Kontoloeschung.bestaetigen, role: .destructive, action: senden)
                        Button(Kontoloeschung.abbrechen, role: .cancel) {}
                    }
                }
            }
        }
        .sensoryFeedback(trigger: meldung) { _, neu in
            guard let neu else { return nil }
            return neu.ok ? .success : .error
        }
    }

    private func senden() {
        guard !laeuft else { return }
        laeuft = true
        Task {
            let r = await daten.beantrageKontoloeschung(nachricht)
            laeuft = false
            meldung = r
        }
    }
}

// MARK: - Geruest

/**
 * Aufbau aller Konto-Blaetter wie bei den Buchungsblaettern: Titel und X fest
 * oben, der Inhalt rollt, die Aktion steht abgesetzt unten.
 */
struct KontoBlattGeruest<Inhalt: View, Fuss: View>: View {
    let titel: String
    var unterzeile: String?
    let zu: () -> Void
    @ViewBuilder var inhalt: Inhalt
    @ViewBuilder var fuss: Fuss

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(titel)
                        .font(Schrift.display(.fett, 26, relativeTo: .title))
                        .tracking(Tokens.Schrift.laufweiteTitel)
                        .foregroundStyle(Farbe.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityAddTraits(.isHeader)
                    if let unterzeile {
                        Text(unterzeile)
                            .font(Schrift.text(.normal, 15))
                            .foregroundStyle(Farbe.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 6)
                SchliessenKnopf(aktion: zu)
            }
            .padding(.horizontal, Tokens.Abstand.rand)
            .padding(.top, 24)
            .padding(.bottom, 16)
            ScrollView {
                VStack(alignment: .leading, spacing: 20) { inhalt }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, Tokens.Abstand.rand)
                    .padding(.top, 4)
                    .padding(.bottom, 24)
            }
            .scrollDismissesKeyboard(.interactively)
            .scrollBounceBehavior(.basedOnSize)
            if Fuss.self != EmptyView.self {
                Farbe.line.frame(height: 1)
                VStack(spacing: 10) { fuss }
                    .padding(.horizontal, Tokens.Abstand.rand)
                    .padding(.top, 14)
                    .padding(.bottom, 10)
            }
        }
        .background(Farbe.bg)
    }
}

extension KontoBlattGeruest where Fuss == EmptyView {
    init(titel: String, unterzeile: String? = nil, zu: @escaping () -> Void, @ViewBuilder inhalt: () -> Inhalt) {
        self.init(titel: titel, unterzeile: unterzeile, zu: zu, inhalt: inhalt) { EmptyView() }
    }
}
