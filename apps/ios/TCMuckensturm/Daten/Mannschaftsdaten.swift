/**
 * Was die Mannschaft von Supabase liest und schreibt
 *
 * Vertrag "Mannschaftsfuehrer laedt in seine Mannschaft ein" (02.11.2026):
 * meine_mannschaft(), meine_mannschaft_einladungen(), mannschaft_kandidaten,
 * mannschaft_einladen, mannschaft_einladung_zurueckziehen,
 * mannschaft_einladung_beantworten, mannschaft_austragen und
 * set_team_phone_visible. Ob jemand etwas darf, entscheidet allein die
 * Datenbank (private.ist_mannschaftsfuehrer); die App zeigt nur, was gerade
 * geht. Fehler kommen als deutscher Satz aus den RPCs (DbFehler).
 *
 * Lesende Aufrufe werfen den uebersetzten Satz als `Meldung`, schreibende
 * geben ein `Ergebnis` zurueck, wie in Kontodaten.
 */

import Foundation
import Supabase

// MARK: - Modelle

/// meine_mannschaft(): null ohne Mannschaft.
struct MeineMannschaft: Decodable, Equatable, Sendable {
    let teamId: String
    let name: String
    let ichBinMf: Bool
    let telefonSichtbar: Bool
    /// Sortiert von der Datenbank: MF zuerst, dann nach LK, ohne LK zuletzt, dann Name.
    let kader: [KaderMitglied]
    /// Nur fuer den MF, sonst fehlt das Feld.
    let offeneEinladungen: [OffeneEinladung]?

    enum CodingKeys: String, CodingKey {
        case name, kader
        case teamId = "team_id"
        case ichBinMf = "ich_bin_mf"
        case telefonSichtbar = "telefon_sichtbar"
        case offeneEinladungen = "offene_einladungen"
    }
}

/// Eine Zeile im Kader.
struct KaderMitglied: Decodable, Equatable, Identifiable, Sendable {
    let memberId: String
    let firstName: String?
    let lastName: String?
    let tennisLk: String?
    let isTeamCaptain: Bool?
    /// Mobil, sonst Telefon; nur fuer MF/Admin und nur mit Zustimmung.
    let telefon: String?

    var id: String { memberId }

    enum CodingKeys: String, CodingKey {
        case telefon
        case memberId = "member_id"
        case firstName = "first_name"
        case lastName = "last_name"
        case tennisLk = "tennis_lk"
        case isTeamCaptain = "is_team_captain"
    }
}

/// Eine offene Einladung, die der MF verschickt hat.
struct OffeneEinladung: Decodable, Equatable, Identifiable, Sendable {
    let id: String
    let memberId: String
    let firstName: String?
    let lastName: String?
    let createdAt: String?
    let expiresAt: String?

    enum CodingKeys: String, CodingKey {
        case id
        case memberId = "member_id"
        case firstName = "first_name"
        case lastName = "last_name"
        case createdAt = "created_at"
        case expiresAt = "expires_at"
    }
}

/// Eine Zeile aus mannschaft_kandidaten.
struct MannschaftKandidat: Decodable, Equatable, Identifiable, Sendable {
    let memberId: String
    let firstName: String?
    let lastName: String?
    let tennisLk: String?
    let mannschaftInteresse: Bool?
    /// Name der Mannschaft, in der das Mitglied gerade spielt.
    let aktuelleMannschaft: String?
    let eingeladen: Bool?

    var id: String { memberId }

    enum CodingKeys: String, CodingKey {
        case eingeladen
        case memberId = "member_id"
        case firstName = "first_name"
        case lastName = "last_name"
        case tennisLk = "tennis_lk"
        case mannschaftInteresse = "mannschaft_interesse"
        case aktuelleMannschaft = "aktuelle_mannschaft"
    }
}

/// Eine offene, nicht verfallene Einladung an mich (meine_mannschaft_einladungen).
struct MannschaftEinladung: Decodable, Equatable, Identifiable, Sendable {
    let id: String
    let teamId: String
    let teamName: String
    let eingeladenVon: String?
    let createdAt: String?
    let expiresAt: String?
    /// Die Mannschaft, aus der ich beim Annehmen wechsle.
    let wechselVon: String?
    let annehmenMoeglich: Bool
    /// Fertiger Satz der Datenbank, etwa der Wechselhinweis oder die MF-Sperre.
    let hinweis: String?

