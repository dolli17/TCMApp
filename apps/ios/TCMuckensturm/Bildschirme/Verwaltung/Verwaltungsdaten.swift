/**
 * Was die Verwaltung von Supabase liest und schreibt
 *
 * Wie apps/mobile/src/lib/verwaltung/plaetze.ts (ladePlaetze, sperre,
 * vorschauSerie, legeSerieAn, aendereSerie, beendeSerie), Vertrag:
 * docs/native/app-api.md, Abschnitt "Sperren und Serien". Nur RPCs; jede
 * davon prueft private.darf_plaetze() selbst. Die Blockungsarten kommen aus
 * booking_types_aktiv, Oeffnung und Schluss aus booking_settings - die
 * Verwaltung braucht nur aktive Arten, ein Tabellenzugriff ist nicht noetig.
 *
 * Lesen wirft den uebersetzten Satz als `Meldung`, Schreiben gibt ein
 * `PlatzErgebnis` zurueck und wirft nie.
 */

import Foundation
import Supabase

// MARK: - Modelle

/// Eine Zeile aus court_overview, auch stillgelegte Plaetze.
struct VerwalteterPlatz: Decodable, Equatable, Identifiable, Sendable {
    let id: String
    let name: String?
    let shortName: String?
    let subline: String?
    let sortPosition: Int?
    let active: Bool?
    let offeneBuchungen: Int?

    enum CodingKeys: String, CodingKey {
        case id, name, subline, active
        case shortName = "short_name"
        case sortPosition = "sort_position"
        case offeneBuchungen = "offene_buchungen"
    }

    var aktiv: Bool { active ?? true }
}

/// Eine Zeile aus series_overview.
struct Serie: Decodable, Equatable, Identifiable, Sendable {
    let id: String
    let courtName: String?
    let typeName: String?
    let title: String?
    let weekday: Int?
    let startTime: String?
    let endTime: String?
    let validFrom: String?
    let validTo: String?
    let kuenftige: Int?

    enum CodingKeys: String, CodingKey {
        case id, title, weekday, kuenftige
        case courtName = "court_name"
        case typeName = "type_name"
        case startTime = "start_time"
        case endTime = "end_time"
        case validFrom = "valid_from"
        case validTo = "valid_to"
    }
}

/// Ein Termin aus preview_series; conflict_booking_id gesetzt heisst: da liegt etwas im Weg.
struct SerienTermin: Decodable, Equatable, Sendable {
    let startsAt: String
    let endsAt: String
    let conflictBookingId: String?
    let conflictMemberName: String?
    let conflictKind: String?

    enum CodingKeys: String, CodingKey {
        case startsAt = "starts_at"
        case endsAt = "ends_at"
        case conflictBookingId = "conflict_booking_id"
        case conflictMemberName = "conflict_member_name"
        case conflictKind = "conflict_kind"
    }
}

/// Alles, was die Seite auf einmal laedt.
struct VerwaltungsStand: Equatable, Sendable {
    var plaetze: [VerwalteterPlatz]
    /// Aktive Blockungsarten fuer Sperren und Serien, nach sort_order
    var blockungsarten: [Buchungsart]
    var serien: [Serie]
    var zustand: [String: PlatzJetzt]
    /// "HH:MM"
    var oeffnung: String
    var schluss: String

    var aktivePlaetze: [VerwalteterPlatz] { plaetze.filter(\.aktiv) }
}

/// Was create_blocking, create_series und update_series zurueckgeben.
private struct Anzahlen: Decodable {
    let createdCount: Int?
    let displacedCount: Int?

    enum CodingKeys: String, CodingKey {
        case createdCount = "created_count"
        case displacedCount = "displaced_count"
    }
}

// MARK: - Laden und Schreiben

struct Verwaltungsdaten: Sendable {
    let client: SupabaseClient

    private var start: Startdaten { Startdaten(client: client) }

    /// ich() fuer Sichtbarkeit und den Weg ins Web.
    func ich() async throws -> Ich? {
        try await Platzdaten(client: client).ich()
    }

