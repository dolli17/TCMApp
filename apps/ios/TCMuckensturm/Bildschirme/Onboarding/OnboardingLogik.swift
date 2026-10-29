/**
 * Ansichtslogik des Onboardings als reine Funktionen
 *
 * Texte wortgleich aus apps/mobile/app/onboarding.tsx, die Pruefungen aus
 * apps/mobile/src/lib/daten.ts (pruefeOnboardingStammdaten,
 * speichereErziehungsberechtigte) und die Datumswandlung aus
 * src/lib/verwaltung/gemeinsam.ts (isoZuDeutsch, deutschZuIso).
 */

import Foundation

enum OnboardingLogik {
    static let kicker = "Konto einrichten"
    static let freigeschaltet = "Dein Konto ist freigeschaltet. Die nächsten Schritte sind freiwillig."

    /// Was unter dem Titel steht - je Schritt ein Satz, warum es ihn gibt.
    static func einleitung(_ key: OnboardingSchrittKey, minderjaehrig: Bool) -> String {
        switch key {
        case .passwort:
            "Lege ein Passwort für dein Konto fest."
        case .stammdaten:
            "Bitte prüfe deine Angaben und korrigiere, was nicht stimmt. Geburtsdatum und Geschlecht kannst du nur jetzt selbst ändern, später über den Vorstand."
        case .rechtliches:
            "Satzung und Beitragsordnung gelten für alle Mitglieder. Wir speichern, welcher Fassung du wann zugestimmt hast."
        case .erziehungsberechtigte:
            "Du bist noch nicht volljährig. Deshalb brauchen wir die Angaben einer erziehungsberechtigten Person und ihre Zustimmung zur Mitgliedschaft."
        case .notfallkontakt:
            minderjaehrig
                ? "Wen sollen wir anrufen, wenn auf der Anlage etwas passiert? Bei Minderjährigen ist das Pflicht; vorbelegt sind die Erziehungsberechtigten."
                : "Wen sollen wir anrufen, wenn auf der Anlage etwas passiert? Freiwillig – du kannst den Schritt überspringen."
        case .sepa:
            "Der Verein zieht Beiträge per Lastschrift ein. Mit dem Mandat ist dein Konto freigeschaltet."
        case .einwilligungen:
            "Freiwillig. Nichts ist vorausgewählt, und du kannst alles später im Konto ändern."
        case .tennis:
            "Freiwillig. Das hilft bei der Planung der Mannschaften."
        case .einstellungen:
            "Freiwillig. Wie wir dich über deine Buchungen informieren – auch das kannst du später im Konto ändern."
        }
    }

    static func kopfKicker(index: Int, anzahl: Int) -> String {
        "\(kicker) · Schritt \(index + 1) von \(anzahl)"
    }

    enum Fortschritt: Equatable, Sendable { case erledigt, jetzt, offen }

    static func fortschritt(_ schritte: [OnboardingSchritt], index: Int) -> [Fortschritt] {
        schritte.enumerated().map { i, s in i == index ? .jetzt : s.erledigt ? .erledigt : .offen }
    }

    /**
     * Wo der Assistent steht: der gewaehlte Schritt, sonst der erste offene
     * Pflichtschritt, sonst das Mandat. Faellt der gewaehlte weg (etwa die
     * Erziehungsberechtigten nach einem neuen Geburtsdatum), der erste.
     */
    static func aktuell(gewaehlt: OnboardingSchrittKey?, zustand: OnboardingZustand) -> (key: OnboardingSchrittKey, index: Int) {
        let key = gewaehlt ?? zustand.naechsterPflichtschritt ?? Onboarding.letzterPflichtschritt
        let schritte = zustand.schritte
        let index = max(0, schritte.firstIndex { $0.key == key } ?? 0)
        return (schritte[index].key, index)
    }

    /// Nach der Freischaltung fuehrt kein Weg zurueck in die Pflicht: die RPCs dort lehnen dann ab.
    static func ersterErreichbarer(_ schritte: [OnboardingSchritt], freigeschaltet: Bool) -> Int {
        guard freigeschaltet, let sepa = schritte.firstIndex(where: { $0.key == Onboarding.letzterPflichtschritt }) else { return 0 }
        return sepa + 1
    }

