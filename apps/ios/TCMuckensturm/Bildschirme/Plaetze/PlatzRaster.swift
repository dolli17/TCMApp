/**
 * Der Belegungsplan als Raster (docs/design/stitch, Entwurf "Plaetze (Belegungsplan Final)")
 *
 * Die einzige Uebersicht der Plaetze: links die Uhrzeiten von Oeffnung bis
 * Schluss, daneben je Platz eine Spalte. Freie Zeiten sind weisse Kaestchen
 * mit Linie; eins antippen waehlt Platz und Beginn aus (hellblau). Gebucht
 * wird erst ueber die Leiste unten und das Blatt. Belegungen sind Bloecke:
 * belegt grau, das eigene Spiel gelb mit "Du", Mitspieler gesucht hellblau
 * mit "+", Training grau mit Rand, gesperrt schraffiert. Was frei ist,
 * rechnet der Kern (freeGaps), was VoiceOver vorliest ebenfalls (occupancyLabel).
 */

import SwiftUI

private enum Mass {
    /// Eine halbe Stunde ist 32 Punkte hoch.
    static let stunde: CGFloat = 64
    static let kopf: CGFloat = 38
    static let zeit: CGFloat = 48
    /// Schmaler wird eine Platzspalte nicht; passen nicht alle, wischt man waagerecht.
    static let spalteMin: CGFloat = 38
    static let rand: CGFloat = 2

    static func px(_ minuten: Int) -> CGFloat { CGFloat(minuten) / 60 * stunde }
}

struct PlatzRaster: View {
    let modell: PlaetzeModell

    var body: some View {
        let m = modell
        let hoehe = Mass.px(m.schluss - m.oeffnung)
        // Jede Minute neu: die Linie fuer jetzt und die freien Flaechen ruecken mit der Uhr.
        TimelineView(.everyMinute) { kontext in
            let jetzt = kontext.date
            let jetztMin = m.datum == Zeit.berlinDay(jetzt) ? Zeit.localMinutes(jetzt) : nil
            GeometryReader { geo in
                let anzahl = max(1, m.plaetze.count)
                let spalte = max(Mass.spalteMin, ((geo.size.width - Mass.zeit - 1) / CGFloat(anzahl)).rounded(.down))
                HStack(alignment: .top, spacing: 0) {
                    zeitSpalte(m, hoehe: hoehe)
                    Farbe.line.frame(width: 1)
                    ScrollView(.horizontal, showsIndicators: false) {
                        VStack(alignment: .leading, spacing: 0) {
                            kopf(m, spalte: spalte)
                            Farbe.line.frame(height: 1)
                            HStack(alignment: .top, spacing: 0) {
                                ForEach(m.plaetze) { p in
                                    platzSpalte(m, platz: p, breite: spalte, hoehe: hoehe, jetzt: jetzt)
                                }
                            }
                            .background(alignment: .topLeading) { stundenlinien(m) }
                            .overlay(alignment: .topLeading) {
                                if let jetztMin, jetztMin >= m.oeffnung, jetztMin <= m.schluss {
                                    Farbe.ink.frame(height: 2)
                                        .offset(y: Mass.px(jetztMin - m.oeffnung) - 1)
                                        .allowsHitTesting(false)
                                        .accessibilityHidden(true)
                                }
                            }
                        }
                    }
                    .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
                    .accessibilityLabel("Belegung nach Plätzen und Uhrzeit")
                }
            }
            .frame(height: Mass.kopf + 1 + hoehe)
            .background(Farbe.surf2)
            .clipShape(RoundedRectangle(cornerRadius: Tokens.Radius.karte))
            .overlay(RoundedRectangle(cornerRadius: Tokens.Radius.karte).strokeBorder(Farbe.line, lineWidth: 1))
        }
    }

    /// Volle und halbe Stunden links, die vollen kraeftiger.
    private func zeitSpalte(_ m: PlaetzeModell, hoehe: CGFloat) -> some View {
        let marken = Array(stride(from: Int((Double(m.oeffnung) / 30).rounded(.up)) * 30, to: m.schluss, by: 30))
        return VStack(spacing: 0) {
            Color.clear.frame(height: Mass.kopf + 1)
            ZStack(alignment: .topLeading) {
                ForEach(marken, id: \.self) { s in
                    Text(Zeit.minutesToTime(s))
                        .font(Schrift.display(s % 60 == 0 ? .halbfett : .normal, 10.5))
                        .monospacedDigit()
                        .foregroundStyle(s % 60 == 0 ? Farbe.ink2 : Farbe.muted)
                        .dynamicTypeSize(...DynamicTypeSize.large)
                        .frame(width: Mass.zeit, height: Mass.px(30), alignment: .center)
                        .offset(y: Mass.px(s - m.oeffnung))
                }
            }
            .frame(width: Mass.zeit, height: hoehe, alignment: .topLeading)
        }
        .frame(width: Mass.zeit)
        .accessibilityHidden(true)
    }

