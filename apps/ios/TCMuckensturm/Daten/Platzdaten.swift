/**
 * Was der Tab Plaetze von Supabase liest und schreibt
 *
 * Wie apps/mobile/src/lib/daten.ts (ladeKontingent, bucheplatz,
 * aendereMitspieler, storniereBuchung, sperreStunde usw.), Vertrag:
 * docs/native/app-api.md, Abschnitt Plaetze. Nur RPCs. Lesende Aufrufe werfen
 * den uebersetzten Satz als `Meldung`; schreibende geben ein `PlatzErgebnis`
 * zurueck, dessen Meldung im Blatt oder als Hinweis erscheint. Tagesplan,
 * Plaetze, Einstellungen und Buchungsarten liest Startdaten.
 */

import Foundation
import Supabase

extension TagesBelegung: PlanSlot, BuchungsSlot, Identifiable {
    var id: String { bookingId }
}

// MARK: - Modelle

/// Die eine Zeile aus my_booking_quota. allowed 0 heisst: unbegrenzt.
struct Kontingent: Decodable, Equatable, Sendable {
    var used: Int
    var allowed: Int

    static let leer = Kontingent(used: 0, allowed: 0)

    init(used: Int, allowed: Int) {
        self.used = used
        self.allowed = allowed
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        used = try c.decodeIfPresent(Int.self, forKey: .used) ?? 0
        allowed = try c.decodeIfPresent(Int.self, forKey: .allowed) ?? 0
    }

    enum CodingKeys: String, CodingKey { case used, allowed }
}

/// Eine Zeile aus member_directory.
struct Mitglied: Decodable, Equatable, Identifiable, Sendable {
    let id: String
    let firstName: String?
    let lastName: String?

    enum CodingKeys: String, CodingKey {
        case id
        case firstName = "first_name"
        case lastName = "last_name"
    }

    var name: String { "\(firstName ?? "") \(lastName ?? "")".trimmingCharacters(in: .whitespaces) }
}

/// Was create_blocking und update_blocking zurueckgeben.
private struct SperrErgebnis: Decodable {
    let createdCount: Int?
    let displacedCount: Int?

    enum CodingKeys: String, CodingKey {
        case createdCount = "created_count"
        case displacedCount = "displaced_count"
    }
}

/**
 * Ausgang einer schreibenden Aktion. Bei einer Sperrung, der Buchungen im
 * Weg liegen, steht deren Zahl in `kollisionen` - dann fragt das Blatt nach.
 */
struct PlatzErgebnis: Equatable, Sendable {
    let ok: Bool
    let meldung: String
    var kollisionen: Int?
}

extension Buchungsart {
    /// Die Spielform fuer die Besetzungsregeln (bookingTypeInfo).
    var info: BookingTypeInfo {
        BookingTypeInfo(
            code: code, name: name ?? code, durationMinutes: durationMinutes ?? 60, minPlayers: minPlayers ?? 2,
            maxPlayers: maxPlayers ?? 2, requiresPartner: requiresPartner ?? true
        )
    }
}

// MARK: - Laden und Schreiben

struct Platzdaten: Sendable {
    let client: SupabaseClient

    var start: Startdaten { Startdaten(client: client) }

    private func uebersetzt<T: Sendable>(_ aufruf: () async throws -> T) async throws -> T {
        do {
            return try await aufruf()
        } catch {
            throw Meldung.aus(error)
        }
    }

    /// Fuehrt eine schreibende RPC aus; jeder Fehler wird zur Meldung im PlatzErgebnis.
    private func schreibe(_ erfolg: String, _ aufruf: () async throws -> Void) async -> PlatzErgebnis {
        do {
            try await aufruf()
            return PlatzErgebnis(ok: true, meldung: erfolg)
        } catch {
            return PlatzErgebnis(ok: false, meldung: Meldung.aus(error).text)
        }
    }

