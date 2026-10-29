/**
 * Was das Konto zeigt, als reine Funktionen
 *
 * Texte und Auswahl wie apps/mobile/app/(tabs)/konto.tsx und die Blaetter
 * dort (Stammdatenformular, MerkmaleKarte, KontoloeschungFormular), ohne
 * SwiftUI - geprueft in KontoLogikTests.
 */

import Foundation

/// Alles, was der Konto-Tab laedt; jede Quelle fuer sich.
struct KontoInhalt: Sendable {
    let profil: Abschnitt<MeinProfil?>
    let forderungen: Abschnitt<[Forderung]>
    let getraenke: Abschnitt<[EigenesGetraenk]>
    let dienst: Abschnitt<Arbeitsdienst?>
    let mandat: Abschnitt<MeinMandat?>
    let merkmale: Abschnitt<[MerkmalZeile]>
}

/// Ein Merkmal mit allen seinen Werten (buendeln in MerkmaleKarte.tsx).
struct Merkmal: Equatable, Identifiable, Sendable {
    struct Wert: Equatable, Sendable {
        let option: String?
        let label: String?
        let text: String?
        let seit: String?
    }

    enum Darstellung: Equatable, Sendable {
        /// Nur der Verein darf es aendern.
        case nurLesen
        case jaNein
        /// Eine Liste mit genau einem Wert und 2-4 Optionen: eine Wahl untereinander (U71).
        case einzelwahl
        /// Mehrere Werte als Marken mit "+ Option".
        case liste
        /// Text, Datum oder Zahl mit Speichern.
        case eingabe
    }

    let code: String
    let name: String
    let beschreibung: String
    let art: String
    let multiple: Bool
    let darfIch: Bool
    let optionen: [MerkmalZeile.Option]
    var werte: [Wert]

    var id: String { code }
    var gesetzt: Bool { !werte.isEmpty }

    var darstellung: Darstellung {
        if !darfIch { return .nurLesen }
        if art == "boolean" { return .jaNein }
        if art == "list" && !multiple && optionen.count > 1 && optionen.count <= 4 { return .einzelwahl }
        if art == "list" { return .liste }
        return .eingabe
    }
}

/// Die Marke unter einer Forderung (Statusmarke in konto.tsx).
struct Statusmarke: Equatable, Sendable {
    enum Ton: Equatable, Sendable { case gold, rot, grau }
    let text: String
    let ton: Ton
}

enum KontoLogik {
    // MARK: - Profilkopf

    static func initialen(vorname: String, nachname: String) -> String {
        (String(vorname.prefix(1)) + String(nachname.prefix(1))).uppercased()
    }

    /// "Mitglied seit 2019", die Mannschaft und "Mannschaftsführer", soweit vorhanden.
    static func marken(_ p: MeinProfil?) -> [String] {
        guard let p else { return [] }
        var liste: [String] = []
        if let seit = p.memberSince, !seit.isEmpty { liste.append("Mitglied seit \(seit.prefix(4))") }
        if let team = p.teamName, !team.isEmpty {
            liste.append(team)
            if p.isTeamCaptain == true { liste.append("Mannschaftsführer") }
        }
        return liste
    }

    // MARK: - Abrechnung

    /**
     * Offen ist, was noch eingezogen oder bezahlt werden muss. "returned"
     * zaehlt mit: eine zurueckgebuchte Lastschrift ist Geld, das der Verein
     * nicht bekommen hat.
     */
    static func offen(_ liste: [Forderung]) -> [Forderung] {
        liste.filter { ["open", "notified", "returned"].contains($0.status ?? "") }
    }

    static func zurueckText(_ anzahl: Int) -> String? {
        guard anzahl > 0 else { return nil }
        let anfang = anzahl == 1 ? "Eine Lastschrift kam zurück" : "\(anzahl) Lastschriften kamen zurück"
        return "\(anfang) – die Beträge sind wieder offen. Bitte melde dich beim Verein."
    }

    /// "Beitrag 2026" - unbekannte Arten mit ihrem Code.
    static func forderungTitel(_ f: Forderung) -> String {
        let art = f.kind.map { Forderungen.chargeKindLabel($0) ?? $0 } ?? ""
        if let p = f.periodLabel, !p.isEmpty { return "\(art) \(p)" }
        return art
    }

    /// Forderungen plus die Getraenke des laufenden Monats - die ehrliche Zahl.
    static func summe(offen: [Forderung], getraenkeLaufend: Int) -> Int {
        offen.reduce(0) { $0 + ($1.amountCents ?? 0) } + getraenkeLaufend
    }

    static func statusmarke(status: String, faellig: String?) -> Statusmarke {
        switch status {
        case "notified":
            if let f = faellig, !f.isEmpty { return Statusmarke(text: "Einzug am \(tagDatum(f))", ton: .gold) }
            return Statusmarke(text: "angekündigt", ton: .gold)
        case "returned": return Statusmarke(text: "zurückgebucht", ton: .rot)
        case "laufend": return Statusmarke(text: "läuft noch", ton: .grau)
        default: return Statusmarke(text: "offen", ton: .grau)
        }
    }

