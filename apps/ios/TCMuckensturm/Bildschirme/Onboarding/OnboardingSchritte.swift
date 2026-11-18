/**
 * Die Schritte des Onboardings (die Schritt-Komponenten in onboarding.tsx)
 *
 * Jeder Schritt haelt sein Formular selbst und ruft beim Weiter erst seine
 * RPC, dann `k.weiter`. Ein Fehler mit Feld steht rot am Feld; sobald man
 * dort tippt, verschwindet er (useFeldfehler). Jeder Schritt liefert
 * Sections fuer die gruppierte Liste des Rahmens; die Knoepfe legt er mit
 * `.fuss(...)` in die feste Leiste unten.
 */

import SwiftUI

/// Hinweis als eigene Zeile: gruen erledigt, sonst neutral oder rot.
private struct SchrittHinweis: View {
    let text: String
    var ok = false
    var warnung = false

    var body: some View {
        Section {
            Label(text, systemImage: ok ? "checkmark.circle.fill" : warnung ? "exclamationmark.triangle.fill" : "info.circle.fill")
                .foregroundStyle(ok ? Farbe.greenInk : warnung ? Farbe.redInk : Farbe.ink)
                .fixedSize(horizontal: false, vertical: true)
                .gruppenZeile()
        }
    }
}

/// Feldfehler als rote Zeile unter dem Feld.
private struct FeldFehler: View {
    let text: String

    var body: some View {
        Text(text).font(.footnote).foregroundStyle(Farbe.redInk).gruppenZeile()
    }
}

// MARK: - Passwort

struct SchrittPasswort: View {
    @Environment(Sitzung.self) private var sitzung
    let k: OnboardingKontext

    @State private var passwort = ""
    @State private var wiederholung = ""
    @State private var fehler: Profil.Fehler?

    var body: some View {
        if k.zustand.status[OnboardingSchrittKey.passwort.rawValue] == true {
            SchrittHinweis(text: "Dein Passwort ist gesetzt.", ok: true)
                .fuss(OnboardingAktionen(k: k, speichern: k.weiter))
        } else {
            Section {
                AnmeldeFeld(beschriftung: "Passwort", text: feld("passwort", $passwort), passwort: true, inhaltsTyp: .newPassword)
                if fehler?.feld == "passwort", let fehler { FeldFehler(text: fehler.meldung) }
                AnmeldeFeld(
                    beschriftung: "Noch einmal",
                    bedienName: "Passwort wiederholen",
                    text: feld("wiederholung", $wiederholung),
                    passwort: true,
                    inhaltsTyp: .newPassword,
                    absenden: .done
                )
                if fehler?.feld == "wiederholung", let fehler { FeldFehler(text: fehler.meldung) }
            } footer: {
                Text(PasswortTexte.setzenUnterzeile).foregroundStyle(Farbe.muted)
            }
            .fuss(OnboardingAktionen(k: k, speichern: speichern))
        }
    }

    private func feld(_ name: String, _ wert: Binding<String>) -> Binding<String> {
        Binding(get: { wert.wrappedValue }, set: {
            if fehler?.feld == name { fehler = nil }
            wert.wrappedValue = $0
        })
    }

    private func speichern() async -> Ergebnis {
        // Dieselben Regeln wie "Passwort festlegen".
        if let text = PasswortRegeln.pruefen(passwort: passwort, wiederholung: wiederholung) {
            fehler = .init(feld: text == PasswortTexte.zuKurz ? "passwort" : "wiederholung", meldung: text)
            return .erfolg("")
        }
        if let text = await sitzung.passwortSpeichern(passwort) {
            fehler = .init(feld: "passwort", meldung: text)
            return .erfolg("")
        }
        return await k.weiter()
    }
}

// MARK: - Stammdaten

struct SchrittStammdaten: View {
    let k: OnboardingKontext

    @State private var werte: [String: String] = [:]
    @State private var fehler: Profil.Fehler?

