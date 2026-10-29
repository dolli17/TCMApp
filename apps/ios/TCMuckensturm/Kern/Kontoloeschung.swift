/**
 * Mitgliedschaft kuendigen beantragen (O9, Apple-Regel 5.1.1(v); U44)
 *
 * Portierung von packages/core/src/kontoloeschung.ts: dieselben Saetze wie
 * im Web unter /konto/loeschen und in der Expo-App, dieselbe Pruefung.
 * Geloescht wird nicht sofort: konto_loeschung_beantragen meldet den Antrag
 * an Vorstand und Admins.
 */

enum Kontoloeschung {
    /// Grenze der RPC fuer die freiwillige Nachricht.
    static let nachrichtMax = 1000

    static let titel = "Mitgliedschaft kündigen beantragen"
    static let erklaerung = [
        "Dein Antrag geht an den Vorstand. Er kümmert sich um die Kündigung deiner Mitgliedschaft und löscht dabei auch dein Konto samt Login für App und Web – oder anonymisiert es. Falls noch etwas zu klären ist, meldet er sich bei dir.",
        "Daten, die der Verein aufbewahren muss – etwa Beiträge und Lastschriften –, bleiben so lange wie vorgeschrieben erhalten.",
    ]
    static let nachrichtLabel = "Nachricht an den Vorstand (freiwillig)"
    static let absenden = "Kündigung beantragen"
    static let bestaetigungFrage = "Möchtest du die Kündigung deiner Mitgliedschaft und die Löschung deines Kontos wirklich beantragen?"
    static let bestaetigen = "Ja, beantragen"
    static let abbrechen = "Abbrechen"
    static let eingegangen = "Dein Antrag ist eingegangen. Der Vorstand meldet sich bei dir."
    static let liegtVor = "Dein Antrag liegt schon vor. Der Vorstand kümmert sich darum."

    enum Eingabe: Equatable, Sendable {
        /// nil heisst: keine Nachricht.
        case ok(nachricht: String?)
        case fehler(String)
    }

    /// Leer heisst: keine Nachricht. Zu lang meldet sich vor dem Absenden.
    static func pruefen(_ nachricht: String?) -> Eingabe {
        let text = Profil.trim(nachricht ?? "")
        if text.utf16.count > nachrichtMax {
            return .fehler("Die Nachricht ist zu lang (höchstens \(nachrichtMax) Zeichen).")
        }
        return .ok(nachricht: text.isEmpty ? nil : text)
    }

    /// true: neu eingegangen; false: aus den letzten 24 Stunden liegt schon einer vor.
    static func meldung(neu: Bool) -> String {
        neu ? eingegangen : liegtVor
    }
}