    /**
     * Plaetze, Arten, Serien, Einstellungen und der Tagesplan von heute.
     * Die Plaetze tragen die Seite; faellt nur der Tagesplan aus, fehlt bloss
     * der Zustand "gesperrt bis ...".
     */
    func laden(jetzt: Date = Date()) async throws -> VerwaltungsStand {
        async let plaetze = plaetze()
        async let arten = Platzdaten(client: client).blockungsarten()
        async let serien = serien()
        async let plan = try? start.tagesplan(Zeit.berlinDay(jetzt))
        async let einstellungen = start.buchungseinstellungen()

        let p = try await plaetze
        let e = try await einstellungen
        return VerwaltungsStand(
            plaetze: p,
            blockungsarten: try await arten,
            serien: try await serien,
            zustand: VerwaltungLogik.zustandJetzt(await plan ?? [], jetzt: jetzt),
            oeffnung: VerwaltungLogik.uhrzeit(e?.openingTime, ersatz: "08:00"),
            schluss: VerwaltungLogik.uhrzeit(e?.closingTime, ersatz: "21:00")
        )
    }

    private func plaetze() async throws -> [VerwalteterPlatz] {
        do {
            return try await client.rpc("court_overview").execute().value
        } catch {
            throw Meldung(text: "Die Plätze konnten nicht geladen werden. (\(Meldung.aus(error).text))")
        }
    }

    private func serien() async throws -> [Serie] {
        do {
            return try await client.rpc("series_overview").execute().value
        } catch {
            throw Meldung.aus(error)
        }
    }

    // MARK: Sperren

    private struct SperrParameter: Encodable {
        let p_court_ids: [String]
        let p_von: String
        let p_bis: String
        let p_type_code: String
        let p_title: String
        let p_force: Bool
    }

    /**
     * Einen Zeitraum auf mehreren Plaetzen sperren. Zweistufig: ohne
     * `verdraengen` lehnt die Datenbank ab, sobald Buchungen im Weg liegen,
     * und nennt ihre Zahl (`kollisionen`). Erst der zweite Aufruf raeumt sie weg.
     */
    func sperre(
        platzIds: [String], tag: String, von: String, bis: String, artCode: String, grund: String, verdraengen: Bool
    ) async -> PlatzErgebnis {
        let zeiten: (von: Date, bis: Date)
        switch VerwaltungLogik.pruefeSperre(tag: tag, von: von, bis: bis) {
        case let .failure(m): return PlatzErgebnis(ok: false, meldung: m.text)
        case let .success(z): zeiten = z
        }
        do {
            let zeilen: [Anzahlen] = try await client.rpc("create_blocking", params: SperrParameter(
                p_court_ids: platzIds, p_von: Zeit.iso(zeiten.von), p_bis: Zeit.iso(zeiten.bis), p_type_code: artCode,
                p_title: grund.trimmingCharacters(in: .whitespacesAndNewlines), p_force: verdraengen
            )).execute().value
            return PlatzErgebnis(ok: true, meldung: VerwaltungLogik.gesperrtMeldung(
                angelegt: zeilen.first?.createdCount ?? 0, verdraengt: zeilen.first?.displacedCount ?? 0
            ))
        } catch {
            let form = Meldung.form(error)
            return PlatzErgebnis(
                ok: false, meldung: DbFehler.translateDbError(form), kollisionen: PlaetzeLogik.kollisionen(aus: form.message ?? "")
            )
        }
    }

    // MARK: Serien

    private struct VorschauParameter: Encodable {
        let p_court_id: String
        let p_weekday: Int
        let p_start_time: String
        let p_end_time: String
        let p_valid_from: String
        let p_valid_to: String
    }

    /// Reine Leseoperation, aendert nichts - auch nicht bei Konflikten.
    func vorschau(_ f: SerienEingabe) async -> Result<[SerienTermin], Meldung> {
        let w: SerienWerte
        switch VerwaltungLogik.pruefeSerie(f) {
        case let .failure(m): return .failure(m)
        case let .success(werte): w = werte
        }
        do {
            let termine: [SerienTermin] = try await client.rpc("preview_series", params: VorschauParameter(
                p_court_id: w.courtId, p_weekday: w.weekday, p_start_time: w.startTime, p_end_time: w.endTime,
                p_valid_from: w.validFrom, p_valid_to: w.validTo
            )).execute().value
            return .success(termine)
        } catch {
            return .failure(Meldung.aus(error))
        }
    }

