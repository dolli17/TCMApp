/**
 * Mitspielersuche "Nur für …" und die LK-Eingabe
 *
 * Vertrag (02.11.2026): Wer "Mitspieler gesucht" einschaltet, kann die Suche
 * auf einen LK-Bereich (1,0 = beste, 25,0 = schwaechste, Schritte 0,1) und
 * auf Damen oder Herren einschraenken. Durchgesetzt wird das in der
 * Datenbank (open_matches, join_booking); hier stehen nur Darstellung,
 * Eingabe und welche Werte an create_booking / set_partner_wanted gehen.
 *
 * Gerechnet wird in Zehnteln (10 ... 250), damit 0,1-Schritte ohne
 * Rundungsfehler zaehlen.
 */

import Foundation

/// Fuer wen die Suche gilt (bookings.partner_fuer).
enum SucheFuer: String, CaseIterable, Hashable, Sendable {
    case alle, female, male

    /// nil heisst alle - so steht es in der Datenbank.
    init(db: String?) {
        self = db.flatMap(SucheFuer.init(rawValue:)) ?? .alle
    }

    var db: String? { self == .alle ? nil : rawValue }

    var label: String {
        switch self {
        case .alle: "Alle"
        case .female: "Damen"
        case .male: "Herren"
        }
    }
}

struct Suchfilter: Equatable, Hashable, Sendable {
    /// LK in Zehnteln: 10 = LK 1,0, 250 = LK 25,0.
    static let minZehntel = 10
    static let maxZehntel = 250

    var vonZehntel: Int
    var bisZehntel: Int
    var fuer: SucheFuer

    /// Standard: keine Einschraenkung.
    static let offen = Suchfilter(vonZehntel: minZehntel, bisZehntel: maxZehntel, fuer: .alle)

    init(vonZehntel: Int, bisZehntel: Int, fuer: SucheFuer) {
        self.vonZehntel = vonZehntel
        self.bisZehntel = bisZehntel
        self.fuer = fuer
    }

    /// Aus den Spalten der Datenbank (day_schedule, open_matches); fehlende Grenze = offen.
    init(von: Double?, bis: Double?, fuer: String?) {
        let v = von.map(Suchfilter.zehntel) ?? Suchfilter.minZehntel
        let b = bis.map(Suchfilter.zehntel) ?? Suchfilter.maxZehntel
        self.init(
            vonZehntel: Suchfilter.begrenzt(min(v, b)), bisZehntel: Suchfilter.begrenzt(max(v, b)),
            fuer: SucheFuer(db: fuer)
        )
    }

    var istEingeschraenkt: Bool { self != .offen }

    // MARK: Parameter

    /// An den Grenzen null (von = 1 -> null), sonst die LK.
    var paramVon: Double? { vonZehntel <= Self.minZehntel ? nil : Double(vonZehntel) / 10 }
    /// An den Grenzen null (bis = 25 -> null), sonst die LK.
    var paramBis: Double? { bisZehntel >= Self.maxZehntel ? nil : Double(bisZehntel) / 10 }
    var paramFuer: String? { fuer.db }

    // MARK: Eingabe

    /// Neues "von"; zieht "bis" mit, damit von <= bis bleibt.
    func mitVon(_ zehntel: Int) -> Suchfilter {
        var f = self
        f.vonZehntel = Self.begrenzt(zehntel)
        f.bisZehntel = max(f.bisZehntel, f.vonZehntel)
        return f
    }

    /// Neues "bis"; zieht "von" mit, damit von <= bis bleibt.
    func mitBis(_ zehntel: Int) -> Suchfilter {
        var f = self
        f.bisZehntel = Self.begrenzt(zehntel)
        f.vonZehntel = min(f.vonZehntel, f.bisZehntel)
        return f
    }

    /// Alle Werte fuer die Auswahl: 1,0 ... 25,0.
    static let stufen = Array(minZehntel...maxZehntel)

    // MARK: Text

