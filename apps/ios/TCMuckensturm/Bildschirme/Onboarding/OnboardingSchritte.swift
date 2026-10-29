/**
 * Die Schritte des Onboardings (die Schritt-Komponenten in onboarding.tsx)
 *
 * Jeder Schritt haelt sein Formular selbst und ruft beim Weiter erst seine
 * RPC, dann `k.weiter`. Ein Fehler mit Feld steht rot am Feld; sobald man
 * dort tippt, verschwindet er (useFeldfehler).
 */

import SwiftUI

// MARK: - Passwort

struct SchrittPasswort: View {
    @Environment(Sitzung.self) private var sitzung
    let k: OnboardingKontext

    @State private var passwort = ""
    @State private var wiederholung = ""
    @State private var fehler: Profil.Fehler?

    var body: some View {
        if k.zustand.status[OnboardingSchrittKey.passwort.rawValue] == true {
            KontoHinweis(text: "Dein Passwort ist gesetzt.", ok: true)
            OnboardingAktionen(k: k, speichern: k.weiter)
        } else {
            AnmeldeFeld(beschriftung: "Passwort", text: feld("passwort", $passwort), passwort: true, inhaltsTyp: .newPassword)
            if fehler?.feld == "passwort", let fehler { KontoHinweis(text: fehler.meldung) }
            AnmeldeFeld(
                beschriftung: "Noch einmal",
                bedienName: "Passwort wiederholen",
                text: feld("wiederholung", $wiederholung),
                passwort: true,
                inhaltsTyp: .newPassword,
                absenden: .done
            )
            if fehler?.feld == "wiederholung", let fehler { KontoHinweis(text: fehler.meldung) }
            OnboardingAktionen(k: k, speichern: speichern)
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
        Gruppe(titel: "Person") {
            feld("first_name", "Vorname", inhalt: .givenName, gross: .words)
            feld("last_name", "Nachname", inhalt: .familyName, gross: .words)
            feld("title", "Titel", inhalt: .namePrefix)
            Geburtstag(text: wert("birthday"), fehler: fehlerText("birthday"))
        }
        VStack(alignment: .leading, spacing: 7) {
            Text("Geschlecht")
                .font(Schrift.text(.halbfett, Tokens.Schrift.klein, relativeTo: .footnote))
                .foregroundStyle(fehler?.feld == "gender" ? Farbe.red : Farbe.ink2)
            KontoSegmente(beschriftung: "Geschlecht", optionen: OnboardingLogik.geschlechter, gewaehlt: werte["gender"]) {
                wert("gender").wrappedValue = $0
            }
            if let f = fehlerText("gender") { KontoHinweis(text: f) }
        }
        Gruppe(titel: "Adresse") {
            feld("street", "Straße", inhalt: .streetAddressLine1, gross: .words)
            feld("postcode", "PLZ", inhalt: .postalCode, tastatur: .numberPad)
            feld("city", "Ort", inhalt: .addressCity, gross: .words)
        }
        Gruppe(titel: "Kontakt") {
            feld("phone", "Telefon", inhalt: .telephoneNumber, tastatur: .phonePad)
            feld("mobile", "Mobil", inhalt: .telephoneNumber, tastatur: .phonePad)
            Text("Telefon oder Mobil genügt.").leise()
            KontoFeld(label: "E-Mail", text: .constant(k.zustand.stammdaten.email ?? ""))
                .disabled(true)
                .opacity(0.7)
        }
        Text("Die E-Mail-Adresse ist dein Login. Ändern kann sie der Vorstand.").leise()
        OnboardingAktionen(k: k) {
            let r = await k.daten.speichereStammdaten(werte)
            fehler = r.feld.map { Profil.Fehler(feld: $0, meldung: r.meldung) }
            if !r.ok { return fehler == nil ? r : .erfolg("") }
            return await k.weiter()
        }
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
        _ name: String, _ label: String, inhalt: UITextContentType? = nil,
        tastatur: UIKeyboardType = .default, gross: TextInputAutocapitalization = .sentences
    ) -> some View {
        KontoFeld(label: label, text: wert(name), fehler: fehlerText(name), inhaltsTyp: inhalt, tastatur: tastatur, grossschreibung: gross)
    }
}

/// Abschnitt mit kleinem Titel (FormGruppe titel=…)
private struct Gruppe<Inhalt: View>: View {
    let titel: String
    @ViewBuilder let inhalt: Inhalt

