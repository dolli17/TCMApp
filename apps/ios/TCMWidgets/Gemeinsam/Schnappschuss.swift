/**
 * Was die Widgets zeigen: ein kleiner Schnappschuss im App-Group-Container
 *
 * Die App legt ihn nach jedem Laden von Home ab (WidgetBruecke), das Widget
 * nach jedem eigenen Laden im Zeitplan (WidgetLaden). Gelesen wird er von
 * beiden Seiten mit denselben Typen - die Dateien unter TCMWidgets/Gemeinsam
 * gehoeren zu App und Erweiterung (project.yml).
 *
 * Darin steht nur, was die App ohnehin zeigt: die eigenen Termine mit den
 * Namen der Mitspieler, die Belegung des Tages ohne Namen (nur die Art, wie
 * im Raster farbig) und die naechsten Veranstaltungen. Keine Bankdaten,
 * keine Nachrichten, keine Namen Fremder ausser den eigenen Mitspielern.
 */

import Foundation

struct WidgetSchnappschuss: Codable, Equatable, Sendable {
    /// Steigt, wenn sich das Format so aendert, dass alte Dateien nicht mehr passen.
    static let aktuelleVersion = 1

    var version: Int = Self.aktuelleVersion
    /// Wann geladen wurde
    var stand: Date
    /// Kommende eigene Termine, der naechste zuerst; nil, wenn sie nie geladen werden konnten.
    var termine: [WidgetTermin]?
    /// Belegung eines Tages; nil, wenn sie nie geladen werden konnte.
    var plan: WidgetPlan?
    /// Die naechsten Veranstaltungen; nil, wenn sie nie geladen werden konnten.
    var veranstaltungen: [WidgetVeranstaltung]?

    /// So viele Termine und Veranstaltungen nimmt der Schnappschuss mit.
    static let hoechstensTermine = 5
    static let hoechstensVeranstaltungen = 3

    /**
     * Neu ueber alt: Was diesmal nicht geladen werden konnte (nil), bleibt
     * aus dem alten Schnappschuss stehen - ein Netzfehler leert kein Widget.
     */
    func ueber(_ alt: WidgetSchnappschuss?) -> WidgetSchnappschuss {
        guard let alt else { return self }
        var neu = self
        neu.termine = termine ?? alt.termine
        neu.plan = plan ?? alt.plan
        neu.veranstaltungen = veranstaltungen ?? alt.veranstaltungen
        return neu
    }

    // MARK: - Kodierung

    static func kodieren(_ s: WidgetSchnappschuss) throws -> Data {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        e.outputFormatting = [.sortedKeys]
        return try e.encode(s)
    }

    /// nil bei fremder Version oder kaputter Datei - dann gilt: kein Schnappschuss.
    static func dekodieren(_ daten: Data) -> WidgetSchnappschuss? {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        guard let s = try? d.decode(WidgetSchnappschuss.self, from: daten), s.version == aktuelleVersion else { return nil }
        return s
    }
}

/// Ein eigener Termin aus my_bookings.
struct WidgetTermin: Codable, Equatable, Identifiable, Sendable, Zeitraum {
    let id: String
    let startsAt: String
    let endsAt: String
    let platz: String
    let art: String
    /// "mit A, B", "Du hast gebucht" oder "von X" (HomeLogik.mitText)
    let mit: String
}

/// Ein Platz, wie courts_aktiv ihn liefert.
struct WidgetPlatz: Codable, Equatable, Identifiable, Sendable {
    let id: String
    let name: String
}

/// Eine Belegung aus day_schedule - ohne Namen, nur was Art und Lage braucht.
struct WidgetBelegung: Codable, Equatable, Sendable, BelegterSlot, Belegungsmerkmale {
    let courtId: String
    let startsAt: String
    let endsAt: String
    let kind: String?
    let isOwn: Bool?
    let partnerWanted: Bool?
    let frei: Int?
    let seriesId: String?
}

/// Die Belegung eines Berliner Tages mit den Regeln aus booking_settings.
struct WidgetPlan: Codable, Equatable, Sendable {
    /// "2026-10-29"
    let tag: String
    let oeffnung: Int
    let schluss: Int
    let raster: Int
    /// Dauer der ersten Buchungsart, sonst 60 (wie "Jetzt frei" auf Home)
    let dauer: Int
    let vorlaufTage: Int?
    let plaetze: [WidgetPlatz]
    let belegungen: [WidgetBelegung]
}

