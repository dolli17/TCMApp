/**
 * Plaetze - der Belegungsplan (apps/mobile/app/(tabs)/plaetze/index.tsx)
 *
 * Eine einzige Uebersicht (docs/design/stitch, "Plaetze (Belegungsplan
 * Final)"): oben die Tagesleiste, dann der Umschalter, darunter das Raster - Plaetze als Spalten,
 * Uhrzeiten als Zeilen -, in dem eine freie Flaeche Platz und Beginn
 * auswaehlt; gebucht wird ueber die Leiste unten.
 *
 * Ob gebucht werden kann, entscheidet canStartAt (Kern); durchgesetzt wird
 * es ausschliesslich in create_booking. Der Plan haelt sich ueber Realtime
 * aktuell und laedt beim Zurueckkehren in den Vordergrund nach.
 *
 * Oben unter dem Titel der Umschalter Belegung | Meine & offene Spiele
 * (Bereichsreiter.tsx). Die Sicht liegt im PlaetzeZustand, den HauptTabs
 * haelt - so fuehren Home, Push und Widgets ueber `zuPlaetze` gezielt hin.
 */

import SwiftUI

@MainActor @Observable
final class PlaetzeZustand {
    var sicht: PlaetzeSicht = .belegung
    /// Die offenen Spiele oben (U75) - wer ueber "Mitspielen" kommt, sucht sie.
    var offeneZuerst = false

    func oeffne(_ ziel: PlaetzeZiel) {
        switch ziel {
        case .belegung:
            sicht = .belegung
        case let .spiele(offen):
            offeneZuerst = offen
            sicht = .spiele
        }
    }

    /// Per Umschalter: die Spiele wieder in der gewohnten Reihenfolge.
    func wechsle(zu neu: PlaetzeSicht) {
        if neu == .spiele { offeneZuerst = false }
        sicht = neu
    }
}

extension View {
    /// Haengt die Plaetze an die Tabs (HauptTabs): stellt den Zustand und `zuPlaetze` bereit.
    func plaetzeTab(_ zustand: PlaetzeZustand, tab: Binding<HauptTab>) -> some View {
        environment(zustand)
            .environment(\.zuPlaetze) { ziel in
                zustand.oeffne(ziel)
                tab.wrappedValue = .plaetze
            }
    }
}

struct PlaetzeBildschirm: View {
    @Environment(Sitzung.self) private var sitzung
    @Environment(PlaetzeZustand.self) private var zustand

    var body: some View {
        switch zustand.sicht {
        case .belegung: PlaetzeInhalt(modell: PlaetzeModell(client: sitzung.client))
        case .spiele: SpieleBildschirm()
        }
    }
}

/// Unter dem grossen Titel (Navigationsleiste): in der Belegung die Wochenleiste, dann der Umschalter - oben in beiden Sichten.
struct PlaetzeKopf<Tage: View>: View {
    @Environment(PlaetzeZustand.self) private var zustand
    /// "8 Plätze · 08 bis 21 Uhr" - steht als Unterzeile unter dem Titel.
    var unterzeile: String?
    @ViewBuilder var tage: Tage

    var body: some View {
        Picker("Ansicht", selection: Binding(get: { zustand.sicht }, set: { zustand.wechsle(zu: $0) })) {
            ForEach(PlaetzeSicht.allCases, id: \.self) { Text($0.label).tag($0) }
        }
        .pickerStyle(.segmented)
        tage
    }
}

extension View {
    /// Titel "Plätze" gross in der Navigationsleiste, wie in beiden Sichten.
    func plaetzeTitel(_ unterzeile: String? = nil) -> some View {
        navigationTitle("Plätze")
            .navigationBarTitleDisplayMode(.large)
            .titelUnterzeile(unterzeile)
    }
}

private struct PlaetzeInhalt: View {
    @Environment(\.scenePhase) private var phase
    @State var modell: PlaetzeModell
    /// Breite des Rasters, gemessen - Kopf und Raster rechnen damit dieselben Spalten.
    @State private var breite: CGFloat = 0
    /// Fuer welchen Tag schon zur Uhrzeit gerollt wurde
    @State private var gerolltFuer: String?

