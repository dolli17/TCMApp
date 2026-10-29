/**
 * Was Home, Glocke und Neuigkeiten von Supabase lesen
 *
 * Wie apps/mobile/src/lib/daten.ts (ladeMeineBuchungen, ladeBenachrichtigungen
 * usw.), Vertrag: docs/native/app-api.md. Jede Rueckgabespalte ist optional,
 * die nicht offensichtlich Pflicht ist (Kennungen, Zeitpunkte). Jeder Fehler
 * geht durch translateDbError (DbFehler); lesende Aufrufe werfen den
 * uebersetzten Satz als `Meldung`.
 */

import Foundation
import Supabase

/// Ein Fehler, dessen Text die App unveraendert zeigt.
struct Meldung: Error, Equatable, LocalizedError {
    let text: String
    var errorDescription: String? { text }

    /// Aus einem beliebigen Fehler den Satz fuer die Anzeige machen.
    static func aus(_ fehler: any Error) -> Meldung {
        if let meldung = fehler as? Meldung { return meldung }
        return Meldung(text: DbFehler.translateDbError(form(fehler)))
    }

    /// Die Form, die translateDbError erwartet (wie der Fehler von supabase-js).
    static func form(_ fehler: any Error) -> PostgresFehler {
        if let p = fehler as? PostgrestError {
            return PostgresFehler(code: p.code, message: p.message, details: p.details, hint: p.hint)
        }
        if fehler is URLError {
            // Wie fetch in React Native: wird zu "Keine Verbindung zum Server."
            return PostgresFehler(message: "Network request failed")
        }
        // Decodierfehler u. a.: englischer Text ohne Regel - landet beim allgemeinen Satz.
        return PostgresFehler(message: "unbekannt")
    }
}

// MARK: - Modelle

/// Eine Zeile aus my_bookings.
struct MeineBuchung: Decodable, Equatable, Identifiable, Sendable, Zeitraum {
    let bookingId: String
    let startsAt: String
    let endsAt: String
    let courtName: String?
    let kind: String?
    let typeCode: String?
    let typeName: String?
    let title: String?
    let ownerName: String?
    let binBucher: Bool?
    let players: [String?]?

    var id: String { bookingId }

    enum CodingKeys: String, CodingKey {
        case kind, title, players
        case bookingId = "booking_id"
        case startsAt = "starts_at"
        case endsAt = "ends_at"
        case courtName = "court_name"
        case typeCode = "type_code"
        case typeName = "type_name"
        case ownerName = "owner_name"
        case binBucher = "bin_bucher"
    }
}

/// Eine Zeile aus open_matches.
struct OffenesSpiel: Decodable, Equatable, Identifiable, Sendable, Zeitraum {
    let bookingId: String
    let startsAt: String
    let endsAt: String
    let courtName: String?
    let typeCode: String?
    let typeName: String?
    let ownerMemberId: String?
    let ownerName: String?
    let players: [String?]?
    let frei: Int?
    let binDabei: Bool?

    var id: String { bookingId }

    enum CodingKeys: String, CodingKey {
        case players, frei
        case bookingId = "booking_id"
        case startsAt = "starts_at"
        case endsAt = "ends_at"
        case courtName = "court_name"
        case typeCode = "type_code"
        case typeName = "type_name"
        case ownerMemberId = "owner_member_id"
        case ownerName = "owner_name"
        case binDabei = "bin_dabei"
    }
}

/// Eine Belegung aus day_schedule.
struct TagesBelegung: Decodable, Equatable, Sendable, BelegterSlot, Belegungsmerkmale {
    let bookingId: String
    let courtId: String
    let startsAt: String
    let endsAt: String
    let kind: String?
    let seriesId: String?
    let typeCode: String?
    let typeName: String?
    let title: String?
    let ownerMemberId: String?
    let ownerName: String?
    let isOwn: Bool?
    let binDabei: Bool?
    let partnerWanted: Bool?
    let frei: Int?
    let players: [String?]?
    let playerMemberIds: [String?]?
    let guestNames: [String?]?

    enum CodingKeys: String, CodingKey {
        case kind, title, frei, players
        case bookingId = "booking_id"
        case courtId = "court_id"
        case startsAt = "starts_at"
        case endsAt = "ends_at"
        case seriesId = "series_id"
        case typeCode = "type_code"
        case typeName = "type_name"
        case ownerMemberId = "owner_member_id"
        case ownerName = "owner_name"
        case isOwn = "is_own"
        case binDabei = "bin_dabei"
        case partnerWanted = "partner_wanted"
        case playerMemberIds = "player_member_ids"
        case guestNames = "guest_names"
    }
}

