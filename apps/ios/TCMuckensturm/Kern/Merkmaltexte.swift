/**
 * Forderungsarten und Beschreibungen der Einwilligungen
 *
 * Portierung von CHARGE_KIND_LABEL (packages/core/src/forderungen.ts) und
 * merkmalBeschreibung (packages/core/src/merkmaltexte.ts), geprueft gegen
 * die Golden Files CHARGE_KIND_LABEL.json und merkmalBeschreibung.json.
 */

enum Forderungen {
    /// In der Reihenfolge von CHARGE_KINDS.
    static let arten: [(String, String)] = [
        ("fee", "Beitrag"),
        ("drinks", "Getränke"),
        ("work_duty", "Arbeitsdienst"),
        ("event", "Veranstaltung"),
        ("guest", "Gastgebühr"),
        ("deposit", "Pfand"),
        ("misc", "Sonstiges"),
    ]

    /// Unbekannte Arten zeigt die App mit ihrem Code (wie `?? f.kind` in konto.tsx).
    static func chargeKindLabel(_ kind: String) -> String? {
        arten.first { $0.0 == kind }?.1
    }
}

enum Merkmaltexte {
    enum Sicht: String, Decodable, Sendable {
        case mitglied, verwaltung
    }

    /// Die Ausgangstexte aus Seed und Migration, an denen ein Ersatz haengt.
    static let ausgang: [String: String] = [
        "foto":
            "Darf die Person auf Fotos der Website, in Aushängen und in der Presse erscheinen? "
            + "Bei Minderjährigen erteilen die Erziehungsberechtigten die Einwilligung.",
        "mannschaft_interesse": "Die Person möchte in einer Mannschaft spielen. Der Sportwart meldet sich.",
        "booking_mail":
            "Ob Änderungen an deinen Platzbuchungen zusätzlich per E-Mail kommen. "
            + "In der App siehst du sie in jedem Fall.",
    ]

    static let ersatz: [String: [Sicht: String]] = [
        "foto": [
            .mitglied:
                "Dürfen wir dich auf Fotos der Website, in Aushängen und in der Presse zeigen? "
                + "Bei Minderjährigen willigen die Erziehungsberechtigten ein.",
        ],
        "mannschaft_interesse": [
            .mitglied: "Du möchtest in einer Mannschaft spielen. Der Sportwart meldet sich bei dir.",
        ],
        "booking_mail": [
            .verwaltung:
                "Ob Änderungen an den Platzbuchungen des Mitglieds zusätzlich per E-Mail kommen. "
                + "In der App sieht es sie in jedem Fall.",
        ],
    ]

    /// Die Beschreibung eines Merkmals in der Anrede der Sicht (U71).
    static func merkmalBeschreibung(code: String, beschreibung: String, sicht: Sicht) -> String {
        // Alte Datenbestaende tragen den Text noch ohne Umlaute (vor 20261022120000).
        func gleich(_ a: String, _ b: String) -> Bool {
            let t = Profil.trim(a)
            return t == b || t == ohneUmlaute(b)
        }
        if let neu = ersatz[code]?[sicht], let alt = ausgang[code], gleich(beschreibung, alt) { return neu }
        return beschreibung
    }

    static func ohneUmlaute(_ s: String) -> String {
        var t = s
        for (von, nach) in [("ä", "ae"), ("ö", "oe"), ("ü", "ue"), ("Ä", "Ae"), ("Ö", "Oe"), ("Ü", "Ue"), ("ß", "ss")] {
            t = t.replacingOccurrences(of: von, with: nach)
        }
        return t
    }
}