    /// "LK 10–16 · Herren", "bis LK 16", "ab LK 10", "Damen" - nil ohne Einschraenkung.
    var kurztext: String? {
        let lk: String? = switch (paramVon, paramBis) {
        case (nil, nil): nil
        case (nil, .some): "bis LK \(Self.lkText(bisZehntel))"
        case (.some, nil): "ab LK \(Self.lkText(vonZehntel))"
        case (.some, .some):
            vonZehntel == bisZehntel
                ? "LK \(Self.lkText(vonZehntel))"
                : "LK \(Self.lkText(vonZehntel))–\(Self.lkText(bisZehntel))"
        }
        let teile = [lk, fuer == .alle ? nil : fuer.label].compactMap { $0 }
        return teile.isEmpty ? nil : teile.joined(separator: " · ")
    }

    /// Zusammenfassung neben "Nur für …": "alle" ohne Einschraenkung.
    var zusammenfassung: String { kurztext ?? "alle" }

    /// Fuer den Screenreader: "LK 10 bis 16" statt des Gedankenstrichs.
    var vorleseText: String {
        (kurztext ?? "Alle").replacingOccurrences(of: "–", with: " bis ")
    }

    /// 100 -> "10", 145 -> "14,5"
    static func lkText(_ zehntel: Int) -> String {
        zehntel % 10 == 0 ? String(zehntel / 10) : "\(zehntel / 10),\(zehntel % 10)"
    }

    /// Kurztext direkt aus den Spalten.
    static func kurztext(von: Double?, bis: Double?, fuer: String?) -> String? {
        Suchfilter(von: von, bis: bis, fuer: fuer).kurztext
    }

    private static func zehntel(_ lk: Double) -> Int { Int((lk * 10).rounded()) }
    private static func begrenzt(_ z: Int) -> Int { min(max(z, minZehntel), maxZehntel) }
}

/**
 * Die LK im Profil (members.tennis_lk, Text). Eingabe: Zahl 1–25 mit
 * hoechstens einer Nachkommastelle, Komma oder Punkt, optional "LK" davor;
 * leer bleibt erlaubt. Gespeichert wird normalisiert, etwa "LK14,5".
 */
enum LkEingabe {
    static let beschriftung = "LK oder geschätzte LK"
    static let hinweis = "Keine offizielle LK? Schätz dich ein – 1 ist die beste, 25 die schwächste."
    static let fehlerText = "Bitte eine LK zwischen 1 und 25 eingeben, höchstens eine Nachkommastelle (etwa 14,5)."

    private static let muster = #"^(?:lk)?\s*(\d{1,2})(?:[.,](\d))?$"#

    /// Die LK in Zehnteln, nil wenn leer, nicht lesbar oder ausserhalb 1–25 (wie private.lk_zahl).
    static func zehntel(_ eingabe: String?) -> Int? {
        let text = (eingabe ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard let treffer = try? NSRegularExpression(pattern: muster).firstMatch(
            in: text, range: NSRange(text.startIndex..., in: text)
        ) else { return nil }
        func gruppe(_ i: Int) -> String? {
            Range(treffer.range(at: i), in: text).map { String(text[$0]) }
        }
        guard let ganz = gruppe(1).flatMap(Int.init) else { return nil }
        let wert = ganz * 10 + (gruppe(2).flatMap(Int.init) ?? 0)
        return (Suchfilter.minZehntel...Suchfilter.maxZehntel).contains(wert) ? wert : nil
    }

    /// Leer ist erlaubt (nil), sonst der Fehlertext.
    static func fehler(_ eingabe: String) -> String? {
        let text = eingabe.trimmingCharacters(in: .whitespacesAndNewlines)
        return text.isEmpty || zehntel(text) != nil ? nil : fehlerText
    }

    /// "14.5" -> "LK14,5", "lk 12" -> "LK12"; leer -> "", ungueltig -> nil.
    static func normalisiert(_ eingabe: String) -> String? {
        let text = eingabe.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.isEmpty { return "" }
        return zehntel(text).map { "LK\(Suchfilter.lkText($0))" }
    }
}