    /// "Getränke Oktober"
    static func getraenkeTitel(_ jetzt: Date) -> String {
        "Getränke \(Zeit.monatLang(jetzt))"
    }

    // MARK: - Arbeitsdienst

    /// "4 / 10 h", ohne Soll "4 h"
    static func dienstWert(_ d: Arbeitsdienst) -> String {
        let ist = d.completedHours ?? 0
        let soll = d.requiredHours ?? 0
        return soll > 0 ? "\(HomeLogik.jsZahl(ist)) / \(HomeLogik.jsZahl(soll)) h" : "\(HomeLogik.jsZahl(ist)) h"
    }

    static func dienstText(_ d: Arbeitsdienst) -> String {
        let ist = d.completedHours ?? 0
        let soll = d.requiredHours ?? 0
        if soll == 0 { return "Für dieses Jahr ist kein Arbeitsdienst vorgesehen." }
        if ist >= soll { return "Erledigt – danke für deinen Einsatz." }
        return "Fehlende Stunden werden zum Jahresende als Ausgleich berechnet."
    }

    static func dienstAnteil(_ d: Arbeitsdienst) -> Double {
        let soll = d.requiredHours ?? 0
        return soll > 0 ? min(1, (d.completedHours ?? 0) / soll) : 0
    }

    // MARK: - Mandat

    /// Die Zeilen der Mandatsansicht.
    static func mandatZeilen(_ m: MeinMandat) -> [(String, String)] {
        let iban = m.ibanLast4.flatMap { $0.isEmpty ? nil : "•••• \($0)" } ?? "–"
        return [
            ("Kontoinhaber", leerStrich(m.holder)),
            ("IBAN", iban),
            ("Bank", leerStrich(m.bankName)),
            ("Mandatsreferenz", m.reference ?? ""),
            ("Unterschrieben am", m.signedOn.map(tagDatum) ?? ""),
        ]
    }

    private static func leerStrich(_ s: String?) -> String {
        guard let s, !s.isEmpty else { return "–" }
        return s
    }

    // MARK: - Datum

    /**
     * "2026-11-01" -> "01.11.2026"; ein Zeitstempel wird erst in Berliner
     * Zeit zum Tag. Was sich nicht lesen laesst, bleibt, wie es ist.
     */
    static func tagDatum(_ wert: String) -> String {
        let tag: String
        if wert.count == 10 {
            tag = wert
        } else if let d = Zeit.datum(wert) {
            tag = Zeit.berlinDay(d)
        } else {
            return wert
        }
        let teile = tag.split(separator: "-")
        guard teile.count == 3 else { return wert }
        return "\(teile[2]).\(teile[1]).\(teile[0])"
    }

    // MARK: - Einwilligungen

    /// Aus den Zeilen der RPC wird je Merkmal ein Eintrag; nur, was das Mitglied selbst pflegen darf.
    static func merkmale(_ zeilen: [MerkmalZeile]) -> [Merkmal] {
        var liste: [Merkmal] = []
        for z in zeilen {
            let i: Int
            if let vorhanden = liste.firstIndex(where: { $0.code == z.code }) {
                i = vorhanden
            } else {
                liste.append(Merkmal(
                    code: z.code,
                    name: z.name ?? z.code,
                    beschreibung: Merkmaltexte.merkmalBeschreibung(code: z.code, beschreibung: z.description ?? "", sicht: .mitglied),
                    art: z.valueKind ?? "text",
                    multiple: z.multiple ?? false,
                    darfIch: z.darfIch ?? false,
                    optionen: z.optionen ?? [],
                    werte: []
                ))
                i = liste.count - 1
            }
            // Die RPC liefert auch Merkmale ohne Wert - dann bleibt die Liste leer.
            if z.optionValue != nil || z.textValue != nil {
                liste[i].werte.append(.init(option: z.optionValue, label: z.optionLabel, text: z.textValue, seit: z.setAt))
            }
        }
        return liste.filter { m in zeilen.contains { $0.code == m.code && $0.selfEditable == true } }
    }

    /// Zeigt "Einwilligungen" in den Einstellungen nur, wenn es etwas zu pflegen gibt.
    static func zeigeEinwilligungen(_ zeilen: [MerkmalZeile]?) -> Bool {
        (zeilen ?? []).contains { $0.selfEditable == true }
    }

    /// "gesetzt · nur der Verein kann das ändern"
    static func nurLesenText(_ m: Merkmal) -> String {
        let wert = m.gesetzt ? (m.werte[0].label ?? m.werte[0].text ?? "gesetzt") : "nicht gesetzt"
        return "\(wert) · nur der Verein kann das ändern"
    }
}
