/**
 * Beispieldaten fuer die Widget-Galerie (placeholder, Vorschau) und die Bilder
 * in apps/ios/docs. Erfundene Namen, keine echten Mitglieder.
 */

import Foundation

extension WidgetSchnappschuss {
    /// Ein Nachmittag um `jetzt`: zwei eigene Spiele, sechs Plaetze, zwei Veranstaltungen.
    static func beispiel(jetzt: Date = Date()) -> WidgetSchnappschuss {
        let heute = Zeit.berlinDay(jetzt)
        let morgen = Zeit.berlinDay(jetzt.addingTimeInterval(86_400))
        let iso = { (tag: String, uhr: String) in Zeit.iso(Zeit.berlinTime(day: tag, minutes: Zeit.timeToMinutes(uhr))) }
        let plaetze = (1...6).map { WidgetPlatz(id: "p\($0)", name: "Platz \($0)") }
        let belegung = { (platz: Int, von: String, bis: String, kind: String, eigen: Bool, sucht: Bool) in
            WidgetBelegung(
                courtId: "p\(platz)", startsAt: iso(heute, von), endsAt: iso(heute, bis), kind: kind,
                isOwn: eigen, partnerWanted: sucht, frei: sucht ? 2 : 0, seriesId: nil
            )
        }
        return WidgetSchnappschuss(
            stand: jetzt,
            termine: [
                WidgetTermin(id: "b1", startsAt: iso(heute, "18:00"), endsAt: iso(heute, "19:00"),
                             platz: "Platz 1", art: "Einzel", mit: "mit Mara Beispiel"),
                WidgetTermin(id: "b2", startsAt: iso(morgen, "10:00"), endsAt: iso(morgen, "11:30"),
                             platz: "Platz 3", art: "Doppel", mit: "mit Jonas Muster, Lea Probe, Tim Test"),
            ],
            plan: WidgetPlan(
                tag: heute, oeffnung: 8 * 60, schluss: 21 * 60, raster: 30, dauer: 60, vorlaufTage: 7,
                plaetze: plaetze,
                belegungen: [
                    belegung(1, "18:00", "19:00", "booking", true, false),
                    belegung(1, "15:00", "16:30", "booking", false, false),
                    belegung(2, "14:00", "17:30", "booking", false, false),
                    belegung(3, "16:00", "17:00", "booking", false, true),
                    belegung(3, "17:00", "19:00", "booking", false, false),
                    belegung(4, "08:00", "21:00", "blocking", false, false),
                    belegung(5, "17:30", "20:00", "booking", false, false),
                ]
            ),
            veranstaltungen: [
                WidgetVeranstaltung(id: "e1", titel: "Saisonabschlussfest", startsAt: iso(morgen, "19:00"),
                                    endsAt: iso(morgen, "23:00"), zeit: "\(Zeit.kurzerWochentag(Zeit.datum(iso(morgen, "19:00")) ?? jetzt)) 19–23 Uhr · Clubhaus", marke: "Angemeldet"),
            ]
        )
    }
}
