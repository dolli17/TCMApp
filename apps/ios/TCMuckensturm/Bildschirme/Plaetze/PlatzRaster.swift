/**
 * Die Plaetze als Raster (apps/mobile/src/components/plaetze/PlatzRaster.tsx)
 *
 * Links eine feste Spalte mit den Plaetzen, rechts waagerecht wischbar die
 * Stunden von Oeffnung bis Schluss, 88 Punkte je Stunde. Belegungen sind
 * beschriftete Bloecke; eine freie Flaeche antippen waehlt Platz und Beginn
 * aus. Gebucht wird erst ueber die Leiste unten und das Blatt. Was frei ist,
 * rechnet der Kern (freeGaps), die Beschriftung ebenfalls (occupancyLabel).
 */

import SwiftUI

private enum Mass {
    /// Eine halbe Stunde ist so 44 Punkte breit - schmaler trifft man sie mit dem Finger nicht (U18).
    static let stunde: CGFloat = 88
    static let zeile: CGFloat = 46
    static let kopf: CGFloat = 34
    static let spalte: CGFloat = 46
    static let abstand: CGFloat = 4

    static func px(_ minuten: Int) -> CGFloat { CGFloat(minuten) / 60 * stunde }
}

struct PlatzRaster: View {
    let modell: PlaetzeModell

    var body: some View {
        let m = modell
        // Jede Minute neu: rote Linie und freie Flaechen ruecken mit der Uhr.
        TimelineView(.everyMinute) { kontext in
            let jetzt = kontext.date
            let jetztMin = m.datum == Zeit.berlinDay(jetzt) ? Zeit.localMinutes(jetzt) : nil
            HStack(spacing: 0) {
                platzSpalte(m)
                Divider().overlay(Farbe.line)
                stunden(m, jetzt: jetzt, jetztMin: jetztMin)
            }
            .background(Farbe.surf)
            .clipShape(RoundedRectangle(cornerRadius: 22))
            .overlay(RoundedRectangle(cornerRadius: 22).strokeBorder(Farbe.line, lineWidth: 1))
        }
    }

    private func platzSpalte(_ m: PlaetzeModell) -> some View {
        VStack(spacing: 0) {
            Color.clear.frame(height: Mass.kopf)
            Divider().overlay(Farbe.line)
            ForEach(m.plaetze) { p in
                VStack(spacing: 0) {
                    Text("PLATZ")
                        .font(Schrift.text(.fett, 9.5))
                        .tracking(0.8)
                        .foregroundStyle(Farbe.muted)
                    Text(PlaetzeLogik.platzNummer(name: p.name, kurz: p.shortName))
                        .font(Schrift.display(.fett, 20))
                        .foregroundStyle(Farbe.ink)
                }
                // Die Spalte ist 46 Punkte schmal: hier waechst die Schrift nicht mit.
                .dynamicTypeSize(.large)
                .frame(width: Mass.spalte, height: Mass.zeile)
                .overlay(alignment: .bottom) { Farbe.ink.opacity(0.06).frame(height: 1) }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(p.name ?? "")
                .accessibilityAddTraits(.isHeader)
            }
        }
        .frame(width: Mass.spalte)
    }

