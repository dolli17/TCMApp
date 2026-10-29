/**
 * Die Blaetter des Kontos
 *
 * Meine Daten und Notfallkontakt (Stammdatenformular.tsx), Einwilligungen
 * (MerkmaleKarte.tsx), Bankverbindung & Mandat (MandatAnsicht), Passwort
 * aendern und die Kuendigung (KontoloeschungFormular.tsx). Inhaltlich wie
 * in der Expo-App; "Passwort ändern" ist neu und nimmt dieselben Regeln wie
 * "Passwort festlegen" (PasswortRegeln).
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
            case .einwilligungen: rollend { einwilligungen }
            case .bank: rollend { bank }
            case .passwort: PasswortAendern(zu: zu, gespeichert: gespeichert)
            case .loeschen: rollend { KuendigungFormular(daten: daten) }
            }
        }
        .background(Farbe.bg)
        .presentationDragIndicator(.visible)
        .presentationCornerRadius(Tokens.Radius.blatt)
    }

    private var titel: String {
        switch art {
        case .daten: "Meine Daten"
        case .notfall: "Notfallkontakt"
        case .einwilligungen: "Einwilligungen"
        case .bank: "Bankverbindung & Mandat"
        case .passwort: "Passwort ändern"
        case .loeschen: Kontoloeschung.titel
        }
    }

    private func rollend<Inhalt: View>(@ViewBuilder _ inhalt: () -> Inhalt) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Tokens.Abstand.m) {
                BlattKopf(titel: titel, zu: zu)
                inhalt()
            }
            .padding(Tokens.Abstand.rand)
        }
    }

    // MARK: - Meine Daten und Notfallkontakt

    @ViewBuilder private var formular: some View {
        if let p = inhalt?.profil.wert ?? nil {
            if art == .daten {
                Stammdatenformular(
                    titel: titel,
                    erklaerung: "Änderungen sind sofort für den Verein sichtbar. E-Mail und Geburtsdatum ändert der Vorstand.",
                    felder: [
                        .init(name: "first_name", label: "Vorname", inhalt: .givenName, gross: .words),
                        .init(name: "last_name", label: "Nachname", inhalt: .familyName, gross: .words),
                        .init(name: "title", label: "Titel", inhalt: .namePrefix),
                        .init(name: "phone", label: "Telefon", inhalt: .telephoneNumber, tastatur: .phonePad),
                        .init(name: "mobile", label: "Mobil", inhalt: .telephoneNumber, tastatur: .phonePad),
                        .init(name: "street", label: "Straße", inhalt: .streetAddressLine1, gross: .words),
                        .init(name: "postcode", label: "PLZ", inhalt: .postalCode, tastatur: .numberPad),
                        .init(name: "city", label: "Ort", inhalt: .addressCity, gross: .words),
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
                    felder: [
                        .init(name: "emergency_contact_name", label: "Name", inhalt: .name, gross: .words),
                        .init(name: "emergency_contact_phone", label: "Telefon", inhalt: .telephoneNumber, tastatur: .phonePad),
                        .init(name: "emergency_contact_relation", label: "Verhältnis"),
                    ],
                    werte: p.werte,
                    zu: zu,
                    speichern: { neu in await daten.speichereNotfallkontakt(neu) },
                    gespeichert: gespeichert
                )
            }
        } else {
            rollend {
                Fehlerzeile(
                    text: inhalt?.profil.fehler ?? "Deine Daten konnten nicht geladen werden.",
                    onErneut: erneut
                )
            }
        }
    }

    // MARK: - Einwilligungen

    @ViewBuilder private var einwilligungen: some View {
        if let f = inhalt?.merkmale.fehler {
            Fehlerzeile(text: f, onErneut: erneut)
        } else {
            Einwilligungen(merkmale: KontoLogik.merkmale(inhalt?.merkmale.wert ?? []), daten: daten, geaendert: geaendert)
        }
    }

    // MARK: - Bankverbindung & Mandat

    /// Nur zum Lesen - geaendert wird es ueber den Vorstand.
    @ViewBuilder private var bank: some View {
        if let f = inhalt?.mandat.fehler {
            Fehlerzeile(text: f, onErneut: erneut)
        } else if let m = inhalt?.mandat.wert ?? nil {
            VStack(spacing: 0) {
                ForEach(Array(KontoLogik.mandatZeilen(m).enumerated()), id: \.offset) { i, zeile in
                    if i > 0 { KontoLinie() }
                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        Text(zeile.0).leise()
                        Spacer(minLength: 12)
                        Text(zeile.1)
                            .font(Schrift.text(.halbfett, Tokens.Schrift.normal))
                            .foregroundStyle(Farbe.ink)
                            .multilineTextAlignment(.trailing)
                    }
                    .padding(.vertical, 12)
                    .padding(.horizontal, 16)
                    .accessibilityElement(children: .combine)
                }
            }
            .background(Farbe.surf2, in: RoundedRectangle(cornerRadius: Tokens.Radius.karte))
            Text("Die Bankverbindung ändert der Vorstand – schreib ihm, wenn sich etwas geändert hat.").leise()
        } else {
            Text("Es liegt noch kein SEPA-Mandat vor. Bitte wende dich an den Vorstand.")
                .font(Schrift.text(.normal, Tokens.Schrift.normal))
                .foregroundStyle(Farbe.ink)
        }
    }
}

// MARK: - Formular

/**
 * Felder untereinander, Speichern angeheftet darunter (U76). Ein Fehler mit
 * Feld steht am Feld, nicht noch einmal oben.
 */
