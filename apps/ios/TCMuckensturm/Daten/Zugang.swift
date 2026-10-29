/**
 * Kein Zugang mehr (B22)
 *
 * Entspricht packages/core/src/zugang.ts (Texte wortgleich). Archivierte,
 * gesperrte und ausgetretene Mitglieder koennen sich anmelden, bekommen von
 * der Datenbank aber nichts mehr. Die App fragt deshalb public.mein_zugang()
 * und zeigt statt leerer Seiten einen Hinweis.
 */

import Foundation

enum ZugangsGrund: String, CaseIterable, Sendable {
    case archiviert, gesperrt, ausgetreten, unbekannt

    /// Was die Datenbank sonst liefert, wird zu "unbekannt" - der Satz bleibt dann allgemein.
    init(wert: String?) {
        self = wert.flatMap(Self.init(rawValue:)) ?? .unbekannt
    }
}

enum KeinZugang {
    static let titel = "Kein Zugang mehr"

    /// Was man tun kann - fuer alle Gruende derselbe Weg.
    static let kontakt =
        "Wenn das nicht stimmt oder du wieder einsteigen möchtest, melde dich beim Vorstand."

    /// Ein Satz, warum (keinZugangText).
    static func text(_ grund: ZugangsGrund) -> String {
        switch grund {
        case .ausgetreten, .archiviert:
            "Deine Mitgliedschaft ist beendet. Damit endet auch der Zugang zur App."
        case .gesperrt:
            "Der Verein hat deinen Zugang gesperrt."
        case .unbekannt:
            "Mit diesem Konto ist im Moment keine Anmeldung möglich."
        }
    }
}

/// Eine Zeile aus public.mein_zugang().
struct Zugang: Equatable, Sendable, Decodable {
    let zugang: Bool
    let grund: String?
    let onboardingOffen: Bool

    enum CodingKeys: String, CodingKey {
        case zugang, grund
        case onboardingOffen = "onboarding_offen"
    }
}
