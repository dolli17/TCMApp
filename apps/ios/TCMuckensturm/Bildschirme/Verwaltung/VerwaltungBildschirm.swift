/**
 * Verwaltung: Plaetze & Serien (apps/mobile/app/(tabs)/verwaltung/)
 *
 * Verwaltet wird am PC (Web unter /admin). Am Handy bleibt, was kurzfristig
 * an den Plaetzen passiert: Plaetze sperren und Serien pflegen. Zwei
 * Segmente; der Knopf oben rechts in der Leiste passt zum Segment (Plaetze
 * sperren / Serie anlegen). Die Plaetze stehen nur zum Lesen da, mit dem, was gerade auf
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
    /// Das Segment beim Oeffnen (Tests und Bildschirmfotos).
    var start: VerwaltungAnsicht = .plaetze

    var body: some View {
        NavigationStack {
            VerwaltungInhalt(modell: {
                let m = VerwaltungModell(client: sitzung.client)
                m.ansicht = start
                return m
            }())
        }
    }
}

private struct VerwaltungInhalt: View {
    @Environment(VerwaltungZugang.self) private var zugang
    @Environment(\.scenePhase) private var phase
    @State var modell: VerwaltungModell

    var body: some View {
        let m = modell
        let serien = m.ansicht == .serien
        List {
            Section {
                Picker("Plätze und Serien", selection: Binding(get: { m.ansicht }, set: { m.ansicht = $0 })) {
                    ForEach(VerwaltungAnsicht.allCases, id: \.self) { Text($0.label).tag($0) }
                }
                .pickerStyle(.segmented)
            }
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)
            if let f = m.fehler {
                Section {
                    FehlerZeile(text: f, erneut: Erneut(laeuft: m.aktualisiert) { Task { await m.laden(nachladen: true) } })
                        .gruppenZeile()
                }
            }
            if m.laedt && m.stand == nil {
                Section { ProgressView().tint(Farbe.muted).frame(maxWidth: .infinity).padding(.vertical, 24) }
                    .listRowBackground(Color.clear)
            } else if let s = m.stand {
                if let e = m.meldung {
                    Section {
                        Label(e.meldung, systemImage: e.ok ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                            .foregroundStyle(e.ok ? Farbe.greenInk : Farbe.redInk)
                            .gruppenZeile()
                    }
                }
                if serien {
                    SerienListe(serien: s.serien) { m.blatt = .serie($0) }
                } else {
                    PlatzListe(plaetze: s.plaetze, zustand: s.zustand)
                }
                if let admin = zugang.admin {
                    WebHinweis(admin: admin)
                }
            }
        }
        .gruppenListe()
        .listSectionSpacing(20)
        .navigationTitle("Verwaltung")
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            if m.stand != nil {
                ToolbarItem(placement: .primaryAction) {
                    Button { m.blatt = serien ? .serieAnlegen : .sperren } label: {
                        Image(systemName: serien ? "plus" : "lock")
                    }
                    .accessibilityLabel(serien ? "Serie anlegen" : "Plätze sperren")
                }
            }
        }
        .refreshable { await m.laden(nachladen: true) }
        .sensoryFeedback(trigger: m.meldung?.meldung) { _, neu in neu == nil ? nil : .success }
        .sheet(item: Binding(get: { m.blatt }, set: { m.blatt = $0 })) { b in
            VerwaltungBlattInhalt(modell: m, blatt: b)
        }
        .task {
            async let name: Void = m.ladeName()
            await m.laden()
            await name
            #if DEBUG
            // Fuer Bildschirmfotos per simctl (README): `-TCMVerwaltung serien|sperren|serie-anlegen|serie`.
            let argumente = ProcessInfo.processInfo.arguments
            if let i = argumente.firstIndex(of: "-TCMVerwaltung"), i + 1 < argumente.count {
                switch argumente[i + 1] {
                case "serien": m.ansicht = .serien
                case "sperren": m.blatt = .sperren
                case "serie-anlegen":
                    m.ansicht = .serien
                    m.blatt = .serieAnlegen
                case "serie":
                    m.ansicht = .serien
                    if let s = m.stand?.serien.first { m.blatt = .serie(s) }
                default: break
                }
            }
            #endif
        }
        .onChange(of: phase) { _, neu in
            if neu == .active { Task { await m.laden() } }
        }
    }
}

// MARK: - Listen

/// Die Plaetze mit dem, was jetzt auf ihnen liegt; nur eine Sperrung ist tippbar.
private struct PlatzListe: View {
    @Environment(\.zuTab) private var zuTab
    let plaetze: [VerwalteterPlatz]
    let zustand: [String: PlatzJetzt]

    var body: some View {
        Section {
            ForEach(plaetze) { p in
                let jetzt = p.aktiv ? zustand[p.id] : nil
                let hinweis = VerwaltungLogik.platzHinweis(aktiv: p.aktiv, jetzt: jetzt)
                let fuehrt = VerwaltungLogik.fuehrtZuPlaetzen(jetzt)
                let zeile = VerwaltungZeile(
                    symbol: .platz(p.shortName ?? p.name ?? "", gesperrt: hinweis.ton == .rot, aktiv: p.aktiv),
                    titel: p.name ?? "",
                    kontext: p.subline,
                    hinweis: hinweis.text,
                    ton: hinweis.ton,
                    pfeil: fuehrt
                )
                Group {
                    if fuehrt {
                        // Bearbeitet und aufgehoben wird eine Sperrung im Platzplan.
                        Button { zuTab(.plaetze) } label: { zeile }
                            .buttonStyle(.plain)
                            .accessibilityHint("Öffnet den Platzplan")
                    } else {
                        zeile.accessibilityElement(children: .combine)
                    }
                }
                .gruppenZeile()
            }
        } header: {
            GruppenKopf(titel: "Jetzt", zusatz: "\(plaetze.filter(\.aktiv).count) Plätze aktiv")
        }
    }
}

/// Die angelegten Serien; ein Tippen oeffnet das Blatt zum Aendern.
private struct SerienListe: View {
    let serien: [Serie]
    let oeffnen: (Serie) -> Void

    var body: some View {
        Section {
            if serien.isEmpty {
                Text("Noch keine Serien angelegt.").foregroundStyle(Farbe.muted).gruppenZeile()
            }
            ForEach(serien) { s in
                Button { oeffnen(s) } label: {
                    VerwaltungZeile(
                        symbol: .tag(VerwaltungLogik.kurzeWochentage[(s.weekday ?? 0) % 7]),
                        titel: s.title ?? "",
                        zeit: VerwaltungLogik.serienZeit(weekday: s.weekday, start: s.startTime, ende: s.endTime),
                        kontext: VerwaltungLogik.serienKontext(typ: s.typeName, platz: s.courtName, bis: s.validTo),
                        hinweis: "\(s.kuenftige ?? 0) offen",
                        ton: .leise,
                        pfeil: true
                    )
                }
                .buttonStyle(.plain)
                .gruppenZeile()
            }
        } header: {
            GruppenKopf(titel: "Laufend", zusatz: "\(serien.count) Serien")
        }
    }
}

/// Eine Zeile der Verwaltung: Kachel, Titel, Kontext, rechts der Stand.
struct VerwaltungZeile: View {
    enum Kachel {
        /// Platz-Kuerzel; rot, wenn gerade gesperrt
        case platz(String, gesperrt: Bool, aktiv: Bool)
        /// Wochentag einer Serie
        case tag(String)
    }

    let symbol: Kachel
    let titel: String
    var zeit: String?
    var kontext: String?
    var hinweis: String?
    var ton: HinweisTon = .leise
    var pfeil = false

    var body: some View {
        HStack(spacing: 12) {
            kachel
            VStack(alignment: .leading, spacing: 1) {
                Text(titel).foregroundStyle(Farbe.ink).lineLimit(1)
                if let zeit {
                    Text(zeit).font(.subheadline.weight(.medium)).monospacedDigit().foregroundStyle(Farbe.ink2)
                }
                if let kontext, !kontext.isEmpty {
                    Text(kontext).font(.footnote).foregroundStyle(Farbe.muted).fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if let hinweis {
                Text(hinweis)
                    .font(.subheadline)
                    .foregroundStyle(farbe)
                    .multilineTextAlignment(.trailing)
            }
            if pfeil { ZeilenPfeil() }
        }
        .padding(.vertical, 2)
        .contentShape(Rectangle())
    }

    @ViewBuilder private var kachel: some View {
        switch symbol {
        case let .platz(kurz, gesperrt, aktiv):
            Text(VerwaltungLogik.platzChip(kurz))
                .font(.subheadline.weight(.bold))
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .foregroundStyle(.white)
                .frame(width: 29, height: 29)
                .background(gesperrt ? Farbe.red : aktiv ? Farbe.blue : Farbe.muted, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
                .dynamicTypeSize(...DynamicTypeSize.xLarge)
                .accessibilityHidden(true)
        case let .tag(kurz):
            Text(kurz)
                .font(.caption.weight(.bold))
                .foregroundStyle(Farbe.blueInk)
                .frame(width: 36, height: 36)
                .background(Farbe.blueSoft, in: Circle())
                .dynamicTypeSize(...DynamicTypeSize.xLarge)
                .accessibilityHidden(true)
        }
    }

    private var farbe: Color {
        switch ton {
        case .leise: Farbe.muted
        case .rot: Farbe.redInk
        // "gold" im Kern meint einen Stand, kein "deins": blau.
        case .gold: Farbe.blueInk
        // "frei" ist der Normalfall und bleibt grau.
        case .gruen: Farbe.muted
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
        Section {
            if let link {
                Button { oeffnen(link) } label: {
                    HStack(spacing: 12) {
                        IconKachel(symbol: "safari.fill")
                        Text(VerwaltungLogik.webTitel(admin: admin)).foregroundStyle(Farbe.ink)
                        Spacer()
                        Image(systemName: "arrow.up.right").font(.footnote.weight(.semibold)).foregroundStyle(Farbe.muted)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(.isLink)
                .accessibilityHint("Öffnet die Verwaltung im Browser")
                .gruppenZeile()
            } else {
                Label(VerwaltungLogik.webTitel(admin: admin), systemImage: "desktopcomputer")
                    .foregroundStyle(Farbe.ink)
                    .gruppenZeile()
            }
        } footer: {
            Text(VerwaltungLogik.webText(admin: admin)).foregroundStyle(Farbe.muted)
        }
    }
}