private struct Stammdatenformular: View {
    struct Feld {
        let name: String
        let label: String
        var inhalt: UITextContentType?
        var tastatur: UIKeyboardType = .default
        var gross: TextInputAutocapitalization = .sentences
    }

    let titel: String
    let erklaerung: String
    let felder: [Feld]
    let werte: [String: String]
    let zu: () -> Void
    let speichern: ([String: String]) async -> Ergebnis
    let gespeichert: (String) -> Void

    @State private var entwurf: [String: String] = [:]
    @State private var fehlerFeld: String?
    @State private var meldung: Ergebnis?
    @State private var laeuft = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Tokens.Abstand.m) {
                BlattKopf(titel: titel, zu: zu)
                Text(erklaerung).leise().fixedSize(horizontal: false, vertical: true)
                if let meldung, fehlerFeld == nil {
                    KontoHinweis(text: meldung.meldung, ok: meldung.ok)
                }
                ForEach(felder, id: \.name) { f in
                    KontoFeld(
                        label: f.label,
                        text: Binding(
                            get: { entwurf[f.name] ?? "" },
                            set: {
                                if fehlerFeld == f.name { fehlerFeld = nil }
                                entwurf[f.name] = $0
                            }
                        ),
                        fehler: fehlerFeld == f.name ? meldung?.meldung : nil,
                        inhaltsTyp: f.inhalt,
                        tastatur: f.tastatur,
                        grossschreibung: f.gross
                    )
                }
            }
            .padding(Tokens.Abstand.rand)
        }
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom) {
            GelberKnopf(text: laeuft ? "Speichert…" : "Speichern", gesperrt: laeuft, aktion: absenden)
                .padding(.horizontal, Tokens.Abstand.rand)
                .padding(.vertical, Tokens.Abstand.s)
                .background(Farbe.bg)
        }
        // Der Entwurf startet beim gespeicherten Stand.
        .onAppear { entwurf = werte }
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

// MARK: - Einwilligungen

/**
 * Nur Merkmale, die das Mitglied selbst setzen darf. Ob es sie aendern darf,
 * entscheidet die Datenbank - darf_ich kommt fertig aus der RPC.
 */
private struct Einwilligungen: View {
    let merkmale: [Merkmal]
    let daten: Kontodaten
    let geaendert: () -> Void

    @State private var laeuft = false
    @State private var meldung: Ergebnis?
    @State private var texte: [String: String] = [:]

    var body: some View {
        VStack(alignment: .leading, spacing: Tokens.Abstand.s) {
            Text("Was du hier setzt, kannst du jederzeit wieder zurücknehmen.").leise()
            if let meldung {
                KontoHinweis(text: meldung.meldung, ok: meldung.ok)
            }
            ForEach(merkmale) { m in
                VStack(alignment: .leading, spacing: Tokens.Abstand.xs) {
                    Text(m.name).font(Schrift.text(.halbfett, Tokens.Schrift.normal)).foregroundStyle(Farbe.ink)
                    if !m.beschreibung.isEmpty {
                        Text(m.beschreibung).leise().fixedSize(horizontal: false, vertical: true)
                    }
                    bedienung(m).padding(.top, 4)
                }
                .padding(.top, Tokens.Abstand.m)
            }
        }
    }