    /// Ohne Zeile gilt {0, 0}, also unbegrenzt.
    func kontingent() async throws -> Kontingent {
        try await uebersetzt {
            let zeilen: [Kontingent] = try await client.rpc("my_booking_quota").execute().value
            return zeilen.first ?? .leer
        }
    }

    /// Die Kategorien einer Sperrung, die erste ist die Vorgabe.
    func blockungsarten() async throws -> [Buchungsart] {
        try await uebersetzt {
            try await client.rpc("booking_types_aktiv", params: ["p_applies_to": "blocking"]).execute().value
        }
    }

    /// Alle Mitglieder fuer die Mitspielersuche - gesucht wird in der App.
    func verzeichnis() async throws -> [Mitglied] {
        try await uebersetzt { try await client.rpc("member_directory", params: ["p_query": ""]).execute().value }
    }

    /// member_id und Platzrechte aus ich(); ohne Zeile nil.
    func ich() async throws -> Ich? {
        try await uebersetzt {
            let zeilen: [Ich] = try await client.rpc("ich").execute().value
            return zeilen.first
        }
    }

    // MARK: Buchen

    private struct BuchenParameter: Encodable {
        let p_court_id: String
        let p_starts_at: String
        let p_booking_type_code: String
        let p_player_member_ids: [String]
        let p_guest_names: [String]
        let p_partner_wanted: Bool
    }

    /// Beginn als Zeitpunkt aus berlinTime - nie in der Zeitzone des Geraets.
    func bucheplatz(
        courtId: String, beginn: Date, typ: String, mitspieler: [String], gaeste: [String], sucheMitspieler: Bool
    ) async -> PlatzErgebnis {
        await schreibe("Platz gebucht.") {
            try await client.rpc("create_booking", params: BuchenParameter(
                p_court_id: courtId, p_starts_at: Zeit.iso(beginn), p_booking_type_code: typ,
                p_player_member_ids: mitspieler, p_guest_names: gaeste, p_partner_wanted: sucheMitspieler
            )).execute()
        }
    }

    private struct MitspielerParameter: Encodable {
        let p_booking_id: String
        let p_member_ids: [String]
        let p_guest_names: [String]
    }

    /// Tauscht die Mitspieler komplett aus; leere Gastnamen fallen weg.
    func aendereMitspieler(bookingId: String, mitglieder: [String], gaeste: [String]) async -> PlatzErgebnis {
        let namen = gaeste.map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        return await schreibe("Mitspieler aktualisiert.") {
            try await client.rpc("update_booking_players", params: MitspielerParameter(
                p_booking_id: bookingId, p_member_ids: mitglieder, p_guest_names: namen
            )).execute()
        }
    }

    private struct GrundParameter: Encodable {
        let p_booking_id: String
        /// nil faellt weg: dann nimmt die Funktion ihren Standardwert.
        let p_reason: String?
    }

    func storniereBuchung(_ bookingId: String, grund: String?) async -> PlatzErgebnis {
        await schreibe("Buchung storniert.") {
            try await client.rpc("cancel_booking", params: GrundParameter(
                p_booking_id: bookingId, p_reason: Platzplan.nichtLeer(grund)
            )).execute()
        }
    }

    /// Ein Serientermin faellt aus, die Serie bleibt.
    func sageSerienterminAb(_ bookingId: String, grund: String?) async -> PlatzErgebnis {
        await schreibe("Der Termin ist abgesagt.") {
            try await client.rpc("cancel_series_occurrence", params: GrundParameter(
                p_booking_id: bookingId, p_reason: Platzplan.nichtLeer(grund)
            )).execute()
        }
    }

    /// Eine Sperrung aufheben - dieselbe RPC wie das Stornieren, eigene Meldung.
    func hebeSperreAuf(_ bookingId: String) async -> PlatzErgebnis {
        await schreibe("Die Sperrung ist aufgehoben.") {
            try await client.rpc("cancel_booking", params: ["p_booking_id": bookingId]).execute()
        }
    }