    var body: some View {
        Group {
            Section {
                feld("first_name", "Vorname", inhalt: .givenName, gross: .words)
                feld("last_name", "Nachname", inhalt: .familyName, gross: .words)
                feld("title", "Titel", platzhalter: "Optional", inhalt: .namePrefix)
                Geburtstag(text: wert("birthday"), fehler: fehlerText("birthday"))
                Picker("Geschlecht", selection: wert("gender")) {
                    ForEach(OnboardingLogik.geschlechter, id: \.wert) { g in Text(g.label).tag(g.wert) }
                }
                .pickerStyle(.segmented)
                .gruppenZeile()
                .accessibilityLabel("Geschlecht")
                if let f = fehlerText("gender") { FeldFehler(text: f) }
            } header: {
                GruppenKopf(titel: "Person")
            }
            Section {
                feld("street", "Straße", inhalt: .streetAddressLine1, gross: .words)
                feld("postcode", "PLZ", inhalt: .postalCode, tastatur: .numberPad)
                feld("city", "Ort", inhalt: .addressCity, gross: .words)
            } header: {
                GruppenKopf(titel: "Adresse")
            }
            Section {
                feld("phone", "Telefon", platzhalter: "Festnetz", inhalt: .telephoneNumber, tastatur: .phonePad)
                feld("mobile", "Mobil", inhalt: .telephoneNumber, tastatur: .phonePad)
                LabeledContent("E-Mail", value: k.zustand.stammdaten.email ?? "").gruppenZeile()
            } header: {
                GruppenKopf(titel: "Kontakt")
            } footer: {
                Text("Telefon oder Mobil genügt. Die E-Mail-Adresse ist dein Login; ändern kann sie der Vorstand.")
                    .foregroundStyle(Farbe.muted)
            }
        }
        .fuss(OnboardingAktionen(k: k) {
            let r = await k.daten.speichereStammdaten(werte)
            fehler = r.feld.map { Profil.Fehler(feld: $0, meldung: r.meldung) }
            if !r.ok { return fehler == nil ? r : .erfolg("") }
            return await k.weiter()
        })
        .onAppear { if werte.isEmpty { werte = OnboardingLogik.stammdatenWerte(k.zustand.stammdaten) } }
    }

    private func wert(_ name: String) -> Binding<String> {
        Binding(get: { werte[name] ?? "" }, set: {
            if fehler?.feld == name { fehler = nil }
            werte[name] = $0
        })
    }

    private func fehlerText(_ name: String) -> String? {
        fehler?.feld == name ? fehler?.meldung : nil
    }

    private func feld(
        _ name: String, _ label: String, platzhalter: String? = nil, inhalt: UITextContentType? = nil,
        tastatur: UIKeyboardType = .default, gross: TextInputAutocapitalization = .sentences
    ) -> some View {
        FormFeld(label: label, text: wert(name), platzhalter: platzhalter, fehler: fehlerText(name), inhaltsTyp: inhalt, tastatur: tastatur, gross: gross)
    }
}

/**
 * Das Geburtsdatum mit Datumswaehler (FormDatum, 1900 bis heute). Der Wert
 * bleibt TT.MM.JJJJ wie in der Expo-App; ohne Wert beginnt die Auswahl 1970.
 */
private struct Geburtstag: View {
    @Binding var text: String
    let fehler: String?

    private static let von = OnboardingLogik.datum(ausDeutsch: "01.01.1900") ?? .distantPast

    var body: some View {
        HStack {
            Text("Geburtsdatum").foregroundStyle(fehler != nil ? Farbe.redInk : Farbe.ink)
            Spacer()
            if let datum = OnboardingLogik.datum(ausDeutsch: text) {
                DatePicker(
                    "Geburtsdatum",
                    selection: Binding(get: { datum }, set: { text = OnboardingLogik.deutsch($0) }),
                    in: Self.von...Date(),
                    displayedComponents: .date
                )
                .labelsHidden()
                .environment(\.locale, Locale(identifier: "de_DE"))
                .environment(\.timeZone, Zeit.berlinZone)
            } else {
                Button("Datum wählen") { text = "01.01.1970" }
                    .buttonStyle(.borderless)
                    .tint(Farbe.blueInk)
            }
        }
        .gruppenZeile()
        if let fehler { FeldFehler(text: fehler) }
    }
}

// MARK: - Rechtliches

struct SchrittRechtliches: View {
    @Environment(Sitzung.self) private var sitzung
    let k: OnboardingKontext

    @State private var haken: [String: Bool] = [:]