    enum CodingKeys: String, CodingKey {
        case id, hinweis
        case teamId = "team_id"
        case teamName = "team_name"
        case eingeladenVon = "eingeladen_von"
        case createdAt = "created_at"
        case expiresAt = "expires_at"
        case wechselVon = "wechsel_von"
        case annehmenMoeglich = "annehmen_moeglich"
    }
}

// MARK: - Laden und Speichern

struct Mannschaftsdaten: Sendable {
    let client: SupabaseClient

    private func uebersetzt<T: Sendable>(_ aufruf: () async throws -> T) async throws -> T {
        do {
            return try await aufruf()
        } catch {
            throw Meldung.aus(error)
        }
    }

    private func schreiben(_ erfolg: String, _ aufruf: () async throws -> Void) async -> Ergebnis {
        do {
            try await aufruf()
            return .erfolg(erfolg)
        } catch {
            return .fehler(Meldung.aus(error).text)
        }
    }

    /// nil ohne Mannschaft.
    func mannschaft() async throws -> MeineMannschaft? {
        try await uebersetzt {
            let m: MeineMannschaft? = try await client.rpc("meine_mannschaft").execute().value
            return m
        }
    }

    func einladungen() async throws -> [MannschaftEinladung] {
        try await uebersetzt { try await client.rpc("meine_mannschaft_einladungen").execute().value }
    }

    /// Leere Suche: ohne Parameter, dann liefert die Datenbank die ersten 50.
    func kandidaten(suche: String) async throws -> [MannschaftKandidat] {
        let text = Profil.trim(suche)
        return try await uebersetzt {
            if text.isEmpty {
                return try await client.rpc("mannschaft_kandidaten").execute().value
            }
            return try await client.rpc("mannschaft_kandidaten", params: ["p_suche": text]).execute().value
        }
    }

    func einladen(_ k: MannschaftKandidat) async -> Ergebnis {
        await schreiben(MannschaftLogik.eingeladenMeldung(k)) {
            try await client.rpc("mannschaft_einladen", params: ["p_member_id": k.memberId]).execute()
        }
    }

    func zurueckziehen(_ e: OffeneEinladung) async -> Ergebnis {
        await schreiben(MannschaftLogik.zurueckgezogenMeldung) {
            try await client.rpc("mannschaft_einladung_zurueckziehen", params: ["p_invitation_id": e.id]).execute()
        }
    }

    func beantworten(_ e: MannschaftEinladung, annehmen: Bool, telefonSichtbar: Bool) async -> Ergebnis {
        let params: [String: AnyJSON] = [
            "p_invitation_id": .string(e.id),
            "p_annehmen": .bool(annehmen),
            "p_telefon_sichtbar": .bool(annehmen && telefonSichtbar),
        ]
        return await schreiben(MannschaftLogik.beantwortetMeldung(e, angenommen: annehmen)) {
            try await client.rpc("mannschaft_einladung_beantworten", params: params).execute()
        }
    }

    /// Der MF traegt einen Spieler aus seinem Kader aus.
    func austragen(_ k: KaderMitglied) async -> Ergebnis {
        await schreiben(MannschaftLogik.ausgetragenMeldung(k)) {
            try await client.rpc("mannschaft_austragen", params: ["p_member_id": k.memberId]).execute()
        }
    }

    /// Selbst austreten: mannschaft_austragen mit der eigenen member_id aus ich().
    func austreten(team: String) async -> Ergebnis {
        do {
            let zeilen: [Ich] = try await client.rpc("ich").execute().value
            guard let id = zeilen.first?.memberId else { return .fehler("Nicht angemeldet.") }
            try await client.rpc("mannschaft_austragen", params: ["p_member_id": id]).execute()
            return .erfolg(MannschaftLogik.ausgetretenMeldung(team))
        } catch {
            return .fehler(Meldung.aus(error).text)
        }
    }

    func setzeTelefonSichtbar(_ sichtbar: Bool) async -> Ergebnis {
        await schreiben(TennisLogik.gespeichert) {
            try await client.rpc("set_team_phone_visible", params: ["p_visible": sichtbar]).execute()
        }
    }
}
