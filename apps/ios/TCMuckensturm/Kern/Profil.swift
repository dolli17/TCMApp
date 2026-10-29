/**
 * Eigene Stammdaten pruefen
 *
 * Portierung von memberProfileSchema (packages/core/src/schemas.ts): erst
 * pruefen, dann schicken - eine vierstellige Postleitzahl soll nicht als
 * Datenbankfehler zurueckkommen, sondern als Satz, der das Feld nennt.
 * Golden Files gibt es dafuer keine; die Faelle aus schemas.test.ts stehen
 * in ProfilTests.
 *
 * Die Felder heissen wie die Spalten von members, damit das Formular und
 * save_my_profile dieselben Namen benutzen.
 */

import Foundation

enum Profil {
    /// Genau die Felder, die save_my_profile annimmt, in der Reihenfolge des Schemas.
    static let felder = ["first_name", "last_name", "title", "phone", "mobile", "street", "postcode", "city"]

    /// Die Notfallkontakt-Felder (save_my_notfallkontakt).
    static let notfallFelder = ["emergency_contact_name", "emergency_contact_phone", "emergency_contact_relation"]

    /// Hoechstlaengen aus dem Schema.
    static let hoechstens: [String: Int] = [
        "first_name": 100, "last_name": 100, "title": 50, "phone": 50,
        "mobile": 50, "street": 200, "city": 100,
    ]

    struct Fehler: Equatable, Sendable {
        let feld: String
        let meldung: String
    }

    /// Wie String.prototype.trim (Leerraum und Zeilenumbrueche an beiden Enden).
    static func trim(_ s: String) -> String {
        s.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /**
     * Der erste Fehler wie issues[0] bei zod: Felder in Schema-Reihenfolge,
     * je Feld erst "fehlt", dann die Laenge. nil, wenn alles passt.
     */
    static func pruefen(_ werte: [String: String]) -> Fehler? {
        for feld in felder {
            let wert = trim(werte[feld] ?? "")
            // Gezaehlt wie String.length in JavaScript.
            let laenge = wert.utf16.count
            if feld == "first_name", wert.isEmpty { return Fehler(feld: feld, meldung: "Vorname fehlt.") }
            if feld == "last_name", wert.isEmpty { return Fehler(feld: feld, meldung: "Nachname fehlt.") }
            if feld == "postcode", !wert.isEmpty, !istPostleitzahl(wert) {
                return Fehler(feld: feld, meldung: "Postleitzahl muss fünfstellig sein.")
            }
            if let max = hoechstens[feld], laenge > max {
                // zod schreibt hier englisch ("String must contain at most …"); nativ steht ein Satz.
                return Fehler(feld: feld, meldung: "Höchstens \(max) Zeichen.")
            }
        }
        return nil
    }

    /// /^\d{5}$/ - nur die Ziffern 0 bis 9 wie \d in JavaScript.
    static func istPostleitzahl(_ s: String) -> Bool {
        s.utf8.count == 5 && s.utf8.allSatisfy { (0x30...0x39).contains($0) }
    }

    /// Was sich gegenueber dem gespeicherten Stand geaendert hat (verglichen nach trim).
    static func geaendert(neu: [String: String], alt: [String: String]) -> [String] {
        felder.filter { trim(neu[$0] ?? "") != trim(alt[$0] ?? "") }
    }

    enum Speichern: Equatable, Sendable {
        case nichtsGeaendert
        case fehler(Fehler)
        /// Spalte -> getrimmter Wert; ein leerer Text leert das Feld.
        case senden([String: String])
    }

    /**
     * Wie speichereStammdaten in apps/mobile/src/lib/daten.ts: nur geaenderte
     * Felder gehen hinaus, geprueft wird der ganze Datensatz. Fuer
     * save_my_profile heisst ein fehlendes Feld "unveraendert" und "" "leeren".
     */
    static func speichern(neu: [String: String], alt: [String: String]) -> Speichern {
        let felder = geaendert(neu: neu, alt: alt)
        if felder.isEmpty { return .nichtsGeaendert }
        if let f = pruefen(neu) { return .fehler(f) }
        var patch: [String: String] = [:]
        for feld in felder { patch[feld] = trim(neu[feld] ?? "") }
        return .senden(patch)
    }

    /// Eine Notfallnummer ohne Namen (wie speichereNotfallkontakt und der Constraint).
    static func pruefeNotfallkontakt(_ werte: [String: String]) -> Fehler? {
        let name = trim(werte["emergency_contact_name"] ?? "")
        let telefon = trim(werte["emergency_contact_phone"] ?? "")
        if !telefon.isEmpty && name.isEmpty {
            return Fehler(feld: "emergency_contact_name", meldung: "Zur Notfallnummer gehört auch ein Name.")
        }
        return nil
    }
}