    private func stunden(_ m: PlaetzeModell, jetzt: Date, jetztMin: Int?) -> some View {
        let oeffnung = m.oeffnung
        let breite = Mass.px(m.schluss - oeffnung)
        let volle = Array(stride(from: Int((Double(oeffnung) / 60).rounded(.up)) * 60, to: m.schluss, by: 60))
        // Beim Oeffnen und bei jedem Tageswechsel auf "jetzt" (eine Viertelstunde vorher), sonst auf die Oeffnung.
        let ziel = jetztMin.map { max(oeffnung, $0 - 15) } ?? oeffnung
        let zielStunde = volle.last { $0 <= ziel } ?? volle.first ?? oeffnung

        return ScrollViewReader { leser in
            ScrollView(.horizontal, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 0) {
                    ZStack(alignment: .topLeading) {
                        ForEach(volle, id: \.self) { s in
                            Text(Zeit.minutesToTime(s))
                                .font(Schrift.text(.fett, 12))
                                .monospacedDigit()
                                .foregroundStyle(Farbe.ink2)
                                .dynamicTypeSize(...DynamicTypeSize.xLarge)
                                .offset(x: Mass.px(s - oeffnung) + 6, y: 10)
                                .id(s)
                        }
                    }
                    .frame(width: breite, height: Mass.kopf, alignment: .topLeading)
                    .accessibilityHidden(true)
                    Divider().overlay(Farbe.line)

                    ZStack(alignment: .topLeading) {
                        ForEach(volle, id: \.self) { s in
                            Farbe.ink.opacity(0.07).frame(width: 1).offset(x: Mass.px(s - oeffnung))
                        }
                        VStack(spacing: 0) {
                            ForEach(m.plaetze) { p in
                                zeile(m, platz: p, jetzt: jetzt)
                            }
                        }
                        if let jetztMin, jetztMin >= oeffnung, jetztMin <= m.schluss {
                            Farbe.red.frame(width: 2).offset(x: Mass.px(jetztMin - oeffnung) - 1).accessibilityHidden(true)
                        }
                    }
                    .frame(width: breite, height: CGFloat(m.plaetze.count) * Mass.zeile, alignment: .topLeading)
                }
            }
            .accessibilityLabel("Belegung nach Plätzen, waagerecht wischen für frühere und spätere Stunden")
            .onAppear { leser.scrollTo(zielStunde, anchor: .leading) }
            .onChange(of: m.datum) { leser.scrollTo(zielStunde, anchor: .leading) }
        }
    }

    private func zeile(_ m: PlaetzeModell, platz: AktiverPlatz, jetzt: Date) -> some View {
        let oeffnung = m.oeffnung
        let luecken = Platzplan.freeGaps(
            day: m.datum, courtId: platz.id, openingMinutes: oeffnung, closingMinutes: m.schluss,
            slotMinutes: m.raster, durationMinutes: m.dauer, occupied: m.belegung, leadDays: m.vorlauf, now: jetzt
        )
        let hier = m.belegung.filter { $0.courtId == platz.id }
        return ZStack(alignment: .topLeading) {
            ForEach(luecken, id: \.from) { l in
                FreieFlaeche(platz: platz, luecke: l) { minute in
                    m.auswahl = Auswahl(
                        courtId: platz.id,
                        minute: Platzplan.startInGap(l, minute: minute, slotMinutes: m.raster, durationMinutes: m.dauer),
                        bis: l.until
                    )
                }
                .offset(x: Mass.px(l.from - oeffnung) + 3)
            }
            ForEach(hier) { b in
                let von = max(oeffnung, Zeit.minutesOf(b.startsAt))
                let bis = min(m.schluss, Zeit.minutesOf(b.endsAt))
                if bis > von {
                    Block(belegung: b, platz: platz, breite: max(Mass.px(bis - von) - 6, 12), kannAuf: m.oeffnebar(b),
                          markiert: m.markiert?.trifft(b) == true) { m.oeffne(b) }
                        .offset(x: Mass.px(von - oeffnung) + 3)
                }
            }
            if let a = m.auswahl, a.courtId == platz.id {
                VStack(alignment: .leading, spacing: 0) {
                    Text("+ \(Zeit.minutesToTime(a.minute))").font(Schrift.text(.fett, 12))
                    Text("ausgewählt").font(Schrift.text(.mittel, 12)).opacity(0.85)
                }
                .foregroundStyle(Farbe.goldInk)
                .lineLimit(1)
                .padding(.horizontal, 7)
                .frame(width: Mass.px(m.dauer) - 6, height: Mass.zeile - 8, alignment: .leading)
                .background(Farbe.goldSoft, in: RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Farbe.gold, lineWidth: 2))
                .offset(x: Mass.px(a.minute - oeffnung) + 3, y: Mass.abstand)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
            }
        }
        .frame(height: Mass.zeile, alignment: .topLeading)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .bottom) { Farbe.ink.opacity(0.06).frame(height: 1) }
    }
}

