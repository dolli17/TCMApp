/**
 * Konto, Bereich "Tennis", als reine Funktionen
 *
 * LK, nuLiga-ID und Interesse an einer Mannschaft pflegt das Mitglied nach
 * dem Onboarding hier weiter. Gelesen wird der Tennis-Teil von
 * my_onboarding(), geschrieben ueber save_my_tennis (beides in
 * Daten/Onboardingdaten.swift). Die LK pruefen und normalisieren wie im
 * Onboarding ueber LkEingabe (Kern/Suchfilter.swift). Geprueft in
 * TennisLogikTests.
 *
 * Mannschaft und Mannschaftsfuehrer setzt der Vorstand; das Konto zeigt sie
 * nur als Marken im Profilkopf.
 */

import Foundation

/// Was an save_my_tennis geht: immer alle drei Werte, leerer Text heisst null.
struct TennisEingabe: Equatable, Sendable {
    let tennisLk: String
    let nuligaId: String
    let mannschaftInteresse: Bool
}

enum TennisPruefung: Equatable, Sendable {
    case ok(TennisEingabe)
    case fehler(String, feld: String)
}

enum TennisLogik {
    static let titel = "Tennis"
    static let lkWarum = "Die LK bestimmt, welche Mitspielersuchen du siehst."
    static let nuligaLabel = "nuLiga-ID"
    static let interesseLabel = "Interesse an einer Mannschaft"
    static let keineAngaben = "Noch keine Angaben"
    static let gespeichert = "Gespeichert."

    /// Wie in save_my_tennis (length(v_nu) > 40).
    static let nuligaMax = 40
    static let nuligaZuLang = "Die nuLiga-ID darf höchstens 40 Zeichen haben."

    /// Feldnamen fuer Ergebnis.feld, damit das Blatt den Fehler am Feld zeigt.
    static let feldLk = "tennis_lk"
    static let feldNuliga = "nuliga_id"

    /**
     * Kurz der Stand fuer die Zeile im Konto, etwa
     * "LK14,5 · nuLiga 12345678 · Interesse an Mannschaft". Eine LK, die
     * der Vorstand anders geschrieben hat, erscheint normalisiert, wenn sie
     * lesbar ist, sonst wie gespeichert.
     */
    static func uebersicht(_ t: OnboardingZustand.Tennis?) -> String {
        guard let t else { return keineAngaben }
        var teile: [String] = []
        let lk = Profil.trim(t.tennisLk ?? "")
        if !lk.isEmpty { teile.append(LkEingabe.normalisiert(lk) ?? lk) }
        let nuliga = Profil.trim(t.nuligaId ?? "")
        if !nuliga.isEmpty { teile.append("nuLiga \(nuliga)") }
        if t.mannschaftInteresse { teile.append("Interesse an Mannschaft") }
        return teile.isEmpty ? keineAngaben : teile.joined(separator: " · ")
    }

    /// Prueft die Eingaben wie im Onboarding und liefert, was gespeichert wird.
    static func pruefe(lk: String, nuligaId: String, mannschaftInteresse: Bool) -> TennisPruefung {
        guard let lkNormal = LkEingabe.normalisiert(lk) else {
            return .fehler(LkEingabe.fehlerText, feld: feldLk)
        }
        let nuliga = Profil.trim(nuligaId)
        if nuliga.count > nuligaMax {
            return .fehler(nuligaZuLang, feld: feldNuliga)
        }
        return .ok(TennisEingabe(tennisLk: lkNormal, nuligaId: nuliga, mannschaftInteresse: mannschaftInteresse))
    }

    /// Der Entwurf beim Oeffnen des Blatts: der gespeicherte Stand, leer ohne Angaben.
    static func entwurf(_ t: OnboardingZustand.Tennis?) -> (lk: String, nuliga: String, interesse: Bool) {
        (t?.tennisLk ?? "", t?.nuligaId ?? "", t?.mannschaftInteresse ?? false)
    }
}