/// Die eine Zeile aus booking_settings.
struct Buchungseinstellungen: Decodable, Equatable, Sendable {
    let openingTime: String?
    let closingTime: String?
    let slotMinutes: Int?
    let leadDays: Int?
    let maxOpenBookings: Int?
    let displayMinutes: Int?
    let guestFeeCents: Int?

    enum CodingKeys: String, CodingKey {
        case openingTime = "opening_time"
        case closingTime = "closing_time"
        case slotMinutes = "slot_minutes"
        case leadDays = "lead_days"
        case maxOpenBookings = "max_open_bookings"
        case displayMinutes = "display_minutes"
        case guestFeeCents = "guest_fee_cents"
    }
}

/// Eine aktive Buchungsart aus booking_types_aktiv.
struct Buchungsart: Decodable, Equatable, Sendable {
    let code: String
    let name: String?
    let durationMinutes: Int?
    let requiresPartner: Bool?
    let minPlayers: Int?
    let maxPlayers: Int?
    let sortOrder: Int?

    enum CodingKeys: String, CodingKey {
        case code, name
        case durationMinutes = "duration_minutes"
        case requiresPartner = "requires_partner"
        case minPlayers = "min_players"
        case maxPlayers = "max_players"
        case sortOrder = "sort_order"
    }
}

/// Ein aktiver Platz aus courts_aktiv.
struct AktiverPlatz: Decodable, Equatable, Identifiable, Sendable {
    let id: String
    let name: String?
    let shortName: String?
    let position: Int?

    enum CodingKeys: String, CodingKey {
        case id, name, position
        case shortName = "short_name"
    }
}

/// Eine Zeile aus my_notifications.
struct Benachrichtigung: Decodable, Equatable, Identifiable, Sendable, Benachrichtigungsdaten {
    let id: String
    let kind: String?
    let title: String?
    let body: String?
    let createdAt: String
    let readAt: String?
    let eventId: String?

    enum CodingKeys: String, CodingKey {
        case id, kind, title, body
        case createdAt = "created_at"
        case readAt = "read_at"
        case eventId = "event_id"
    }
}

/// Eine Zeile aus my_drink_purchases.
struct EigenesGetraenk: Decodable, Equatable, Identifiable, Sendable, Getraenkekauf {
    let id: String
    let itemName: String?
    let quantity: Int?
    let unitPriceCents: Int?
    let totalCents: Int?
    let createdAt: String?
    let voidedAt: String?
    let source: String?

    enum CodingKeys: String, CodingKey {
        case id, quantity, source
        case itemName = "item_name"
        case unitPriceCents = "unit_price_cents"
        case totalCents = "total_cents"
        case createdAt = "created_at"
        case voidedAt = "voided_at"
    }
}

/// Die eine Zeile aus my_work_duty. Stunden sind numeric, also Zahl oder Text.
struct Arbeitsdienst: Decodable, Equatable, Sendable {
    let year: Int?
    let requiredHours: Double?
    let completedHours: Double?
    let missingHours: Double?

    enum CodingKeys: String, CodingKey {
        case year
        case requiredHours = "required_hours"
        case completedHours = "completed_hours"
        case missingHours = "missing_hours"
    }

    init(year: Int?, requiredHours: Double?, completedHours: Double?, missingHours: Double?) {
        self.year = year
        self.requiredHours = requiredHours
        self.completedHours = completedHours
        self.missingHours = missingHours
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        year = try c.decodeIfPresent(Int.self, forKey: .year)
        requiredHours = try c.decodeIfPresent(Zahl.self, forKey: .requiredHours)?.wert
        completedHours = try c.decodeIfPresent(Zahl.self, forKey: .completedHours)?.wert
        missingHours = try c.decodeIfPresent(Zahl.self, forKey: .missingHours)?.wert
    }
}

/**
 * Die Zeile aus ich(). Home braucht nur den Namen; der Rest ist optional
 * decodiert, damit neue Spalten nichts brechen.
 */
struct Ich: Decodable, Equatable, Sendable {
    let memberId: String?
    let firstName: String?
    let lastName: String?
    let roles: [String]?
    let admin: Bool?
    let platzRechte: Bool?
    let kiosk: Bool?
    let zugang: Bool?
    let grund: String?
    let onboardingOffen: Bool?

