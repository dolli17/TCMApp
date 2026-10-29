/**
 * Daten fuer die Widgets laden und ablegen
 *
 * - WidgetBruecke (App): nach jedem Laden von Home den Schnappschuss
 *   ablegen und die Widgets neu zeichnen lassen; beim Abmelden alles vergessen.
 * - WidgetLaden (Erweiterung): im Zeitplan selbst laden, mit der Sitzung aus
 *   dem geteilten Schluesselbund (Access Group = App Group). Ein Widget
 *   abonniert nichts (docs/native/app-api.md, Realtime).
 *
 * Beide bauen den Schnappschuss mit WidgetSchnappschuss.aus - aus denselben
 * RPCs wie Home: my_bookings, courts_aktiv, day_schedule, booking_settings,
 * booking_types_aktiv, events_fuer_mitglied.
 */

import Foundation
import Supabase
import WidgetKit

@MainActor
enum WidgetBruecke {
    /// Legt ab, was Home geladen hat. Neu gezeichnet wird nur, wenn sich etwas geaendert hat.
    static func ablegen(_ inhalt: HomeInhalt, umgebung: Umgebung, jetzt: Date = Date()) {
        guard let ablage = WidgetAblage(appGroup: umgebung.appGroup) else { return }
        let neu = WidgetSchnappschuss.aus(
            termine: inhalt.termine.wert, frei: inhalt.frei.wert, events: inhalt.events.wert, jetzt: jetzt
        )
        let alt = ablage.lesen()
        guard let gesamt = try? ablage.speichern(neu) else { return }
        if alt.map({ !gleicherInhalt($0, gesamt) }) ?? true {
            WidgetCenter.shared.reloadAllTimelines()
        }
    }

    /// Beim Abmelden: kein Termin bleibt auf dem Home-Bildschirm stehen.
    static func vergessen(umgebung: Umgebung) {
        WidgetAblage(appGroup: umgebung.appGroup)?.loeschen()
        WidgetCenter.shared.reloadAllTimelines()
    }

    /// Gleich bis auf den Zeitpunkt des Ladens.
    nonisolated static func gleicherInhalt(_ a: WidgetSchnappschuss, _ b: WidgetSchnappschuss) -> Bool {
        var b = b
        b.stand = a.stand
        return a == b
    }
}

enum WidgetLaden {
    enum Ergebnis: Sendable, Equatable {
        case geladen(WidgetSchnappschuss)
        /// Keine Sitzung im Schluesselbund
        case abgemeldet
        /// Kein Netz, Server gestoert, nichts ging
        case fehler
    }

    static func laden(umgebung: Umgebung, jetzt: Date = Date()) async -> Ergebnis {
        // Ohne Auffrischen im Hintergrund: die Erweiterung lebt nur Sekunden. Ist das
        // Zugriffstoken abgelaufen, erneuert `session` es einmal und legt es in den
        // geteilten Schluesselbund - die App liest es von dort (supabase-swift liest
        // die Sitzung bei jedem Zugriff aus der Ablage).
        let client = SupabaseVerbindung.client(fuer: umgebung, autoRefreshToken: false)
        do {
            _ = try await client.auth.session
        } catch AuthError.sessionMissing {
            return .abgemeldet
        } catch {
            return .fehler
        }

        let d = Startdaten(client: client)
        let heute = Zeit.berlinDay(jetzt)
        async let meine = try? d.meineBuchungen()
        async let plaetze = try? d.plaetze()
        async let plan = try? d.tagesplan(heute)
        async let einstellungen = try? d.buchungseinstellungen()
        async let arten = try? d.buchungsarten()
        async let events = try? d.veranstaltungen()

        let (m, p, t, e, a, v) = await (meine, plaetze, plan, einstellungen, arten, events)
        // Wie "Jetzt frei" auf Home: vier Quellen, fehlt eine, fehlt der Plan.
        var frei: FreiDaten?
        if let p, let t, let e, let a {
            frei = FreiDaten(heute: heute, plaetze: p, belegung: t, einstellungen: e, dauer: a.first?.durationMinutes ?? 60)
        }
        guard m != nil || frei != nil || v != nil else { return .fehler }
        return .geladen(WidgetSchnappschuss.aus(termine: m, frei: frei, events: v, jetzt: jetzt))
    }
}