    private struct AnlegenParameter: Encodable {
        let p_court_id: String
        let p_booking_type_code: String
        let p_weekday: Int
        let p_start_time: String
        let p_end_time: String
        let p_valid_from: String
        let p_valid_to: String
        let p_title: String
        let p_displace: Bool
    }

    /// Ohne `verdraengen` bricht die Datenbank bei einer Kollision ab.
    func legeSerieAn(_ f: SerienEingabe, verdraengen: Bool) async -> PlatzErgebnis {
        let w: SerienWerte
        switch VerwaltungLogik.pruefeSerie(f) {
        case let .failure(m): return PlatzErgebnis(ok: false, meldung: m.text)
        case let .success(werte): w = werte
        }
        do {
            let zeilen: [Anzahlen] = try await client.rpc("create_series", params: AnlegenParameter(
                p_court_id: w.courtId, p_booking_type_code: w.bookingTypeCode, p_weekday: w.weekday,
                p_start_time: w.startTime, p_end_time: w.endTime, p_valid_from: w.validFrom, p_valid_to: w.validTo,
                p_title: w.title, p_displace: verdraengen
            )).execute().value
            return PlatzErgebnis(ok: true, meldung: VerwaltungLogik.serieAngelegtMeldung(
                angelegt: zeilen.first?.createdCount ?? 0, verdraengt: zeilen.first?.displacedCount ?? 0
            ))
        } catch {
            return PlatzErgebnis(ok: false, meldung: Meldung.aus(error).text)
        }
    }

    private struct AendernParameter: Encodable {
        let p_series_id: String
        let p_start_time: String
        let p_end_time: String
        let p_title: String
        /// nil faellt weg: dann bleibt das Enddatum.
        let p_valid_to: String?
        let p_displace: Bool
    }

    /**
     * Uhrzeit, Titel oder Enddatum aendern. Zweistufig wie das Sperren: ohne
     * `verdraengen` nennt die Datenbank die Zahl der Kollisionen.
     */
    func aendereSerie(
        id: String, startTime: String, endTime: String, titel: String, validTo: String, verdraengen: Bool
    ) async -> PlatzErgebnis {
        guard let von = VerwaltungLogik.normZeit(startTime), let bis = VerwaltungLogik.normZeit(endTime) else {
            return PlatzErgebnis(ok: false, meldung: VerwaltungLogik.keineZeit)
        }
        var ende: String?
        if !validTo.trimmingCharacters(in: .whitespaces).isEmpty {
            guard let iso = VerwaltungLogik.deutschZuIso(validTo) else {
                return PlatzErgebnis(ok: false, meldung: VerwaltungLogik.keinDatum)
            }
            ende = iso
        }
        do {
            let zeilen: [Anzahlen] = try await client.rpc("update_series", params: AendernParameter(
                p_series_id: id, p_start_time: von, p_end_time: bis, p_title: titel, p_valid_to: ende, p_displace: verdraengen
            )).execute().value
            return PlatzErgebnis(ok: true, meldung: VerwaltungLogik.serieGeaendertMeldung(
                neu: zeilen.first?.createdCount ?? 0, verdraengt: zeilen.first?.displacedCount ?? 0
            ))
        } catch {
            let form = Meldung.form(error)
            return PlatzErgebnis(
                ok: false, meldung: DbFehler.translateDbError(form),
                kollisionen: VerwaltungLogik.terminKollisionen(aus: form.message ?? "")
            )
        }
    }

    /// Beenden statt Loeschen: vergangene Termine bleiben als Beleg stehen.
    func beendeSerie(_ id: String) async -> PlatzErgebnis {
        do {
            let weg: Int = try await client.rpc("end_series", params: ["p_series_id": id]).execute().value
            return PlatzErgebnis(ok: true, meldung: VerwaltungLogik.serieBeendetMeldung(weg))
        } catch {
            return PlatzErgebnis(ok: false, meldung: Meldung.aus(error).text)
        }
    }
}
