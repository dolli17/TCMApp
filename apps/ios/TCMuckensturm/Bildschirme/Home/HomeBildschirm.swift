/**
 * Home - die Startseite (docs/design/stitch, Entwurf "Home"; im Web apps/web/src/app/page.tsx)
 *
 * Bewusst ausgeduennt und einspaltig: der naechste eigene Termin, zwei
 * Aktionen, freie Plaetze, offene Spiele und ein Streifen zur naechsten
 * Veranstaltung. Der laufende Monat steht im Konto, Neuigkeiten hinter der
 * Glocke. Nur Lesen - gebucht und eingetragen wird auf den Bildschirmen, auf
 * die die Knoepfe fuehren: Belegung und Spiele ueber zuPlaetze, Getraenke
 * und Veranstaltungen ueber zuVerein.
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

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Tokens.Abstand.m) {
                    GrosserKopf(titel: HomeLogik.titel(vorname: inhalt?.name?.vorname))
                    if laedt && inhalt == nil {
                        ProgressView().tint(Farbe.muted).frame(maxWidth: .infinity).padding(.top, 40)
                    } else if let d = inhalt {
                        let erneut = Erneut(laeuft: aktualisiert) { Task { await laden(.nachladen) } }
                        AlsNaechstes(termine: d.termine, erneut: erneut)
                        Schnellaktionen()
                        JetztFrei(frei: d.frei, erneut: erneut)
                        OffeneSpiele(
                            offen: d.offen, eigene: HomeLogik.eigeneBuchungen(d.termine.wert ?? []), erneut: erneut
                        )
                        DemnaechstImVerein(events: d.events, erneut: erneut)
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
            events: events
        )
    }
}

/// Was ein Abschnitt braucht, um nach einem Fehler neu zu laden.
struct Erneut {
    let laeuft: Bool
    let aktion: () -> Void
}

// MARK: - Als Naechstes

/// Die eine Karte mit dem naechsten eigenen Termin. Gelb heisst "deins": der Marker mit "in 2 Stunden".
private struct AlsNaechstes: View {
    @Environment(\.zuPlaetze) private var zuPlaetze
    let termine: Abschnitt<[MeineBuchung]>
    let erneut: Erneut

    var body: some View {
        let jetzt = Date()
        let kommende = Startseite.upcomingBookings(termine.wert ?? [], now: jetzt)
        if let f = termine.fehler {
            Fehlerzeile(text: f, laeuft: erneut.laeuft, onErneut: erneut.aktion)
        } else if let t = kommende.first {
            let kicker = HomeLogik.terminKicker(t, jetzt: jetzt)
            Button { zuPlaetze(.spiele(offeneZuerst: false)) } label: {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(alignment: .center, spacing: 10) {
                        Text(kicker.tag).kicker()
                        Spacer(minLength: 0)
                        if let wann = kicker.wann { DeinMarker(wann) }
                    }
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text(Zeit.minutesToTime(Zeit.minutesOf(t.startsAt)))
                            .font(Schrift.display(.fett, Tokens.Schrift.hero, relativeTo: .largeTitle))
                            .tracking(-1.5)
                            .monospacedDigit()
                            .foregroundStyle(Farbe.ink)
                        Text("Uhr").font(Schrift.display(.mittel, 18)).foregroundStyle(Farbe.muted)
                    }
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .padding(.top, 6)
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Image(systemName: "tennis.racket")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(Farbe.blueInk)
                            .accessibilityHidden(true)
                        Text(HomeLogik.terminOrt(t))
                            .font(Schrift.text(.normal, 15.5))
                            .foregroundStyle(Farbe.ink2)
                            .lineLimit(2)
                    }
                    if let weitere = HomeLogik.weitereTermine(kommende.count - 1) {
                        Text(weitere)
                            .font(Schrift.text(.halbfett, 13))
                            .foregroundStyle(Farbe.blueInk)
                            .padding(.top, 6)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 22)
                .padding(.vertical, 20)
                .karte(radius: Tokens.Radius.karteGross, padding: nil)
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(HomeLogik.terminLabel(t, jetzt: jetzt))
            .accessibilityAddTraits(.isButton)
        } else {
            VStack(alignment: .leading, spacing: 4) {
                Text("Heute").kicker()
                Text("Noch nichts geplant")
                    .font(Schrift.display(.fett, 22, relativeTo: .title2))
                    .foregroundStyle(Farbe.ink)
                    .padding(.top, 6)
                Text("Such dir einen Platz – heute ist noch einiges frei.")
                    .font(Schrift.text(.normal, 15))
                    .foregroundStyle(Farbe.ink2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 22)
            .padding(.vertical, 20)
            .karte(radius: Tokens.Radius.karteGross, padding: nil)
            .accessibilityElement(children: .combine)
        }
    }
}

// MARK: - Die zwei Aktionen

/// "Platz buchen" ist die eine Hauptaktion der Startseite (blau), "Getränk eintragen" die zweite (hellblau).
private struct Schnellaktionen: View {
    @Environment(\.zuPlaetze) private var zuPlaetze
    @Environment(\.zuVerein) private var zuVerein
    @Environment(\.dynamicTypeSize) private var textgroesse

    var body: some View {
        // Bei grosser Schrift untereinander (U5).
        let layout = textgroesse >= .xxLarge ? AnyLayout(VStackLayout(spacing: 12)) : AnyLayout(HStackLayout(spacing: 12))
        layout {
            Knopf("Platz buchen", symbol: "plus.circle", stufe: .haupt, groesse: .gross, breit: true, eng: true) { zuPlaetze(.belegung) }
            Knopf("Getränk eintragen", symbol: "wineglass", groesse: .gross, breit: true, eng: true) { zuVerein(.getraenke) }
        }
        .padding(.top, 4)
    }
}

// MARK: - Jetzt frei

private struct JetztFrei: View {
    @Environment(\.zuPlaetze) private var zuPlaetze
    let frei: Abschnitt<FreiDaten>
    let erneut: Erneut

    var body: some View {
        let karten = frei.wert.map { HomeLogik.jetztFreiKarten($0, jetzt: Date()) } ?? []
        Kopfzeile(titel: "Jetzt frei", zaehler: karten.isEmpty ? nil : HomeLogik.freiZaehler(karten.count))
        if let f = frei.fehler {
            Fehlerzeile(text: f, laeuft: erneut.laeuft, onErneut: erneut.aktion)
        }
        if frei.wert != nil && karten.isEmpty {
            Leerzustand(text: "Gerade ist kein Platz frei.", handlung: ("Belegung ansehen", { zuPlaetze(.belegung) }))
        }
        if !karten.isEmpty {
            VStack(spacing: 0) {
                ForEach(Array(karten.enumerated()), id: \.element.id) { i, k in
                    if i > 0 { Rectangle().fill(Farbe.line).frame(height: 1) }
                    Button { zuPlaetze(.belegung) } label: {
                        HStack(spacing: 14) {
                            Circle().fill(Farbe.blue).frame(width: 8, height: 8)
                            Text(k.name)
                                .font(Schrift.display(.halbfett, 17))
                                .foregroundStyle(Farbe.ink)
                                .lineLimit(1)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            Text("frei bis \(k.bis)")
                                .font(Schrift.text(.normal, 14.5))
                                .monospacedDigit()
                                .foregroundStyle(Farbe.muted)
                        }
                        .padding(.horizontal, 20)
                        .frame(minHeight: 56)
                    }
                    .buttonStyle(ZeilenDruck())
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(k.name), frei bis \(k.bis), buchen")
                    .accessibilityAddTraits(.isButton)
                }
            }
            .karte(radius: Tokens.Radius.karte, padding: 0)
        }
    }
}

// MARK: - Offene Spiele

private struct OffeneSpiele: View {
    @Environment(\.zuPlaetze) private var zuPlaetze
    let offen: Abschnitt<[OffenesSpiel]>
    /// Buchungen, die man selbst angelegt hat
    let eigene: Set<String>
    let erneut: Erneut

    var body: some View {
        let liste = HomeLogik.offeneSpiele(offen.wert ?? [])
        let jetzt = Date()
        Kopfzeile(titel: "Offene Spiele", zaehler: "Mitspieler gesucht")
        if let f = offen.fehler {
            Fehlerzeile(text: f, laeuft: erneut.laeuft, onErneut: erneut.aktion)
        }
        if offen.wert != nil && liste.isEmpty {
            Leerzustand(text: "Gerade sucht niemand Mitspieler.")
        }
        ForEach(liste) { o in
            let wann = HomeLogik.offenesSpielWann(o, jetzt: jetzt)
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    ViewThatFits(in: .horizontal) {
                        HStack(spacing: 8) { wannText(wann); BlaueMarke(o.typeName ?? "") }
                        VStack(alignment: .leading, spacing: 4) { wannText(wann); BlaueMarke(o.typeName ?? "") }
                    }
                    Text(HomeLogik.offenesSpielZeile(o, eigenes: eigene.contains(o.bookingId)))
                        .font(Schrift.text(.normal, 14))
                        .foregroundStyle(Farbe.ink2)
                        .lineLimit(1)
                    if let zusatz = SpieleLogik.filterZusatz(o) {
                        Text(zusatz)
                            .font(Schrift.text(.halbfett, Tokens.Schrift.klein))
                            .foregroundStyle(Farbe.blueInk)
                            .lineLimit(1)
                            .accessibilityLabel("Nur für \(o.suchfilter.vorleseText)")
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if o.binDabei == true {
                    // Gelb heisst "deins".
                    DeinMarker("Du bist dabei")
                } else {
                    Knopf("Mitspielen", groesse: .klein) { zuPlaetze(.spiele(offeneZuerst: true)) }
                        .accessibilityLabel("Mitspielen: \(o.typeName ?? ""), \(wann)")
                }
            }
            .padding(.leading, 20)
            .padding(.trailing, 16)
            .padding(.vertical, 14)
            .karte(radius: Tokens.Radius.karte, padding: nil)
        }
    }

    private func wannText(_ wann: String) -> some View {
        Text(wann)
            .font(Schrift.display(.halbfett, 16))
            .monospacedDigit()
            .foregroundStyle(Farbe.ink)
            .lineLimit(1)
    }
}

// MARK: - Demnaechst im Verein

/// Ein Streifen zur naechsten Veranstaltung; der Rest steht unter Verein.
private struct DemnaechstImVerein: View {
    @Environment(\.zuVerein) private var zuVerein
    let events: Abschnitt<[MitgliedEvent]>
    let erneut: Erneut

    var body: some View {
        if let f = events.fehler {
            Fehlerzeile(text: f, laeuft: erneut.laeuft, onErneut: erneut.aktion)
        } else if let e = Veranstaltungen.eventDemnaechst(events.wert ?? [], now: Date()).first {
            let streifen = HomeLogik.eventStreifen(e)
            Button { zuVerein(.veranstaltung(e.id)) } label: {
                HStack(spacing: 12) {
                    Image(systemName: "calendar")
                        .font(.system(size: 18, weight: .medium))
                        .foregroundStyle(Farbe.blueInk)
                        .accessibilityHidden(true)
                    (Text("\(streifen.datum) · ").font(Schrift.text(.normal, 14.5))
                        + Text(streifen.titel).font(Schrift.text(.fett, 14.5)))
                        .foregroundStyle(Farbe.ink)
                        .multilineTextAlignment(.leading)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 10)
                .frame(minHeight: 52)
                .background(Farbe.blueSoft, in: RoundedRectangle(cornerRadius: 26))
                .overlay(RoundedRectangle(cornerRadius: 26).strokeBorder(Farbe.blue.opacity(0.22), lineWidth: 1))
            }
            .buttonStyle(.plain)
            .padding(.top, Tokens.Abstand.abschnitt - Tokens.Abstand.m)
            .accessibilityLabel("Demnächst im Verein: \(streifen.datum), \(streifen.titel)")
        }
    }
}
