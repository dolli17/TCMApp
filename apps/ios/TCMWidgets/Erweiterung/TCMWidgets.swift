/**
 * Die Widget-Erweiterung der App
 *
 * Drei Widgets: "Meine nächsten Spiele" (auch auf dem Sperrbildschirm),
 * "Plätze jetzt" und "Nächste Veranstaltung". Alle lesen denselben
 * Schnappschuss (Gemeinsam/Schnappschuss.swift) und laden im Zeitplan selbst
 * nach (WidgetLaden) - Realtime gibt es hier nicht.
 *
 * Ein Tippen oeffnet die App ueber das eigene URL-Schema der Konfiguration
 * (WidgetLink); die App fuehrt dorthin wie bei einer Push-Nachricht.
 */

import SwiftUI
import WidgetKit

@main
struct TCMWidgets: WidgetBundle {
    var body: some Widget {
        SpieleWidget()
        PlaetzeWidget()
        VeranstaltungWidget()
    }
}

// MARK: - Zeitplan

struct WidgetEintrag: TimelineEntry {
    let date: Date
    let zustand: WidgetZustand
}

struct Anbieter: TimelineProvider {
    /// Spaetestens so oft neu laden (WidgetZeitplan).
    let takt: TimeInterval

    func placeholder(in context: Context) -> WidgetEintrag {
        WidgetEintrag(date: Date(), zustand: .daten(.beispiel()))
    }

    func getSnapshot(in context: Context, completion: @escaping (WidgetEintrag) -> Void) {
        let jetzt = Date()
        // In der Galerie das Beispiel, sonst was zuletzt geladen wurde.
        if context.isPreview {
            completion(WidgetEintrag(date: jetzt, zustand: .daten(.beispiel(jetzt: jetzt))))
            return
        }
        let s = WidgetUmgebung.ablage?.lesen()
        completion(WidgetEintrag(date: jetzt, zustand: s.map(WidgetZustand.daten) ?? .keineDaten))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<WidgetEintrag>) -> Void) {
        let takt = takt
        let fertig = Rueckgabe(aufruf: completion)
        Task {
            fertig.aufruf(await Self.zeitplan(takt: takt))
        }
    }

    /// WidgetKit ruft `completion` genau einmal und von beliebigem Thread auf; das Protokoll
    /// markiert sie (noch) nicht als Sendable.
    private struct Rueckgabe: @unchecked Sendable {
        let aufruf: (Timeline<WidgetEintrag>) -> Void
    }

    /// Ohne Daten (kein Netz, abgemeldet) wird nach dieser Zeit erneut versucht.
    static let wiederholen: TimeInterval = 15 * 60
    /// Juenger als das: nicht noch einmal laden - die drei Widgets laden sonst dreimal.
    static let frisch: TimeInterval = 5 * 60
    /// Ohne Sitzung zeigt das Widget einen alten Schnappschuss nur so lange (vor dem
    /// ersten Entsperren ist der Schluesselbund nicht lesbar - das ist kein Abmelden).
    static let ohneSitzungHoechstens: TimeInterval = 12 * 60 * 60

    static func zeitplan(takt: TimeInterval) async -> Timeline<WidgetEintrag> {
        let jetzt = Date()
        let ablage = WidgetUmgebung.ablage
        var schnappschuss = ablage?.lesen()
        var ohneSitzung = false

        if let umgebung = WidgetUmgebung.umgebung,
           schnappschuss.map({ jetzt.timeIntervalSince($0.stand) > frisch }) ?? true {
            switch await WidgetLaden.laden(umgebung: umgebung, jetzt: jetzt) {
            case let .geladen(neu):
                schnappschuss = (try? ablage?.speichern(neu)) ?? neu.ueber(schnappschuss)
            case .abgemeldet:
                ohneSitzung = true
            case .fehler:
                break
            }
        }

        let zustand: WidgetZustand
        if let s = schnappschuss, !(ohneSitzung && jetzt.timeIntervalSince(s.stand) > ohneSitzungHoechstens) {
            zustand = .daten(s)
        } else {
            zustand = ohneSitzung ? .abgemeldet : .keineDaten
        }

        guard case let .daten(s) = zustand else {
            return Timeline(entries: [WidgetEintrag(date: jetzt, zustand: zustand)], policy: .after(jetzt.addingTimeInterval(wiederholen)))
        }
        let termine = s.termine ?? []
        let bis = WidgetZeitplan.neuLaden(termine: termine, jetzt: jetzt, takt: takt)
        let eintraege = WidgetZeitplan.eintraege(jetzt: jetzt, bis: bis, termine: termine)
            .map { WidgetEintrag(date: $0, zustand: zustand) }
        return Timeline(entries: eintraege, policy: .after(bis))
    }
}