    @ViewBuilder private func bedienung(_ m: Merkmal) -> some View {
        switch m.darstellung {
        case .nurLesen:
            Text(KontoLogik.nurLesenText(m)).leise()
        case .jaNein:
            KontoSegmente(beschriftung: m.name, optionen: [(true, "Ja"), (false, "Nein")], gewaehlt: m.gesetzt, gesperrt: laeuft) { ja in
                guard ja != m.gesetzt else { return }
                ausfuehren { ja ? await daten.setzeMerkmal(code: m.code, option: "true") : await daten.entferneMerkmal(code: m.code) }
            }
            if m.gesetzt, let seit = m.werte.first?.seit {
                Text("erteilt am \(KontoLogik.tagDatum(seit))").leise()
            }
        case .einzelwahl:
            KontoSegmente(
                beschriftung: m.name,
                optionen: m.optionen.map { ($0.value, $0.label ?? $0.value) },
                gewaehlt: m.werte.first?.option,
                untereinander: true,
                gesperrt: laeuft
            ) { wert in
                guard wert != m.werte.first?.option else { return }
                ausfuehren { await daten.setzeMerkmal(code: m.code, option: wert) }
            }
        case .liste:
            liste(m)
        case .eingabe:
            HStack(alignment: .bottom, spacing: Tokens.Abstand.s) {
                KontoFeld(
                    label: m.name,
                    text: Binding(get: { texte[m.code] ?? m.werte.first?.text ?? "" }, set: { texte[m.code] = $0 }),
                    tastatur: m.art == "number" ? .decimalPad : .default
                )
                Button {
                    let text = texte[m.code] ?? m.werte.first?.text ?? ""
                    ausfuehren { await daten.setzeMerkmal(code: m.code, text: text) }
                } label: {
                    Text("Speichern")
                        .font(Schrift.text(.fett, 15))
                        .foregroundStyle(Farbe.onBrand)
                        .padding(.horizontal, 16)
                        .frame(minHeight: 50)
                        .background(Farbe.blue, in: RoundedRectangle(cornerRadius: Tokens.Radius.knopf))
                }
                .buttonStyle(.plain)
                .disabled(laeuft)
                .opacity(laeuft ? 0.5 : 1)
            }
        }
    }