    var body: some View {
        VStack(alignment: .leading, spacing: Tokens.Abstand.s) {
            Text(titel).kicker()
            inhalt
        }
        .padding(.top, Tokens.Abstand.s)
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
        VStack(alignment: .leading, spacing: 7) {
            HStack {
                Text("Geburtsdatum")
                    .font(Schrift.text(.halbfett, Tokens.Schrift.klein, relativeTo: .footnote))
                    .foregroundStyle(fehler != nil ? Farbe.red : Farbe.ink2)
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
                        .font(Schrift.text(.fett, 15))
                        .foregroundStyle(Farbe.blueInk)
                        .frame(minHeight: 44)
                }
            }
            if let fehler { KontoHinweis(text: fehler) }
        }
    }
}

// MARK: - Rechtliches

struct SchrittRechtliches: View {
    @Environment(Sitzung.self) private var sitzung
    let k: OnboardingKontext

    @State private var haken: [String: Bool] = [:]

    var body: some View {
        KontoGruppe {
            ForEach(Array(k.zustand.dokumente.enumerated()), id: \.element.code) { i, d in
                if i > 0 { KontoLinie() }
                VStack(alignment: .leading, spacing: 0) {
                    OnboardingSchalter(
                        label: OnboardingLogik.zustimmungstext(code: d.code, titel: d.title),
                        beschreibung: OnboardingLogik.fassung(d),
                        an: Binding(get: { haken[d.code] ?? (d.zugestimmtAm != nil) }, set: { haken[d.code] = $0 }),
                        gesperrt: d.zugestimmtAm != nil
                    )
                    // Dieselben Adressen wie im Web: /satzung, /beitragsordnung, /datenschutz.
                    if let link = sitzung.umgebung.webLink("/\(d.code)") {
                        Link(destination: link) {
                            Text("\(d.title) lesen ›")
                                .font(Schrift.text(.fett, 14))
                                .foregroundStyle(Farbe.blueInk)
                                .frame(minHeight: 32)
                        }
                        .padding(.horizontal, 16)
                        .padding(.bottom, 10)
                    }
                }
            }
        }
        OnboardingAktionen(k: k) {
            let dokumente = k.zustand.dokumente
            if dokumente.contains(where: { !(haken[$0.code] ?? ($0.zugestimmtAm != nil)) }) {
                return .fehler(OnboardingLogik.alleZustimmen)
            }
            let r = await k.daten.akzeptiereDokumente(dokumente.filter { $0.zugestimmtAm == nil }.map(\.code))
            return r.ok ? await k.weiter() : r
        }
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
        KontoFeld(label: "Name", text: feld("name", $name), fehler: fehlerText("name"), inhaltsTyp: .name, grossschreibung: .words)
        KontoFeld(label: "E-Mail", text: feld("email", $email), fehler: fehlerText("email"), inhaltsTyp: .emailAddress,
                  tastatur: .emailAddress, grossschreibung: .never)
        KontoFeld(label: "Telefon", text: feld("email", $telefon), inhaltsTyp: .telephoneNumber, tastatur: .phonePad)
        Text("E-Mail oder Telefon genügt.").leise()
        KontoGruppe {
            OnboardingSchalter(
                label: "Zustimmung zur Mitgliedschaft",
                beschreibung: "Die erziehungsberechtigte Person ist damit einverstanden, dass \(k.zustand.stammdaten.firstName ?? "") Mitglied im Verein ist.",
                an: $zustimmung
            )
        }
        OnboardingAktionen(k: k) {
            let r = await k.daten.speichereErziehungsberechtigte(name: name, email: email, telefon: telefon, zustimmung: zustimmung)
            fehler = r.feld.map { Profil.Fehler(feld: $0, meldung: r.meldung) }
            if !r.ok { return fehler == nil ? r : .erfolg("") }
            return await k.weiter()
        }
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
        KontoFeld(
            label: "Name",
            text: Binding(get: { name }, set: { fehler = nil; name = $0 }),
            fehler: fehler, inhaltsTyp: .name, grossschreibung: .words
        )
        KontoFeld(label: "Telefon", text: $telefon, inhaltsTyp: .telephoneNumber, tastatur: .phonePad)
        KontoFeld(label: "Verhältnis (etwa Mutter, Partner)", text: $verhaeltnis)
        OnboardingAktionen(k: k) {
            let r = await k.daten.speichereNotfallkontakt(name: name, telefon: telefon, verhaeltnis: verhaeltnis)
            if r.feld != nil { fehler = r.meldung; return .erfolg("") }
            return r.ok ? await k.weiter() : r
        }
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
            KontoHinweis(text: "Für dich liegt ein SEPA-Mandat vor (Mandatsreferenz \(m.referenz ?? "–")). Ändern kann es der Vorstand.", ok: true)
            OnboardingAktionen(k: k, weiterText: "Konto freischalten", speichern: k.weiter)
        } else if !m.moeglich {
            KontoHinweis(text: "Die Gläubigerdaten des Vereins fehlen noch, deshalb lässt sich das Mandat gerade nicht erteilen. Bitte wende dich an den Vorstand.")
            OnboardingAktionen(k: k, gesperrt: true, speichern: k.weiter)
        } else {
            Text(OnboardingLogik.mandatstext(m))
                .font(Schrift.text(.normal, 14))
                .foregroundStyle(Farbe.ink)
                .lineSpacing(3)
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16)
                .background(Farbe.surf2, in: RoundedRectangle(cornerRadius: Tokens.Radius.karte))
            KontoFeld(
                label: "Kontoinhaber",
                text: Binding(get: { kontoinhaber ?? m.kontoinhaberVorschlag ?? "" }, set: { kontoinhaber = $0 }),
                inhaltsTyp: .name,
                grossschreibung: .words
            )
            if k.zustand.minderjaehrig {
                Text("Bei Kindern ist der Kontoinhaber ein Elternteil.").leise()
            }
            KontoFeld(label: "IBAN", text: $iban, tastatur: .asciiCapable, grossschreibung: .characters)
            KontoGruppe {
                OnboardingSchalter(
                    label: "Ich erteile dieses Mandat",
                    beschreibung: "Als Kontoinhaber oder mit dessen Einverständnis.",
                    an: $bestaetigt
                )
            }
            OnboardingAktionen(k: k, weiterText: "Mandat erteilen") {
                let r = await k.daten.erteileMandat(
                    iban: iban, kontoinhaber: kontoinhaber ?? m.kontoinhaberVorschlag ?? "", bestaetigt: bestaetigt
                )
                return r.ok ? await k.weiter() : r
            }
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
        if merkmale.isEmpty {
            Text("Der Verein fragt gerade keine Einwilligungen ab.").leise()
        } else {
            KontoGruppe {
                ForEach(Array(merkmale.enumerated()), id: \.element.code) { i, m in
                    if i > 0 { KontoLinie() }
                    OnboardingSchalter(
                        label: m.name,
                        beschreibung: m.description,
                        an: Binding(get: { wahl[m.code] ?? m.gesetzt }, set: { wahl[m.code] = $0 })
                    )
                }
            }
        }
        OnboardingAktionen(k: k) {
            // Nur was sich geaendert hat; ein boolesches Merkmal ist "ja", sobald die Zeile existiert.
            let konto = Kontodaten(client: sitzung.client)
            for m in merkmale {
                let neu = wahl[m.code] ?? m.gesetzt
                if neu == m.gesetzt { continue }
                let r = neu ? await konto.setzeMerkmal(code: m.code, option: "true") : await konto.entferneMerkmal(code: m.code)
                if !r.ok { return r }
            }
            return await k.weiter()
        }
    }
}

