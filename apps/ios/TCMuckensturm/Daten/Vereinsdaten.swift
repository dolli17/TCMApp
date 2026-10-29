/**
 * Was der Tab Verein von Supabase liest und schreibt
 *
 * Wie apps/mobile/src/lib/daten.ts (ladeGetraenkekarte, bucheGetraenk,
 * storniereGetraenk, ladeStornoFenster, ladeVeranstaltung,
 * meldeZuVeranstaltungAn usw.), Vertrag: docs/native/app-api.md, Abschnitt
 * "Verein". Nur RPCs: das Stornofenster kommt aus drink_void_window_minutes
 * statt aus settings, die eigene Forderung zur Veranstaltung aus
 * events_fuer_mitglied (meine_forderung_*) statt aus charges.
 *
 * Lesende Aufrufe werfen den uebersetzten Satz als `Meldung`, schreibende
 * geben ein `Ergebnis` zurueck, dessen Meldung als Toast oder Hinweis erscheint.
 */

import Foundation
import Supabase

// MARK: - Modelle

/// Eine Zeile aus drink_menu.
struct Getraenk: Decodable, Equatable, Identifiable, Sendable, Korbartikel {
    let id: String
    let name: String?
    let category: String?
    let description: String?
    let priceCents: Int?
    let sortOrder: Int?

    enum CodingKeys: String, CodingKey {
        case id, name, category, description
        case priceCents = "price_cents"
        case sortOrder = "sort_order"
    }
}

/// Eine Veranstaltung im Detail mit dem eigenen Platz auf der Warteliste.
struct VeranstaltungDetail: Equatable, Sendable {
    let event: MitgliedEvent
    /// Eigener Platz auf der Warteliste, sonst nil
    let wartePlatz: Int?
}

// MARK: - Laden und Schreiben

struct Vereinsdaten: Sendable {
    let client: SupabaseClient

    /// Wie lange man eine Entnahme selbst zuruecknehmen darf, wenn nichts eingestellt ist.
    static let stornoFensterVorgabe = 15

    private func uebersetzt<T: Sendable>(_ aufruf: () async throws -> T) async throws -> T {
        do {
            return try await aufruf()
        } catch {
            throw Meldung.aus(error)
        }
    }

    private func schreiben(_ aufruf: () async throws -> String) async -> Ergebnis {
        do {
            return .erfolg(try await aufruf())
        } catch {
            return .fehler(Meldung.aus(error).text)
        }
    }

    // MARK: Getraenke

    func getraenkekarte() async throws -> [Getraenk] {
        try await uebersetzt { try await client.rpc("drink_menu").execute().value }
    }

    func eigeneGetraenke() async throws -> [EigenesGetraenk] {
        try await Startdaten(client: client).eigeneGetraenke()
    }

    /// Minuten; ohne Einstellung oder bei einem Fehler 15 wie ladeStornoFenster.
    func stornoFenster() async -> Int {
        let minuten = try? await client.rpc("drink_void_window_minutes").execute().value as Int?
        guard let m = minuten, m > 0 else { return Self.stornoFensterVorgabe }
        return m
    }

    private struct BuchenParameter: Encodable {
        let p_item_id: String
        let p_quantity: Int
    }

    /// Ein Artikel mit Menge (1 bis 50) - je Artikel ein Aufruf, es gibt keinen Sammelauftrag.
    func bucheGetraenk(_ itemId: String, menge: Int) async -> Ergebnis {
        await schreiben {
            try await client.rpc("record_drink_purchase", params: BuchenParameter(p_item_id: itemId, p_quantity: menge))
                .execute()
            return "Gebucht."
        }
    }

    func storniereGetraenk(_ purchaseId: String) async -> Ergebnis {
        await schreiben {
            try await client.rpc("void_drink_purchase", params: ["p_purchase_id": purchaseId, "p_reason": "Fehlbuchung"])
                .execute()
            return "Zurückgenommen."
        }
    }

    // MARK: Veranstaltungen

    func veranstaltungen() async throws -> [MitgliedEvent] {
        try await Startdaten(client: client).veranstaltungen()
    }

    /// Ohne Treffer nil. Der Platz auf der Warteliste ist Beiwerk: schlaegt er fehl, gibt es keinen.
    func veranstaltung(_ id: String) async throws -> VeranstaltungDetail? {
        async let platz = try? client.rpc("event_mein_wartelistenplatz", params: ["p_event_id": id]).execute().value as Int?
        let zeilen: [MitgliedEvent] = try await uebersetzt {
            try await client.rpc("events_fuer_mitglied").eq("id", value: id).execute().value
        }
        guard let event = zeilen.first else { return nil }
        return VeranstaltungDetail(event: event, wartePlatz: await platz)
    }

    private struct AnmeldeParameter: Encodable {
        let p_event_id: String
        let p_companions: Int
        let p_note: String
    }

    func meldeAn(_ id: String, begleitpersonen: Int, bemerkung: String) async -> Ergebnis {
        await schreiben {
            let stand: String = try await client.rpc("event_anmelden", params: AnmeldeParameter(
                p_event_id: id, p_companions: begleitpersonen, p_note: bemerkung
            )).execute().value
            return stand == "waitlisted" ? "Ausgebucht – du stehst auf der Warteliste." : "Du bist angemeldet."
        }
    }

    func aendereAnmeldung(_ id: String, begleitpersonen: Int, bemerkung: String) async -> Ergebnis {
        await schreiben {
            let stand: String = try await client.rpc("event_anmeldung_aendern", params: AnmeldeParameter(
                p_event_id: id, p_companions: begleitpersonen, p_note: bemerkung
            )).execute().value
            return stand == "waitlisted" ? "Geändert – du stehst weiter auf der Warteliste." : "Deine Anmeldung ist geändert."
        }
    }

    func meldeAb(_ id: String) async -> Ergebnis {
        await schreiben {
            try await client.rpc("event_abmelden", params: ["p_event_id": id]).execute()
            return "Du bist abgemeldet."
        }
    }
}