    /// Die fehlenden Schritte aus dem DETAIL von complete_onboarding ("stammdaten, sepa").
    static func fehlendeSchritte(_ details: String?) -> [OnboardingSchrittKey] {
        (details ?? "")
            .split(separator: ",")
            .compactMap { OnboardingSchrittKey(rawValue: $0.trimmingCharacters(in: .whitespaces)) }
            .filter { Onboarding.pflichtKeys.contains($0) }
    }

    // MARK: - Rechtliches

    /// Satzung und Beitragsordnung werden akzeptiert, die Datenschutzerklaerung zur Kenntnis genommen.
    static func zustimmungstext(code: String, titel: String) -> String {
        code == "datenschutz" ? "Ich habe die \(titel) zur Kenntnis genommen." : "Ich akzeptiere die \(titel)."
    }

    static func fassung(_ d: OnboardingZustand.Dokument) -> String {
        let version = d.version.map(String.init) ?? "–"
        return "Fassung \(version) vom \(isoZuDeutsch(d.validFrom))\(d.zugestimmtAm != nil ? " · bereits zugestimmt" : "")"
    }

    static let alleZustimmen = "Bitte stimme allen drei Texten zu."

    // MARK: - Stammdaten

    static let geschlechter: [(wert: String, label: String)] = [
        ("female", "weiblich"), ("male", "männlich"), ("diverse", "divers"),
    ]

    /// Die Werte fuer das Formular, Schluessel = Spaltenname; das Geburtsdatum als TT.MM.JJJJ.
    static func stammdatenWerte(_ s: OnboardingZustand.Stammdaten) -> [String: String] {
        [
            "first_name": s.firstName ?? "", "last_name": s.lastName ?? "", "title": s.title ?? "",
            "birthday": isoZuDeutsch(s.birthday), "gender": s.gender ?? "",
            "street": s.street ?? "", "postcode": s.postcode ?? "", "city": s.city ?? "",
            "phone": s.phone ?? "", "mobile": s.mobile ?? "",
        ]
    }

    enum Pruefung: Equatable, Sendable {
        /// Mit dem Geburtsdatum als JJJJ-MM-TT
        case ok(String)
        case fehler(Profil.Fehler)
    }

    /**
     * Dieselben Pflichten wie onboarding_save_stammdaten, aber mit dem Feld,
     * das fehlt. Die Datenbank meldet nur "Pflichtangaben fehlen: …".
     */
    static func pruefeStammdaten(_ w: [String: String], heute: String = Zeit.berlinDay(Date())) -> Pruefung {
        let leer = { (feld: String) in Profil.trim(w[feld] ?? "").isEmpty }
        let fehlt = { (feld: String, meldung: String) in Pruefung.fehler(.init(feld: feld, meldung: meldung)) }
        if leer("first_name") { return fehlt("first_name", "Vorname fehlt.") }
        if leer("last_name") { return fehlt("last_name", "Nachname fehlt.") }

        guard let geburtstag = deutschZuIso(w["birthday"] ?? "") else {
            return fehlt("birthday", "Bitte das Geburtsdatum als TT.MM.JJJJ angeben.")
        }
        // deutschZuIso liest "85" als 2085 - bei einem Geburtsdatum nie gemeint.
        if geburtstag > heute {
            return fehlt("birthday", "Das Geburtsdatum liegt in der Zukunft. Bitte das Jahr vierstellig angeben.")
        }
        if geburtstag < "1900-01-01" { return fehlt("birthday", "Bitte ein gültiges Geburtsdatum angeben.") }
        if leer("gender") { return fehlt("gender", "Bitte das Geschlecht wählen.") }

        if leer("street") { return fehlt("street", "Straße fehlt.") }
        if leer("postcode") { return fehlt("postcode", "Postleitzahl fehlt.") }
        if leer("city") { return fehlt("city", "Ort fehlt.") }
        if leer("phone") && leer("mobile") { return fehlt("phone", "Bitte Telefon oder Mobil angeben.") }
        return .ok(geburtstag)
    }

    static func pruefeErziehungsberechtigte(name: String, email: String, telefon: String) -> Profil.Fehler? {
        if Profil.trim(name).isEmpty { return .init(feld: "name", meldung: "Bitte den Namen angeben.") }
        if Profil.trim(email).isEmpty && Profil.trim(telefon).isEmpty {
            return .init(feld: "email", meldung: "Bitte E-Mail oder Telefon angeben.")
        }
        return nil
    }

