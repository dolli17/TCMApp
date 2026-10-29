/**
 * Wohin ein Tippen auf eine Push-Nachricht fuehrt
 *
 * Die Edge Function notification-pushes legt neben `aps` die Daten `ziel`
 * (Pfad wie in der Expo-App, aus pushZiel in packages/core/src/pushvorlage.ts),
 * `kind` und `event_id` ab - die letzten beiden nur, wenn alle Posten
 * dieselben haben (Funktion daten in index.ts). Die Expo-App oeffnet den
 * Pfad mit expo-router; nativ wird daraus ein Tab oder Bildschirm.
 *
 * Als reine Funktion, damit sie ohne Geraet testbar ist. Nur Pfade der App
 * selbst zaehlen (sichererWeiterPfad), keine fremden Adressen.
 */

import Foundation

enum PushZiel: Equatable, Sendable {
    /// Neuigkeiten (/nachrichten)
    case nachrichten
    /// Eine Veranstaltung (/verein/veranstaltung/<id>): ihr Detail im Tab Verein
    case veranstaltung(id: String)
    /// Ein anderer Pfad der App, der zu einem Tab gehoert
    case tab(HauptTab)

    /**
     * - Parameter daten: `userInfo` der Nachricht ohne `aps`, nur die Texte.
     * - Returns: nil, wenn die Nachricht kein Ziel nennt - dann oeffnet sich
     *   die App einfach.
     */
    static func aus(_ daten: [String: String]) -> PushZiel? {
        if let pfad = daten["ziel"], let ziel = ausPfad(pfad) { return ziel }
        if let id = daten["event_id"], istKennung(id) { return .veranstaltung(id: id) }
        guard let kind = daten["kind"], !kind.isEmpty else { return nil }
        // Ohne Pfad: wie pushZiel - eine Veranstaltung ohne Kennung und alles andere stehen in den Nachrichten.
        return .nachrichten
    }

    /// Der Pfad aus `ziel`, wie expo-router ihn oeffnen wuerde.
    static func ausPfad(_ pfad: String) -> PushZiel? {
        guard istSichererPfad(pfad) else { return nil }
        let ohneAbfrage = pfad.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false)[0]
            .split(separator: "#", maxSplits: 1, omittingEmptySubsequences: false)[0]
        let teile = ohneAbfrage.split(separator: "/").map(String.init)
        switch teile.first {
        case nil, "home":
            return .tab(.home)
        case "nachrichten":
            return .nachrichten
        case "plaetze":
            return .tab(.plaetze)
        case "konto":
            return .tab(.konto)
        case "verein":
            if teile.count == 3, teile[1] == "veranstaltung", istKennung(teile[2]) {
                return .veranstaltung(id: teile[2])
            }
            return .tab(.verein)
        default:
            return nil
        }
    }

    /**
     * Wie sichererWeiterPfad in packages/core/src/weiterleitung.ts: ein
     * fuehrender Schraegstrich, kein zweiter, kein Backslash, keine Steuerzeichen.
     */
    static func istSichererPfad(_ wert: String) -> Bool {
        guard wert.hasPrefix("/"), !wert.hasPrefix("//"), !wert.contains("\\") else { return false }
        return !wert.unicodeScalars.contains { $0.value < 0x20 || $0.value == 0x7f }
    }

    /// Kennungen sind UUIDs; mehr als Buchstaben, Ziffern und Bindestrich laesst die App nicht durch.
    static func istKennung(_ id: String) -> Bool {
        !id.isEmpty && id.count <= 64 && id.unicodeScalars.allSatisfy {
            CharacterSet.alphanumerics.contains($0) && $0.isASCII || $0 == "-"
        }
    }

    /// Aus `userInfo` die Texte neben `aps` (simctl push und APNs liefern sie auf oberster Ebene).
    static func texte(_ userInfo: [AnyHashable: Any]) -> [String: String] {
        var ergebnis: [String: String] = [:]
        for (schluessel, wert) in userInfo {
            guard let s = schluessel as? String, s != "aps", let w = wert as? String else { continue }
            ergebnis[s] = w
        }
        return ergebnis
    }
}