    func spieleMit(_ bookingId: String) async -> PlatzErgebnis {
        await schreibe("Du bist eingetragen. Viel Spaß!") {
            try await client.rpc("join_booking", params: ["p_booking_id": bookingId]).execute()
        }
    }

    private struct GesuchtParameter: Encodable {
        let p_booking_id: String
        let p_wanted: Bool
    }

    func sucheMitspieler(_ bookingId: String, gesucht: Bool) async -> PlatzErgebnis {
        await schreibe(gesucht ? "Die Buchung steht jetzt bei den offenen Spielen." : "Die Buchung ist nicht mehr ausgeschrieben.") {
            try await client.rpc("set_partner_wanted", params: GesuchtParameter(p_booking_id: bookingId, p_wanted: gesucht)).execute()
        }
    }

    // MARK: Platzrechte

    private struct UmsetzParameter: Encodable {
        let p_booking_id: String
        let p_court_id: String
        let p_starts_at: String
        let p_reason: String?
    }

    /// Auf einen anderen Platz, Tag oder Beginn (move_booking), nur mit Platzrechten.
    func setzeUm(bookingId: String, platzId: String, tag: String, minute: Int, grund: String?) async -> PlatzErgebnis {
        await schreibe("Die Buchung ist umgesetzt.") {
            try await client.rpc("move_booking", params: UmsetzParameter(
                p_booking_id: bookingId, p_court_id: platzId,
                p_starts_at: Zeit.iso(Zeit.berlinTime(day: tag, minutes: minute)), p_reason: Platzplan.nichtLeer(grund)
            )).execute()
        }
    }

    private struct SperrParameter: Encodable {
        var p_booking_id: String?
        let p_court_ids: [String]
        let p_von: String
        let p_bis: String
        let p_type_code: String
        let p_title: String
        let p_force: Bool
    }

    /**
     * Sperren (create_blocking). Zweistufig: liegen Buchungen im Weg, weist
     * die Datenbank ab und nennt ihre Zahl - die steht dann in `kollisionen`,
     * und erst mit verdraengen=true werden sie abgesagt.
     */
    func sperre(platzId: String, von: Date, bis: Date, typCode: String, grund: String, verdraengen: Bool) async -> PlatzErgebnis {
        do {
            let _: [SperrErgebnis] = try await client.rpc("create_blocking", params: SperrParameter(
                p_court_ids: [platzId], p_von: Zeit.iso(von), p_bis: Zeit.iso(bis), p_type_code: typCode,
                p_title: grund.trimmingCharacters(in: .whitespacesAndNewlines), p_force: verdraengen
            )).execute().value
            return PlatzErgebnis(ok: true, meldung: "Gesperrt.")
        } catch {
            return Self.sperrFehler(error)
        }
    }

    /// Eine Sperrung aendern (update_blocking), zweistufig wie sperre.
    func aendereSperre(
        bookingId: String, platzIds: [String], von: Date, bis: Date, typCode: String, grund: String, verdraengen: Bool
    ) async -> PlatzErgebnis {
        do {
            let zeilen: [SperrErgebnis] = try await client.rpc("update_blocking", params: SperrParameter(
                p_booking_id: bookingId, p_court_ids: platzIds, p_von: Zeit.iso(von), p_bis: Zeit.iso(bis),
                p_type_code: typCode, p_title: grund.trimmingCharacters(in: .whitespacesAndNewlines), p_force: verdraengen
            )).execute().value
            return PlatzErgebnis(ok: true, meldung: PlaetzeLogik.sperreGeaendert(verdraengt: zeilen.first?.displacedCount ?? 0))
        } catch {
            return Self.sperrFehler(error)
        }
    }

    private static func sperrFehler(_ fehler: any Error) -> PlatzErgebnis {
        let form = Meldung.form(fehler)
        return PlatzErgebnis(
            ok: false,
            meldung: DbFehler.translateDbError(form),
            kollisionen: PlaetzeLogik.kollisionen(aus: form.message ?? "")
        )
    }
}
