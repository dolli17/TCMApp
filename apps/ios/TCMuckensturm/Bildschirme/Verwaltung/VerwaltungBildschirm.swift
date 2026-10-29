/**
 * Verwaltung: Plaetze & Serien (apps/mobile/app/(tabs)/verwaltung/)
 *
 * Verwaltet wird am PC (Web unter /admin). Am Handy bleibt, was kurzfristig
 * an den Plaetzen passiert: Plaetze sperren und Serien pflegen. Zwei
 * Segmente; der gelbe Knopf passt zum Segment (Plaetze sperren / Serie
 * anlegen). Die Plaetze stehen nur zum Lesen da, mit dem, was gerade auf
 * ihnen liegt - eine Sperrung fuehrt in den Tab Plaetze, wo sie bearbeitet
 * und aufgehoben wird. Unten verweist eine Karte ins Web: Admins auf
 * /admin, den Platzwart auf /admin/plaetze.
 *
 * Den Tab gibt es nur mit Platzrechten (VerwaltungZugang, HauptTabs). Das
 * ist wie im Web nur die Oberflaeche: die RPCs pruefen selbst.
 */

import SwiftUI
import Supabase

// MARK: - Zugang

/**
 * Ob der Tab sichtbar ist und ob mit vollen Rechten. HauptTabs fragt beim
 * Start ich(); ein Fehler zaehlt als "keine Rechte", der Tab bleibt dann weg.
 */
@MainActor @Observable
final class VerwaltungZugang {
    var sichtbar = false
    /// nil, solange es nicht feststeht - dann bleibt der Web-Hinweis weg.
    var admin: Bool?

    func pruefen(_ client: SupabaseClient) async {
        let ich = try? await Verwaltungsdaten(client: client).ich()
        sichtbar = VerwaltungLogik.sichtbar(ich)
        admin = ich.map { $0.admin == true }
    }
}

// MARK: - Modell

enum VerwaltungAnsicht: String, CaseIterable, Hashable {
    case plaetze, serien

    var label: String { self == .plaetze ? "Plätze" : "Serien" }
}

enum VerwaltungBlatt: Identifiable, Equatable {
    case sperren, serieAnlegen
    case serie(Serie)

    var id: String {
        switch self {
        case .sperren: "sperren"
        case .serieAnlegen: "serie-anlegen"
        case let .serie(s): "serie-\(s.id)"
        }
    }
}

@MainActor @Observable
final class VerwaltungModell {
    let daten: Verwaltungsdaten

    var ansicht: VerwaltungAnsicht = .plaetze {
        didSet { if ansicht != oldValue { meldung = nil } }
    }
    var stand: VerwaltungsStand?
    var laedt = true
    var aktualisiert = false
    var fehler: String?
    var blatt: VerwaltungBlatt?
    /// Ergebnis der letzten Aktion, steht unter dem gelben Knopf.
    var meldung: PlatzErgebnis?
    var meinName: MeinName?

    init(client: SupabaseClient) {
        daten = Verwaltungsdaten(client: client)
    }

    func laden(nachladen: Bool = false) async {
        if nachladen { aktualisiert = true }
        do {
            stand = try await daten.laden()
            fehler = nil
        } catch {
            fehler = Meldung.aus(error).text
        }
        laedt = false
        aktualisiert = false
    }

    func ladeName() async {
        meinName = (try? await daten.ich())?.name
    }

    /// Nach einer Aktion im Blatt: Meldung zeigen, Blatt zu, neu laden.
    func erledigt(_ e: PlatzErgebnis) async {
        blatt = nil
        meldung = e
        await laden()
    }
}

// MARK: - Bildschirm

struct VerwaltungBildschirm: View {
    @Environment(Sitzung.self) private var sitzung

    var body: some View {
        VerwaltungInhalt(modell: VerwaltungModell(client: sitzung.client))
    }
}

private struct VerwaltungInhalt: View {
    @Environment(VerwaltungZugang.self) private var zugang
    @Environment(\.scenePhase) private var phase
    @State var modell: VerwaltungModell