    var body: some View {
        let m = modell
        NavigationStack {
            ScrollViewReader { leser in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: Tokens.Abstand.m, pinnedViews: [.sectionHeaders]) {
                    PlaetzeKopf(
                        unterzeile: PlaetzeLogik.kopfzeile(plaetze: m.plaetze.count, oeffnung: m.oeffnung, schluss: m.schluss)
                    ) { Tagesleiste(modell: m) }
                    if let f = m.ladeFehler {
                        Fehlerzeile(text: f, laeuft: m.aktualisiert) { Task { await m.vonHand() } }
                    }
                    if m.laedt && m.geladenFuer != m.datum {
                        ProgressView().tint(Farbe.muted).frame(maxWidth: .infinity).padding(.top, 40)
                    } else if m.geladenFuer != nil {
                        if let text = PlaetzeLogik.kontingentText(m.kontingent) {
                            Text(text).leise().fixedSize(horizontal: false, vertical: true)
                        }
                        RasterLegende()
                        Section {
                            PlatzRaster(modell: m, breite: breite)
                                .padding(.top, PlatzRaster.kopfFest(breite: breite, anzahl: m.plaetze.count) ? -Tokens.Abstand.m : 0)
                        } header: {
                            if PlatzRaster.kopfFest(breite: breite, anzahl: m.plaetze.count) {
                                PlatzRasterKopf(modell: m, breite: breite)
                            }
                        }
                    }
                }
                .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { breite = $0 }
                .padding(.horizontal, Tokens.Abstand.rand)
                .padding(.bottom, Tokens.Abstand.abschnitt * 2)
            }
            // Heute beim ersten Laden zur Uhrzeit rollen statt vergangene Stunden zu zeigen.
            .task(id: m.geladenFuer) {
                guard let tag = m.geladenFuer, tag != gerolltFuer, tag == Zeit.berlinDay(Date()) else { return }
                // Erst wenn das Raster steht, gibt es die Sprungmarke.
                try? await Task.sleep(for: .milliseconds(400))
                guard !Task.isCancelled else { return }
                gerolltFuer = tag
                withAnimation(.snappy) { leser.scrollTo(PlatzRaster.jetztMarke, anchor: .top) }
            }
            }
            .background(GruppenGrund())
            .refreshable { await m.vonHand() }
            .plaetzeTitel(PlaetzeLogik.kopfzeile(plaetze: m.plaetze.count, oeffnung: m.oeffnung, schluss: m.schluss))
            .safeAreaInset(edge: .bottom) {
                VStack(spacing: 8) {
                    if let t = m.meldung { Toast(meldung: t) { m.meldung = nil } }
                    if let a = m.auswahl, let p = m.platz(a.courtId), m.fenster == nil {
                        BuchenLeiste(platz: p, auswahl: a, dauer: m.dauer) { m.buchenAuf(p, minute: a.minute) }
                    }
                }
                .padding(.horizontal, Tokens.Abstand.m)
                .padding(.bottom, 8)
                .animation(.snappy, value: m.meldung)
            }
        }
        .sheet(item: Binding(get: { m.fenster }, set: { if $0 == nil { m.schliesseFenster() } })) { f in
            Buchungsblatt(modell: m, fenster: f)
        }
        // Erstes Laden und jeder Tageswechsel; der Kanal plan-<datum> wird je Tag neu aufgebaut.
        .task(id: m.datum) {
            await m.laden()
            #if DEBUG
            // Fuer Bildschirmfotos per simctl: `-TCMBuchen 17:00` oeffnet das Buchungsblatt auf dem zweiten Platz.
            let argumente = ProcessInfo.processInfo.arguments
            if let i = argumente.firstIndex(of: "-TCMBuchen"), i + 1 < argumente.count, m.fenster == nil,
               let p = m.plaetze.dropFirst().first ?? m.plaetze.first {
                let t = argumente[i + 1].split(separator: ":").compactMap { Int($0) }
                if t.count == 2 { m.buchenAuf(p, minute: t[0] * 60 + t[1]) }
            }
            // `-TCMBuchung eigen|fremd` oeffnet die eigene bzw. eine fremde Buchung des Tages.
            if let i = argumente.firstIndex(of: "-TCMBuchung"), i + 1 < argumente.count, m.fenster == nil,
               let b = m.belegung.first(where: {
                   argumente[i + 1] == "sperre" ? $0.kind == "blocking"
                       : $0.kind == "booking" && ($0.isOwn == true) == (argumente[i + 1] == "eigen")
                       && (argumente[i + 1] != "fremd" || (Zeit.datum($0.endsAt) ?? .distantPast) > Date())
               }) {
                m.oeffne(b)
            }
            #endif
        }
        .task(id: m.datum) { await m.beobachte(tag: m.datum) }
        // Was waehrend des Schlafs passiert ist, hat der Kanal nicht gesehen.
        .onChange(of: phase) { _, neu in
            if neu == .active { Task { await m.laden(still: true) } }
        }
        // Die Hervorhebung nach einer Aktion bleibt fuenf Sekunden.
        .task(id: m.markiert) {
            guard m.markiert != nil else { return }
            try? await Task.sleep(for: .seconds(5))
            if !Task.isCancelled { m.markiert = nil }
        }
        .task(id: m.meldung) {
            guard m.meldung != nil else { return }
            try? await Task.sleep(for: .seconds(4))
            if !Task.isCancelled { m.meldung = nil }
        }
    }
}

