/**
 * Was die Widgets zeigen und wann sie neu laden, als reine Funktionen
 *
 * Ohne WidgetKit und ohne Netz, damit sich alles in den Unit-Tests der App
 * pruefen laesst (WidgetTests). Gerechnet wird mit dem Kern (Startseite,
 * Belegung, Platzplan) in Europe/Berlin - dieselben Saetze wie auf Home.
 */

import Foundation

// MARK: - Zeitplan

enum WidgetZeitplan {
    /// Spaetestens so oft laedt "Plätze jetzt" neu.
    static let taktPlaetze: TimeInterval = 30 * 60
    /// Termine und Veranstaltungen aendern sich seltener.
    static let taktTermine: TimeInterval = 60 * 60
    /// Abstand der Eintraege dazwischen: Kicker ("in 2 Stunden") und freie Plaetze ruecken weiter.
    static let eintragsAbstand: TimeInterval = 15 * 60

    /// Die naechste Mitternacht in Berlin nach `jetzt` (auch an den Tagen mit 23 oder 25 Stunden).
    static func naechsteMitternacht(nach jetzt: Date) -> Date {
        let heute = Zeit.berlin.startOfDay(for: jetzt)
        return Zeit.berlin.date(byAdding: .day, value: 1, to: heute) ?? jetzt.addingTimeInterval(86_400)
    }

    /**
     * Wann das Widget wieder laden soll: kurz nach dem Ende des naechsten
     * (oder laufenden) eigenen Spiels, um Mitternacht in Berlin, spaetestens
     * nach `takt` - was zuerst kommt.
     */
    static func neuLaden(termine: [some Zeitraum], jetzt: Date, takt: TimeInterval) -> Date {
        var kandidaten = [jetzt.addingTimeInterval(takt), naechsteMitternacht(nach: jetzt)]
        if let naechstes = Startseite.upcomingBookings(termine, now: jetzt).first, let ende = Zeit.datum(naechstes.endsAt) {
            // Eine Minute Luft, damit das Spiel dann sicher vorbei ist.
            kandidaten.append(ende.addingTimeInterval(60))
        }
        return kandidaten.filter { $0 > jetzt }.min() ?? jetzt.addingTimeInterval(takt)
    }

    /**
     * Zu diesen Zeitpunkten bekommt das Widget einen Eintrag, bis vor `bis`:
     * jetzt, jede volle Viertelstunde und Beginn und Ende der Termine.
     */
    static func eintraege(jetzt: Date, bis: Date, termine: [some Zeitraum] = [WidgetTermin]()) -> [Date] {
        var zeiten: Set<Date> = [jetzt]
        let abstand = eintragsAbstand
        // Berlin weicht um volle Stunden von UTC ab: die Viertelstunden sind dieselben.
        var t = Date(timeIntervalSince1970: (jetzt.timeIntervalSince1970 / abstand).rounded(.down) * abstand + abstand)
        while t < bis {
            zeiten.insert(t)
            t = t.addingTimeInterval(abstand)
        }
        for termin in termine {
            for zeit in [Zeit.datum(termin.startsAt), Zeit.datum(termin.endsAt)].compactMap({ $0 }) where zeit > jetzt && zeit < bis {
                zeiten.insert(zeit)
            }
        }
        return zeiten.sorted()
    }
}

// MARK: - Meine nächsten Spiele

struct SpielZeile: Equatable, Identifiable, Sendable {
    let id: String
    /// "Heute · in 2 Stunden", "Morgen", "Mittwoch · 30.09." (bookingKicker)
    let kicker: String
    /// "17:00"
    let beginn: String
    /// "17:00 – 18:00"
    let zeit: String
    let platz: String
    let art: String
    let mit: String
}

// MARK: - Plätze jetzt

/// Ein Stueck der Zeitleiste, in Prozent von Oeffnung bis Schluss.
struct LeistenStueck: Equatable, Sendable {
    let left: Double
    let width: Double
}