    var body: some View {
        let m = modell
        ScrollView {
            LazyVStack(alignment: .leading, spacing: Tokens.Abstand.m, pinnedViews: [.sectionHeaders]) {
                GrosserKopf(titel: "Verwaltung", name: m.meinName)
                if let f = m.fehler {
                    Fehlerzeile(text: f, laeuft: m.aktualisiert) { Task { await m.laden(nachladen: true) } }
                }
                if m.laedt && m.stand == nil {
                    ProgressView().tint(Farbe.muted).frame(maxWidth: .infinity).padding(.top, 40)
                } else if let s = m.stand {
                    Section {
                        inhalt(s)
                    } header: {
                        // Klebt beim Scrollen oben wie in Plaetze und Verein (U74).
                        KontoSegmente(
                            beschriftung: "Plätze und Serien",
                            optionen: VerwaltungAnsicht.allCases.map { ($0, $0.label) },
                            gewaehlt: m.ansicht
                        ) { m.ansicht = $0 }
                        .padding(.vertical, Tokens.Abstand.s)
                        .background(Farbe.bg)
                    }
                }
            }
            .padding(.horizontal, Tokens.Abstand.rand)
            .padding(.bottom, Tokens.Abstand.abschnitt * 2)
        }
        .background(Farbe.bg)
        // Was nach oben scrollt, laeuft nicht unter die Uhr der Statusleiste.
        .overlay(alignment: .top) { Farbe.bg.frame(height: 0).ignoresSafeArea(edges: .top) }
        .refreshable { await m.laden(nachladen: true) }
        .sheet(item: Binding(get: { m.blatt }, set: { m.blatt = $0 })) { b in
            VerwaltungBlattInhalt(modell: m, blatt: b)
        }
        .task {
            async let name: Void = m.ladeName()
            await m.laden()
            await name
            #if DEBUG
            // Fuer Bildschirmfotos per simctl (README): `-TCMVerwaltung serien|sperren|serie-anlegen`.
            let argumente = ProcessInfo.processInfo.arguments
            if let i = argumente.firstIndex(of: "-TCMVerwaltung"), i + 1 < argumente.count {
                switch argumente[i + 1] {
                case "serien": m.ansicht = .serien
                case "sperren": m.blatt = .sperren
                case "serie-anlegen":
                    m.ansicht = .serien
                    m.blatt = .serieAnlegen
                default: break
                }
            }
            #endif
        }
        .onChange(of: phase) { _, neu in
            if neu == .active { Task { await m.laden() } }
        }
    }

    @ViewBuilder private func inhalt(_ s: VerwaltungsStand) -> some View {
        let m = modell
        let serien = m.ansicht == .serien
        GelberKnopf(text: serien ? "+ Serie anlegen" : "+ Plätze sperren") {
            m.blatt = serien ? .serieAnlegen : .sperren
        }
        if let e = m.meldung {
            KontoHinweis(text: e.meldung, ok: e.ok)
        }
        if serien {
            VerwaltungGruppenkopf(titel: "Laufend", neben: "\(s.serien.count) Serien")
            SerienListe(serien: s.serien) { m.blatt = .serie($0) }
        } else {
            VerwaltungGruppenkopf(titel: "Jetzt")
            PlatzListe(plaetze: s.plaetze, zustand: s.zustand)
        }
        if let admin = zugang.admin {
            WebHinweis(admin: admin)
        }
    }
}

// MARK: - Listen

/// Gruppenkopf ueber einer Liste, rechts optional eine Zahl (Gruppenkopf in Liste.tsx).
struct VerwaltungGruppenkopf: View {
    let titel: String
    var neben: String?

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(titel)
                .font(Schrift.text(.fett, Tokens.Schrift.titel, relativeTo: .title2))
                .tracking(-0.2)
                .foregroundStyle(Farbe.ink)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: Tokens.Abstand.s)
            if let neben {
                Text(neben).leise()
            }
        }
        .padding(.top, Tokens.Abstand.s)
    }
}

/// Die Plaetze mit dem, was jetzt auf ihnen liegt; nur eine Sperrung ist tippbar.
private struct PlatzListe: View {
    @Environment(\.zuTab) private var zuTab
    let plaetze: [VerwalteterPlatz]
    let zustand: [String: PlatzJetzt]

    var body: some View {
        KontoGruppe {
            ForEach(Array(plaetze.enumerated()), id: \.element.id) { i, p in
                if i > 0 { KontoLinie() }
                let jetzt = p.aktiv ? zustand[p.id] : nil
                let hinweis = VerwaltungLogik.platzHinweis(aktiv: p.aktiv, jetzt: jetzt)
                let zeile = VerwaltungZeile(
                    symbol: p.shortName ?? "",
                    titel: p.name ?? "",
                    kontext: p.subline,
                    hinweis: hinweis.text,
                    ton: hinweis.ton,
                    pfeil: VerwaltungLogik.fuehrtZuPlaetzen(jetzt)
                )
                if VerwaltungLogik.fuehrtZuPlaetzen(jetzt) {
                    // Bearbeitet und aufgehoben wird eine Sperrung im Platzplan.
                    Button { zuTab(.plaetze) } label: { zeile }
                        .buttonStyle(ZeilenDruck())
                        .accessibilityHint("Öffnet den Platzplan")
                } else {
                    zeile.accessibilityElement(children: .combine)
                }
            }
        }
    }
}

