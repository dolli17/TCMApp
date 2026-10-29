/**
 * Die Ansichten der Widgets
 *
 * Liegen bei den gemeinsamen Dateien, damit die Unit-Tests der App sie mit
 * ImageRenderer abbilden koennen (WidgetBilderTests, Bilder unter apps/ios/docs).
 * Farben und Schrift wie in der App (Farbe, Schrift, Tokens): hell und dunkel
 * folgen dem System. Im getoenten Modus faerbt das System selbst ein; was dort
 * hervorstechen soll, ist `widgetAccentable`.
 */

import SwiftUI
import WidgetKit

/// Was ein Widget gerade zeigen kann.
enum WidgetZustand: Equatable, Sendable {
    case daten(WidgetSchnappschuss)
    /// Keine Sitzung und kein Schnappschuss
    case abgemeldet
    /// Angemeldet, aber noch nichts geladen (oder kein Netz beim ersten Mal)
    case keineDaten
}

// MARK: - Hintergrund

private struct VorschauSchluessel: EnvironmentKey {
    static let defaultValue = false
}

extension EnvironmentValues {
    /// Ausserhalb von WidgetKit (Bilder in den Tests): der Hintergrund kommt als `background`.
    var widgetVorschau: Bool {
        get { self[VorschauSchluessel.self] }
        set { self[VorschauSchluessel.self] = newValue }
    }
}

private struct Hintergrund: ViewModifier {
    @Environment(\.widgetVorschau) private var vorschau
    let farbe: Color

    func body(content: Content) -> some View {
        if vorschau {
            content.padding(16).background(farbe)
        } else {
            content.containerBackground(for: .widget) { farbe }
        }
    }
}

extension View {
    func widgetHintergrund(_ farbe: Color) -> some View {
        modifier(Hintergrund(farbe: farbe))
    }

    /// Kicker wie in der App (Bausteine.kicker), etwas kleiner fuer Widgets.
    func widgetKicker(_ farbe: Color, zeilen: Int = 1) -> some View {
        font(Schrift.display(.fett, 12, relativeTo: .caption))
            .textCase(.uppercase)
            .tracking(12 * Tokens.Schrift.laufweiteKicker)
            .foregroundStyle(farbe)
            .lineLimit(zeilen)
    }
}

// MARK: - Hinweise

/// Ohne Sitzung oder ohne Daten - dieselbe Karte fuer alle Widgets.
struct WidgetHinweis: View {
    let titel: String
    let zustand: WidgetZustand
    let familie: WidgetFamily