/// Umgebung und Ablage aus der Info.plist der Erweiterung (dieselben Werte wie die App).
enum WidgetUmgebung {
    static let umgebung = try? Umgebung.ausBundle()
    static var ablage: WidgetAblage? { WidgetAblage(appGroup: umgebung?.appGroup) }

    static func link(_ pfad: String) -> URL? {
        WidgetLink.url(pfad, schema: umgebung?.urlSchema)
    }
}

// MARK: - Widgets

struct SpieleWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "TCMSpiele", provider: Anbieter(takt: WidgetZeitplan.taktTermine)) { e in
            FamilienAnsicht { familie in
                SpieleWidgetAnsicht(zustand: e.zustand, jetzt: e.date, familie: familie)
                    .widgetURL(WidgetUmgebung.link(e.zustand == .abgemeldet ? WidgetLink.home : WidgetLink.plaetze))
            }
        }
        .configurationDisplayName("Meine nächsten Spiele")
        .description("Deine nächsten Buchungen mit Platz, Uhrzeit und Mitspielern.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryInline])
    }
}

struct PlaetzeWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "TCMPlaetze", provider: Anbieter(takt: WidgetZeitplan.taktPlaetze)) { e in
            FamilienAnsicht { familie in
                PlaetzeWidgetAnsicht(zustand: e.zustand, jetzt: e.date, familie: familie)
                    .widgetURL(WidgetUmgebung.link(e.zustand == .abgemeldet ? WidgetLink.home : WidgetLink.plaetze))
            }
        }
        .configurationDisplayName("Plätze jetzt")
        .description("Welche Plätze heute frei sind und bis wann.")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}

struct VeranstaltungWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "TCMVeranstaltung", provider: Anbieter(takt: WidgetZeitplan.taktTermine)) { e in
            FamilienAnsicht { familie in
                VeranstaltungWidgetAnsicht(zustand: e.zustand, jetzt: e.date, familie: familie)
                    .widgetURL(WidgetUmgebung.link(ziel(e)))
            }
        }
        .configurationDisplayName("Nächste Veranstaltung")
        .description("Was demnächst im Verein ansteht und ob du dabei bist.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }

    private func ziel(_ e: WidgetEintrag) -> String {
        guard case let .daten(s) = e.zustand else { return WidgetLink.home }
        guard let v = WidgetInhalt.veranstaltung(s.veranstaltungen ?? [], jetzt: e.date) else { return "/verein" }
        return WidgetLink.veranstaltung(v.id)
    }
}

/// Reicht die Groesse aus der Umgebung weiter - die Ansichten nehmen sie als Wert (fuer die Bilder in den Tests).
private struct FamilienAnsicht<Inhalt: View>: View {
    @Environment(\.widgetFamily) private var familie
    @ViewBuilder let inhalt: (WidgetFamily) -> Inhalt

    var body: some View { inhalt(familie) }
}

#Preview("Spiele", as: .systemSmall) {
    SpieleWidget()
} timeline: {
    WidgetEintrag(date: .now, zustand: .daten(.beispiel()))
    WidgetEintrag(date: .now, zustand: .abgemeldet)
}

#Preview("Plätze", as: .systemLarge) {
    PlaetzeWidget()
} timeline: {
    WidgetEintrag(date: .now, zustand: .daten(.beispiel()))
}
