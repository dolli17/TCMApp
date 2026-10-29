/**
 * Was der Konto-Tab von Supabase liest und schreibt
 *
 * Wie apps/mobile/src/lib/daten.ts (ladeMeineStammdaten, ladeMeinMandat,
 * speichereStammdaten usw.), aber nur ueber RPCs: statt der Tabellen
 * members, memberships und sepa_mandates nimmt die native App mein_profil(),
 * mein_mandat(), save_my_profile und save_my_notfallkontakt
 * (docs/native/app-api.md, "Neu fuer die nativen Apps").
 *
 * Lesende Aufrufe werfen den uebersetzten Satz als `Meldung`, schreibende
 * geben ein `Ergebnis` zurueck, dessen Meldung im Formular erscheint.
 */

import Foundation
import Supabase

// MARK: - Modelle

/// Die eine Zeile aus mein_profil().
struct MeinProfil: Decodable, Equatable, Sendable {
    let firstName: String?
    let lastName: String?
    let title: String?
    let phone: String?
    let mobile: String?
    let street: String?
    let postcode: String?
    let city: String?
    let emergencyContactName: String?
    let emergencyContactPhone: String?
    let emergencyContactRelation: String?
    let membershipNumber: String?
    let memberSince: String?
    let teamName: String?
    let isTeamCaptain: Bool?

    enum CodingKeys: String, CodingKey {
        case title, phone, mobile, street, postcode, city
        case firstName = "first_name"
        case lastName = "last_name"
        case emergencyContactName = "emergency_contact_name"
        case emergencyContactPhone = "emergency_contact_phone"
        case emergencyContactRelation = "emergency_contact_relation"
        case membershipNumber = "membership_number"
        case memberSince = "member_since"
        case teamName = "team_name"
        case isTeamCaptain = "is_team_captain"
    }

    /**
     * Die Werte fuer die Formulare, Schluessel = Spaltenname. Aus null wird
     * der leere Text: das Formular arbeitet mit Zeichenketten.
     */
    var werte: [String: String] {
        [
            "first_name": firstName ?? "", "last_name": lastName ?? "", "title": title ?? "",
            "phone": phone ?? "", "mobile": mobile ?? "", "street": street ?? "",
            "postcode": postcode ?? "", "city": city ?? "",
            "emergency_contact_name": emergencyContactName ?? "",
            "emergency_contact_phone": emergencyContactPhone ?? "",
            "emergency_contact_relation": emergencyContactRelation ?? "",
        ]
    }
}

/// Eine Zeile aus my_charges.
struct Forderung: Decodable, Equatable, Identifiable, Sendable {
    let id: String
    let kind: String?
    let description: String?
    let periodLabel: String?
    let amountCents: Int?
    let dueDate: String?
    let status: String?
    let memberName: String?
    let isForOther: Bool?

    enum CodingKeys: String, CodingKey {
        case id, kind, description, status
        case periodLabel = "period_label"
        case amountCents = "amount_cents"
        case dueDate = "due_date"
        case memberName = "member_name"
        case isForOther = "is_for_other"
    }
}

/// Die Zeile aus mein_mandat(). Von der IBAN gibt es nur die letzten vier Stellen.
struct MeinMandat: Decodable, Equatable, Sendable {
    let reference: String?
    let signedOn: String?
    let status: String?
    let holder: String?
    let bankName: String?
    let ibanLast4: String?

    enum CodingKeys: String, CodingKey {
        case reference, status, holder
        case signedOn = "signed_on"
        case bankName = "bank_name"
        case ibanLast4 = "iban_last4"
    }
}

/// Eine Zeile aus member_attributes - je Merkmal und gesetztem Wert eine.
struct MerkmalZeile: Decodable, Equatable, Sendable {
    struct Option: Decodable, Equatable, Sendable {
        let value: String
        let label: String?
    }

    let code: String
    let name: String?
    let description: String?
    /// list, text, date, boolean, number
    let valueKind: String?
    let multiple: Bool?
    let optionen: [Option]?
    let optionValue: String?
    let optionLabel: String?
    let textValue: String?
    let setAt: String?
    let selfEditable: Bool?
    let darfIch: Bool?

    enum CodingKeys: String, CodingKey {
        case code, name, description, multiple, optionen
        case valueKind = "value_kind"
        case optionValue = "option_value"
        case optionLabel = "option_label"
        case textValue = "text_value"
        case setAt = "set_at"
        case selfEditable = "self_editable"
        case darfIch = "darf_ich"
    }
}

/// Ergebnis eines schreibenden Aufrufs (Ergebnis in daten.ts).
struct Ergebnis: Equatable, Sendable {
    let ok: Bool
    let meldung: String
    /// Bei Pruefungsfehlern: welches Feld gemeint ist, damit das Formular es markiert.
    var feld: String?

    static func erfolg(_ meldung: String) -> Ergebnis { Ergebnis(ok: true, meldung: meldung) }
    static func fehler(_ meldung: String, feld: String? = nil) -> Ergebnis { Ergebnis(ok: false, meldung: meldung, feld: feld) }
}

// MARK: - Laden und Speichern

