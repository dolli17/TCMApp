/**
 * Was der Link aus der E-Mail mitbringt
 *
 * Entspricht apps/mobile/src/lib/passwortlink.ts. Einladung und "Passwort
 * vergessen" kommen als ?token_hash=…&type=… an (siehe supabase/templates).
 * Die App loest den Hash selbst mit verifyOTP ein.
 *
 * Uebergang: Solange die Cloud-Vorlagen noch {{ .ConfirmationURL }} schicken,
 * kommt die fertige Sitzung im Fragment (#access_token=…&refresh_token=…).
 * Die nimmt die App vorerst weiter an, genau wie Expo-App und Web. Einen
 * solchen Link kann aber jeder mit seinem eigenen Konto bauen und einem
 * anderen unterschieben (Login-CSRF, Befund S20) - deshalb die Rueckfrage in
 * PasswortAblauf. Sobald die Cloud-Vorlagen umgestellt sind, faellt der Zweig
 * ueberall gemeinsam weg (docs/goLive.md).
 *
 * Der Link kommt als Universal Link (https://app.…/passwort-setzen,
 * https://dev.…/passwort-setzen) oder ueber das eigene Schema
 * (tcm://passwort-setzen, tcmdev://, tcmlokal://).
 */

import Foundation

/// Nur diese beiden Mails fuehren nach passwort-setzen.
enum LinkTyp: String, Equatable, Sendable, CaseIterable {
    case invite
    case recovery
}

enum LinkInhalt: Equatable, Sendable {
    case token(tokenHash: String, typ: LinkTyp)
    case fragment(accessToken: String, refreshToken: String)
    case ungueltig
    case ohne
}

enum Passwortlink {
    /// Die Webadressen, unter denen die App Universal Links annimmt (wie die Entitlements).
    static let hosts: Set<String> = ["app.tennisclub-muckensturm.de", "dev.tennisclub-muckensturm.de"]
    /// Die eigenen Schemata aller Konfigurationen (Prod, Dev, Lokal).
    static let schemata: Set<String> = ["tcm", "tcmdev", "tcmlokal"]

    static let pfad = "passwort-setzen"

    /**
     * Ist das ein Link nach passwort-setzen? Andere Adressen (spaeter etwa
     * Buchungen) gehen die Passwort-Behandlung nichts an.
     */
    static func istPasswortLink(_ url: URL) -> Bool {
        guard let schema = url.scheme?.lowercased() else { return false }
        let teile = url.pathComponents.filter { $0 != "/" }
        if schema == "https" {
            guard let host = url.host()?.lowercased(), hosts.contains(host) else { return false }
            return teile == [pfad]
        }
        guard schemata.contains(schema) else { return false }
        // tcm://passwort-setzen (Host) oder tcm:///passwort-setzen (Pfad)
        if let host = url.host(), !host.isEmpty { return host == pfad && teile.isEmpty }
        return teile == [pfad]
    }

    /// Wertet einen Link aus. nil, wenn er nicht nach passwort-setzen fuehrt.
    static func auswerten(_ url: URL) -> LinkInhalt? {
        guard istPasswortLink(url) else { return nil }
        let teile = URLComponents(url: url, resolvingAgainstBaseURL: false)
        return auswerten(
            abfrage: parameter(teile?.percentEncodedQuery),
            fragment: parameter(teile?.percentEncodedFragment)
        )
    }

    /// Der Kern, ohne Adresse - dieselben Faelle wie linkAuswerten in passwortlink.ts.
    static func auswerten(abfrage: [String: String], fragment: [String: String]) -> LinkInhalt {
        if let tokenHash = abfrage["token_hash"], !tokenHash.isEmpty {
            if let typ = abfrage["type"].flatMap(LinkTyp.init(rawValue:)) {
                return .token(tokenHash: tokenHash, typ: typ)
            }
            return .ungueltig
        }

        if let access = fragment["access_token"], !access.isEmpty,
           let refresh = fragment["refresh_token"], !refresh.isEmpty {
            return .fragment(accessToken: access, refreshToken: refresh)
        }

        // Supabase meldet Fehler wie einen abgelaufenen Link als Abfrage oder im Fragment.
        if abfrage["error"] != nil || abfrage["error_code"] != nil || fragment["error"] != nil {
            return .ungueltig
        }
        return .ohne
    }

    /**
     * Zerlegt "a=1&b=2" wie URLSearchParams: "+" ist ein Leerzeichen, %xx wird
     * dekodiert, bei doppelten Namen gilt der erste.
     */
    static func parameter(_ roh: String?) -> [String: String] {
        guard let roh, !roh.isEmpty else { return [:] }
        var ergebnis: [String: String] = [:]
        for paar in roh.split(separator: "&", omittingEmptySubsequences: true) {
            let teile = paar.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
            let name = dekodiert(teile[0])
            let wert = teile.count > 1 ? dekodiert(teile[1]) : ""
            if ergebnis[name] == nil { ergebnis[name] = wert }
        }
        return ergebnis
    }

    private static func dekodiert(_ teil: Substring) -> String {
        let mitLeerzeichen = teil.replacingOccurrences(of: "+", with: " ")
        return mitLeerzeichen.removingPercentEncoding ?? mitLeerzeichen
    }

    /**
     * Die Nutzer-ID (sub) aus einem Access Token, ungeprueft - nur um zu
     * sehen, ob ein Fragment-Link zum schon angemeldeten Konto gehoert. Ob das
     * Token gilt, entscheidet erst Supabase beim Einloesen.
     */
    static func nutzerID(ausToken token: String) -> String? {
        let teile = token.split(separator: ".", omittingEmptySubsequences: false)
        guard teile.count == 3 else { return nil }
        var base64 = teile[1].replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while base64.count % 4 != 0 { base64.append("=") }
        guard let daten = Data(base64Encoded: base64),
              let inhalt = try? JSONSerialization.jsonObject(with: daten) as? [String: Any],
              let sub = inhalt["sub"] as? String, !sub.isEmpty
        else { return nil }
        return sub.lowercased()
    }
}

/// Die Frist ist abgelaufen, bevor das Netz geantwortet hat.
struct Zeitueberschreitung: Error, Equatable {}

/// Bricht ab, wenn das Netz nicht antwortet - sonst dreht der Ladekreis ewig (wie mitFrist in passwortlink.ts).
func mitFrist<T: Sendable>(
    _ frist: Duration,
    _ arbeit: @escaping @Sendable () async throws -> T
) async throws -> T {
    try await withThrowingTaskGroup(of: T.self) { gruppe in
        gruppe.addTask { try await arbeit() }
        gruppe.addTask {
            try await Task.sleep(for: frist)
            throw Zeitueberschreitung()
        }
        defer { gruppe.cancelAll() }
        guard let erstes = try await gruppe.next() else { throw Zeitueberschreitung() }
        return erstes
    }
}
