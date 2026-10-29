/**
 * Plaetze - der Belegungsplan (apps/mobile/app/(tabs)/plaetze/index.tsx)
 *
 * Zwei Ansichten derselben Tagesbelegung, umschaltbar ueber den kleinen
 * Schalter rechts in der Datumszeile; die Wahl bleibt gemerkt. Die Uebersicht
 * ist ein Raster - Plaetze als Zeilen, Stunden zum Wischen -, in dem eine
 * freie Flaeche Platz und Beginn auswaehlt; gebucht wird ueber die Leiste
 * unten. Freie Zeiten listet die Startzeiten mit den freien Plaetzen.
 *
 * Ob gebucht werden kann, entscheidet canStartAt (Kern); durchgesetzt wird
 * es ausschliesslich in create_booking. Der Plan haelt sich ueber Realtime
 * aktuell und laedt beim Zurueckkehren in den Vordergrund nach.
 */

import SwiftUI

struct PlaetzeBildschirm: View {
    @Environment(Sitzung.self) private var sitzung

    var body: some View {
        PlaetzeInhalt(modell: PlaetzeModell(client: sitzung.client))
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
                    GrosserKopf(titel: "Plätze", name: m.meinName)
                    Datumszeile(modell: m)
                    if m.tagwahlOffen { Tagwahl(modell: m) }
                    if let f = m.ladeFehler {
                        Fehlerzeile(text: f, laeuft: m.aktualisiert) { Task { await m.vonHand() } }
                    }
                    if m.laedt && m.geladenFuer != m.datum {
                        ProgressView().tint(Farbe.muted).frame(maxWidth: .infinity).padding(.top, 40)
                    } else if m.geladenFuer != nil {
                        if let text = PlaetzeLogik.kontingentText(m.kontingent) {
                            Text(text).leise().fixedSize(horizontal: false, vertical: true)
                        }
                        switch m.ansicht {
                        case .uebersicht:
                            PlatzRaster(modell: m)
                            RasterLegende()
                        case .freieZeiten:
                            FreieZeiten(modell: m)
                            FreieZeitenLegende()
                        }
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
                    if m.ansicht == .uebersicht, let a = m.auswahl, let p = m.platz(a.courtId), m.fenster == nil {
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

// MARK: - Datumszeile

private struct Datumszeile: View {
    let modell: PlaetzeModell

    var body: some View {
        let m = modell
        let tage = m.tage
        let i = tage.firstIndex(of: m.datum) ?? -1
        HStack(spacing: 8) {
            Rundknopf(symbol: "chevron.left", beschriftung: "Vortag", aus: i <= 0) { m.waehleTag(tage[i - 1]) }
            Button { withAnimation(.snappy) { m.tagwahlOffen.toggle() } } label: {
                HStack(spacing: 6) {
                    Text(PlaetzeLogik.tageszeile(m.datum, heute: m.heute))
                        .font(Schrift.text(.fett, 17))
                        .foregroundStyle(Farbe.ink)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                    Image(systemName: "chevron.down")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(Farbe.muted)
                        .rotationEffect(.degrees(m.tagwahlOffen ? 180 : 0))
                }
                .frame(maxWidth: .infinity, minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(PlaetzeLogik.lesbar(m.datum)), Tag wählen")
            .accessibilityValue(m.tagwahlOffen ? "aufgeklappt" : "zugeklappt")
            Rundknopf(symbol: "chevron.right", beschriftung: "Folgetag", aus: i < 0 || i >= tage.count - 1) {
                m.waehleTag(tage[i + 1])
            }
            AnsichtSchalter(wert: m.ansicht) { m.waehleAnsicht($0) }
        }
    }
}

/// Runder Knopf fuer Vortag und Folgetag
private struct Rundknopf: View {
    let symbol: String
    let beschriftung: String
    let aus: Bool
    let aktion: () -> Void

    var body: some View {
        Button(action: aktion) {
            Image(systemName: symbol)
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(Farbe.ink)
                .frame(width: 44, height: 44)
                .background(Farbe.surf2, in: Circle())
        }
        .buttonStyle(.plain)
        .disabled(aus)
        .opacity(aus ? 0.4 : 1)
        .accessibilityLabel(beschriftung)
    }
}

/**
 * Rechts in der Datumszeile: Uebersicht (Raster) oder Freie Zeiten (Liste).
 * Zwei Knoepfe statt eines Wechselknopfs, damit man sieht, was gerade gilt.
 */
private struct AnsichtSchalter: View {
    @Environment(\.colorScheme) private var schema
    let wert: Ansicht
    let onWahl: (Ansicht) -> Void

    var body: some View {
        HStack(spacing: 2) {
            knopf(.uebersicht, "Übersicht", "square.grid.2x2")
            knopf(.freieZeiten, "Freie Zeiten", "list.bullet")
        }
        .padding(4)
        .background(Farbe.surf2, in: RoundedRectangle(cornerRadius: Tokens.Radius.knopf - 2))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Darstellung")
    }

    private func knopf(_ a: Ansicht, _ label: String, _ symbol: String) -> some View {
        let aktiv = wert == a
        return Button { onWahl(a) } label: {
            Image(systemName: symbol)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(aktiv ? Farbe.ink : Farbe.ink2)
                .frame(width: 36, height: 36)
                .background {
                    if aktiv {
                        RoundedRectangle(cornerRadius: Tokens.Radius.knopf - 6)
                            .fill(Farbe.segAktiv)
                            .shadow(color: schema == .dark ? .clear : .black.opacity(0.08), radius: 2, y: 1)
                    }
                }
                // 36 sichtbar, 44 zum Tippen (U18)
                .padding(4)
                .contentShape(Rectangle())
                .padding(-4)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityAddTraits(aktiv ? [.isSelected] : [])
    }
}

/// Die buchbaren Tage als Kacheln - nur so viele, wie lead_days erlaubt.
private struct Tagwahl: View {
    let modell: PlaetzeModell

    var body: some View {
        let m = modell
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(m.tage, id: \.self) { t in
                    TagKachel(tag: t, heute: m.heute, aktiv: t == m.datum) {
                        m.waehleTag(t)
                        m.tagwahlOffen = false
                    }
                }
            }
            .padding(.horizontal, Tokens.Abstand.rand)
        }
        .padding(.horizontal, -Tokens.Abstand.rand)
    }
}

/// Eine Datumskachel "MO / 28", gewaehlt in Gold - auch beim Umsetzen.
struct TagKachel: View {
    let tag: String
    var heute: String?
    let aktiv: Bool
    let aktion: () -> Void

    var body: some View {
        let k = PlaetzeLogik.kachel(tag, heute: heute)
        Button(action: aktion) {
            VStack(spacing: 1) {
                Text(k.wochentag)
                    .font(Schrift.display(.fett, Tokens.Schrift.kicker))
                    .tracking(0.6)
                Text("\(k.tag)")
                    .font(Schrift.display(.fett, 21))
            }
            .dynamicTypeSize(...DynamicTypeSize.xLarge)
            .foregroundStyle(aktiv ? Farbe.onGold : Farbe.ink2)
            .frame(width: 50, height: 56)
            .background(aktiv ? Farbe.gold : Farbe.surf2, in: RoundedRectangle(cornerRadius: 16))
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
                    .font(Schrift.text(.extrafett, 15))
                    .foregroundStyle(Farbe.bg)
                Text("frei bis \(Zeit.minutesToTime(auswahl.bis))")
                    .font(Schrift.text(.mittel, Tokens.Schrift.klein))
                    .foregroundStyle(Farbe.bg.opacity(0.7))
            }
            .lineLimit(1)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
            Button(action: aktion) {
                Text("Buchen")
                    .font(Schrift.text(.extrafett, 15.5))
                    .foregroundStyle(Farbe.onGold)
                    .padding(.horizontal, 22)
                    .frame(minHeight: 48)
                    .background(Farbe.gold, in: RoundedRectangle(cornerRadius: 16))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(platz.name ?? "") um \(Zeit.minutesToTime(auswahl.minute)) Uhr buchen")
        }
        .padding(.leading, 18)
        .padding(.trailing, 8)
        .frame(minHeight: 64)
        .background(Farbe.ink, in: RoundedRectangle(cornerRadius: 22))
        .shadow(color: .black.opacity(0.35), radius: 10, y: 8)
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
            .background(Farbe.ink, in: RoundedRectangle(cornerRadius: 18))
            .shadow(color: .black.opacity(0.25), radius: 8, y: 6)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(meldung.text)
        .accessibilityHint("Schließt die Meldung")
        .transition(.move(edge: .bottom).combined(with: .opacity))
        .onAppear { UIAccessibility.post(notification: .announcement, argument: meldung.text) }
    }
}
