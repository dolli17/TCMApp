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

/// Grosser Kopf, darunter (in der Belegung) die Tagesleiste, dann der Umschalter - oben in beiden Sichten.
struct PlaetzeKopf<Tage: View>: View {
    @Environment(PlaetzeZustand.self) private var zustand
    /// "8 Plätze · 08 bis 21 Uhr"
    var unterzeile: String?
    @ViewBuilder var tage: Tage

    var body: some View {
        GrosserKopf(titel: "Plätze", unterzeile: unterzeile)
        tage
        SegmentLeiste(
            beschriftung: "Ansicht",
            optionen: PlaetzeSicht.allCases.map { ($0, $0.label) },
            gewaehlt: zustand.sicht
        ) { zustand.wechsle(zu: $0) }
        .padding(.bottom, Tokens.Abstand.xs)
    }
}

private struct PlaetzeInhalt: View {
    @Environment(\.scenePhase) private var phase
    @State var modell: PlaetzeModell

    var body: some View {
        let m = modell
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Tokens.Abstand.m) {
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
                        PlatzRaster(modell: m)
                    }
                }
                .padding(.horizontal, Tokens.Abstand.rand)
                .padding(.bottom, Tokens.Abstand.abschnitt * 2)
            }
            .background(Farbe.bg)
            // Was nach oben scrollt, laeuft nicht unter die Uhr der Statusleiste.
            .overlay(alignment: .top) { Farbe.bg.frame(height: 0).ignoresSafeArea(edges: .top) }
            .refreshable { await m.vonHand() }
            .toolbar(.hidden, for: .navigationBar)
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
        .task(id: m.datum) { await m.laden() }
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
                HStack(spacing: 8) {
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

/// Eine Datumspille "MO / 16"; der gewaehlte Tag in Vereinsblau - auch beim Umsetzen.
struct TagKachel: View {
    let tag: String
    var heute: String?
    let aktiv: Bool
    let aktion: () -> Void

    var body: some View {
        let k = PlaetzeLogik.kachel(tag, heute: heute)
        Button(action: aktion) {
            VStack(spacing: 2) {
                Text(k.wochentag)
                    .font(Schrift.display(.fett, 11))
                    .tracking(0.6)
                    .foregroundStyle(aktiv ? Farbe.onBrand.opacity(0.9) : Farbe.muted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Text("\(k.tag)")
                    .font(Schrift.display(.fett, 20))
                    .monospacedDigit()
                    .foregroundStyle(aktiv ? Farbe.onBrand : Farbe.ink)
            }
            .dynamicTypeSize(...DynamicTypeSize.xLarge)
            .frame(width: 54, height: 64)
            .background(aktiv ? Farbe.blue : Farbe.surf, in: Capsule())
            .overlay(Capsule().strokeBorder(aktiv ? Color.clear : Farbe.line2, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(PlaetzeLogik.lesbar(tag))
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
