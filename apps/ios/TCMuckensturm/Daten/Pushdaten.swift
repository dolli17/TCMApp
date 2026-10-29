/**
 * Push-Marken in der Datenbank an- und abmelden
 *
 * Wie apps/mobile/src/lib/push.ts, aber mit der APNs-Marke statt der von
 * Expo: register_push_token mit p_provider 'apns', remove_push_token und
 * statt des Tabellenzugriffs push_token_aktiv (docs/native/app-api.md, Push).
 * Versandt wird von der Edge Function notification-pushes direkt an APNs.
 */

import Foundation
import Supabase

enum Pushmarke {
    /// Die Marke, wie APNs sie erwartet: die Bytes als Hex, klein geschrieben.
    static func hex(_ daten: Data) -> String {
        daten.map { String(format: "%02x", $0) }.joined()
    }
}

struct Pushdaten: Sendable {
    let client: SupabaseClient

    private struct Anmeldung: Encodable, Sendable {
        let p_token: String
        let p_platform: String
        let p_device_name: String?
        let p_provider: String
    }

    func anmelden(marke: String, geraet: String?) async -> Ergebnis {
        do {
            try await client.rpc("register_push_token", params: Anmeldung(
                p_token: marke, p_platform: "ios", p_device_name: geraet, p_provider: "apns"
            )).execute()
            return .erfolg("Benachrichtigungen sind eingeschaltet.")
        } catch {
            return .fehler(Meldung.aus(error).text)
        }
    }

    func abmelden(marke: String) async -> Ergebnis {
        do {
            try await client.rpc("remove_push_token", params: ["p_token": marke]).execute()
            return .erfolg("Benachrichtigungen sind ausgeschaltet.")
        } catch {
            return .fehler(Meldung.aus(error).text)
        }
    }

    /// true nur fuer die eigene, nicht stillgelegte Marke.
    func aktiv(marke: String) async -> Bool {
        let aktiv: Bool? = try? await client.rpc("push_token_aktiv", params: ["p_token": marke]).execute().value
        return aktiv ?? false
    }
}