    var body: some View {
        ForEach(k.zustand.dokumente, id: \.code) { d in
            Section {
                OnboardingSchalter(
                    label: OnboardingLogik.zustimmungstext(code: d.code, titel: d.title),
                    beschreibung: OnboardingLogik.fassung(d),
                    an: Binding(get: { haken[d.code] ?? (d.zugestimmtAm != nil) }, set: { haken[d.code] = $0 }),
                    gesperrt: d.zugestimmtAm != nil
                )
                // Dieselben Adressen wie im Web: /satzung, /beitragsordnung, /datenschutz.
                if let link = sitzung.umgebung.webLink("/\(d.code)") {
                    Link(destination: link) {
                        HStack {
                            Text("\(d.title) lesen").foregroundStyle(Farbe.blueInk)
                            Spacer()
                            Image(systemName: "arrow.up.right").font(.footnote.weight(.semibold)).foregroundStyle(Farbe.muted)
                        }
                    }
                    .gruppenZeile()
                }
            }
        }
        .fuss(OnboardingAktionen(k: k) {
            let dokumente = k.zustand.dokumente
            if dokumente.contains(where: { !(haken[$0.code] ?? ($0.zugestimmtAm != nil)) }) {
                return .fehler(OnboardingLogik.alleZustimmen)
            }
            let r = await k.daten.akzeptiereDokumente(dokumente.filter { $0.zugestimmtAm == nil }.map(\.code))
            return r.ok ? await k.weiter() : r
        })
    }
}

// MARK: - Erziehungsberechtigte

struct SchrittErziehungsberechtigte: View {
    let k: OnboardingKontext

    @State private var name = ""
    @State private var email = ""
    @State private var telefon = ""
    @State private var zustimmung = false
    @State private var fehler: Profil.Fehler?
    @State private var bereit = false

    var body: some View {
        Group {
            Section {
                FormFeld(label: "Name", text: feld("name", $name), fehler: fehlerText("name"), inhaltsTyp: .name, gross: .words)
                FormFeld(label: "E-Mail", text: feld("email", $email), fehler: fehlerText("email"), inhaltsTyp: .emailAddress,
                         tastatur: .emailAddress, gross: .never)
                FormFeld(label: "Telefon", text: feld("email", $telefon), inhaltsTyp: .telephoneNumber, tastatur: .phonePad)
            } footer: {
                Text("E-Mail oder Telefon genügt.").foregroundStyle(Farbe.muted)
            }
            Section {
                OnboardingSchalter(
                    label: "Zustimmung zur Mitgliedschaft",
                    beschreibung: "Die erziehungsberechtigte Person ist damit einverstanden, dass \(k.zustand.stammdaten.firstName ?? "") Mitglied im Verein ist.",
                    an: $zustimmung
                )
            }
        }
        .fuss(OnboardingAktionen(k: k) {
            let r = await k.daten.speichereErziehungsberechtigte(name: name, email: email, telefon: telefon, zustimmung: zustimmung)
            fehler = r.feld.map { Profil.Fehler(feld: $0, meldung: r.meldung) }
            if !r.ok { return fehler == nil ? r : .erfolg("") }
            return await k.weiter()
        })
        .onAppear {
            guard !bereit else { return }
            bereit = true
            let e = k.zustand.erziehungsberechtigte
            (name, email, telefon, zustimmung) = (e.name ?? "", e.email ?? "", e.phone ?? "", e.zustimmungAm != nil)
        }
    }

    private func feld(_ name: String, _ wert: Binding<String>) -> Binding<String> {
        Binding(get: { wert.wrappedValue }, set: {
            if fehler?.feld == name { fehler = nil }
            wert.wrappedValue = $0
        })
    }

    private func fehlerText(_ name: String) -> String? {
        fehler?.feld == name ? fehler?.meldung : nil
    }
}

// MARK: - Notfallkontakt

struct SchrittNotfallkontakt: View {
    let k: OnboardingKontext

    @State private var name = ""
    @State private var telefon = ""
    @State private var verhaeltnis = ""
    @State private var fehler: String?
    @State private var bereit = false

