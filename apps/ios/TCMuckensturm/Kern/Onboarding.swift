/**
 * Onboarding nach dem ersten Login
 *
 * Portierung aus packages/core/src/onboarding.ts und iban.ts. Die Datenbank
 * ist die Quelle der Wahrheit: my_onboarding() liefert, welcher Schritt
 * erledigt ist, und complete_onboarding() prueft die Pflichtschritte noch
 * einmal selbst. Hier stehen Reihenfolge, Bezeichnungen und welche Schritte
 * Pflicht sind, damit Web und App denselben Assistenten zeigen.
 */

import Foundation

enum OnboardingSchrittKey: String, CaseIterable, Sendable, Decodable {
    case passwort, stammdaten, rechtliches, erziehungsberechtigte, notfallkontakt, sepa
    case einwilligungen, tennis, einstellungen
}

struct OnboardingSchritt: Equatable, Sendable {
    let key: OnboardingSchrittKey
    let titel: String
    let pflicht: Bool
    let erledigt: Bool
}

enum Onboarding {
    static let titel: [OnboardingSchrittKey: String] = [
        .passwort: "Passwort",
        .stammdaten: "Deine Daten",
        .rechtliches: "Satzung und Datenschutz",
        .erziehungsberechtigte: "Erziehungsberechtigte",
        .notfallkontakt: "Notfallkontakt",
        .sepa: "SEPA-Lastschriftmandat",
        .einwilligungen: "Einwilligungen",
        .tennis: "Tennis",
        .einstellungen: "App-Einstellungen",
    ]

    /// Mit diesem Schritt ist das Konto freigeschaltet; danach ist alles optional.
    static let letzterPflichtschritt = OnboardingSchrittKey.sepa

    /// Was complete_onboarding() in den details als fehlend nennen kann.
    static let pflichtKeys: [OnboardingSchrittKey] = [
        .passwort, .stammdaten, .rechtliches, .erziehungsberechtigte, .notfallkontakt, .sepa,
    ]

    /**
     * Die Schritte in Reihenfolge (onboardingSchritte). Erziehungsberechtigte
     * gibt es nur bei Minderjaehrigen; dort ist auch der Notfallkontakt Pflicht.
     */
    static func schritte(minderjaehrig: Bool, status: [String: Bool]) -> [OnboardingSchritt] {
        OnboardingSchrittKey.allCases
            .filter { minderjaehrig || $0 != .erziehungsberechtigte }
            .map { key in
                OnboardingSchritt(
                    key: key,
                    titel: titel[key] ?? key.rawValue,
                    pflicht: [.passwort, .stammdaten, .rechtliches, .sepa].contains(key)
                        || (minderjaehrig && (key == .erziehungsberechtigte || key == .notfallkontakt)),
                    erledigt: status[key.rawValue] == true
                )
            }
    }

    /// Der erste offene Pflichtschritt, oder nil, wenn alles Pflichtige erledigt ist.
    static func naechsterPflichtschritt(minderjaehrig: Bool, status: [String: Bool]) -> OnboardingSchrittKey? {
        schritte(minderjaehrig: minderjaehrig, status: status).first { $0.pflicht && !$0.erledigt }?.key
    }

    /**
     * Der Text des SEPA-Basislastschriftmandats. Wortgleich mit
     * private.sepa_mandatstext in der Datenbank, die ihn beim Erteilen als
     * Nachweis speichert.
     */
    static func mandatstext(glaeubigerName: String, glaeubigerId: String, referenz: String) -> String {
        [
            "SEPA-Lastschriftmandat (SEPA-Basislastschrift)",
            "",
            "Zahlungsempfänger: \(glaeubigerName)",
            "Gläubiger-Identifikationsnummer: \(glaeubigerId)",
            "Mandatsreferenz: \(referenz)",
            "Zahlungsart: Wiederkehrende Zahlungen",
            "",
            "Ich ermächtige \(glaeubigerName), Zahlungen von meinem Konto mittels Lastschrift einzuziehen. "
                + "Zugleich weise ich mein Kreditinstitut an, die von \(glaeubigerName) auf mein Konto gezogenen Lastschriften einzulösen.",
            "",
            "Hinweis: Ich kann innerhalb von acht Wochen, beginnend mit dem Belastungsdatum, "
                + "die Erstattung des belasteten Betrages verlangen. Es gelten dabei die mit "
                + "meinem Kreditinstitut vereinbarten Bedingungen.",
        ].joined(separator: "\n")
    }
}

/**
 * IBAN nach ISO 13616 (iban.ts). Dieselbe Pruefung gibt es als
 * Datenbankfunktion; hier nur, damit die Maske sofort reagiert.
 */
enum Iban {
    /// Laenge je Land. Unvollstaendig, deckt aber ab, was im Verein vorkommt.
    static let laengen: [String: Int] = [
        "DE": 22, "AT": 20, "CH": 21, "FR": 27, "IT": 27, "NL": 18, "BE": 16,
        "ES": 24, "LU": 20, "DK": 18, "PL": 28, "CZ": 24, "GB": 22, "SE": 24,
    ]

    static func normalisiert(_ eingabe: String) -> String {
        eingabe.filter { !$0.isWhitespace && $0 != "-" }.uppercased()
    }

    static func istGueltig(_ eingabe: String?) -> Bool {
        guard let eingabe, !eingabe.isEmpty else { return false }
        let iban = normalisiert(eingabe)
        guard iban.range(of: "^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$", options: .regularExpression) != nil else { return false }
        if let laenge = laengen[String(iban.prefix(2))], iban.count != laenge { return false }

        // Modulo 97 stueckweise, Buchstaben zu Zahlen (A = 10 … Z = 35).
        var rest = 0
        for zeichen in iban.dropFirst(4) + iban.prefix(4) {
            guard let wert = zeichen.wholeNumberValue ?? buchstabe(zeichen) else { return false }
            for ziffer in String(wert) {
                rest = (rest * 10 + (ziffer.wholeNumberValue ?? 0)) % 97
            }
        }
        return rest == 1
    }

    private static func buchstabe(_ z: Character) -> Int? {
        guard let a = z.asciiValue, a >= 65, a <= 90 else { return nil }
        return Int(a) - 55
    }
}