    private func kopf(_ m: PlaetzeModell, spalte: CGFloat) -> some View {
        HStack(spacing: 0) {
            ForEach(m.plaetze) { p in
                Text(PlaetzeLogik.platzNummer(name: p.name, kurz: p.shortName))
                    .font(Schrift.display(.fett, 15))
                    .foregroundStyle(Farbe.ink)
                    // Die Spalten sind schmal: hier waechst die Schrift nicht mit.
                    .dynamicTypeSize(.large)
                    .frame(width: spalte, height: Mass.kopf)
                    .accessibilityLabel(p.name ?? "")
                    .accessibilityAddTraits(.isHeader)
            }
        }
        .background(Farbe.surf)
    }

    private func stundenlinien(_ m: PlaetzeModell) -> some View {
        let volle = Array(stride(from: Int((Double(m.oeffnung) / 60).rounded(.up)) * 60, to: m.schluss, by: 60))
        return ZStack(alignment: .topLeading) {
            ForEach(volle, id: \.self) { s in
                Farbe.line.frame(height: 1).offset(y: Mass.px(s - m.oeffnung))
            }
        }
        .accessibilityHidden(true)
    }

    private func platzSpalte(_ m: PlaetzeModell, platz: AktiverPlatz, breite: CGFloat, hoehe: CGFloat, jetzt: Date) -> some View {
        let oeffnung = m.oeffnung
        let innen = breite - 2 * Mass.rand
        let luecken = Platzplan.freeGaps(
            day: m.datum, courtId: platz.id, openingMinutes: oeffnung, closingMinutes: m.schluss,
            slotMinutes: m.raster, durationMinutes: m.dauer, occupied: m.belegung, leadDays: m.vorlauf, now: jetzt
        )
        let hier = m.belegung.filter { $0.courtId == platz.id }
        return ZStack(alignment: .topLeading) {
            ForEach(luecken, id: \.from) { l in
                FreieFlaeche(platz: platz, luecke: l, raster: m.raster, breite: innen) { minute in
                    m.auswahl = Auswahl(
                        courtId: platz.id,
                        minute: Platzplan.startInGap(l, minute: minute, slotMinutes: m.raster, durationMinutes: m.dauer),
                        bis: l.until
                    )
                }
                .offset(x: Mass.rand, y: Mass.px(l.from - oeffnung))
            }
            ForEach(hier) { b in
                let von = max(oeffnung, Zeit.minutesOf(b.startsAt))
                let bis = min(m.schluss, Zeit.minutesOf(b.endsAt))
                if bis > von {
                    Block(belegung: b, platz: platz, breite: innen, hoehe: max(Mass.px(bis - von) - 2 * Mass.rand, 10),
                          kannAuf: m.oeffnebar(b), markiert: m.markiert?.trifft(b) == true) { m.oeffne(b) }
                        .offset(x: Mass.rand, y: Mass.px(von - oeffnung) + Mass.rand)
                }
            }
            if let a = m.auswahl, a.courtId == platz.id {
                // Ausgewaehlt ist hellblau mit blauer Linie.
                Text(Zeit.minutesToTime(a.minute))
                    .font(Schrift.display(.fett, 10.5))
                    .monospacedDigit()
                    .foregroundStyle(Farbe.blueInk)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .dynamicTypeSize(.large)
                    .frame(width: innen, height: Mass.px(m.dauer) - 2 * Mass.rand)
                    .background(Farbe.blueSoft, in: RoundedRectangle(cornerRadius: 7))
                    .overlay(RoundedRectangle(cornerRadius: 7).strokeBorder(Farbe.blue, lineWidth: 2))
                    .offset(x: Mass.rand, y: Mass.px(a.minute - oeffnung) + Mass.rand)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }
        }
        .frame(width: breite, height: hoehe, alignment: .topLeading)
        .overlay(alignment: .leading) { Farbe.line.opacity(0.6).frame(width: 1) }
    }
}

/**
 * Eine freie Zeit: je Rasterschritt ein weisses Kaestchen mit Linie, zusammen
 * eine antippbare Flaeche. Die Stelle des Fingers bestimmt den Beginn;
 * VoiceOver tippt ohne Stelle und bekommt den fruehesten.
 */
private struct FreieFlaeche: View {
    let platz: AktiverPlatz
    let luecke: FreeGap
    let raster: Int
    let breite: CGFloat
    let wahl: (Int) -> Void