    var body: some View {
        Section {
            FormFeld(
                label: "Name",
                text: Binding(get: { name }, set: { fehler = nil; name = $0 }),
                fehler: fehler, inhaltsTyp: .name, gross: .words
            )
            FormFeld(label: "Telefon", text: $telefon, inhaltsTyp: .telephoneNumber, tastatur: .phonePad)
            FormFeld(label: "Verhältnis", text: $verhaeltnis, platzhalter: "etwa Mutter, Partner")
        }
        .fuss(OnboardingAktionen(k: k) {
            let r = await k.daten.speichereNotfallkontakt(name: name, telefon: telefon, verhaeltnis: verhaeltnis)
            if r.feld != nil { fehler = r.meldung; return .erfolg("") }
            return r.ok ? await k.weiter() : r
        })
        .onAppear {
            guard !bereit else { return }
            bereit = true
            (name, telefon, verhaeltnis) = OnboardingLogik.notfallVorbelegung(k.zustand)
        }
    }
}

// MARK: - SEPA

struct SchrittSepa: View {
    let k: OnboardingKontext

    @State private var kontoinhaber: String?
    @State private var iban = ""
    @State private var bestaetigt = false

    var body: some View {
        let m = k.zustand.mandat
        if m.vorhanden {
            SchrittHinweis(text: "Für dich liegt ein SEPA-Mandat vor (Mandatsreferenz \(m.referenz ?? "–")). Ändern kann es der Vorstand.", ok: true)
                .fuss(OnboardingAktionen(k: k, weiterText: "Konto freischalten", speichern: k.weiter))
        } else if !m.moeglich {
            SchrittHinweis(
                text: "Die Gläubigerdaten des Vereins fehlen noch, deshalb lässt sich das Mandat gerade nicht erteilen. Bitte wende dich an den Vorstand.",
                warnung: true
            )
            .fuss(OnboardingAktionen(k: k, gesperrt: true, speichern: k.weiter))
        } else {
            // Erst die Angaben, dann der Mandatstext, darunter die Zustimmung.
            Group {
                Section {
                    FormFeld(
                        label: "Kontoinhaber",
                        text: Binding(get: { kontoinhaber ?? m.kontoinhaberVorschlag ?? "" }, set: { kontoinhaber = $0 }),
                        inhaltsTyp: .name,
                        gross: .words
                    )
                    FormFeld(label: "IBAN", text: $iban, platzhalter: "DE…", tastatur: .asciiCapable, gross: .characters)
                } footer: {
                    if k.zustand.minderjaehrig {
                        Text("Bei Kindern ist der Kontoinhaber ein Elternteil.").foregroundStyle(Farbe.muted)
                    }
                }
                Section {
                    Text(OnboardingLogik.mandatstext(m))
                        .font(.footnote)
                        .foregroundStyle(Farbe.ink2)
                        .textSelection(.enabled)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.vertical, 4)
                        .gruppenZeile()
                    // Zustimmung als Haken vor dem Satz
                    Button { bestaetigt.toggle() } label: {
                        HStack(spacing: 12) {
                            Image(systemName: bestaetigt ? "checkmark.circle.fill" : "circle")
                                .font(.title2)
                                .foregroundStyle(bestaetigt ? Farbe.blue : Farbe.line2)
                                .accessibilityHidden(true)
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Ich erteile dieses Mandat").foregroundStyle(Farbe.ink)
                                Text("Als Kontoinhaber oder mit dessen Einverständnis.").font(.footnote).foregroundStyle(Farbe.muted)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .gruppenZeile()
                    .sensoryFeedback(.selection, trigger: bestaetigt)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("Ich erteile dieses Mandat. Als Kontoinhaber oder mit dessen Einverständnis.")
                    .accessibilityAddTraits(bestaetigt ? [.isButton, .isSelected] : .isButton)
                } header: {
                    GruppenKopf(titel: "Mandat")
                }
            }
            .fuss(OnboardingAktionen(k: k, weiterText: "Mandat erteilen") {
                let r = await k.daten.erteileMandat(
                    iban: iban, kontoinhaber: kontoinhaber ?? m.kontoinhaberVorschlag ?? "", bestaetigt: bestaetigt
                )
                return r.ok ? await k.weiter() : r
            })
        }
    }
}

// MARK: - Einwilligungen

struct SchrittEinwilligungen: View {
    @Environment(Sitzung.self) private var sitzung
    let k: OnboardingKontext

    @State private var wahl: [String: Bool] = [:]