    enum CodingKeys: String, CodingKey {
        case roles, admin, kiosk, zugang, grund
        case memberId = "member_id"
        case firstName = "first_name"
        case lastName = "last_name"
        case platzRechte = "platz_rechte"
        case onboardingOffen = "onboarding_offen"
    }

    /// Ohne Zugang oder ohne Mitglied (Kiosk) ist member_id null - dann kein Name.
    var name: MeinName? {
        guard memberId != nil else { return nil }
        return MeinName(vorname: firstName ?? "", nachname: lastName ?? "")
    }
}

/// Vor- und Nachname aus ich().
struct MeinName: Decodable, Equatable, Sendable {
    let vorname: String
    let nachname: String

    enum CodingKeys: String, CodingKey {
        case vorname = "first_name"
        case nachname = "last_name"
    }

    init(vorname: String, nachname: String) {
        self.vorname = vorname
        self.nachname = nachname
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        vorname = try c.decodeIfPresent(String.self, forKey: .vorname) ?? ""
        nachname = try c.decodeIfPresent(String.self, forKey: .nachname) ?? ""
    }
}

// MARK: - Laden

struct Startdaten: Sendable {
    let client: SupabaseClient

    /// Fuehrt einen Aufruf aus und uebersetzt jeden Fehler.
    private func uebersetzt<T: Sendable>(_ aufruf: () async throws -> T) async throws -> T {
        do {
            return try await aufruf()
        } catch {
            throw Meldung.aus(error)
        }
    }

    /// Name aus ich(), ohne Zugang oder ohne Mitglied nil.
    func meinName() async throws -> MeinName? {
        try await uebersetzt {
            let zeilen: [Ich] = try await client.rpc("ich").execute().value
            return zeilen.first?.name
        }
    }

    func meineBuchungen() async throws -> [MeineBuchung] {
        try await uebersetzt { try await client.rpc("my_bookings").execute().value }
    }

    func offeneSpiele() async throws -> [OffenesSpiel] {
        try await uebersetzt { try await client.rpc("open_matches").execute().value }
    }

    /// Belegungen eines Berliner Tages ("2026-10-29").
    func tagesplan(_ tag: String) async throws -> [TagesBelegung] {
        try await uebersetzt { try await client.rpc("day_schedule", params: ["p_date": tag]).execute().value }
    }

    /// Ohne Zeile nil.
    func buchungseinstellungen() async throws -> Buchungseinstellungen? {
        try await uebersetzt {
            let zeilen: [Buchungseinstellungen] = try await client.rpc("booking_settings").execute().value
            return zeilen.first
        }
    }

    func buchungsarten() async throws -> [Buchungsart] {
        try await uebersetzt {
            try await client.rpc("booking_types_aktiv", params: ["p_applies_to": "booking"]).execute().value
        }
    }

    func plaetze() async throws -> [AktiverPlatz] {
        try await uebersetzt { try await client.rpc("courts_aktiv").execute().value }
    }

    func eigeneGetraenke() async throws -> [EigenesGetraenk] {
        try await uebersetzt { try await client.rpc("my_drink_purchases").execute().value }
    }

    /// Ohne Zeile nil.
    func arbeitsdienst() async throws -> Arbeitsdienst? {
        try await uebersetzt {
            let zeilen: [Arbeitsdienst] = try await client.rpc("my_work_duty").execute().value
            return zeilen.first
        }
    }

    func veranstaltungen() async throws -> [MitgliedEvent] {
        try await uebersetzt { try await client.rpc("events_fuer_mitglied").execute().value }
    }

    /// Ungelesen zuerst, dann die neuesten.
    func benachrichtigungen(limit: Int = 30) async throws -> [Benachrichtigung] {
        try await uebersetzt { try await client.rpc("my_notifications", params: ["p_limit": limit]).execute().value }
    }

    /// Ohne p_ids: alle. Gibt die Zahl der markierten zurueck.
    @discardableResult
    func markiereGelesen() async throws -> Int {
        try await uebersetzt { try await client.rpc("mark_notifications_read").execute().value }
    }

    /// Ein Fehler zaehlt als 0 - die Glocke bleibt dann einfach leer.
    func ungelesen() async -> Int {
        (try? await client.rpc("my_unread_notification_count").execute().value as Int) ?? 0
    }
}
