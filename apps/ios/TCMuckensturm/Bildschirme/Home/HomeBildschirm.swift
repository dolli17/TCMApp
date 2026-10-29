/**
 * Home - der Startbildschirm (apps/mobile/app/(tabs)/home.tsx)
 *
 * Was heute zaehlt, auf einen Blick: die eigenen naechsten Termine, drei
 * Schnellaktionen, welche Plaetze gerade frei sind, wer Mitspieler sucht,
 * was demnaechst im Verein ansteht, der laufende Monat und die letzten
 * Neuigkeiten. Nur Lesen - gebucht und eingetragen wird auf den
 * Bildschirmen, auf die die Knoepfe fuehren (bis es sie nativ gibt: der
 * passende Tab; Getraenke und Veranstaltungen ueber zuVerein).
 *
 * Alle Abschnitte laden parallel und jeder fuer sich: schlaegt einer fehl,
 * steht dort der Fehler, und der Rest bleibt gefuellt.
 */

import SwiftUI

struct HomeBildschirm: View {
    @Environment(Sitzung.self) private var sitzung
    @Environment(\.zuTab) private var zuTab
    @State private var inhalt: HomeInhalt?
    @State private var laedt = true
    @State private var aktualisiert = false
    @State private var nachrichtenOffen = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Tokens.Abstand.m) {
                    GrosserKopf(
                        titel: HomeLogik.titel(vorname: inhalt?.name?.vorname),
                        kicker: HomeLogik.kicker(Date()),
                        name: inhalt?.name
                    )
                    if laedt && inhalt == nil {
                        ProgressView().tint(Farbe.muted).frame(maxWidth: .infinity).padding(.top, 40)
                    } else if let d = inhalt {
                        let erneut = Erneut(laeuft: aktualisiert) { Task { await laden(.nachladen) } }
                        AlsNaechstes(termine: d.termine, erneut: erneut)
                        Schnellaktionen()
                        JetztFrei(frei: d.frei, erneut: erneut)
                        OffeneSpiele(offen: d.offen, erneut: erneut)
                        DemnaechstImVerein(events: d.events, erneut: erneut)
                        DeinStandKacheln(stand: HomeLogik.deinStand(getraenke: d.getraenke, dienst: d.dienst, jetzt: Date()))
                        Neuigkeiten(neues: d.neues, erneut: erneut) { nachrichtenOffen = true }
                    } else {
                        Text("Die Startseite konnte nicht geladen werden.").leise()
                    }
                }
                .padding(.horizontal, Tokens.Abstand.rand)
                .padding(.bottom, Tokens.Abstand.abschnitt * 2)
            }
            .background(Farbe.bg)
            .refreshable { await laden(.nachladen) }
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(isPresented: $nachrichtenOffen) { NachrichtenBildschirm() }
        }
        .task { await laden(.erstes) }
        // Zurueck auf Home: still nachladen, ohne Ladekreis.
        .onAppear { if inhalt != nil { Task { await laden(.still) } } }
    }

    private enum Art { case erstes, nachladen, still }

    private func laden(_ art: Art) async {
        if art == .nachladen { aktualisiert = true }
        let neu = await Self.lade(Startdaten(client: sitzung.client))
        inhalt = neu
        // Die Widgets zeigen dasselbe (TCMWidgets/Gemeinsam).
        WidgetBruecke.ablegen(neu, umgebung: sitzung.umgebung)
        laedt = false
        aktualisiert = false
    }

    nonisolated static func lade(_ d: Startdaten) async -> HomeInhalt {
        let heute = Zeit.berlinDay(Date())
        async let name = Abschnitt.von { try await d.meinName() }
        async let meine = Abschnitt.von { try await d.meineBuchungen() }
        async let plaetze = Abschnitt.von { try await d.plaetze() }
        async let plan = Abschnitt.von { try await d.tagesplan(heute) }
        async let einstellungen = Abschnitt.von { try await d.buchungseinstellungen() }
        async let arten = Abschnitt.von { try await d.buchungsarten() }
        async let offen = Abschnitt.von { try await d.offeneSpiele() }
        async let getraenke = Abschnitt.von { try await d.eigeneGetraenke() }
        async let dienst = Abschnitt.von { try await d.arbeitsdienst() }
        // Drei Benachrichtigungen reichen: ungelesen zuerst, dann die neuesten.
        async let neues = Abschnitt.von { try await d.benachrichtigungen(limit: 3) }
        async let events = Abschnitt.von { try await d.veranstaltungen() }

        let (p, t, e, a) = await (plaetze, plan, einstellungen, arten)
        // "Jetzt frei" braucht vier Quellen; fehlt eine, fehlt der Abschnitt.
        let frei: Abschnitt<FreiDaten>
        if let p = p.wert, let t = t.wert, case let .wert(e) = e, let a = a.wert {
            frei = .wert(FreiDaten(heute: heute, plaetze: p, belegung: t, einstellungen: e, dauer: a.first?.durationMinutes ?? 60))
        } else {
            frei = .fehler(p.fehler ?? t.fehler ?? e.fehler ?? a.fehler ?? "Konnte nicht geladen werden.")
        }

        return await HomeInhalt(
            name: name.wert ?? nil,
            termine: meine,
            frei: frei,
            offen: offen,
            getraenke: getraenke,
            dienst: dienst,
            neues: neues,
            events: events
        )
    }
}