/**
 * Eine freie Flaeche: gruen getoent mit gruenem Rand, antippbar. Die Stelle
 * des Fingers bestimmt den Beginn; VoiceOver tippt ohne Stelle und bekommt
 * den fruehesten.
 */
private struct FreieFlaeche: View {
    let platz: AktiverPlatz
    let luecke: FreeGap
    let wahl: (Int) -> Void

    var body: some View {
        Text("frei")
            .font(Schrift.text(.fett, 12))
            .foregroundStyle(Farbe.greenInk)
            .dynamicTypeSize(...DynamicTypeSize.xLarge)
            .padding(.horizontal, 7)
            .frame(width: max(Mass.px(luecke.until - luecke.from) - 6, 12), height: Mass.zeile - 2 * Mass.abstand, alignment: .leading)
            .background(Farbe.green.opacity(0.16), in: RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Farbe.green, lineWidth: 1.5))
            .offset(y: Mass.abstand)
            .contentShape(Rectangle())
            .onTapGesture(coordinateSpace: .local) { ort in
                wahl(luecke.from + Int((ort.x / Mass.stunde * 60).rounded(.down)))
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(platz.name ?? ""), frei von \(Zeit.minutesToTime(luecke.from)) bis \(Zeit.minutesToTime(luecke.until)) Uhr")
            .accessibilityHint("Wählt \(Zeit.minutesToTime(luecke.from)) Uhr zum Buchen aus")
            .accessibilityAddTraits(.isButton)
            .accessibilityAction { wahl(luecke.from) }
    }
}

/// Eine Belegung als Block, gefaerbt nach der Statustabelle (wie .tr-block im Web).
private struct Block: View {
    let belegung: TagesBelegung
    let platz: AktiverPlatz
    let breite: CGFloat
    let kannAuf: Bool
    let markiert: Bool
    let aktion: () -> Void

    var body: some View {
        let l = Platzplan.occupancyLabel(belegung)
        let stil = BelegungsStil(l.art)
        Button(action: aktion) {
            VStack(alignment: .leading, spacing: 0) {
                Text(l.title).font(Schrift.text(.fett, 12))
                if !l.detail.isEmpty {
                    Text(l.detail).font(Schrift.text(.mittel, 12)).opacity(0.85)
                }
            }
            .foregroundStyle(stil.text)
            .lineLimit(1)
            .dynamicTypeSize(...DynamicTypeSize.xLarge)
            .padding(.horizontal, 8)
            .frame(width: breite, height: Mass.zeile - 2 * Mass.abstand, alignment: .leading)
            .background { stil.flaeche(RoundedRectangle(cornerRadius: 10)) }
            .overlay {
                if markiert { RoundedRectangle(cornerRadius: 10).strokeBorder(Farbe.goldLine, lineWidth: 3) }
            }
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
        .disabled(!kannAuf)
        .offset(y: Mass.abstand)
        .accessibilityLabel("\(platz.name ?? ""), \(l.spoken)")
        .accessibilityHint(kannAuf ? "Öffnet die Buchung" : "")
    }
}

/**
 * Farben einer Belegung nach der Statustabelle (HANDOFF §2): eigen gold,
 * belegt blau mit Rand, sucht goldSoft gestrichelt, Training schraffiert,
 * gesperrt grau mit Rand.
 */
struct BelegungsStil {
    let art: TimelineKind

    init(_ art: TimelineKind) { self.art = art }

    var text: Color {
        switch art {
        case .eigen: Farbe.onGold
        case .belegt: Farbe.blueInk
        case .sucht: Farbe.goldInk
        case .serie: Farbe.ink2
        case .gesperrt: Farbe.muted
        }
    }