    var body: some View {
        let schritt = max(15, raster)
        let schritte = Array(stride(from: luecke.from, to: luecke.until, by: schritt))
        ZStack(alignment: .topLeading) {
            ForEach(schritte, id: \.self) { s in
                let h = Mass.px(min(schritt, luecke.until - s)) - 2 * Mass.rand
                RoundedRectangle(cornerRadius: 7)
                    .fill(Farbe.surf)
                    .overlay(RoundedRectangle(cornerRadius: 7).strokeBorder(Farbe.line2, lineWidth: 1))
                    .frame(width: breite, height: max(h, 4))
                    .offset(y: Mass.px(s - luecke.from) + Mass.rand)
            }
        }
        .frame(width: breite, height: Mass.px(luecke.until - luecke.from), alignment: .topLeading)
        .contentShape(Rectangle())
        .onTapGesture(coordinateSpace: .local) { ort in
            wahl(luecke.from + Int((ort.y / Mass.stunde * 60).rounded(.down)))
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(platz.name ?? ""), frei von \(Zeit.minutesToTime(luecke.from)) bis \(Zeit.minutesToTime(luecke.until)) Uhr")
        .accessibilityHint("Wählt \(Zeit.minutesToTime(luecke.from)) Uhr zum Buchen aus")
        .accessibilityAddTraits(.isButton)
        .accessibilityAction { wahl(luecke.from) }
    }
}

/// Eine Belegung als Block. Die Spalten sind schmal: im Block steht nur "Du" oder "+", der Rest im Blatt.
private struct Block: View {
    let belegung: TagesBelegung
    let platz: AktiverPlatz
    let breite: CGFloat
    let hoehe: CGFloat
    let kannAuf: Bool
    let markiert: Bool
    let aktion: () -> Void

    var body: some View {
        let l = Platzplan.occupancyLabel(belegung)
        let stil = BelegungsStil(l.art)
        Button(action: aktion) {
            Group {
                if hoehe >= 20, let zeichen = stil.zeichen {
                    Text(zeichen).font(Schrift.display(.fett, zeichen == "+" ? 16 : 12.5))
                } else {
                    Color.clear
                }
            }
            .foregroundStyle(stil.text)
            .lineLimit(1)
            .dynamicTypeSize(.large)
            .frame(width: breite, height: hoehe)
            .background { stil.flaeche(RoundedRectangle(cornerRadius: 7)) }
            .overlay {
                if markiert { RoundedRectangle(cornerRadius: 7).strokeBorder(Farbe.blue, lineWidth: 2.5) }
            }
            .clipShape(RoundedRectangle(cornerRadius: 7))
        }
        .buttonStyle(.plain)
        .disabled(!kannAuf)
        .accessibilityLabel("\(platz.name ?? ""), \(l.spoken)")
        .accessibilityHint(kannAuf ? "Öffnet die Buchung" : "")
    }
}

/**
 * Farben einer Belegung (docs/design/stitch): eigen gelb ("deins"), belegt
 * grau, Mitspieler gesucht hellblau, Training grau mit Rand, gesperrt
 * schraffiert.
 */
struct BelegungsStil {
    let art: TimelineKind

    init(_ art: TimelineKind) { self.art = art }

    var text: Color {
        switch art {
        case .eigen: Farbe.onGold
        case .belegt: Farbe.ink2
        case .sucht: Farbe.blueInk
        case .serie: Farbe.ink2
        case .gesperrt: Farbe.muted
        }
    }

    /// Was im Block steht
    var zeichen: String? {
        switch art {
        case .eigen: "Du"
        case .sucht: "+"
        default: nil
        }
    }

    @ViewBuilder func flaeche(_ form: RoundedRectangle) -> some View {
        switch art {
        case .eigen: form.fill(Farbe.gold)
        case .belegt: form.fill(Farbe.line2)
        case .sucht: form.fill(Farbe.blueSoft).overlay(form.strokeBorder(Farbe.blueInk.opacity(0.55), lineWidth: 1))
        case .serie: form.fill(Farbe.surf3).overlay(form.strokeBorder(Farbe.rahmen, lineWidth: 1))
        case .gesperrt:
            form.fill(Farbe.surf3)
                .overlay(Schraegstriche().stroke(Farbe.rahmen.opacity(0.55), lineWidth: 1.5).clipShape(form))
        }
    }
}

/// Schraege Linien fuer Sperrungen
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

/// Kurze Legende ueber dem Raster.
struct RasterLegende: View {
    var body: some View {
        let form = RoundedRectangle(cornerRadius: 4)
        Legende(eintraege: [
            ("frei", AnyView(form.fill(Farbe.surf).overlay(form.strokeBorder(Farbe.line2, lineWidth: 1)))),
            ("belegt", AnyView(BelegungsStil(.belegt).flaeche(form))),
            ("Du", AnyView(BelegungsStil(.eigen).flaeche(form))),
            ("sucht Mitspieler", AnyView(BelegungsStil(.sucht).flaeche(form))),
            ("Training", AnyView(BelegungsStil(.serie).flaeche(form))),
            ("gesperrt", AnyView(BelegungsStil(.gesperrt).flaeche(form))),
        ], groesse: CGSize(width: 14, height: 14))
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
