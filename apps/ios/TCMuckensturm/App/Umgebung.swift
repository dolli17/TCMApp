/**
 * Die Umgebung der App: gegen welches Supabase sie spricht
 *
 * Die Werte stehen je Konfiguration (Lokal, Dev, Prod) in
 * den xcconfig-Dateien unter Konfiguration und kommen ueber die Info.plist in die App -
 * dasselbe, was in der Expo-App EXPO_PUBLIC_* aus eas.json bzw. .env leisten.
 * Auch hier nur der oeffentliche Schluessel: was ein Mitglied sehen darf,
 * entscheidet RLS in der Datenbank.
 */

import Foundation

struct Umgebung: Equatable, Sendable {
    let supabaseURL: URL
    let supabaseKey: String
    /// Basisadresse des Webs ohne Schraegstrich am Ende; nil, wenn keine gesetzt ist (lokal).
    let siteURL: URL?
    /// App Group und Access Group des Schluesselbunds; nil, wenn keine gesetzt ist.
    let appGroup: String?

    enum Fehler: Error, Equatable {
        case fehlt(String)
        case ungueltig(String)
    }

    static let schluesselURL = "TCMSupabaseURL"
    static let schluesselKey = "TCMSupabaseKey"
    static let schluesselSite = "TCMSiteURL"
    static let schluesselAppGroup = "TCMAppGroup"

    /// Liest die Werte aus der Info.plist. Wirft, statt abzustuerzen: die App
    /// zeigt dann einen verstaendlichen Hinweis.
    init(info: [String: Any]) throws {
        let url = Self.text(info[Self.schluesselURL])
        let key = Self.text(info[Self.schluesselKey])
        guard !url.isEmpty else { throw Fehler.fehlt(Self.schluesselURL) }
        guard !key.isEmpty else { throw Fehler.fehlt(Self.schluesselKey) }
        guard let supabaseURL = URL(string: url), let schema = supabaseURL.scheme,
              ["http", "https"].contains(schema), supabaseURL.host() != nil
        else { throw Fehler.ungueltig(Self.schluesselURL) }

        self.supabaseURL = supabaseURL
        self.supabaseKey = key
        self.siteURL = Self.basis(Self.text(info[Self.schluesselSite])).flatMap(URL.init(string:))
        let gruppe = Self.text(info[Self.schluesselAppGroup])
        self.appGroup = gruppe.isEmpty ? nil : gruppe
    }

    static func ausBundle(_ bundle: Bundle = .main) throws -> Umgebung {
        try Umgebung(info: bundle.infoDictionary ?? [:])
    }

    /// "/antrag" -> "https://…/antrag"; ohne Basisadresse nil (wie webLink in apps/mobile/src/lib/web.ts).
    func webLink(_ pfad: String) -> URL? {
        guard let siteURL else { return nil }
        let teil = pfad.hasPrefix("/") ? pfad : "/\(pfad)"
        return URL(string: siteURL.absoluteString + teil)
    }

    private static func text(_ wert: Any?) -> String {
        ((wert as? String) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Ohne Schraegstrich am Ende; leer bleibt nil.
    private static func basis(_ wert: String) -> String? {
        var w = wert
        while w.hasSuffix("/") { w.removeLast() }
        return w.isEmpty ? nil : w
    }
}