    private func liste(_ m: Merkmal) -> some View {
        let frei = m.optionen.filter { o in !m.werte.contains { $0.option == o.value } }
        return VStack(alignment: .leading, spacing: 6) {
            if !m.werte.isEmpty {
                Umbruch {
                    ForEach(Array(m.werte.enumerated()), id: \.offset) { _, w in
                        let label = w.label ?? w.text ?? ""
                        Button {
                            ausfuehren { await daten.entferneMerkmal(code: m.code, option: w.option) }
                        } label: {
                            HStack(spacing: 6) {
                                Text(label).font(Schrift.text(.halbfett, 14))
                                Image(systemName: "xmark").font(.system(size: 11, weight: .bold))
                            }
                            .foregroundStyle(Farbe.ink)
                            .padding(.horizontal, 12)
                            .frame(minHeight: 36)
                            .background(Farbe.surf2, in: Capsule())
                            .overlay(Capsule().strokeBorder(Farbe.line2, lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                        .disabled(laeuft)
                        .accessibilityLabel("\(label) entfernen")
                    }
                }
            }
            if !frei.isEmpty {
                Umbruch {
                    ForEach(frei, id: \.value) { o in
                        Button {
                            ausfuehren { await daten.setzeMerkmal(code: m.code, option: o.value) }
                        } label: {
                            Text("+ \(o.label ?? o.value)")
                                .font(Schrift.text(.halbfett, 14))
                                .foregroundStyle(Farbe.ink2)
                                .padding(.horizontal, 12)
                                .frame(minHeight: 36)
                                .overlay(Capsule().strokeBorder(Farbe.line2, lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                        .disabled(laeuft)
                        .accessibilityLabel("\(o.label ?? o.value) setzen")
                    }
                }
            }
        }
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

/// Marken nebeneinander mit Umbruch (flexWrap).
private struct Umbruch: Layout {
    var abstand: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let breite = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, zeile: CGFloat = 0, weiteste: CGFloat = 0
        for s in subviews {
            let g = s.sizeThatFits(.unspecified)
            if x > 0 && x + g.width > breite {
                y += zeile + abstand
                x = 0
                zeile = 0
            }
            x += g.width + abstand
            zeile = max(zeile, g.height)
            weiteste = max(weiteste, x - abstand)
        }
        return CGSize(width: min(weiteste, breite), height: y + zeile)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, zeile: CGFloat = 0
        for s in subviews {
            let g = s.sizeThatFits(.unspecified)
            if x > bounds.minX && x + g.width > bounds.maxX {
                y += zeile + abstand
                x = bounds.minX
                zeile = 0
            }
            s.place(at: CGPoint(x: x, y: y), proposal: .unspecified)
            x += g.width + abstand
            zeile = max(zeile, g.height)
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
        ScrollView {
            VStack(alignment: .leading, spacing: Tokens.Abstand.m) {
                BlattKopf(titel: "Passwort ändern", zu: zu)
                if let email = sitzung.client.auth.currentUser?.email {
                    Text("Für das Konto \(Text(email).font(Schrift.text(.fett, 15)))")
                        .font(Schrift.text(.normal, 15))
                        .foregroundStyle(Farbe.ink2)
                }
                Text(PasswortTexte.setzenUnterzeile).leise()
                AnmeldeFeld(beschriftung: "Neues Passwort", text: $passwort, passwort: true, inhaltsTyp: .newPassword)
                AnmeldeFeld(
                    beschriftung: "Noch einmal",
                    bedienName: "Passwort wiederholen",
                    text: $wiederholung,
                    passwort: true,
                    inhaltsTyp: .newPassword,
                    absenden: .go,
                    beimAbsenden: speichern
                )
                if let fehler {
                    KontoHinweis(text: fehler)
                }
            }
            .padding(Tokens.Abstand.rand)
        }
        .safeAreaInset(edge: .bottom) {
            GelberKnopf(text: laeuft ? "Wird gespeichert…" : "Speichern", gesperrt: laeuft, aktion: speichern)
                .padding(.horizontal, Tokens.Abstand.rand)
                .padding(.vertical, Tokens.Abstand.s)
                .background(Farbe.bg)
        }
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
 * Erklaerung, freiwillige Nachricht, dann eine Rueckfrage im Blatt selbst.
 * Rot als Schrift und Rahmen, nicht als Flaeche (U44).
 */
private struct KuendigungFormular: View {
    let daten: Kontodaten

    @State private var nachricht = ""
    @State private var rueckfrage = false
    @State private var laeuft = false
    @State private var meldung: Ergebnis?

    var body: some View {
        VStack(alignment: .leading, spacing: Tokens.Abstand.s) {
            ForEach(Kontoloeschung.erklaerung, id: \.self) { satz in
                Text(satz)
                    .font(Schrift.text(.normal, Tokens.Schrift.normal))
                    .foregroundStyle(Farbe.ink)
                    .lineSpacing(4)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let meldung {
                KontoHinweis(text: meldung.meldung, ok: meldung.ok)
            }
            if meldung?.ok != true {
                KontoFeld(
                    label: Kontoloeschung.nachrichtLabel,
                    text: Binding(
                        get: { nachricht },
                        set: { nachricht = $0.utf16.count > Kontoloeschung.nachrichtMax ? String($0.prefix(Kontoloeschung.nachrichtMax)) : $0 }
                    ),
                    mehrzeilig: true
                )
                .disabled(laeuft)
                .padding(.top, Tokens.Abstand.s)

                if rueckfrage {
                    Text(Kontoloeschung.bestaetigungFrage)
                        .font(Schrift.text(.fett, Tokens.Schrift.normal))
                        .foregroundStyle(Farbe.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, Tokens.Abstand.s)
                    LeiserKnopf(text: laeuft ? "Wird gesendet…" : Kontoloeschung.bestaetigen, rot: true, gesperrt: laeuft, aktion: senden)
                    LeiserKnopf(text: Kontoloeschung.abbrechen, gesperrt: laeuft) { rueckfrage = false }
                } else {
                    LeiserKnopf(text: Kontoloeschung.absenden, rot: true) {
                        meldung = nil
                        rueckfrage = true
                    }
                    .padding(.top, Tokens.Abstand.s)
                }
            }
        }
    }

    private func senden() {
        guard !laeuft else { return }
        laeuft = true
        Task {
            let r = await daten.beantrageKontoloeschung(nachricht)
            laeuft = false
            rueckfrage = false
            meldung = r
        }
    }
}