struct PlatzZeile: Equatable, Identifiable, Sendable {
    let id: String
    let name: String
    /// "frei bis 19:00", "belegt bis 18:00", "frei ab 20:00", "heute belegt"
    let status: String
    let freiJetzt: Bool
    let belegt: [TimelineSegment]
    /// Wo heute noch eine volle Buchung passt
    let frei: [LeistenStueck]
    /// "17:00–19:00, 20:00–21:00" oder "keine freie Zeit mehr"
    let lueckenText: String
}

struct PlaetzeLage: Equatable, Sendable {
    let zeilen: [PlatzZeile]
    /// "3 von 6 frei", nach Schluss "Für heute geschlossen"
    let ueberschrift: String
    let freiJetzt: Int
    /// Marke fuer jetzt, in Prozent
    let jetzt: Double
    let geschlossen: Bool
}

// MARK: - Aufbereitung

enum WidgetInhalt {
    static func spiele(_ termine: [WidgetTermin], jetzt: Date, hoechstens: Int) -> [SpielZeile] {
        Startseite.upcomingBookings(termine, now: jetzt).prefix(hoechstens).map { t in
            SpielZeile(
                id: t.id,
                kicker: Startseite.bookingKicker(startsAt: t.startsAt, endsAt: t.endsAt, now: jetzt),
                beginn: Zeit.minutesToTime(Zeit.minutesOf(t.startsAt)),
                zeit: HomeLogik.zeitSpanne(t),
                platz: t.platz,
                art: t.art,
                mit: t.mit
            )
        }
    }

    /// Eine Zeile fuer den Sperrbildschirm ueber der Uhr: "Morgen · 17:00 · Platz 1"
    static func inline(_ s: SpielZeile, jetzt: Date, startsAt: String) -> String {
        let tag = Startseite.dayLabel(startsAt: startsAt, now: jetzt)
        return [tag, s.beginn, s.platz].filter { !$0.isEmpty }.joined(separator: " · ")
    }

    /// "Stand 14:30", wenn der Schnappschuss aelter als eine Dreiviertelstunde ist (kein Netz), sonst nil.
    static func standText(_ stand: Date, jetzt: Date) -> String? {
        guard jetzt.timeIntervalSince(stand) > 45 * 60 else { return nil }
        let tag = Zeit.tageZwischen(stand, jetzt) == 0 ? "" : "\(Zeit.tagMonat(stand)) "
        return "Stand \(tag)\(Zeit.minutesToTime(Zeit.localMinutes(stand)))"
    }

    /// Fuer das mittlere Widget: die jetzt freien Plaetze zuerst, sonst in der Reihenfolge der Plaetze.
    static func mittelZeilen(_ zeilen: [PlatzZeile], hoechstens: Int) -> [PlatzZeile] {
        Array((zeilen.filter(\.freiJetzt) + zeilen.filter { !$0.freiJetzt }).prefix(hoechstens))
    }

    /// Die naechste Veranstaltung, die noch nicht vorbei ist.
    static func veranstaltung(_ liste: [WidgetVeranstaltung], jetzt: Date) -> WidgetVeranstaltung? {
        liste.first { e in (Zeit.datum(e.endsAt ?? e.startsAt) ?? .distantPast) >= jetzt }
    }

