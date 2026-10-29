/**
 * Die Weiche
 *
 * Entspricht apps/mobile/app/index.tsx: ohne Sitzung zur Anmeldung; mit
 * Sitzung entscheidet public.mein_zugang(). Hat das Konto keinen Zugang mehr
 * (ausgetreten, archiviert, gesperrt), geht es auf "Kein Zugang" statt auf
 * leere Seiten (B22); ist das Onboarding offen, aufs Onboarding; sonst in die
 * Tabs. Als reine Funktion, damit sie ohne Netz testbar ist.
 */

enum StartZiel: Equatable, Sendable {
    /// Noch nicht entschieden - Ladekreis.
    case laden
    case anmelden
    case keinZugang(ZugangsGrund)
    case onboarding
    case tabs
}

enum StartLogik {
    /**
     * - Parameter zugang: die Zeile aus mein_zugang(); nil, wenn das Lesen
     *   ausfiel oder keine Zeile kam. Dann geht es in die Tabs wie in der
     *   Expo-App: die Datenbank weist ein offenes Konto ohnehin selbst ab.
     */
    static func ziel(angemeldet: Bool, zugang: Zugang?) -> StartZiel {
        guard angemeldet else { return .anmelden }
        guard let zugang else { return .tabs }
        if !zugang.zugang { return .keinZugang(ZugangsGrund(wert: zugang.grund)) }
        return zugang.onboardingOffen ? .onboarding : .tabs
    }

    /**
     * Wohin nach dem Abmelden. "Kein Zugang" meldet selbst ab und bleibt
     * stehen, bis man von dort zur Anmeldung geht - sonst verschwaende der
     * Hinweis sofort wieder.
     */
    static func nachAbmelden(aktuell: StartZiel) -> StartZiel {
        if case .keinZugang = aktuell { return aktuell }
        return .anmelden
    }
}