/// Was ein Abschnitt braucht, um nach einem Fehler neu zu laden.
struct Erneut {
    let laeuft: Bool
    let aktion: () -> Void
}

/// Waagerecht wischbar, bis an den Bildschirmrand - der Inhalt hat 20 Rand.
private struct Wischreihe<Inhalt: View>: View {
    var abstand: CGFloat = 12
    @ViewBuilder let inhalt: Inhalt

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(alignment: .top, spacing: abstand) { inhalt }
                .padding(.horizontal, Tokens.Abstand.rand)
                .padding(.vertical, 4)
        }
        .padding(.horizontal, -Tokens.Abstand.rand)
    }
}

// MARK: - Als Naechstes

private struct AlsNaechstes: View {
    @Environment(\.zuTab) private var zuTab
    let termine: Abschnitt<[MeineBuchung]>
    let erneut: Erneut

    var body: some View {
        let jetzt = Date()
        let kommende = Startseite.upcomingBookings(termine.wert ?? [], now: jetzt)
        Kopfzeile(
            titel: "Als Nächstes",
            link: kommende.isEmpty ? nil : ("Alle", "Alle Termine", { zuTab(.plaetze) })
        )
        if let f = termine.fehler {
            Fehlerzeile(text: f, laeuft: erneut.laeuft, onErneut: erneut.aktion)
        }
        if termine.wert != nil && kommende.isEmpty {
            // Sekundaer: die gelbe Kachel "Platz buchen" steht direkt darunter (U43).
            Leerzustand(
                titel: "Noch nichts geplant",
                text: "Such dir einen Platz – heute ist noch einiges frei.",
                handlung: ("Platz buchen", { zuTab(.plaetze) })
            )
        }
        if !kommende.isEmpty {
            Wischreihe {
                ForEach(Array(kommende.enumerated()), id: \.element.id) { i, t in
                    TerminKarte(t: t, erste: i == 0, jetzt: jetzt) { zuTab(.plaetze) }
                }
            }
        }
    }
}

private struct TerminKarte: View {
    let t: MeineBuchung
    let erste: Bool
    let jetzt: Date
    let aktion: () -> Void