    var body: some View {
        let merkmale = k.zustand.merkmale
        Section {
            if merkmale.isEmpty {
                Text("Der Verein fragt gerade keine Einwilligungen ab.").foregroundStyle(Farbe.muted).gruppenZeile()
            }
            ForEach(merkmale, id: \.code) { m in
                OnboardingSchalter(
                    label: m.name,
                    beschreibung: m.description,
                    an: Binding(get: { wahl[m.code] ?? m.gesetzt }, set: { wahl[m.code] = $0 })
                )
            }
        }
        .fuss(OnboardingAktionen(k: k) {
            // Nur was sich geaendert hat; ein boolesches Merkmal ist "ja", sobald die Zeile existiert.
            let konto = Kontodaten(client: sitzung.client)
            for m in merkmale {
                let neu = wahl[m.code] ?? m.gesetzt
                if neu == m.gesetzt { continue }
                let r = neu ? await konto.setzeMerkmal(code: m.code, option: "true") : await konto.entferneMerkmal(code: m.code)
                if !r.ok { return r }
            }
            return await k.weiter()
        })
    }
}

// MARK: - Tennis

struct SchrittTennis: View {
    let k: OnboardingKontext

    @State private var lk = ""
    @State private var nuliga = ""
    @State private var interesse = false
    @State private var bereit = false
    /// Erst nach dem ersten Speichern pruefen - nicht schon beim Tippen meckern.
    @State private var geprueft = false

    var body: some View {
        Group {
            Section {
                FormFeld(
                    label: "LK", text: $lk, platzhalter: "etwa 18,5", fehler: geprueft ? LkEingabe.fehler(lk) : nil,
                    tastatur: .numbersAndPunctuation, gross: .characters, bedienName: LkEingabe.beschriftung
                )
                FormFeld(label: "nuLiga-ID", text: $nuliga, platzhalter: "Optional", gross: .never)
            } footer: {
                Text(LkEingabe.hinweis).foregroundStyle(Farbe.muted)
            }
            Section {
                OnboardingSchalter(label: "Interesse an einer Mannschaft", an: $interesse)
            }
        }
        .fuss(OnboardingAktionen(k: k) {
            geprueft = true
            let r = await k.daten.speichereTennis(lk: lk, nuligaId: nuliga, mannschaftInteresse: interesse)
            return r.ok ? await k.weiter() : r
        })
        .onAppear {
            guard !bereit else { return }
            bereit = true
            let t = k.zustand.tennis
            (lk, nuliga, interesse) = (t.tennisLk ?? "", t.nuligaId ?? "", t.mannschaftInteresse)
        }
    }
}

// MARK: - App-Einstellungen

struct SchrittEinstellungen: View {
    @Environment(Sitzung.self) private var sitzung
    let k: OnboardingKontext

    @State private var mails: String?

    var body: some View {
        let gespeichert = k.zustand.einstellungen.bookingMail
        let gewaehlt = mails ?? OnboardingLogik.buchungsmail(gespeichert)
        Group {
            Section {
                ForEach(OnboardingLogik.buchungsmails, id: \.wert) { o in
                    let aktiv = o.wert == gewaehlt
                    Button { mails = o.wert } label: {
                        HStack {
                            Text(o.label).foregroundStyle(Farbe.ink)
                            Spacer()
                            if aktiv {
                                Image(systemName: "checkmark").font(.body.weight(.semibold)).foregroundStyle(Farbe.blue)
                            }
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .gruppenZeile()
                    .accessibilityAddTraits(aktiv ? .isSelected : [])
                }
            } header: {
                GruppenKopf(titel: "E-Mails zu deinen Buchungen")
            } footer: {
                Text("In der App siehst du Änderungen an deinen Buchungen in jedem Fall.").foregroundStyle(Farbe.muted)
            }
            .sensoryFeedback(.selection, trigger: mails)
            Section {
                PushSchalter(symbol: "bell.badge.fill", beschreibung: "Das Gerät fragt einmal nach deiner Erlaubnis.", inListe: true)
                    .gruppenZeile()
            }
        }
        .fuss(OnboardingAktionen(k: k, weiterText: k.letzter ? "Fertig" : "Weiter") {
            let gewaehlt = mails ?? OnboardingLogik.buchungsmail(gespeichert)
            if OnboardingLogik.buchungsmailSpeichern(gewaehlt: gewaehlt, gespeichert: gespeichert) {
                let r = await Kontodaten(client: sitzung.client).setzeMerkmal(code: "booking_mail", option: gewaehlt)
                if !r.ok { return r }
            }
            return await k.weiter()
        })
    }
}