    // MARK: - Notfallkontakt

    /// Bei Minderjaehrigen mit den Erziehungsberechtigten vorbelegt, solange noch nichts eingetragen ist.
    static func notfallVorbelegung(_ z: OnboardingZustand) -> (name: String, telefon: String, verhaeltnis: String) {
        let n = z.notfallkontakt
        let e = z.erziehungsberechtigte
        let vorbelegen = z.minderjaehrig && (n.name ?? "").isEmpty && (n.phone ?? "").isEmpty
        guard vorbelegen else { return (n.name ?? "", n.phone ?? "", n.relation ?? "") }
        let hatName = !(e.name ?? "").isEmpty
        return (e.name ?? "", e.phone ?? "", hatName ? "Erziehungsberechtigte" : (n.relation ?? ""))
    }

    // MARK: - Mandat

    static func mandatstext(_ m: OnboardingZustand.Mandat) -> String {
        m.text ?? Onboarding.mandatstext(
            glaeubigerName: m.glaeubigerName ?? "", glaeubigerId: m.glaeubigerId ?? "", referenz: m.referenz ?? ""
        )
    }

    // MARK: - Einstellungen

    /**
     * Die Werte von booking_mail. Sie stehen in member_attribute_options;
     * ohne Wert gilt "Nur Wichtiges".
     */
    static let buchungsmails: [(wert: String, label: String)] = [
        ("alle", "Alle"), ("wichtige", "Nur Wichtiges"), ("keine", "Keine"),
    ]

    static func buchungsmail(_ gespeichert: String?) -> String {
        buchungsmails.contains { $0.wert == gespeichert } ? gespeichert! : "wichtige"
    }

    /// Gespeichert wird, wenn sich etwas geaendert hat oder noch gar nichts gesetzt ist.
    static func buchungsmailSpeichern(gewaehlt: String, gespeichert: String?) -> Bool {
        gespeichert == nil || gewaehlt != buchungsmail(gespeichert)
    }

    // MARK: - Datum

    /// 2026-09-29 -> 29.09.2026; ohne Wert leer.
    static func isoZuDeutsch(_ iso: String?) -> String {
        guard let iso, !iso.isEmpty else { return "" }
        let teile = iso.prefix(10).split(separator: "-", omittingEmptySubsequences: false)
        guard teile.count == 3, teile.allSatisfy({ !$0.isEmpty }) else { return iso }
        return "\(teile[2]).\(teile[1]).\(teile[0])"
    }

    /// 29.09.2026 (auch 29.9.26) -> 2026-09-29. Ungueltiges gibt nil.
    static func deutschZuIso(_ text: String) -> String? {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.range(of: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$", options: .regularExpression) != nil { return t }
        guard t.range(of: "^[0-9]{1,2}\\.[0-9]{1,2}\\.([0-9]{2}|[0-9]{4})$", options: .regularExpression) != nil else { return nil }
        let teile = t.split(separator: ".").compactMap { Int($0) }
        guard teile.count == 3 else { return nil }
        let jahrText = t.split(separator: ".")[2]
        let jahr = jahrText.count == 2 ? 2000 + teile[2] : teile[2]
        let (tag, monat) = (teile[0], teile[1])
        let k = DateComponents(year: jahr, month: monat, day: tag)
        guard let d = Zeit.utc.date(from: k) else { return nil }
        let z = Zeit.utc.dateComponents([.year, .month, .day], from: d)
        guard z.month == monat, z.day == tag else { return nil }
        return String(format: "%04d-%02d-%02d", jahr, monat, tag)
    }

    /// Fuer den Datumswaehler: TT.MM.JJJJ <-> Tag in Berlin.
    static func datum(ausDeutsch text: String) -> Date? {
        guard let iso = deutschZuIso(text) else { return nil }
        let teile = iso.split(separator: "-").compactMap { Int($0) }
        let k = DateComponents(year: teile[0], month: teile[1], day: teile[2], hour: 12)
        return Zeit.berlin.date(from: k)
    }

    static func deutsch(_ datum: Date) -> String {
        isoZuDeutsch(Zeit.berlinDay(datum))
    }
}