// MARK: - Tennis

struct SchrittTennis: View {
    let k: OnboardingKontext

    @State private var lk = ""
    @State private var nuliga = ""
    @State private var interesse = false
    @State private var bereit = false

    var body: some View {
        KontoFeld(label: "LK (etwa 18,4)", text: $lk, tastatur: .numbersAndPunctuation)
        KontoFeld(label: "nuLiga-ID", text: $nuliga, grossschreibung: .never)
        KontoGruppe {
            OnboardingSchalter(label: "Interesse an einer Mannschaft", an: $interesse)
        }
        OnboardingAktionen(k: k) {
            let r = await k.daten.speichereTennis(lk: lk, nuligaId: nuliga, mannschaftInteresse: interesse)
            return r.ok ? await k.weiter() : r
        }
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
        VStack(alignment: .leading, spacing: 7) {
            Text("E-Mails zu deinen Buchungen")
                .font(Schrift.text(.halbfett, Tokens.Schrift.klein, relativeTo: .footnote))
                .foregroundStyle(Farbe.ink2)
            KontoSegmente(
                beschriftung: "E-Mails zu deinen Buchungen",
                optionen: OnboardingLogik.buchungsmails,
                gewaehlt: mails ?? OnboardingLogik.buchungsmail(gespeichert)
            ) { mails = $0 }
        }
        Text("In der App siehst du Änderungen an deinen Buchungen in jedem Fall.").leise()
        KontoGruppe {
            PushSchalter(beschreibung: "Das Gerät fragt einmal nach deiner Erlaubnis.")
        }
        OnboardingAktionen(k: k, weiterText: k.letzter ? "Fertig" : "Weiter") {
            let gewaehlt = mails ?? OnboardingLogik.buchungsmail(gespeichert)
            if OnboardingLogik.buchungsmailSpeichern(gewaehlt: gewaehlt, gespeichert: gespeichert) {
                let r = await Kontodaten(client: sitzung.client).setzeMerkmal(code: "booking_mail", option: gewaehlt)
                if !r.ok { return r }
            }
            return await k.weiter()
        }
    }
}