struct Kontodaten: Sendable {
    let client: SupabaseClient

    private func uebersetzt<T: Sendable>(_ aufruf: () async throws -> T) async throws -> T {
        do {
            return try await aufruf()
        } catch {
            throw Meldung.aus(error)
        }
    }

    /// Schreibt und macht aus jedem Fehler die Meldung fuer das Formular.
    private func schreiben(_ erfolg: String, _ aufruf: () async throws -> Void) async -> Ergebnis {
        do {
            try await aufruf()
            return .erfolg(erfolg)
        } catch {
            return .fehler(Meldung.aus(error).text)
        }
    }

    /// Ohne Zugang keine Zeile, dann nil.
    func profil() async throws -> MeinProfil? {
        try await uebersetzt {
            let zeilen: [MeinProfil] = try await client.rpc("mein_profil").execute().value
            return zeilen.first
        }
    }

    /// Die member_id fuer member_attributes; ohne Zugang oder als Kiosk nil.
    func meineId() async throws -> String? {
        try await uebersetzt {
            let zeilen: [Ich] = try await client.rpc("ich").execute().value
            return zeilen.first?.memberId
        }
    }

    func forderungen() async throws -> [Forderung] {
        try await uebersetzt { try await client.rpc("my_charges").execute().value }
    }

    /// Ohne aktives Mandat nil.
    func mandat() async throws -> MeinMandat? {
        try await uebersetzt {
            let zeilen: [MeinMandat] = try await client.rpc("mein_mandat").execute().value
            return zeilen.first
        }
    }

    func merkmale() async throws -> [MerkmalZeile] {
        guard let id = try await meineId() else { return [] }
        return try await uebersetzt {
            try await client.rpc("member_attributes", params: ["p_member_id": id]).execute().value
        }
    }

    /**
     * Eigene Stammdaten speichern (save_my_profile). Wie speichereStammdaten:
     * erst pruefen (Profil.speichern), dann nur die geaenderten Felder
     * schicken. Ein fehlender Parameter bleibt unveraendert, "" leert.
     */
    func speichereProfil(neu: [String: String], alt: [String: String]) async -> Ergebnis {
        switch Profil.speichern(neu: neu, alt: alt) {
        case .nichtsGeaendert:
            return .fehler("Nichts geändert.")
        case let .fehler(f):
            return .fehler(f.meldung, feld: f.feld)
        case let .senden(patch):
            let params = Dictionary(uniqueKeysWithValues: patch.map { ("p_\($0.key)", $0.value) })
            return await schreiben("Gespeichert.") {
                try await client.rpc("save_my_profile", params: params).execute()
            }
        }
    }

    /// Ersetzt alle drei Felder; leere Texte werden in der RPC zu null.
    func speichereNotfallkontakt(_ werte: [String: String]) async -> Ergebnis {
        if let f = Profil.pruefeNotfallkontakt(werte) { return .fehler(f.meldung, feld: f.feld) }
        let params = [
            "p_name": Profil.trim(werte["emergency_contact_name"] ?? ""),
            "p_phone": Profil.trim(werte["emergency_contact_phone"] ?? ""),
            "p_relation": Profil.trim(werte["emergency_contact_relation"] ?? ""),
        ]
        return await schreiben("Notfallkontakt gespeichert.") {
            try await client.rpc("save_my_notfallkontakt", params: params).execute()
        }
    }

    /// Optionale Parameter fehlen, statt null zu sein (Grundsaetze in app-api.md).
    func setzeMerkmal(code: String, option: String? = nil, text: String? = nil) async -> Ergebnis {
        do {
            guard let id = try await meineId() else { return .fehler("Nicht angemeldet.") }
            var params = ["p_member_id": id, "p_type_code": code]
            if let option { params["p_option_value"] = option }
            if let text { params["p_text_value"] = text }
            try await client.rpc("set_member_attribute", params: params).execute()
            return .erfolg("Gespeichert.")
        } catch {
            return .fehler(Meldung.aus(error).text)
        }
    }

    func entferneMerkmal(code: String, option: String? = nil) async -> Ergebnis {
        do {
            guard let id = try await meineId() else { return .fehler("Nicht angemeldet.") }
            var params = ["p_member_id": id, "p_type_code": code]
            if let option { params["p_option_value"] = option }
            try await client.rpc("remove_member_attribute", params: params).execute()
            return .erfolg("Entfernt.")
        } catch {
            return .fehler(Meldung.aus(error).text)
        }
    }

    /// Kuendigung beantragen. Ein zweiter Antrag binnen 24 Stunden ist kein Fehler.
    func beantrageKontoloeschung(_ nachricht: String) async -> Ergebnis {
        switch Kontoloeschung.pruefen(nachricht) {
        case let .fehler(text):
            return .fehler(text)
        case let .ok(text):
            do {
                let params = text.map { ["p_nachricht": $0] } ?? [:]
                let neu: Bool = try await client.rpc("konto_loeschung_beantragen", params: params).execute().value
                return .erfolg(Kontoloeschung.meldung(neu: neu))
            } catch {
                return .fehler(Meldung.aus(error).text)
            }
        }
    }
}