    var body: some View {
        switch familie {
        case .accessoryInline:
            Text(kurz)
        case .accessoryRectangular, .accessoryCircular:
            VStack(alignment: .leading, spacing: 2) {
                Text(titel).widgetKicker(.secondary)
                Text(kurz).font(Schrift.text(.halbfett, 15)).lineLimit(2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        default:
            VStack(alignment: .leading, spacing: 6) {
                Text(titel).widgetKicker(Farbe.muted)
                Spacer(minLength: 0)
                Text(kurz)
                    .font(Schrift.text(.fett, 17))
                    .foregroundStyle(Farbe.ink)
                    .widgetAccentable()
                Text(lang)
                    .font(Schrift.text(.normal, 13))
                    .foregroundStyle(Farbe.ink2)
                    .lineLimit(3)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .widgetHintergrund(Farbe.surf)
        }
    }

    private var kurz: String {
        zustand == .abgemeldet ? "In der App anmelden" : "Noch keine Daten"
    }

    private var lang: String {
        zustand == .abgemeldet
            ? "Dann stehen hier deine Spiele, die Plätze und was im Verein ansteht."
            : "Öffne die App einmal, dann füllt sich das Widget."
    }
}

// MARK: - Meine nächsten Spiele

struct SpieleWidgetAnsicht: View {
    let zustand: WidgetZustand
    let jetzt: Date
    let familie: WidgetFamily

    var body: some View {
        if case let .daten(s) = zustand {
            let termine = s.termine ?? []
            let zeilen = WidgetInhalt.spiele(termine, jetzt: jetzt, hoechstens: familie == .systemMedium ? 3 : 1)
            switch familie {
            case .accessoryInline:
                if let z = zeilen.first, let t = termine.first(where: { $0.id == z.id }) {
                    Label(WidgetInhalt.inline(z, jetzt: jetzt, startsAt: t.startsAt), systemImage: "tennisball")
                } else {
                    Label("Kein Spiel geplant", systemImage: "tennisball")
                }
            case .accessoryRectangular:
                sperrbildschirm(zeilen.first)
            case .systemMedium:
                mittel(zeilen, geladen: s.termine != nil)
            default:
                klein(zeilen.first, geladen: s.termine != nil)
            }
        } else {
            WidgetHinweis(titel: "Meine Spiele", zustand: zustand, familie: familie)
        }
    }

    private func sperrbildschirm(_ z: SpielZeile?) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            if let z {
                Text(z.kicker).font(Schrift.display(.fett, 13)).lineLimit(1)
                Text(z.zeit).font(Schrift.display(.fett, 22)).monospacedDigit().lineLimit(1).widgetAccentable()
                Text([z.platz, z.art].filter { !$0.isEmpty }.joined(separator: " · ")).font(Schrift.text(.mittel, 13)).lineLimit(1)
            } else {
                Text("Meine Spiele").font(Schrift.display(.fett, 13))
                Text("Noch nichts geplant").font(Schrift.text(.halbfett, 15)).lineLimit(2).widgetAccentable()
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func klein(_ z: SpielZeile?, geladen: Bool) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                Text(z?.kicker ?? "Meine Spiele").widgetKicker(Farbe.onBrand.opacity(0.85), zeilen: 2)
                Spacer(minLength: 4)
                Circle().fill(Farbe.gold).frame(width: 14, height: 14).widgetAccentable()
            }
            if let z {
                Text(z.beginn)
                    .font(Schrift.display(.fett, 40, relativeTo: .largeTitle))
                    .monospacedDigit()
                    .foregroundStyle(Farbe.onBrand)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .widgetAccentable()
                    .padding(.top, 4)
                Text([z.platz, z.art].filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(Schrift.text(.fett, 15))
                    .foregroundStyle(Farbe.onBrand)
                    .lineLimit(1)
                Spacer(minLength: 4)
                Text(z.mit)
                    .font(Schrift.text(.normal, 12))
                    .foregroundStyle(Farbe.onBrand.opacity(0.85))
                    .lineLimit(2)
            } else {
                Spacer(minLength: 4)
                leer(geladen: geladen)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .widgetHintergrund(Farbe.brand)
    }

    private func mittel(_ zeilen: [SpielZeile], geladen: Bool) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Meine nächsten Spiele").widgetKicker(Farbe.onBrand.opacity(0.85))
                Spacer(minLength: 4)
                Circle().fill(Farbe.gold).frame(width: 14, height: 14).widgetAccentable()
            }
            if zeilen.isEmpty {
                Spacer(minLength: 4)
                leer(geladen: geladen)
            } else {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(zeilen.enumerated()), id: \.element.id) { i, z in
                        if i > 0 { Rectangle().fill(Farbe.onBrand.opacity(0.18)).frame(height: 1) }
                        zeile(z).padding(.vertical, 5)
                    }
                }
                .padding(.top, 4)
                Spacer(minLength: 0)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .widgetHintergrund(Farbe.brand)
    }

    private func zeile(_ z: SpielZeile) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(z.beginn)
                .font(Schrift.display(.fett, 24))
                .monospacedDigit()
                .foregroundStyle(Farbe.onBrand)
                .widgetAccentable()
                .frame(width: 62, alignment: .leading)
            VStack(alignment: .leading, spacing: 1) {
                Text(z.kicker)
                    .font(Schrift.display(.fett, 12))
                    .foregroundStyle(Farbe.gold)
                    .lineLimit(1)
                Text([z.platz, z.art, z.mit].filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(Schrift.text(.mittel, 13))
                    .foregroundStyle(Farbe.onBrand.opacity(0.92))
                    .lineLimit(1)
            }
        }
    }

