/**
 * Die Logik der Verwaltung als reine Funktionen
 *
 * Portierung aus apps/mobile/src/lib/verwaltung/plaetze.ts und gemeinsam.ts
 * (normZeit, deutschZuIso, isoZuDeutsch, zustandJetzt, pruefeSerie und die
 * Meldungen von sperre, legeSerieAn, aendereSerie, beendeSerie). Die Faelle
 * stehen in VerwaltungTests, dieselben wie in plaetze.test.ts. Die Meldungen
 * sind wortgleich mit dem Web und der Expo-App.
 *
 * Getippt wird wie in der Expo-App: Uhrzeiten als HH:MM, Daten deutsch
 * (TT.MM.JJJJ). Gerechnet wird in Europe/Berlin (Zeit).
 */

import Foundation

/// Was gerade auf einem Platz liegt: Sperrung oder Serie, mit Ende.
struct PlatzJetzt: Equatable, Sendable {
    enum Art: String, Sendable { case gesperrt, serie }
    let art: Art
    let text: String
}

/// Ton des Hinweises rechts in der Platzzeile (hinweisTon in Liste.tsx).
enum HinweisTon: Equatable, Sendable {
    case leise, rot, gold, gruen
}

/// Das Formular "Serie anlegen", so wie es getippt wurde.
struct SerienEingabe: Equatable, Sendable {
    var courtId: String
    var bookingTypeCode: String
    /// 0 = Sonntag wie in der Datenbank
    var weekday: Int
    var startTime: String
    var endTime: String
    /// Deutsch getippt
    var validFrom: String
    var validTo: String
    var title: String
}

/// Ein geprueftes Serienformular mit den Werten, die die RPCs brauchen.
struct SerienWerte: Equatable, Sendable {
    let courtId: String
    let bookingTypeCode: String
    let weekday: Int
    /// HH:MM
    let startTime: String
    let endTime: String
    /// JJJJ-MM-TT
    let validFrom: String
    let validTo: String
    let title: String
}

enum VerwaltungLogik {
    static let keineZeit = "Uhrzeit als HH:MM angeben."
    static let keinDatum = "Das Datum bitte als TT.MM.JJJJ angeben."

    // MARK: - Sichtbarkeit

    /**
     * Den Tab gibt es nur mit Platzrechten (Vorstand, App Admin, Platzwart).
     * Wie im Web nur die Oberflaeche: die RPCs pruefen private.darf_plaetze() selbst.
     */
    static func sichtbar(_ ich: Ich?) -> Bool {
        ich?.platzRechte == true || ich?.admin == true
    }

    // MARK: - Eingaben

