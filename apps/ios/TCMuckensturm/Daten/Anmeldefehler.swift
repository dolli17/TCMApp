/**
 * Fehler beim Anmelden
 *
 * Entspricht packages/core/src/anmeldefehler.ts (Texte wortgleich). Supabase
 * Auth meldet auf Englisch, und nicht jeder Fehler ist ein falsches Passwort.
 * Wer kein Netz hat oder zu oft probiert hat, soll das lesen - nicht
 * "Passwort stimmt nicht" und dann noch einmal probieren.
 *
 * Zweistufig: `AuthFehlerForm.aus(_:)` macht aus einem Swift-Fehler die Form,
 * die auch auth-js liefert (code, status), und `anmeldeFehlerText` ordnet sie
 * zu - so laesst sich die Zuordnung ohne Netz testen.
 */

import Foundation
import Supabase

/// Die Felder, nach denen zugeordnet wird - wie AuthLikeError in @tcm/core.
struct AuthFehlerForm: Equatable, Sendable {
    var code: String?
    var status: Int?
    var nachricht: String?
    /// Keine Antwort vom Server (in auth-js: AuthRetryableFetchError).
    var ohneAntwort = false
}

enum Anmeldefehler {
    static let anmeldedatenFalsch = "E-Mail-Adresse oder Passwort stimmt nicht."
    static let zuVieleVersuche =
        "Zu viele Versuche in kurzer Zeit. Bitte warte ein paar Minuten und versuche es dann erneut."
    static let server = "Der Server ist gerade nicht erreichbar. Bitte versuche es in ein paar Minuten erneut."
    /// VERBINDUNGSFEHLER_TEXT aus packages/core/src/errors.ts
    static let verbindung =
        "Keine Verbindung zum Server. Bitte prüfe die Internetverbindung und versuche es erneut."
    static let gesperrt = "Dieser Zugang ist gesperrt. Bitte melde dich beim Verein."
    static let nichtBestaetigt =
        "Die E-Mail-Adresse ist noch nicht bestätigt. Bitte nutze den Link aus der Einladung."

    /// Dieselben Teile wie VERBINDUNG in errors.ts, ohne Gross-/Kleinschreibung.
    private static let verbindungsTeile = [
        "fetch failed", "failed to fetch", "networkerror", "network request failed", "load failed",
        "econnrefused", "econnreset", "enotfound", "etimedout", "socket hang up",
    ]

    private static func klingtNachVerbindung(_ nachricht: String) -> Bool {
        let klein = nachricht.lowercased()
        return verbindungsTeile.contains { klein.contains($0) }
    }

    /**
     * Eine Stoerung statt einer Antwort in der Sache: keine Verbindung, Server
     * gestoert, zu viele Versuche. Nichts davon verraet, ob es eine Adresse gibt.
     */
    static func stoerungText(_ fehler: AuthFehlerForm?) -> String? {
        guard let fehler else { return nil }
        if fehler.ohneAntwort {
            if let status = fehler.status, status >= 500 { return server }
            return verbindung
        }
        if let nachricht = fehler.nachricht, klingtNachVerbindung(nachricht) { return verbindung }
        if fehler.status == 429 || fehler.code == "over_request_rate_limit"
            || fehler.code == "over_email_send_rate_limit" {
            return zuVieleVersuche
        }
        if let status = fehler.status, status >= 500 { return server }
        return nil
    }

    /// Falsche Adresse und falsches Passwort bleiben ein Satz - sonst liesse sich
    /// herausfinden, wer im Verein ist.
    static func anmeldeFehlerText(_ fehler: AuthFehlerForm?) -> String {
        guard let fehler else { return anmeldedatenFalsch }
        if let text = stoerungText(fehler) { return text }
        switch fehler.code {
        case "user_banned": return gesperrt
        case "email_not_confirmed": return nichtBestaetigt
        default: return anmeldedatenFalsch
        }
    }

    /// Wie passwortFehlerText in @tcm/core: beim Speichern eines neuen Passworts, nie englischer Rohtext.
    static func passwortFehlerText(_ fehler: AuthFehlerForm?) -> String {
        guard let fehler else { return "Das Passwort ließ sich nicht speichern." }
        if let text = stoerungText(fehler) { return text }
        switch fehler.code {
        case "same_password": return "Das neue Passwort muss sich vom bisherigen unterscheiden."
        case "weak_password": return "Das Passwort ist zu schwach. Bitte wähle ein längeres."
        case "session_not_found", "session_expired": return "Der Link ist abgelaufen. Bitte fordere einen neuen an."
        default:
            if fehler.status == 401 { return "Der Link ist abgelaufen. Bitte fordere einen neuen an." }
            return "Das Passwort ließ sich nicht speichern. Bitte versuche es erneut."
        }
    }
}

extension AuthFehlerForm {
    /// Was supabase-swift wirft, in die Form von auth-js gebracht.
    static func aus(_ fehler: any Error) -> AuthFehlerForm {
        if let auth = fehler as? AuthError {
            if case let .api(nachricht, code, _, antwort) = auth {
                return AuthFehlerForm(code: code.rawValue, status: antwort.statusCode, nachricht: nachricht)
            }
            return AuthFehlerForm(code: auth.errorCode.rawValue, nachricht: auth.message)
        }
        if let url = fehler as? URLError, url.istVerbindungsfehler {
            return AuthFehlerForm(nachricht: url.localizedDescription, ohneAntwort: true)
        }
        return AuthFehlerForm(nachricht: String(describing: fehler))
    }
}

private extension URLError {
    var istVerbindungsfehler: Bool {
        switch code {
        case .notConnectedToInternet, .networkConnectionLost, .timedOut, .cannotFindHost,
             .cannotConnectToHost, .dnsLookupFailed, .dataNotAllowed, .internationalRoamingOff,
             .secureConnectionFailed:
            true
        default:
            false
        }
    }
}
