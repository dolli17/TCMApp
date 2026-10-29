/**
 * Ablage der Sitzung im Schluesselbund
 *
 * supabase-swift legt die Sitzung ueber AuthLocalStorage ab. Die eingebaute
 * Ablage laesst die Zugriffsklasse nicht einstellen; wir brauchen
 * kSecAttrAccessibleAfterFirstUnlock wie die Expo-App (supabase.ts): nach dem
 * ersten Entsperren lesbar, damit die Sitzung auch erneuert werden kann, wenn
 * die App bei gesperrtem Bildschirm im Hintergrund aufwacht.
 *
 * Mit Access Group (der App Group) koennen spaeter Widgets dieselbe Sitzung
 * lesen. Anders als expo-secure-store kennt der Schluesselbund keine Grenze
 * von 2 KB je Eintrag - das Teilen in Stuecke aus sitzungsspeicher.ts
 * entfaellt.
 */

import Foundation
import Security
import Supabase

struct Schluesselbund: AuthLocalStorage {
    /// Dienstname der Eintraege; Tests nehmen einen eigenen.
    let service: String
    let accessGroup: String?

    static let standardService = "de.tcmuckensturm.app.sitzung"

    init(service: String = Self.standardService, accessGroup: String? = nil) {
        self.service = service
        self.accessGroup = accessGroup
    }

    struct Fehler: Error, Equatable {
        let status: OSStatus
    }

    func store(key: String, value: Data) throws {
        let aenderung: [String: Any] = [
            kSecValueData as String: value,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
        ]
        let status = SecItemUpdate(abfrage(key) as CFDictionary, aenderung as CFDictionary)
        if status == errSecItemNotFound {
            let neu = abfrage(key).merging(aenderung) { _, b in b }
            let hinzu = SecItemAdd(neu as CFDictionary, nil)
            guard hinzu == errSecSuccess else { throw Fehler(status: hinzu) }
            return
        }
        guard status == errSecSuccess else { throw Fehler(status: status) }
    }

    func retrieve(key: String) throws -> Data? {
        var suche = abfrage(key)
        suche[kSecReturnData as String] = true
        suche[kSecMatchLimit as String] = kSecMatchLimitOne
        var ergebnis: CFTypeRef?
        let status = SecItemCopyMatching(suche as CFDictionary, &ergebnis)
        if status == errSecItemNotFound { return nil }
        // Ein Fehler hier (etwa vor dem ersten Entsperren) wirft; supabase-swift
        // behandelt das wie "keine Sitzung" - abgemeldet statt abgestuerzt.
        guard status == errSecSuccess else { throw Fehler(status: status) }
        return ergebnis as? Data
    }

    func remove(key: String) throws {
        let status = SecItemDelete(abfrage(key) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw Fehler(status: status) }
    }

    /// Alle Eintraege dieses Dienstes - fuer Tests und einen spaeteren "Alles vergessen".
    func alleEntfernen() throws {
        var alle: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
        ]
        if let accessGroup { alle[kSecAttrAccessGroup as String] = accessGroup }
        let status = SecItemDelete(alle as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw Fehler(status: status) }
    }

    private func abfrage(_ key: String) -> [String: Any] {
        var a: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
        if let accessGroup { a[kSecAttrAccessGroup as String] = accessGroup }
        return a
    }
}