// MARK: - Tagesleiste

/// Die buchbaren Tage als Pillen - nur so viele, wie lead_days erlaubt. Der gewaehlte Tag ist blau.
private struct Tagesleiste: View {
    let modell: PlaetzeModell

    var body: some View {
        let m = modell
        ScrollViewReader { leser in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 4) {
                    ForEach(m.tage, id: \.self) { t in
                        TagKachel(tag: t, heute: m.heute, aktiv: t == m.datum) { m.waehleTag(t) }
                            .id(t)
                    }
                }
                .padding(.horizontal, Tokens.Abstand.rand)
                .padding(.vertical, 2)
            }
            .padding(.horizontal, -Tokens.Abstand.rand)
            .onChange(of: m.datum) { _, neu in withAnimation(.snappy) { leser.scrollTo(neu, anchor: .center) } }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Tag wählen")
    }
}

/// Ein Tag wie in der Kalender-App: oben der Wochentag, darunter die Zahl im Kreis. Gewaehlt blau gefuellt, heute blaue Zahl.
struct TagKachel: View {
    let tag: String
    var heute: String?
    let aktiv: Bool
    let aktion: () -> Void

    var body: some View {
        let k = PlaetzeLogik.kachel(tag)
        let istHeute = tag == heute
        Button(action: aktion) {
            VStack(spacing: 6) {
                Text(k.wochentag)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(istHeute ? Farbe.blueInk : Farbe.muted)
                    .lineLimit(1)
                Text("\(k.tag)")
                    .font(.title3.weight(aktiv || istHeute ? .semibold : .regular))
                    .monospacedDigit()
                    .foregroundStyle(aktiv ? Farbe.onBrand : istHeute ? Farbe.blueInk : Farbe.ink)
                    .frame(width: 38, height: 38)
                    .background(aktiv ? Farbe.blue : Color.clear, in: Circle())
            }
            .dynamicTypeSize(...DynamicTypeSize.xLarge)
            .frame(minWidth: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(PlaetzeLogik.lesbar(tag) + (istHeute ? ", heute" : ""))
        .accessibilityAddTraits(aktiv ? [.isSelected] : [])
    }
}

// MARK: - Leiste und Toast

/// Unten ueber dem Inhalt: Platz und Zeit der Auswahl, daneben "Buchen".
private struct BuchenLeiste: View {
    let platz: AktiverPlatz
    let auswahl: Auswahl
    let dauer: Int
    let aktion: () -> Void

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("\(platz.name ?? "") · \(Zeit.minutesToTime(auswahl.minute)) – \(Zeit.minutesToTime(auswahl.minute + dauer))")
                    .font(Schrift.display(.fett, 15.5))
                    .monospacedDigit()
                    .foregroundStyle(Farbe.ink)
                Text("frei bis \(Zeit.minutesToTime(auswahl.bis))")
                    .font(Schrift.text(.normal, Tokens.Schrift.klein))
                    .foregroundStyle(Farbe.muted)
            }
            .lineLimit(1)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
            // Die eine Hauptaktion des Screens
            Knopf("Buchen", stufe: .haupt, aktion: aktion)
                .accessibilityLabel("\(platz.name ?? "") um \(Zeit.minutesToTime(auswahl.minute)) Uhr buchen")
        }
        .padding(.leading, 22)
        .padding(.trailing, 8)
        .frame(minHeight: 68)
        .background(Farbe.surf, in: Capsule())
        .overlay(Capsule().strokeBorder(Farbe.line2, lineWidth: 1))
        .shadow(color: .black.opacity(0.14), radius: 12, y: 8)
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }
}

/// Rueckmeldung nach einer Aktion, unten ueber der Leiste (Toast.tsx).
struct Toast: View {
    let meldung: ToastMeldung
    let schliessen: () -> Void

    var body: some View {
        Button(action: schliessen) {
            HStack(spacing: 10) {
                Image(systemName: meldung.ok ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
                    .foregroundStyle(meldung.ok ? Farbe.green : Farbe.red)
                Text(meldung.text)
                    .font(Schrift.text(.halbfett, 15))
                    .foregroundStyle(Farbe.bg)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(Farbe.ink, in: RoundedRectangle(cornerRadius: 22))
            .shadow(color: .black.opacity(0.25), radius: 8, y: 6)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(meldung.text)
        .accessibilityHint("Schließt die Meldung")
        .transition(.move(edge: .bottom).combined(with: .opacity))
        .onAppear { UIAccessibility.post(notification: .announcement, argument: meldung.text) }
    }
}

extension PlaetzeKopf where Tage == EmptyView {
    init(unterzeile: String? = nil) {
        self.init(unterzeile: unterzeile) { EmptyView() }
    }
}
