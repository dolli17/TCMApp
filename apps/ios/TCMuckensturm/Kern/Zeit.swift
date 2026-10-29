/**
 * Zeit in Europe/Berlin
 *
 * Portierung aus packages/core/src/booking.ts (berlinTime, localMinutes,
 * minutesOf, minutesToTime, timeToMinutes) und home.ts (berlinDay, Abstand in
 * Kalendertagen). Gerechnet wird immer in Berliner Zeit, nie in der Zeitzone
 * des Geraets. Gepruefte Faelle: packages/core/golden/<funktion>.json (KernGoldenTests).
 *
 * Zeitpunkte bleiben in den Modellen Text wie in der Expo-App; `datum(_:)`
 * liest sie, egal ob PostgREST "+00:00" oder JavaScript "Z" schreibt.
 */

import Foundation

enum Zeit {
    static let berlinZone = TimeZone(identifier: "Europe/Berlin")!

    static let berlin: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = berlinZone
        c.locale = Locale(identifier: "de_DE")
        return c
    }()

    static let utc: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }()

    // Feste Namen statt DateFormatter: dieselben Woerter auf jedem Geraet,
    // egal welche Sprache eingestellt ist. Index 0 ist Sonntag wie bei Calendar.weekday - 1.
    static let wochentageLang = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"]
    static let wochentageKurz = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"]
    static let monateLang = [
        "Januar", "Februar", "März", "April", "Mai", "Juni",
        "Juli", "August", "September", "Oktober", "November", "Dezember",
    ]
    /// Wie Intl "short" auf iOS, ohne den Punkt (eventDatumKachel)
    static let monateKurz = ["Jan", "Feb", "März", "Apr", "Mai", "Juni", "Juli", "Aug", "Sept", "Okt", "Nov", "Dez"]

    // MARK: - Lesen und Schreiben

    /// ISO-8601 mit Zone ("2026-07-15T16:30:00Z", "...+00:00", "...123456+02:00")
    /// oder nur ein Tag ("2026-09-01", gilt als UTC-Mitternacht wie in JavaScript).
    static func datum(_ text: String) -> Date? {
        let t = text.trimmingCharacters(in: .whitespaces)
        let teile = t.split(maxSplits: 1, whereSeparator: { $0 == "T" || $0 == " " })
        guard let tagTeil = teile.first else { return nil }
        let tag = tagTeil.split(separator: "-")
        guard tag.count == 3, let jahr = Int(tag[0]), let monat = Int(tag[1]), let tagZahl = Int(tag[2]) else {
            return nil
        }

        var sekunden = 0.0
        var versatz = 0
        if teile.count == 2 {
            var rest = Substring(teile[1])
            // Zone abtrennen
            if rest.hasSuffix("Z") || rest.hasSuffix("z") {
                rest = rest.dropLast()
            } else if let i = rest.lastIndex(where: { $0 == "+" || $0 == "-" }) {
                let zone = rest[rest.index(after: i)...].replacingOccurrences(of: ":", with: "")
                guard zone.count == 2 || zone.count == 4, let zahl = Int(zone) else { return nil }
                let stunden = zone.count == 2 ? zahl : zahl / 100
                let minuten = zone.count == 2 ? 0 : zahl % 100
                versatz = (stunden * 3600 + minuten * 60) * (rest[i] == "-" ? -1 : 1)
                rest = rest[..<i]
            }
            let uhr = rest.split(separator: ":")
            guard uhr.count >= 2, let h = Int(uhr[0]), let m = Int(uhr[1]) else { return nil }
            let s = uhr.count > 2 ? (Double(uhr[2]) ?? .nan) : 0
            guard !s.isNaN else { return nil }
            sekunden = Double(h * 3600 + m * 60) + s
        }

        guard let mitternacht = utc.date(from: DateComponents(year: jahr, month: monat, day: tagZahl)) else {
            return nil
        }
        return mitternacht.addingTimeInterval(sekunden - Double(versatz))
    }

    /// "2026-10-25T09:00:00.000Z" wie Date.toISOString() - so gehen Zeitpunkte an die Datenbank.
    static func iso(_ datum: Date) -> String {
        let millis = Int64((datum.timeIntervalSince1970 * 1000).rounded())
        let sekunden = Int64((Double(millis) / 1000).rounded(.down))
        let rest = millis - sekunden * 1000
        let k = utc.dateComponents(
            [.year, .month, .day, .hour, .minute, .second],
            from: Date(timeIntervalSince1970: TimeInterval(sekunden))
        )
        return String(
            format: "%04d-%02d-%02dT%02d:%02d:%02d.%03dZ",
            k.year!, k.month!, k.day!, k.hour!, k.minute!, k.second!, Int(rest)
        )
    }

    // MARK: - booking.ts

    /// "08:30" -> 510
    static func timeToMinutes(_ wert: String) -> Int {
        let teile = wert.split(separator: ":", omittingEmptySubsequences: false)
        let h = teile.count > 0 ? Int(teile[0]) ?? 0 : 0
        let m = teile.count > 1 ? Int(teile[1]) ?? 0 : 0
        return h * 60 + m
    }

    /// 510 -> "08:30"
    static func minutesToTime(_ minuten: Int) -> String {
        String(format: "%02d:%02d", minuten / 60, minuten % 60)
    }

    /// Uhrzeit in Minuten seit Mitternacht, gerechnet in Europe/Berlin.
    static func localMinutes(_ datum: Date) -> Int {
        let k = berlin.dateComponents([.hour, .minute], from: datum)
        return (k.hour ?? 0) * 60 + (k.minute ?? 0)
    }

    /// Dasselbe fuer einen ISO-Zeitstempel aus der Datenbank.
    static func minutesOf(_ iso: String) -> Int {
        guard let d = datum(iso) else { return 0 }
        return localMinutes(d)
    }

    /// Versatz der Berliner Wanduhr gegenueber UTC in Minuten (60 im Winter, 120 im Sommer).
    private static func berlinOffsetMinutes(_ zeit: Date) -> Int {
        berlinZone.secondsFromGMT(for: zeit) / 60
    }

    /**
     * Aus Tag ("2026-10-25") und Minute den echten Zeitpunkt machen, in
     * Europe/Berlin. Wie in booking.ts wird der Versatz zweimal bestimmt;
     * in der doppelten Stunde gewinnt die erste.
     */
    static func berlinTime(day: String, minutes: Int) -> Date {
        let teile = day.split(separator: "-").map { Int($0) }
        let jahr = teile.count > 0 ? teile[0] ?? 1970 : 1970
        let monat = teile.count > 1 ? teile[1] ?? 1 : 1
        let tag = teile.count > 2 ? teile[2] ?? 1 : 1
        let mitternacht = utc.date(from: DateComponents(year: jahr, month: monat, day: tag)) ?? Date(timeIntervalSince1970: 0)
        let naiv = mitternacht.addingTimeInterval(TimeInterval(minutes * 60))
        let ersterVersuch = naiv.addingTimeInterval(TimeInterval(-berlinOffsetMinutes(naiv) * 60))
        return naiv.addingTimeInterval(TimeInterval(-berlinOffsetMinutes(ersterVersuch) * 60))
    }

    // MARK: - home.ts

    /// "2026-09-28" fuer diesen Zeitpunkt in Berlin
    static func berlinDay(_ zeit: Date) -> String {
        let k = berlin.dateComponents([.year, .month, .day], from: zeit)
        return String(format: "%04d-%02d-%02d", k.year ?? 0, k.month ?? 0, k.day ?? 0)
    }

    /// Abstand in Kalendertagen (Berlin) von a nach b
    static func tageZwischen(_ a: Date, _ b: Date) -> Int {
        guard let ta = datum(berlinDay(a)), let tb = datum(berlinDay(b)) else { return 0 }
        return Int((tb.timeIntervalSince(ta) / 86_400).rounded())
    }

    /// Wochentag ohne Punkt: "Mi"
    static func kurzerWochentag(_ zeit: Date) -> String {
        wochentageKurz[berlin.component(.weekday, from: zeit) - 1]
    }

    static func langerWochentag(_ zeit: Date) -> String {
        wochentageLang[berlin.component(.weekday, from: zeit) - 1]
    }

    /// "30.09." in Berlin
    static func tagMonat(_ zeit: Date) -> String {
        let k = berlin.dateComponents([.month, .day], from: zeit)
        return String(format: "%02d.%02d.", k.day ?? 0, k.month ?? 0)
    }

    /// "Donnerstag, 29. Oktober" - der Kicker ueber "Hallo" auf Home
    static func heuteLang(_ zeit: Date) -> String {
        let k = berlin.dateComponents([.month, .day], from: zeit)
        return "\(langerWochentag(zeit)), \(k.day ?? 0). \(monateLang[(k.month ?? 1) - 1])"
    }

    /// "Oktober"
    static func monatLang(_ zeit: Date) -> String {
        monateLang[berlin.component(.month, from: zeit) - 1]
    }

    /// Das Jahr in Berlin
    static func jahr(_ zeit: Date) -> Int {
        berlin.component(.year, from: zeit)
    }
}

/// Math.round aus JavaScript: .5 rundet zur groesseren Zahl.
func jsRound(_ x: Double) -> Int {
    Int((x + 0.5).rounded(.down))
}