    @ViewBuilder func flaeche(_ form: RoundedRectangle) -> some View {
        switch art {
        case .eigen: form.fill(Farbe.gold)
        case .belegt: form.fill(Farbe.blueSoft).overlay(form.strokeBorder(Farbe.blue, lineWidth: 1))
        case .sucht:
            form.fill(Farbe.goldSoft).overlay(form.strokeBorder(Farbe.goldLine, style: StrokeStyle(lineWidth: 1.5, dash: [4, 3])))
        case .serie:
            form.fill(Farbe.surf3)
                .overlay(Schraegstriche().stroke(Farbe.ink.opacity(0.1), lineWidth: 1.5).clipShape(form))
                .overlay(form.strokeBorder(Farbe.rahmen, lineWidth: 1))
        case .gesperrt: form.fill(Farbe.surf3).overlay(form.strokeBorder(Farbe.rahmen, lineWidth: 1))
        }
    }
}

/// Schraege Linien fuer Serien (Training)
struct Schraegstriche: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        var x = -rect.height
        while x < rect.width {
            p.move(to: CGPoint(x: x, y: rect.height))
            p.addLine(to: CGPoint(x: x + rect.height, y: 0))
            x += 6
        }
        return p
    }
}

/// Kurze Legende unter dem Raster. Jedes Kaestchen mit Rand: die Toenungen allein liegen unter 3:1 (U29).
struct RasterLegende: View {
    var body: some View {
        Legende(eintraege: [
            ("frei", AnyView(RoundedRectangle(cornerRadius: 3).fill(Farbe.green.opacity(0.16)).overlay(RoundedRectangle(cornerRadius: 3).strokeBorder(Farbe.green, lineWidth: 1)))),
            ("Du", AnyView(BelegungsStil(.eigen).flaeche(RoundedRectangle(cornerRadius: 3)))),
            ("belegt", AnyView(BelegungsStil(.belegt).flaeche(RoundedRectangle(cornerRadius: 3)))),
            ("sucht Mitspieler", AnyView(BelegungsStil(.sucht).flaeche(RoundedRectangle(cornerRadius: 3)))),
            ("Training", AnyView(BelegungsStil(.serie).flaeche(RoundedRectangle(cornerRadius: 3)))),
            ("gesperrt", AnyView(BelegungsStil(.gesperrt).flaeche(RoundedRectangle(cornerRadius: 3)))),
        ], groesse: CGSize(width: 16, height: 10))
    }
}

/// Eine Legende als umbrechende Zeile; fuer VoiceOver verborgen, die Bloecke sagen es selbst.
struct Legende: View {
    let eintraege: [(String, AnyView)]
    let groesse: CGSize

    var body: some View {
        UmbruchStapel(abstand: 14, zeilenabstand: 6) {
            ForEach(eintraege, id: \.0) { name, kaestchen in
                HStack(spacing: 6) {
                    kaestchen.frame(width: groesse.width, height: groesse.height)
                    Text(name).font(Schrift.text(.normal, 12.5)).foregroundStyle(Farbe.ink2)
                }
            }
        }
        .accessibilityHidden(true)
    }
}

/// Reiht Elemente nebeneinander und bricht um, wenn die Zeile voll ist (flexWrap).
struct UmbruchStapel: Layout {
    var abstand: CGFloat = 8
    var zeilenabstand: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let breite = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, zeile: CGFloat = 0, weiteste: CGFloat = 0
        for s in subviews {
            let g = s.sizeThatFits(.unspecified)
            if x > 0 && x + g.width > breite {
                y += zeile + zeilenabstand
                x = 0
                zeile = 0
            }
            x += g.width + abstand
            zeile = max(zeile, g.height)
            weiteste = max(weiteste, x - abstand)
        }
        return CGSize(width: proposal.width ?? weiteste, height: y + zeile)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, zeile: CGFloat = 0
        for s in subviews {
            let g = s.sizeThatFits(.unspecified)
            if x > bounds.minX && x + g.width > bounds.maxX {
                y += zeile + zeilenabstand
                x = bounds.minX
                zeile = 0
            }
            s.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(g))
            x += g.width + abstand
            zeile = max(zeile, g.height)
        }
    }
}
