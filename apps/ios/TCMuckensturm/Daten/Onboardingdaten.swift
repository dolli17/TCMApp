/**
 * Was der Onboarding-Assistent von Supabase liest und schreibt
 *
 * Wie der Abschnitt Onboarding in apps/mobile/src/lib/daten.ts: my_onboarding()
 * liefert alles in einem Zug, gespeichert wird je Schritt ueber die
 * Onboarding-RPCs (docs/native/app-api.md, "Onboarding"). Geprueft wird in
 * der Datenbank; vorher prueft die App nur, was sich in einem Satz sagen
 * laesst, der das Feld nennt (OnboardingLogik).
 *
 * Optionale Parameter fehlen, statt null zu sein (Grundsaetze in app-api.md).
 */

import Foundation
import Supabase

// MARK: - Modell

/// Was my_onboarding() zurueckgibt (OnboardingZustand in packages/core/src/onboarding.ts).
struct OnboardingZustand: Decodable, Equatable, Sendable {
    struct Stammdaten: Decodable, Equatable, Sendable {
        let firstName: String?
        let lastName: String?
        let title: String?
        let gender: String?
        let birthday: String?
        let email: String?
        let phone: String?
        let mobile: String?
        let street: String?
        let postcode: String?
        let city: String?

        enum CodingKeys: String, CodingKey {
            case title, gender, birthday, email, phone, mobile, street, postcode, city
            case firstName = "first_name"
            case lastName = "last_name"
        }
    }

    struct Erziehungsberechtigte: Decodable, Equatable, Sendable {
        let name: String?
        let email: String?
        let phone: String?
        let zustimmungAm: String?

        enum CodingKeys: String, CodingKey {
            case name, email, phone
            case zustimmungAm = "zustimmung_am"
        }
    }

    struct Notfallkontakt: Decodable, Equatable, Sendable {
        let name: String?
        let phone: String?
        let relation: String?
    }

    struct Dokument: Decodable, Equatable, Sendable {
        let code: String
        let version: Int?
        let title: String
        let validFrom: String?
        let zugestimmtAm: String?

        enum CodingKeys: String, CodingKey {
            case code, version, title
            case validFrom = "valid_from"
            case zugestimmtAm = "zugestimmt_am"
        }
    }

    struct Mandat: Decodable, Equatable, Sendable {
        let vorhanden: Bool
        let referenz: String?
        let glaeubigerName: String?
        let glaeubigerId: String?
        /// false, solange die Glaeubigerdaten des Vereins fehlen.
        let moeglich: Bool
        let text: String?
        let kontoinhaberVorschlag: String?

        enum CodingKeys: String, CodingKey {
            case vorhanden, referenz, moeglich, text
            case glaeubigerName = "glaeubiger_name"
            case glaeubigerId = "glaeubiger_id"
            case kontoinhaberVorschlag = "kontoinhaber_vorschlag"
        }
    }

    struct Merkmal: Decodable, Equatable, Sendable {
        let code: String
        let name: String
        let description: String?
        let gesetzt: Bool
    }

    struct Tennis: Decodable, Equatable, Sendable {
        let tennisLk: String?
        let nuligaId: String?
        let mannschaftInteresse: Bool

        enum CodingKeys: String, CodingKey {
            case tennisLk = "tennis_lk"
            case nuligaId = "nuliga_id"
            case mannschaftInteresse = "mannschaft_interesse"
        }
    }

    struct Einstellungen: Decodable, Equatable, Sendable {
        let bookingMail: String?

        enum CodingKeys: String, CodingKey {
            case bookingMail = "booking_mail"
        }
    }

    let abgeschlossenAm: String?
    let minderjaehrig: Bool
    /// Erledigt je Schritt, Schluessel = OnboardingSchrittKey.
    let status: [String: Bool]
    let stammdaten: Stammdaten
    let erziehungsberechtigte: Erziehungsberechtigte
    let notfallkontakt: Notfallkontakt
    let dokumente: [Dokument]
    let mandat: Mandat
    let merkmale: [Merkmal]
    let tennis: Tennis
    let einstellungen: Einstellungen

    enum CodingKeys: String, CodingKey {
        case minderjaehrig, status, stammdaten, erziehungsberechtigte, notfallkontakt, dokumente
        case mandat, merkmale, tennis, einstellungen
        case abgeschlossenAm = "abgeschlossen_am"
    }

    var schritte: [OnboardingSchritt] { Onboarding.schritte(minderjaehrig: minderjaehrig, status: status) }

    var naechsterPflichtschritt: OnboardingSchrittKey? {
        Onboarding.naechsterPflichtschritt(minderjaehrig: minderjaehrig, status: status)
    }
}

/// Ergebnis von complete_onboarding: fehlt noch etwas, die Schritte aus dem DETAIL.
struct Abschluss: Equatable, Sendable {
    let ergebnis: Ergebnis
    var fehlt: [OnboardingSchrittKey] = []
}

// MARK: - Laden und Speichern

struct Onboardingdaten: Sendable {
    let client: SupabaseClient

    private func schreiben(_ erfolg: String, _ aufruf: () async throws -> Void) async -> Ergebnis {
        do {
            try await aufruf()
            return .erfolg(erfolg)
        } catch {
            return .fehler(Meldung.aus(error).text)
        }
    }