    /**
     * Die Belegung je Platz fuer jetzt. nil, wenn der Plan nicht von heute
     * (Berlin) ist - dann muss das Widget erst neu laden.
     */
    static func plaetze(_ plan: WidgetPlan?, jetzt: Date) -> PlaetzeLage? {
        guard let plan, plan.tag == Zeit.berlinDay(jetzt) else { return nil }
        let minute = Zeit.localMinutes(jetzt)
        let geschlossen = minute >= plan.schluss
        let jetztFrei = Belegung.freeCourtsNow(
            day: plan.tag, courtIds: plan.plaetze.map(\.id), openingMinutes: plan.oeffnung,
            closingMinutes: plan.schluss, slotMinutes: plan.raster, durationMinutes: plan.dauer,
            occupied: plan.belegungen, leadDays: plan.vorlaufTage, now: jetzt
        )
        let spanne = Double(plan.schluss - plan.oeffnung)

        let zeilen = plan.plaetze.map { platz in
            let eigene = plan.belegungen.filter { $0.courtId == platz.id }
            let luecken = Platzplan.freeGaps(
                day: plan.tag, courtId: platz.id, openingMinutes: plan.oeffnung, closingMinutes: plan.schluss,
                slotMinutes: plan.raster, durationMinutes: plan.dauer, occupied: plan.belegungen,
                leadDays: plan.vorlaufTage, now: jetzt
            )
            let fenster = jetztFrei.first { $0.courtId == platz.id }
            return PlatzZeile(
                id: platz.id,
                name: platz.name,
                status: status(fenster: fenster, belegungen: eigene, luecken: luecken, minute: minute, geschlossen: geschlossen),
                freiJetzt: fenster != nil,
                belegt: Startseite.timelineSegments(eigene, openingMinutes: plan.oeffnung, closingMinutes: plan.schluss),
                frei: spanne > 0 ? luecken.map {
                    LeistenStueck(
                        left: Double($0.from - plan.oeffnung) / spanne * 100,
                        width: Double($0.until - $0.from) / spanne * 100
                    )
                } : [],
                lueckenText: luecken.isEmpty
                    ? "keine freie Zeit mehr"
                    : luecken.map { "\(Zeit.minutesToTime($0.from))–\(Zeit.minutesToTime($0.until))" }.joined(separator: ", ")
            )
        }

        return PlaetzeLage(
            zeilen: zeilen,
            ueberschrift: geschlossen ? "Für heute geschlossen" : "\(jetztFrei.count) von \(plan.plaetze.count) frei",
            freiJetzt: jetztFrei.count,
            jetzt: Startseite.timelinePosition(minute, openingMinutes: plan.oeffnung, closingMinutes: plan.schluss),
            geschlossen: geschlossen
        )
    }

    private static func status(
        fenster: FreeWindow?, belegungen: [WidgetBelegung], luecken: [FreeGap], minute: Int, geschlossen: Bool
    ) -> String {
        if geschlossen { return "geschlossen" }
        if let fenster { return "frei bis \(Zeit.minutesToTime(fenster.untilMinute))" }
        // Laeuft gerade etwas? Dann bis zum Ende - auch ueber direkt anschliessende Belegungen.
        let zeiten = belegungen.map { (von: Zeit.minutesOf($0.startsAt), bis: Zeit.minutesOf($0.endsAt)) }
        if var bis = zeiten.first(where: { $0.von <= minute && $0.bis > minute })?.bis {
            while let weiter = zeiten.first(where: { $0.von <= bis && $0.bis > bis }) { bis = weiter.bis }
            return "belegt bis \(Zeit.minutesToTime(bis))"
        }
        if let naechste = luecken.first { return "frei ab \(Zeit.minutesToTime(naechste.from))" }
        return "heute belegt"
    }
}

// MARK: - Links

/**
 * Wohin ein Tippen fuehrt: das eigene URL-Schema der Konfiguration (tcm,
 * tcmdev, tcmlokal) mit einem Pfad der App, etwa tcm://verein/veranstaltung/<id>.
 * Die App wertet den Pfad wie das Ziel einer Push-Nachricht aus (PushZiel.ausPfad).
 * Universal Links gingen auch, aber ohne Web-Adresse (Lokal) nicht - das Schema immer.
 */
enum WidgetLink {
    static let home = "/home"
    static let plaetze = "/plaetze"

    static func veranstaltung(_ id: String) -> String {
        "/verein/veranstaltung/\(id)"
    }

    static func url(_ pfad: String, schema: String?) -> URL? {
        guard let schema, !schema.isEmpty else { return nil }
        let ohne = pfad.hasPrefix("/") ? String(pfad.dropFirst()) : pfad
        return URL(string: "\(schema)://\(ohne)")
    }

    /// Der Pfad aus einem Widget-Link; nil fuer fremde Schemata und den Passwort-Link.
    static func pfad(aus url: URL, schema: String?) -> String? {
        guard let schema, url.scheme?.lowercased() == schema.lowercased(),
              let host = url.host(), !host.isEmpty, host != "passwort-setzen"
        else { return nil }
        return "/\(host)\(url.path())"
    }
}