/// Die angelegten Serien; ein Tippen oeffnet das Blatt zum Aendern.
private struct SerienListe: View {
    let serien: [Serie]
    let oeffnen: (Serie) -> Void

    var body: some View {
        KontoGruppe {
            if serien.isEmpty {
                Text("Noch keine Serien angelegt.")
                    .leise()
                    .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
                    .padding(.horizontal, 16)
            }
            ForEach(Array(serien.enumerated()), id: \.element.id) { i, s in
                if i > 0 { KontoLinie() }
                Button { oeffnen(s) } label: {
                    VerwaltungZeile(
                        symbol: VerwaltungLogik.kurzeWochentage[(s.weekday ?? 0) % 7],
                        symbolGold: true,
                        titel: s.title ?? "",
                        zeit: VerwaltungLogik.serienZeit(weekday: s.weekday, start: s.startTime, ende: s.endTime),
                        kontext: VerwaltungLogik.serienKontext(typ: s.typeName, platz: s.courtName, bis: s.validTo),
                        hinweis: "\(s.kuenftige ?? 0) offen",
                        ton: .leise,
                        pfeil: true
                    )
                }
                .buttonStyle(ZeilenDruck())
            }
        }
    }
}

/// Eine Zeile der Verwaltung (Listenzeile in Liste.tsx): Kachel, Titel, Kontext, Hinweis rechts.
struct VerwaltungZeile: View {
    let symbol: String
    var symbolGold = false
    let titel: String
    var zeit: String?
    var kontext: String?
    var hinweis: String?
    var ton: HinweisTon = .leise
    var pfeil = false

    var body: some View {
        HStack(spacing: 12) {
            Text(symbol)
                .font(Schrift.display(.extrafett, symbolGold ? 14 : 15))
                .foregroundStyle(symbolGold ? Farbe.goldInk : Farbe.ink)
                .dynamicTypeSize(...DynamicTypeSize.xLarge)
                .frame(width: 40, height: 40)
                .background(Farbe.surf2, in: RoundedRectangle(cornerRadius: 12))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 1) {
                Text(titel)
                    .font(Schrift.text(.fett, 16))
                    .foregroundStyle(Farbe.ink)
                    .lineLimit(1)
                if let zeit {
                    Text(zeit)
                        .font(Schrift.text(.halbfett, 13))
                        .monospacedDigit()
                        .foregroundStyle(Farbe.ink2)
                }
                if let kontext, !kontext.isEmpty {
                    Text(kontext)
                        .font(Schrift.text(.normal, 13))
                        .foregroundStyle(Farbe.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if let hinweis {
                Text(hinweis)
                    .font(Schrift.text(ton == .leise ? .halbfett : .fett, 13))
                    .foregroundStyle(farbe)
                    .multilineTextAlignment(.trailing)
            }
            if pfeil { Pfeil() }
        }
        .padding(.vertical, 10)
        .padding(.leading, 16)
        .padding(.trailing, 14)
        .frame(minHeight: 64)
        .contentShape(Rectangle())
    }

    private var farbe: Color {
        switch ton {
        case .leise: Farbe.muted
        case .rot: Farbe.redInk
        case .gold: Farbe.goldInk
        case .gruen: Farbe.greenInk
        }
    }
}

// MARK: - Web

/**
 * Mitglieder, Kasse, Getraenke und die Plaetze selbst gibt es nur im Web.
 * Ohne Webadresse (lokal) steht nur der Satz da.
 */
private struct WebHinweis: View {
    @Environment(Sitzung.self) private var sitzung
    @Environment(\.openURL) private var oeffnen
    let admin: Bool

    var body: some View {
        let link = sitzung.umgebung.webLink(VerwaltungLogik.webPfad(admin: admin))
        if let link {
            Button { oeffnen(link) } label: { karte(link: true) }
                .buttonStyle(.plain)
                .accessibilityAddTraits(.isLink)
                .accessibilityHint("Öffnet die Verwaltung im Browser")
                .padding(.top, Tokens.Abstand.s)
        } else {
            karte(link: false)
                .accessibilityElement(children: .combine)
                .padding(.top, Tokens.Abstand.s)
        }
    }

    private func karte(link: Bool) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(VerwaltungLogik.webTitel(admin: admin))
                .font(Schrift.text(.fett, 15))
                .foregroundStyle(Farbe.ink)
            Text(VerwaltungLogik.webText(admin: admin))
                .font(Schrift.text(.normal, 14))
                .foregroundStyle(Farbe.ink2)
                .lineSpacing(2)
                .fixedSize(horizontal: false, vertical: true)
            if link {
                Text("Im Browser öffnen ›")
                    .font(Schrift.text(.fett, 14.5))
                    .foregroundStyle(Farbe.blueInk)
                    .padding(.top, 4)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .karte(padding: 16)
    }
}