    @ViewBuilder private func leer(geladen: Bool) -> some View {
        Text(geladen ? "Noch nichts geplant" : "Termine konnten nicht geladen werden.")
            .font(Schrift.text(.fett, 17))
            .foregroundStyle(Farbe.onBrand)
        Text("Platz buchen ›")
            .font(Schrift.text(.halbfett, 13))
            .foregroundStyle(Farbe.gold)
            .widgetAccentable()
            .padding(.top, 2)
    }
}

// MARK: - Plätze jetzt

struct PlaetzeWidgetAnsicht: View {
    let zustand: WidgetZustand
    let jetzt: Date
    let familie: WidgetFamily

    var body: some View {
        if case let .daten(s) = zustand {
            inhalt(WidgetInhalt.plaetze(s.plan, jetzt: jetzt), stand: s.stand)
        } else {
            WidgetHinweis(titel: "Plätze jetzt", zustand: zustand, familie: familie)
        }
    }

    private var gross: Bool { familie == .systemLarge }

    private func inhalt(_ lage: PlaetzeLage?, stand: Date) -> some View {
        VStack(alignment: .leading, spacing: gross ? 10 : 6) {
            HStack(alignment: .firstTextBaseline) {
                Text("Plätze jetzt").widgetKicker(Farbe.muted)
                Spacer(minLength: 4)
                if let text = WidgetInhalt.standText(stand, jetzt: jetzt) {
                    Text(text).font(Schrift.text(.normal, 11)).foregroundStyle(Farbe.muted)
                }
                if let lage {
                    Text(lage.ueberschrift)
                        .font(Schrift.text(.fett, 13))
                        .foregroundStyle(lage.freiJetzt > 0 ? Farbe.greenInk : Farbe.ink2)
                        .widgetAccentable()
                }
            }
            if let lage {
                let zeilen = gross ? Array(lage.zeilen.prefix(8)) : WidgetInhalt.mittelZeilen(lage.zeilen, hoechstens: 4)
                ForEach(zeilen) { z in zeile(z, marke: lage.geschlossen ? nil : lage.jetzt) }
                Spacer(minLength: 0)
            } else {
                Spacer(minLength: 0)
                Text("Die Belegung für heute ist noch nicht geladen.")
                    .font(Schrift.text(.halbfett, 14))
                    .foregroundStyle(Farbe.ink2)
                Spacer(minLength: 0)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .widgetHintergrund(Farbe.surf)
    }

    private func zeile(_ z: PlatzZeile, marke: Double?) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(alignment: .center, spacing: 10) {
                Text(z.name)
                    .font(Schrift.display(.fett, 15))
                    .foregroundStyle(Farbe.ink)
                    .lineLimit(1)
                    .frame(width: 66, alignment: .leading)
                WidgetZeitleiste(belegt: z.belegt, frei: z.frei, markierung: marke)
                Text(z.status)
                    .font(Schrift.text(.halbfett, 12))
                    .foregroundStyle(z.freiJetzt ? Farbe.greenInk : Farbe.ink2)
                    .lineLimit(1)
                    .frame(width: 96, alignment: .trailing)
                    .widgetAccentable(z.freiJetzt)
            }
            if gross {
                Text("Frei: \(z.lueckenText)")
                    .font(Schrift.text(.normal, 11))
                    .foregroundStyle(Farbe.muted)
                    .lineLimit(1)
                    .padding(.leading, 76)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(z.name), \(z.status)")
    }
}

/// Wie MiniZeitleiste auf Home, dazu die freien Luecken gruen unterlegt.
struct WidgetZeitleiste: View {
    let belegt: [TimelineSegment]
    let frei: [LeistenStueck]
    let markierung: Double?
    var hoehe: CGFloat = 8

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            ZStack(alignment: .leading) {
                Capsule().fill(Farbe.surf2)
                ForEach(Array(frei.enumerated()), id: \.offset) { _, f in
                    Capsule().fill(Farbe.green.opacity(0.55))
                        .frame(width: max(0, w * f.width / 100), height: hoehe)
                        .offset(x: w * f.left / 100)
                        .widgetAccentable()
                }
                ForEach(Array(belegt.enumerated()), id: \.offset) { _, s in
                    Capsule().fill(farbe(s.art))
                        .frame(width: max(0, w * s.width / 100), height: hoehe)
                        .offset(x: w * s.left / 100)
                }
            }
            .clipShape(Capsule())
            .overlay(alignment: .leading) {
                if let markierung {
                    RoundedRectangle(cornerRadius: 1)
                        .fill(Farbe.ink)
                        .frame(width: 2, height: hoehe + 4)
                        .offset(x: min(w - 2, w * markierung / 100))
                }
            }
        }
        .frame(height: hoehe + 4)
        .accessibilityHidden(true)
    }