    /// "8:00", "08.00" oder "08:00" -> "08:00". Ungueltiges gibt nil.
    static func normZeit(_ text: String) -> String? {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let r = t.range(of: #"^\d{1,2}[:.]\d{2}$"#, options: .regularExpression), r == t.startIndex..<t.endIndex
        else { return nil }
        let teile = t.split(whereSeparator: { $0 == ":" || $0 == "." })
        guard teile.count == 2, let h = Int(teile[0]), let min = Int(teile[1]) else { return nil }
        if h > 24 || min > 59 || (h == 24 && min > 0) { return nil }
        return String(format: "%02d:", h) + teile[1]
    }

    /**
     * 29.09.2026 (auch 29.9.26) -> 2026-09-29. ISO bleibt ISO. Ungueltiges
     * (31.02.) gibt nil.
     */
    static func deutschZuIso(_ text: String) -> String? {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil { return t }
        guard t.range(of: #"^\d{1,2}\.\d{1,2}\.(\d{2}|\d{4})$"#, options: .regularExpression) != nil else { return nil }
        let teile = t.split(separator: ".")
        guard teile.count == 3, let tag = Int(teile[0]), let monat = Int(teile[1]), let j = Int(teile[2]) else { return nil }
        let jahr = teile[2].count == 2 ? 2000 + j : j
        guard (1...12).contains(monat), tag >= 1,
              let d = Zeit.utc.date(from: DateComponents(year: jahr, month: monat, day: tag)),
              Zeit.utc.component(.day, from: d) == tag, Zeit.utc.component(.month, from: d) == monat
        else { return nil }
        return String(format: "%04d-%02d-%02d", jahr, monat, tag)
    }

    /// 2026-09-29 -> 29.09.2026. Leer bleibt leer.
    static func isoZuDeutsch(_ iso: String?) -> String {
        guard let iso, !iso.isEmpty else { return "" }
        let teile = iso.prefix(10).split(separator: "-")
        guard teile.count == 3 else { return iso }
        return "\(teile[2]).\(teile[1]).\(teile[0])"
    }

    // MARK: - Zustand der Plaetze

    /**
     * Was jetzt gerade auf dem Platz liegt: Sperrung oder Serie aus dem
     * Tagesplan, eingeordnet wie im Belegungsplan (occupancyKind). Je Platz
     * zaehlt der erste laufende Eintrag; der Beginn zaehlt mit, das Ende nicht.
     */
    static func zustandJetzt<T: BelegterSlot & Belegungsmerkmale>(_ plan: [T], jetzt: Date = Date()) -> [String: PlatzJetzt] {
        var zustand: [String: PlatzJetzt] = [:]
        for b in plan {
            let art: PlatzJetzt.Art
            switch Startseite.occupancyKind(b) {
            case .gesperrt: art = .gesperrt
            case .serie: art = .serie
            default: continue
            }
            guard zustand[b.courtId] == nil, let von = Zeit.datum(b.startsAt), let bis = Zeit.datum(b.endsAt),
                  von <= jetzt, jetzt < bis
            else { continue }
            let ende = Zeit.minutesToTime(Zeit.minutesOf(b.endsAt))
            zustand[b.courtId] = PlatzJetzt(art: art, text: art == .gesperrt ? "gesperrt bis \(ende)" : "Serie bis \(ende)")
        }
        return zustand
    }

    /// Hinweis und Ton rechts in der Platzzeile: stillgelegt, gesperrt/Serie bis …, sonst frei.
    static func platzHinweis(aktiv: Bool, jetzt: PlatzJetzt?) -> (text: String, ton: HinweisTon) {
        if !aktiv { return ("stillgelegt", .leise) }
        guard let jetzt else { return ("frei", .gruen) }
        return (jetzt.text, jetzt.art == .gesperrt ? .rot : .gold)
    }

    /// Eine Sperrung wird im Platzplan bearbeitet und aufgehoben: nur die fuehrt dorthin.
    static func fuehrtZuPlaetzen(_ jetzt: PlatzJetzt?) -> Bool {
        jetzt?.art == .gesperrt
    }

    // MARK: - Web

    /// Admins in die ganze Verwaltung, der Platzwart gleich zu den Plaetzen.
    static func webPfad(admin: Bool) -> String {
        admin ? "/admin" : "/admin/plaetze"
    }

    static func webTitel(admin: Bool) -> String {
        admin ? "Weitere Verwaltung am PC" : "Plätze & Serien am PC"
    }

    static func webText(admin: Bool) -> String {
        admin
            ? "Mitglieder, Kasse, Getränke, Plätze und Buchungsregeln pflegst du in der Verwaltung im Web."
            : "Sperren und Serien pflegst du bequemer in der Verwaltung im Web."
    }

    // MARK: - Einstellungen

    /// "08:00:00" oder "08:00" -> "08:00"; ohne Wert die Vorgabe.
    static func uhrzeit(_ wert: String?, ersatz: String) -> String {
        guard let wert, !wert.isEmpty else { return ersatz }
        return String(wert.prefix(5))
    }

    // MARK: - Sperren

    /// Was create_blocking braucht, oder die Meldung, warum nicht.
    static func pruefeSperre(tag: String, von: String, bis: String) -> Result<(von: Date, bis: Date), Meldung> {
        guard let iso = deutschZuIso(tag) else { return .failure(Meldung(text: keinDatum)) }
        guard let v = normZeit(von), let b = normZeit(bis) else { return .failure(Meldung(text: keineZeit)) }
        // Ueber berlinTime, nie als Zeitstempel ohne Zone: den laese Postgres als UTC.
        return .success((
            Zeit.berlinTime(day: iso, minutes: Zeit.timeToMinutes(v)),
            Zeit.berlinTime(day: iso, minutes: Zeit.timeToMinutes(b))
        ))
    }

    static func gesperrtMeldung(angelegt: Int, verdraengt: Int) -> String {
        verdraengt > 0
            ? "\(angelegt) Plätze gesperrt, \(verdraengt) Buchungen verdrängt. Die Betroffenen wurden benachrichtigt."
            : "\(angelegt) \(angelegt == 1 ? "Platz" : "Plätze") gesperrt."
    }

    // MARK: - Serien

    /**
     * Prueft ein Serienformular wie seriesSchema in @tcm/core und gibt die
     * Werte so zurueck, wie die RPCs sie brauchen.
     */
    static func pruefeSerie(_ f: SerienEingabe) -> Result<SerienWerte, Meldung> {
        guard let ab = deutschZuIso(f.validFrom), let bis = deutschZuIso(f.validTo) else {
            return .failure(Meldung(text: keinDatum))
        }
        guard let start = normZeit(f.startTime), let ende = normZeit(f.endTime) else {
            return .failure(Meldung(text: keineZeit))
        }
        let titel = f.title.trimmingCharacters(in: .whitespacesAndNewlines)
        if f.courtId.isEmpty || f.bookingTypeCode.isEmpty || !(0...6).contains(f.weekday) {
            return .failure(Meldung(text: "Die Angaben stimmen nicht."))
        }
        if titel.isEmpty { return .failure(Meldung(text: "Titel fehlt.")) }
        if titel.count > 200 { return .failure(Meldung(text: "Die Angaben stimmen nicht.")) }
        if !(ende > start) { return .failure(Meldung(text: "Die Endzeit muss nach der Startzeit liegen.")) }
        if bis < ab { return .failure(Meldung(text: "Das Enddatum darf nicht vor dem Startdatum liegen.")) }
        return .success(SerienWerte(
            courtId: f.courtId, bookingTypeCode: f.bookingTypeCode, weekday: f.weekday,
            startTime: start, endTime: ende, validFrom: ab, validTo: bis, title: f.title
        ))
    }

    /// "2 Termine kollidieren mit ..." - die Zahl fuer die Rueckfrage beim Aendern.
    static func terminKollisionen(aus meldung: String) -> Int? {
        guard let r = meldung.range(of: #"^(\d+) Termine kollidieren"#, options: .regularExpression) else { return nil }
        return Int(meldung[r].prefix { $0.isNumber })
    }

    static func serieAngelegtMeldung(angelegt: Int, verdraengt: Int) -> String {
        "Serie angelegt: \(angelegt) Termine"
            + (verdraengt > 0 ? ", \(verdraengt) bestehende Buchungen verdrängt und die Betroffenen benachrichtigt." : ".")
    }

    static func serieGeaendertMeldung(neu: Int, verdraengt: Int) -> String {
        verdraengt > 0
            ? "Serie geändert: \(neu) Termine neu angelegt, \(verdraengt) Buchungen verdrängt. Die Betroffenen wurden benachrichtigt."
            : "Serie geändert: \(neu) künftige \(neu == 1 ? "Termin steht" : "Termine stehen") in der neuen Lage."
    }

    static func serieBeendetMeldung(_ weg: Int) -> String {
        weg > 0
            ? "Serie beendet. \(weg) künftige \(weg == 1 ? "Termin wurde" : "Termine wurden") abgesagt."
            : "Serie beendet. Es standen keine Termine mehr aus."
    }

    /// Die Vorschau nach dem Pruefen: wie viele Termine und was im Weg liegt.
    static func vorschauText(termine: Int, kollisionen: Int) -> String {
        kollisionen == 0
            ? "\(termine) Termine, nichts im Weg. Die Serie kann so angelegt werden."
            : PlaetzeLogik.imWegText(kollisionen)
    }

    /// Der gelbe Knopf nach der Vorschau.
    static func anlegenText(termine: Int, kollisionen: Int) -> String {
        kollisionen == 0
            ? "Serie anlegen · \(termine) Termine"
            : "Anlegen und \(PlaetzeLogik.verdraengenText(kollisionen))"
    }

    /// Eine Zeile der Vorschau: "• Di, 06.10., 18:30 · Max Muster"
    static func kollisionsZeile(startsAt: String, mitglied: String?, art: String?) -> String {
        let wer = mitglied ?? (art == "blocking" ? "andere Blockung" : "unbekannt")
        guard let d = Zeit.datum(startsAt) else { return "• \(wer)" }
        return "• \(Zeit.kurzerWochentag(d)), \(Zeit.tagMonat(d)), \(Zeit.minutesToTime(Zeit.localMinutes(d))) · \(wer)"
    }

    static let kurzeWochentage = ["SO", "MO", "DI", "MI", "DO", "FR", "SA"]

    /// Mo bis So, wie im Web - die Datenbank zaehlt ab Sonntag (0).
    static let wochentagWahl: [(wert: Int, label: String)] = [
        (1, "Mo"), (2, "Di"), (3, "Mi"), (4, "Do"), (5, "Fr"), (6, "Sa"), (0, "So"),
    ]

    /// "Dienstag · 18:30 – 20:00"
    static func serienZeit(weekday: Int?, start: String?, ende: String?) -> String {
        let tag = (0...6).contains(weekday ?? -1) ? Zeit.wochentageLang[weekday!] : ""
        return "\(tag) · \((start ?? "").prefix(5)) – \((ende ?? "").prefix(5))"
    }

    /// "Training · Platz 1 · bis 31.10.2026"
    static func serienKontext(typ: String?, platz: String?, bis: String?) -> String {
        [typ, platz, bis.map { "bis \(isoZuDeutsch($0))" }].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
    }

    /// "1" statt "P1" auf den Chips beim Sperren.
    static func platzChip(_ kurz: String?) -> String {
        guard let kurz else { return "" }
        return kurz.hasPrefix("P") ? String(kurz.dropFirst()) : kurz
    }

    /// "1" statt "Platz 1" auf den Chips der Serie.
    static func platzOhneWort(_ name: String?) -> String {
        guard let name else { return "" }
        return name.replacingOccurrences(of: #"^[Pp][Ll][Aa][Tt][Zz]\s*"#, with: "", options: .regularExpression)
    }
}