    var body: some View {
        let tinte = erste ? Farbe.onBrand : Farbe.ink
        Button(action: aktion) {
            VStack(alignment: .leading, spacing: 0) {
                Text(Startseite.bookingKicker(startsAt: t.startsAt, endsAt: t.endsAt, now: jetzt))
                    .kicker(farbe: erste ? Farbe.onBrand.opacity(0.85) : Farbe.muted)
                    .padding(.trailing, erste ? 40 : 0)
                Text(HomeLogik.zeitSpanne(t))
                    .font(Schrift.display(.fett, Tokens.Schrift.hero, relativeTo: .largeTitle))
                    .monospacedDigit()
                    .foregroundStyle(tinte)
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                    .padding(.top, 8)
                Text("\(t.courtName ?? "") · \(t.typeName ?? "")")
                    .font(Schrift.text(.halbfett, 16))
                    .foregroundStyle(tinte.opacity(erste ? 0.92 : 1))
                    .lineLimit(1)
                    .padding(.top, 6)
                Spacer(minLength: 16)
                HStack(spacing: 10) {
                    Text(HomeLogik.mitText(t))
                        .font(Schrift.text(.normal, 13))
                        .foregroundStyle(erste ? Farbe.onBrand.opacity(0.9) : Farbe.ink2)
                        .lineLimit(1)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Text("Details")
                        .font(Schrift.text(.fett, 14))
                        .foregroundStyle(tinte)
                        .padding(.horizontal, 16)
                        .frame(minHeight: 40)
                        .background(erste ? Farbe.onBrand.opacity(0.18) : Farbe.surf2, in: Capsule())
                }
            }
            .padding(20)
            .frame(minHeight: 216, alignment: .topLeading)
            .containerRelativeFrame(.horizontal) { breite, _ in min(318, breite - 2 * Tokens.Abstand.rand - 32) }
            .background { hintergrund }
            .clipShape(RoundedRectangle(cornerRadius: Tokens.Radius.karteGross))
            .overlay {
                if !erste {
                    RoundedRectangle(cornerRadius: Tokens.Radius.karteGross).strokeBorder(Farbe.line, lineWidth: 1)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(HomeLogik.terminLabel(t, jetzt: jetzt))
        .accessibilityAddTraits(.isButton)
    }

    @ViewBuilder private var hintergrund: some View {
        if erste {
            ZStack {
                Farbe.brand
                // Platzlinien in Perspektive, dezent, und der Ball
                Canvas { ctx, groesse in
                    let b = groesse.width
                    let h = groesse.height
                    var p = Path()
                    p.move(to: CGPoint(x: b * 0.47, y: h)); p.addLine(to: CGPoint(x: b * 0.66, y: 0))
                    p.move(to: CGPoint(x: b, y: 60)); p.addLine(to: CGPoint(x: b * 0.6, y: h))
                    p.move(to: CGPoint(x: b * 0.57, y: 100)); p.addLine(to: CGPoint(x: b, y: 100))
                    p.move(to: CGPoint(x: b * 0.63, y: 40)); p.addLine(to: CGPoint(x: b, y: 40))
                    ctx.stroke(p, with: .color(Farbe.onBrand.opacity(0.13)), lineWidth: 2)
                    ctx.fill(Path(ellipseIn: CGRect(x: b - 46, y: 20, width: 26, height: 26)), with: .color(Farbe.gold))
                }
            }
        } else {
            Farbe.surf
        }
    }
}

// MARK: - Schnellaktionen

private struct Schnellaktionen: View {
    @Environment(\.zuTab) private var zuTab
    @Environment(\.zuVerein) private var zuVerein
    @Environment(\.dynamicTypeSize) private var textgroesse

    private struct Kachel: Identifiable {
        let text: String
        let symbol: String
        let ziel: HauptTab
        var gelb = false
        var id: String { text }
    }

    var body: some View {
        // Bei grosser Schrift untereinander, Symbol neben dem Text (U5).
        let gestapelt = textgroesse >= .xxLarge
        let kacheln = [
            Kachel(text: "Platz buchen", symbol: "calendar.badge.plus", ziel: .plaetze, gelb: true),
            Kachel(text: "Getränk eintragen", symbol: "wineglass", ziel: .verein),
            Kachel(text: "Mitspielen", symbol: "person.badge.plus", ziel: .plaetze),
        ]
        let layout = gestapelt ? AnyLayout(VStackLayout(spacing: 10)) : AnyLayout(HStackLayout(alignment: .top, spacing: 10))
        layout {
            ForEach(kacheln) { k in
                let tinte = k.gelb ? Farbe.onGold : Farbe.ink
                Button { k.ziel == .verein ? zuVerein(.getraenke) : zuTab(k.ziel) } label: {
                    let symbol = Image(systemName: k.symbol)
                        .font(.system(size: 20, weight: k.gelb ? .semibold : .regular))
                        .foregroundStyle(tinte)
                    let text = Text(k.text)
                        .font(Schrift.text(.fett, 15))
                        .foregroundStyle(tinte)
                        .multilineTextAlignment(.leading)
                    Group {
                        if gestapelt {
                            HStack(spacing: 12) { symbol; text; Spacer(minLength: 0) }
                                .frame(minHeight: 56 - 28)
                        } else {
                            VStack(alignment: .leading) { symbol; Spacer(minLength: 8); text }
                                .frame(maxWidth: .infinity, minHeight: 96 - 28, alignment: .leading)
                        }
                    }
                    .padding(14)
                    .background(k.gelb ? Farbe.gold : Farbe.surf, in: RoundedRectangle(cornerRadius: Tokens.Radius.karte))
                    .overlay {
                        if !k.gelb {
                            RoundedRectangle(cornerRadius: Tokens.Radius.karte).strokeBorder(Farbe.line, lineWidth: 1)
                        }
                    }
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.top, Tokens.Abstand.s)
    }
}

// MARK: - Jetzt frei

private struct JetztFrei: View {
    @Environment(\.zuTab) private var zuTab
    let frei: Abschnitt<FreiDaten>
    let erneut: Erneut

    var body: some View {
        let karten = frei.wert.map { HomeLogik.jetztFreiKarten($0, jetzt: Date()) } ?? []
        Kopfzeile(titel: "Jetzt frei", link: ("Alle Plätze", nil, { zuTab(.plaetze) }))
        if let f = frei.fehler {
            Fehlerzeile(text: f, laeuft: erneut.laeuft, onErneut: erneut.aktion)
        }
        if frei.wert != nil && karten.isEmpty {
            Leerzustand(text: "Gerade ist kein Platz frei.", handlung: ("Belegung ansehen", { zuTab(.plaetze) }))
        }
        if !karten.isEmpty {
            Wischreihe(abstand: 10) {
                ForEach(karten) { k in
                    Button { zuTab(.plaetze) } label: {
                        VStack(alignment: .leading, spacing: 10) {
                            HStack {
                                Text(k.name)
                                    .font(Schrift.display(.fett, 20))
                                    .foregroundStyle(Farbe.ink)
                                    .lineLimit(1)
                                Spacer(minLength: 4)
                                Circle().fill(Farbe.green).frame(width: 8, height: 8)
                            }
                            Text("frei bis \(k.bis)")
                                .font(Schrift.text(.halbfett, 13))
                                .foregroundStyle(Farbe.greenInk)
                            MiniZeitleiste(segmente: k.segmente, markierung: k.jetzt)
                        }
                        .frame(width: 150 - 28, alignment: .leading)
                        .karte(radius: Tokens.Radius.karte, padding: 14)
                    }
                    .buttonStyle(.plain)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(k.name), frei bis \(k.bis), buchen")
                    .accessibilityAddTraits(.isButton)
                }
            }
        }
    }
}

// MARK: - Offene Spiele

private struct OffeneSpiele: View {
    @Environment(\.zuTab) private var zuTab
    let offen: Abschnitt<[OffenesSpiel]>
    let erneut: Erneut

    var body: some View {
        let liste = HomeLogik.offeneSpiele(offen.wert ?? [])
        let jetzt = Date()
        Kopfzeile(titel: "Offene Spiele", link: ("Alle", "Alle offenen Spiele", { zuTab(.plaetze) }))
        if let f = offen.fehler {
            Fehlerzeile(text: f, laeuft: erneut.laeuft, onErneut: erneut.aktion)
        }
        if offen.wert != nil && liste.isEmpty {
            Leerzustand(text: "Gerade sucht niemand Mitspieler.")
        }
        ForEach(liste) { o in
            let uhr = Zeit.minutesToTime(Zeit.minutesOf(o.startsAt))
            HStack(spacing: 14) {
                VStack(spacing: 0) {
                    Text(Startseite.dayTag(startsAt: o.startsAt, now: jetzt))
                        .font(Schrift.display(.fett, Tokens.Schrift.kicker))
                        .tracking(0.8)
                        .foregroundStyle(Farbe.ink2)
                        .dynamicTypeSize(...DynamicTypeSize.xLarge)
                    Text(uhr)
                        .font(Schrift.display(.fett, 19))
                        .foregroundStyle(Farbe.ink)
                        .dynamicTypeSize(...DynamicTypeSize.xLarge)
                }
                .frame(width: 56, height: 60)
                .background(Farbe.goldSoft, in: RoundedRectangle(cornerRadius: 16))
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .strokeBorder(Farbe.goldLine, style: StrokeStyle(lineWidth: 1.5, dash: [4, 3]))
                )
                VStack(alignment: .leading, spacing: 2) {
                    Text(HomeLogik.offenesSpielTitel(o))
                        .font(Schrift.text(.fett, Tokens.Schrift.normal))
                        .foregroundStyle(Farbe.ink)
                        .lineLimit(1)
                    Text(HomeLogik.offenesSpielZeile(o)).leise().lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if o.binDabei == true {
                    Text("Dabei").font(Schrift.text(.fett, Tokens.Schrift.klein)).foregroundStyle(Farbe.muted)
                } else {
                    Button { zuTab(.plaetze) } label: {
                        Text("Mitspielen")
                            .font(Schrift.text(.fett, 14))
                            .foregroundStyle(Farbe.onGold)
                            .padding(.horizontal, 14)
                            .frame(minHeight: 44)
                            .background(Farbe.gold, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Mitspielen: \(o.typeName ?? "") um \(uhr)")
                }
            }
            .karte(radius: Tokens.Radius.karte, padding: 14)
        }
    }
}

// MARK: - Demnaechst im Verein

private struct DemnaechstImVerein: View {
    @Environment(\.zuVerein) private var zuVerein
    let events: Abschnitt<[MitgliedEvent]>
    let erneut: Erneut

    var body: some View {
        let jetzt = Date()
        let liste = Veranstaltungen.eventDemnaechst(events.wert ?? [], now: jetzt)
        Kopfzeile(titel: "Demnächst im Verein", link: ("Alle", "Alle Veranstaltungen", { zuVerein(.veranstaltungen) }))
        if let f = events.fehler {
            Fehlerzeile(text: f, laeuft: erneut.laeuft, onErneut: erneut.aktion)
        }
        if events.wert != nil && liste.isEmpty {
            Leerzustand(text: "Gerade ist nichts geplant.")
        }
        ForEach(liste) { e in
            EventKarte(e: e, jetzt: jetzt, aufforderung: true) { zuVerein(.veranstaltung(e.id)) }
        }
    }
}

/// Eine Veranstaltung als Karte (EventKarte.tsx)
struct EventKarte: View {
    let e: MitgliedEvent
    let jetzt: Date
    var aufforderung = false
    let aktion: () -> Void

    var body: some View {
        let k = Veranstaltungen.eventDatumKachel(e.startsAt)
        let vorbei = Veranstaltungen.eventVorbei(e, now: jetzt) || e.status == "cancelled"
        let marke = Veranstaltungen.eventMeineMarke(e, now: jetzt, aufforderung: aufforderung)
        let art = e.kind ?? ""
        Button(action: aktion) {
            HStack(alignment: .top, spacing: 14) {
                VStack(spacing: 0) {
                    Text(k.tag).font(Schrift.display(.fett, 21))
                    Text(k.monat).font(Schrift.display(.fett, Tokens.Schrift.kicker)).tracking(0.6).textCase(.uppercase)
                }
                .foregroundStyle(vorbei ? Farbe.ink2 : Farbe.onBrand)
                .dynamicTypeSize(...DynamicTypeSize.xLarge)
                .frame(width: 52, height: 56)
                .background(vorbei ? Farbe.surf2 : Farbe.brand, in: RoundedRectangle(cornerRadius: 14))
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        MarkeKlein(text: Veranstaltungen.kindLabel[art] ?? art, ton: Veranstaltungen.kindTon[art] ?? .grau)
                        if let marke { MarkeKlein(text: marke.text, ton: marke.ton) }
                    }
                    Text(e.title ?? "")
                        .font(Schrift.text(.fett, 17))
                        .foregroundStyle(vorbei ? Farbe.ink2 : Farbe.ink)
                    Text(Veranstaltungen.eventKartenZeit(e)).font(Schrift.text(.normal, 13.5)).foregroundStyle(Farbe.muted)
                    Text(Veranstaltungen.eventKartenZeile(e, now: jetzt))
                        .font(Schrift.text(.fett, 13.5))
                        .foregroundStyle(Farbe.ink)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .karte(radius: Tokens.Radius.karte, padding: 14)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(e.title ?? ""), \(Veranstaltungen.eventKartenZeit(e))\(marke.map { ", \($0.text)" } ?? "")")
        .accessibilityAddTraits(.isButton)
    }
}

/// .marke-klein in den Toenen von EVENT_KIND_TON
struct MarkeKlein: View {
    let text: String
    let ton: EventTon

    var body: some View {
        let (grund, tinte): (Color, Color) = switch ton {
        case .blau: (Farbe.blueSoft, Farbe.blueInk)
        case .gelb: (Farbe.goldSoft, Farbe.goldInk)
        case .gruen: (Farbe.green.opacity(0.16), Farbe.greenInk)
        case .grau: (Farbe.chip, Farbe.ink2)
        case .rot: (Farbe.red.opacity(0.14), Farbe.redInk)
        }
        Text(text)
            .font(Schrift.text(.halbfett, Tokens.Schrift.klein))
            .foregroundStyle(tinte)
            .padding(.vertical, 3)
            .padding(.horizontal, 8)
            .background(grund, in: Capsule())
    }
}

// MARK: - Dein Stand

private struct DeinStandKacheln: View {
    @Environment(\.zuTab) private var zuTab
    @Environment(\.zuVerein) private var zuVerein
    let stand: DeinStand

    var body: some View {
        Kopfzeile(titel: "Dein Stand")
        HStack(alignment: .top, spacing: 10) {
            kachel(titel: stand.getraenkeTitel, label: stand.getraenkeLabel, ziel: .verein) {
                if let f = stand.getraenkeFehler {
                    Text(f).leise().foregroundStyle(Farbe.redInk)
                } else {
                    Text(stand.getraenkeWert ?? "").font(Schrift.display(.fett, 28)).foregroundStyle(Farbe.ink)
                    Text("läuft noch").leise()
                }
            }
            kachel(titel: stand.dienstTitel, label: stand.dienstLabel, ziel: .konto) {
                if let f = stand.dienstFehler {
                    Text(f).leise().foregroundStyle(Farbe.redInk)
                } else if let wert = stand.dienstWert {
                    Text(wert).font(Schrift.display(.fett, 28)).foregroundStyle(Farbe.ink)
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule().fill(Farbe.surf2)
                            Capsule().fill(Farbe.green).frame(width: geo.size.width * stand.dienstAnteil)
                        }
                    }
                    .frame(height: 6)
                    .padding(.top, 6)
                } else {
                    Text("Kein Soll für dieses Jahr.").leise().padding(.top, 4)
                }
            }
        }
    }

    private func kachel<Inhalt: View>(
        titel: String, label: String, ziel: HauptTab, @ViewBuilder inhalt: () -> Inhalt
    ) -> some View {
        Button { ziel == .verein ? zuVerein(.getraenke) : zuTab(ziel) } label: {
            VStack(alignment: .leading, spacing: 4) {
                Text(titel).font(Schrift.text(.halbfett, 13)).foregroundStyle(Farbe.muted)
                inhalt()
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .karte(radius: Tokens.Radius.karte, padding: 16)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
        .accessibilityAddTraits(.isButton)
    }
}

// MARK: - Neuigkeiten

private struct Neuigkeiten: View {
    @Environment(\.zuVerein) private var zuVerein
    let neues: Abschnitt<[Benachrichtigung]>
    let erneut: Erneut
    let alle: () -> Void

    var body: some View {
        let jetzt = Date()
        // Ungelesenes und die letzte Woche; "Alle" fuehrt auch dann zur ganzen
        // Liste, wenn nur noch Aelteres da ist.
        let liste = Startseite.startseitenNeuigkeiten(neues.wert ?? [], now: jetzt)
        Kopfzeile(
            titel: "Neuigkeiten",
            link: HomeLogik.zeigeAlleNeuigkeiten(neues) ? ("Alle", "Alle Neuigkeiten", alle) : nil
        )
        if let f = neues.fehler {
            Fehlerzeile(text: f, laeuft: erneut.laeuft, onErneut: erneut.aktion)
        }
        if neues.wert != nil && liste.isEmpty {
            Leerzustand(text: "Keine Neuigkeiten.")
        }
        if !liste.isEmpty {
            VStack(spacing: 0) {
                ForEach(Array(liste.enumerated()), id: \.element.id) { i, n in
                    if i > 0 { Rectangle().fill(Farbe.line).frame(height: 1) }
                    NachrichtZeile(n: n, neu: n.readAt == nil, jetzt: jetzt, hervorheben: false, zeilen: 3) {
                        zuVerein(.veranstaltung($0))
                    }
                }
            }
            .karte(padding: 0)
        }
    }
}