/// Eine Veranstaltung, schon fuer die Anzeige aufbereitet.
struct WidgetVeranstaltung: Codable, Equatable, Identifiable, Sendable {
    let id: String
    let titel: String
    let startsAt: String
    let endsAt: String?
    /// "Fr 19 Uhr · Clubhaus" (eventKartenZeit)
    let zeit: String
    /// "Angemeldet", "Warteliste", "Anmelden" oder nil (eventMeineMarke)
    let marke: String?
}

// MARK: - Aus den Daten der App

extension WidgetSchnappschuss {
    /**
     * Baut den Schnappschuss aus dem, was Home (bzw. das Widget) geladen hat.
     * nil heisst "konnte nicht geladen werden" und bleibt nil.
     */
    static func aus(
        termine: [MeineBuchung]?,
        frei: FreiDaten?,
        events: [MitgliedEvent]?,
        jetzt: Date
    ) -> WidgetSchnappschuss {
        WidgetSchnappschuss(
            stand: jetzt,
            termine: termine.map { liste in
                Startseite.upcomingBookings(liste, now: jetzt)
                    .prefix(hoechstensTermine)
                    .map { b in
                        WidgetTermin(
                            id: b.bookingId,
                            startsAt: b.startsAt,
                            endsAt: b.endsAt,
                            platz: b.courtName ?? "",
                            art: b.typeName ?? "",
                            mit: HomeLogik.mitText(b)
                        )
                    }
            },
            plan: frei.map(plan),
            veranstaltungen: events.map { liste in
                Veranstaltungen.eventDemnaechst(liste, now: jetzt, n: hoechstensVeranstaltungen).map { e in
                    WidgetVeranstaltung(
                        id: e.id,
                        titel: e.title ?? "",
                        startsAt: e.startsAt,
                        endsAt: e.endsAt,
                        zeit: Veranstaltungen.eventKartenZeit(e),
                        marke: Veranstaltungen.eventMeineMarke(e, now: jetzt, aufforderung: true)?.text
                    )
                }
            }
        )
    }

    private static func plan(_ d: FreiDaten) -> WidgetPlan {
        WidgetPlan(
            tag: d.heute,
            // Dieselben Rueckfaelle wie HomeLogik.jetztFreiKarten
            oeffnung: Zeit.timeToMinutes(d.einstellungen?.openingTime ?? "08:00"),
            schluss: Zeit.timeToMinutes(d.einstellungen?.closingTime ?? "21:00"),
            raster: d.einstellungen?.slotMinutes ?? 30,
            dauer: d.dauer,
            vorlaufTage: d.einstellungen?.leadDays,
            plaetze: d.plaetze.map { WidgetPlatz(id: $0.id, name: $0.name ?? $0.shortName ?? "") },
            belegungen: d.belegung.map { b in
                WidgetBelegung(
                    courtId: b.courtId, startsAt: b.startsAt, endsAt: b.endsAt, kind: b.kind,
                    isOwn: b.isOwn, partnerWanted: b.partnerWanted, frei: b.frei, seriesId: b.seriesId
                )
            }
        )
    }
}

// MARK: - Ablage im App-Group-Container

/// Liest und schreibt den Schnappschuss als JSON-Datei.
struct WidgetAblage: Sendable {
    let datei: URL

    static let dateiname = "widget-schnappschuss.json"

    init(datei: URL) {
        self.datei = datei
    }

    /// Im Container der App Group; nil, wenn es keine gibt (dann gibt es auch kein Widget).
    init?(appGroup: String?) {
        guard let appGroup,
              let ordner = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup)
        else { return nil }
        self.init(datei: ordner.appending(path: Self.dateiname))
    }

    func lesen() -> WidgetSchnappschuss? {
        guard let daten = try? Data(contentsOf: datei) else { return nil }
        return WidgetSchnappschuss.dekodieren(daten)
    }

    /// Schreibt neu ueber alt (siehe `ueber`) und gibt zurueck, was jetzt gilt.
    @discardableResult
    func speichern(_ neu: WidgetSchnappschuss) throws -> WidgetSchnappschuss {
        let gesamt = neu.ueber(lesen())
        // Erst nach dem ersten Entsperren lesbar - wie die Sitzung im Schluesselbund.
        try WidgetSchnappschuss.kodieren(gesamt).write(to: datei, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        return gesamt
    }

    func loeschen() {
        try? FileManager.default.removeItem(at: datei)
    }
}