    /// Alles fuer den Assistenten in einem Zug; nil, wenn kein Mitglied angemeldet ist.
    func laden() async throws -> OnboardingZustand? {
        do {
            let zustand: OnboardingZustand? = try await client.rpc("my_onboarding").execute().value
            return zustand
        } catch {
            throw Meldung.aus(error)
        }
    }

    func speichereStammdaten(_ werte: [String: String]) async -> Ergebnis {
        switch OnboardingLogik.pruefeStammdaten(werte) {
        case let .fehler(f):
            return .fehler(f.meldung, feld: f.feld)
        case let .ok(geburtstag):
            let t = { (feld: String) in Profil.trim(werte[feld] ?? "") }
            var params: [String: String] = [
                "p_first_name": t("first_name"),
                "p_last_name": t("last_name"),
                "p_birthday": geburtstag,
                "p_gender": t("gender"),
                "p_street": t("street"),
                "p_postcode": t("postcode"),
                "p_city": t("city"),
            ]
            for feld in ["phone", "mobile", "title"] where !t(feld).isEmpty {
                params["p_\(feld)"] = t(feld)
            }
            return await schreiben("Deine Daten sind gespeichert.") {
                try await client.rpc("onboarding_save_stammdaten", params: params).execute()
            }
        }
    }

    /// Stimmt der jeweils gueltigen Version der genannten Texte zu.
    func akzeptiereDokumente(_ codes: [String]) async -> Ergebnis {
        if codes.isEmpty { return .erfolg("") }
        return await schreiben("Zustimmung gespeichert.") {
            try await client.rpc("onboarding_accept_documents", params: ["p_codes": codes]).execute()
        }
    }

    func speichereErziehungsberechtigte(name: String, email: String, telefon: String, zustimmung: Bool) async -> Ergebnis {
        if let f = OnboardingLogik.pruefeErziehungsberechtigte(name: name, email: email, telefon: telefon) {
            return .fehler(f.meldung, feld: f.feld)
        }
        var params: [String: AnyJSON] = [
            "p_name": .string(Profil.trim(name)),
            "p_consent": .bool(zustimmung),
        ]
        if !Profil.trim(email).isEmpty { params["p_email"] = .string(Profil.trim(email)) }
        if !Profil.trim(telefon).isEmpty { params["p_phone"] = .string(Profil.trim(telefon)) }
        return await schreiben("Erziehungsberechtigte gespeichert.") {
            try await client.rpc("onboarding_save_guardian", params: params).execute()
        }
    }

    /// Ueber die RPC und nicht wie im Konto: nur sie weiss, dass er bei Minderjaehrigen Pflicht ist.
    func speichereNotfallkontakt(name: String, telefon: String, verhaeltnis: String) async -> Ergebnis {
        if !Profil.trim(telefon).isEmpty && Profil.trim(name).isEmpty {
            return .fehler("Zur Notfallnummer gehört auch ein Name.", feld: "name")
        }
        var params = ["p_name": Profil.trim(name), "p_phone": Profil.trim(telefon)]
        if !Profil.trim(verhaeltnis).isEmpty { params["p_relation"] = Profil.trim(verhaeltnis) }
        return await schreiben("Notfallkontakt gespeichert.") {
            try await client.rpc("onboarding_save_notfallkontakt", params: params).execute()
        }
    }

    /// Erteilt das SEPA-Mandat online.
    func erteileMandat(iban: String, kontoinhaber: String, bestaetigt: Bool) async -> Ergebnis {
        guard bestaetigt else { return .fehler("Bitte bestätige das Mandat ausdrücklich.") }
        guard Iban.istGueltig(iban) else { return .fehler("Diese IBAN ist nicht gültig. Bitte die Ziffern prüfen.") }
        var params: [String: AnyJSON] = ["p_iban": .string(iban), "p_accept": .bool(true)]
        if !Profil.trim(kontoinhaber).isEmpty { params["p_holder"] = .string(Profil.trim(kontoinhaber)) }
        return await schreiben("Das Mandat ist erteilt.") {
            try await client.rpc("create_my_sepa_mandate", params: params).execute()
        }
    }

    func speichereTennis(lk: String, nuligaId: String, mannschaftInteresse: Bool) async -> Ergebnis {
        var params: [String: AnyJSON] = ["p_mannschaft_interesse": .bool(mannschaftInteresse)]
        if !Profil.trim(lk).isEmpty { params["p_tennis_lk"] = .string(Profil.trim(lk)) }
        if !Profil.trim(nuligaId).isEmpty { params["p_nuliga_id"] = .string(Profil.trim(nuligaId)) }
        return await schreiben("Gespeichert.") {
            try await client.rpc("save_my_tennis", params: params).execute()
        }
    }

    /**
     * Schaltet das Konto frei. Fehlt noch etwas, nennt die Meldung es, und
     * `fehlt` enthaelt die Schritte aus dem DETAIL der Datenbankmeldung -
     * damit springt der Assistent zum ersten davon.
     */
    func schliesseAb() async -> Abschluss {
        do {
            try await client.rpc("complete_onboarding").execute()
            return Abschluss(ergebnis: .erfolg("Dein Konto ist freigeschaltet."))
        } catch {
            let form = Meldung.form(error)
            return Abschluss(
                ergebnis: .fehler(DbFehler.translateDbError(form)),
                fehlt: OnboardingLogik.fehlendeSchritte(form.details)
            )
        }
    }
}