    private func farbe(_ art: TimelineKind) -> Color {
        switch art {
        case .belegt: Farbe.blue
        case .eigen: Farbe.gold
        case .sucht: Farbe.goldLine.opacity(0.6)
        case .gesperrt, .serie: Farbe.rahmen.opacity(0.55)
        }
    }
}

// MARK: - Nächste Veranstaltung

struct VeranstaltungWidgetAnsicht: View {
    let zustand: WidgetZustand
    let jetzt: Date
    let familie: WidgetFamily

    var body: some View {
        if case let .daten(s) = zustand {
            inhalt(WidgetInhalt.veranstaltung(s.veranstaltungen ?? [], jetzt: jetzt), geladen: s.veranstaltungen != nil)
        } else {
            WidgetHinweis(titel: "Im Verein", zustand: zustand, familie: familie)
        }
    }

    private func inhalt(_ e: WidgetVeranstaltung?, geladen: Bool) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(familie == .systemSmall ? "Im Verein" : "Demnächst im Verein").widgetKicker(Farbe.muted)
            if let e {
                let kachel = Veranstaltungen.eventDatumKachel(e.startsAt)
                HStack(alignment: .top, spacing: 10) {
                    VStack(spacing: -2) {
                        Text(kachel.tag).font(Schrift.display(.extrafett, 24)).monospacedDigit()
                        Text(kachel.monat).font(Schrift.display(.fett, 12)).textCase(.uppercase)
                    }
                    .foregroundStyle(Farbe.onGold)
                    .frame(width: 46, height: 50)
                    .background(Farbe.gold, in: RoundedRectangle(cornerRadius: Tokens.Radius.klein))
                    .widgetAccentable()
                    if familie != .systemSmall {
                        titel(e)
                    }
                }
                .padding(.top, 8)
                if familie == .systemSmall {
                    titel(e).padding(.top, 8)
                }
                Spacer(minLength: 0)
                if let marke = e.marke {
                    // Wie eventMeineMarke: angemeldet gruen, Warteliste und "Anmelden" gelb
                    let dabei = marke.hasPrefix("Angemeldet")
                    Text(marke)
                        .font(Schrift.text(.fett, 12))
                        .foregroundStyle(dabei ? Farbe.greenInk : Farbe.goldInk)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(dabei ? Farbe.green.opacity(0.15) : Farbe.goldSoft, in: Capsule())
                        .widgetAccentable()
                }
            } else {
                Spacer(minLength: 4)
                Text(geladen ? "Gerade steht nichts an." : "Veranstaltungen konnten nicht geladen werden.")
                    .font(Schrift.text(.halbfett, 15))
                    .foregroundStyle(Farbe.ink)
                Spacer(minLength: 0)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .widgetHintergrund(Farbe.surf)
    }

    private func titel(_ e: WidgetVeranstaltung) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(e.titel)
                .font(Schrift.text(.fett, 15))
                .foregroundStyle(Farbe.ink)
                .lineLimit(2)
            Text(e.zeit)
                .font(Schrift.text(.normal, 12))
                .foregroundStyle(Farbe.ink2)
                .lineLimit(2)
        }
    }
}
