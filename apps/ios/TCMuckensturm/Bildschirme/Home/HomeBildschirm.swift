/**
 * Home - die Startseite im Stil der Apple Human Interface Guidelines
 * (im Web apps/web/src/app/page.tsx)
 *
 * Eine eingerueckte, gruppierte Liste wie in den iOS-Einstellungen: grosser
 * Titel in der Navigationsleiste, der beim Scrollen schrumpft, die Glocke
 * rechts daneben, Systemschrift mit Textstilen (Dynamic Type), SF Symbols.
 * Die Farben bleiben die des Vereins (Tokens): Blau fuer Aktionen, Gelb
 * fuer "deins".
 *
 * Inhalt wie bisher: der naechste eigene Termin, zwei Aktionen, freie
 * Plaetze, offene Spiele und die naechste Veranstaltung. Nur Lesen -
 * gebucht und eingetragen wird auf den Bildschirmen, auf die die Zeilen
 * fuehren (zuPlaetze, zuVerein).
 *
 * Alle Abschnitte laden parallel und jeder fuer sich: schlaegt einer fehl,
 * steht dort der Fehler, und der Rest bleibt gefuellt.
 */

import SwiftUI

struct HomeBildschirm: View {
    @Environment(Sitzung.self) private var sitzung
    @State private var inhalt: HomeInhalt?
    @State private var laedt = true
    @State private var aktualisiert = false

    var body: some View {
        NavigationStack {
            List {
                if laedt && inhalt == nil {
                    Section {
                        ProgressView().tint(Farbe.muted).frame(maxWidth: .infinity).padding(.vertical, 24)
                    }
                    .listRowBackground(Color.clear)
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
                    Section { Text("Die Startseite konnte nicht geladen werden.").foregroundStyle(Farbe.muted) }
                }
            }
            .gruppenListe()
            .refreshable { await laden(.nachladen) }
            .navigationTitle(HomeLogik.titel(vorname: inhalt?.name?.vorname))
            .navigationBarTitleDisplayMode(.large)
            .titelUnterzeile(HomeLogik.datumszeile(Date()))
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { Glocke(schlicht: true) }
            }
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

/// Der naechste eigene Termin. Gelb heisst "deins": der Marker mit "in 2 Stunden".
private struct AlsNaechstes: View {
    @Environment(\.zuPlaetze) private var zuPlaetze
    let termine: Abschnitt<[MeineBuchung]>
    let erneut: Erneut

    var body: some View {
        let jetzt = Date()
        let kommende = Startseite.upcomingBookings(termine.wert ?? [], now: jetzt)
        Section {
            if let f = termine.fehler {
                FehlerZeile(text: f, erneut: erneut).gruppenZeile()
            } else if let t = kommende.first {
                let kicker = HomeLogik.terminKicker(t, jetzt: jetzt)
                Button { zuPlaetze(.spiele(offeneZuerst: false)) } label: {
                    HStack(alignment: .center, spacing: 14) {
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(alignment: .firstTextBaseline, spacing: 4) {
                                Text(Zeit.minutesToTime(Zeit.minutesOf(t.startsAt)))
                                    .font(.system(.largeTitle, weight: .bold))
                                    .monospacedDigit()
                                    .foregroundStyle(Farbe.ink)
                                Text("Uhr").font(.title3).foregroundStyle(Farbe.muted)
                            }
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                            Label(HomeLogik.terminOrt(t), systemImage: "tennis.racket")
                                .font(.subheadline)
                                .foregroundStyle(Farbe.ink2)
                                .lineLimit(2)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        if let wann = kicker.wann { DeinMarker(wann) }
                        ZeilenPfeil()
                    }
                    .padding(.vertical, 6)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .gruppenZeile()
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(HomeLogik.terminLabel(t, jetzt: jetzt))
                .accessibilityAddTraits(.isButton)
            } else {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Noch nichts geplant").font(.headline).foregroundStyle(Farbe.ink)
                    Text("Such dir einen Platz – heute ist noch einiges frei.")
                        .font(.subheadline)
                        .foregroundStyle(Farbe.muted)
                }
                .padding(.vertical, 4)
                .gruppenZeile()
                .accessibilityElement(children: .combine)
            }
        } header: {
            GruppenKopf(
                titel: kommende.first.map { HomeLogik.terminKicker($0, jetzt: jetzt).tag } ?? "Heute",
                verweis: kommende.isEmpty ? nil : "Meine Spiele"
            ) { zuPlaetze(.spiele(offeneZuerst: false)) }
        } footer: {
            if let weitere = HomeLogik.weitereTermine(kommende.count - 1) {
                Text(weitere).foregroundStyle(Farbe.muted)
            }
        }
    }
}

// MARK: - Die zwei Aktionen

/// "Platz buchen" ist die eine Hauptaktion (gefuellt blau), "Getränk eintragen" die zweite (getoent).
private struct Schnellaktionen: View {
    @Environment(\.zuPlaetze) private var zuPlaetze
    @Environment(\.zuVerein) private var zuVerein
    @Environment(\.dynamicTypeSize) private var textgroesse

    var body: some View {
        Section {
            // Bei grosser Schrift untereinander (U5).
            let layout = textgroesse >= .xxLarge ? AnyLayout(VStackLayout(spacing: 12)) : AnyLayout(HStackLayout(spacing: 12))
            layout {
                Button { zuPlaetze(.belegung) } label: { aktion("Platz buchen", symbol: "plus") }
                    .buttonStyle(.borderedProminent)
                Button { zuVerein(.getraenke) } label: { aktion("Getränk", symbol: "wineglass") }
                    .buttonStyle(.bordered)
                    .accessibilityLabel("Getränk eintragen")
            }
            .font(.body.weight(.semibold))
            .controlSize(.large)
            .tint(Farbe.blue)
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)
        }
    }

    /// Symbol und Text in einer Zeile, beide Knoepfe gleich breit und hoch.
    private func aktion(_ text: String, symbol: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: symbol).accessibilityHidden(true)
            Text(text).lineLimit(1).minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, minHeight: 28)
    }
}

// MARK: - Jetzt frei

private struct JetztFrei: View {
    @Environment(\.zuPlaetze) private var zuPlaetze
    let frei: Abschnitt<FreiDaten>
    let erneut: Erneut

    var body: some View {
        let karten = frei.wert.map { HomeLogik.jetztFreiKarten($0, jetzt: Date()) } ?? []
        Section {
            if let f = frei.fehler {
                FehlerZeile(text: f, erneut: erneut).gruppenZeile()
            }
            if frei.wert != nil && karten.isEmpty {
                Button { zuPlaetze(.belegung) } label: {
                    HStack {
                        Text("Gerade ist kein Platz frei.").foregroundStyle(Farbe.muted)
                        Spacer()
                        Text("Belegung").foregroundStyle(Farbe.blueInk)
                        ZeilenPfeil()
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .gruppenZeile()
            }
            // Hoechstens drei, damit die offenen Spiele im Bild bleiben; der Rest steht in der Belegung.
            ForEach(karten.prefix(3)) { k in
                Button { zuPlaetze(.belegung) } label: {
                    HStack(spacing: 12) {
                        Circle().fill(Farbe.blue).frame(width: 8, height: 8).accessibilityHidden(true)
                        Text(k.name)
                            .foregroundStyle(Farbe.ink)
                            .lineLimit(1)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        Text("frei bis \(k.bis)")
                            .monospacedDigit()
                            .foregroundStyle(Farbe.muted)
                        ZeilenPfeil()
                    }
                    .frame(minHeight: 32)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .gruppenZeile()
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(k.name), frei bis \(k.bis), buchen")
                .accessibilityAddTraits(.isButton)
            }
        } header: {
            GruppenKopf(
                titel: "Jetzt frei",
                zusatz: karten.isEmpty ? nil : HomeLogik.freiZaehler(karten.count),
                verweis: karten.count > 3 ? "Alle \(karten.count) anzeigen" : nil
            ) { zuPlaetze(.belegung) }
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
        Section {
            if let f = offen.fehler {
                FehlerZeile(text: f, erneut: erneut).gruppenZeile()
            }
            if offen.wert != nil && liste.isEmpty {
                Text("Gerade sucht niemand Mitspieler.").foregroundStyle(Farbe.muted).gruppenZeile()
            }
            ForEach(liste) { o in
                let wann = HomeLogik.offenesSpielWann(o, jetzt: jetzt)
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(wann)
                            .font(.headline)
                            .monospacedDigit()
                            .foregroundStyle(Farbe.ink)
                            .lineLimit(1)
                        Text([o.typeName, HomeLogik.offenesSpielZeile(o, eigenes: eigene.contains(o.bookingId))]
                            .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                            .font(.subheadline)
                            .foregroundStyle(Farbe.ink2)
                            .lineLimit(1)
                        if let zusatz = SpieleLogik.filterZusatz(o) {
                            Text(zusatz)
                                .font(.footnote.weight(.semibold))
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
                        Button("Mitspielen") { zuPlaetze(.spiele(offeneZuerst: true)) }
                            .font(.subheadline.weight(.semibold))
                            .buttonStyle(.bordered)
                            .buttonBorderShape(.capsule)
                            .tint(Farbe.blue)
                            .accessibilityLabel("Mitspielen: \(o.typeName ?? ""), \(wann)")
                    }
                }
                .padding(.vertical, 4)
                .gruppenZeile()
            }
        } header: {
            GruppenKopf(titel: "Offene Spiele", verweis: liste.isEmpty ? nil : "Alle anzeigen") {
                zuPlaetze(.spiele(offeneZuerst: true))
            }
        }
    }
}

// MARK: - Demnaechst im Verein

/// Die naechste Veranstaltung; der Rest steht unter Verein.
private struct DemnaechstImVerein: View {
    @Environment(\.zuVerein) private var zuVerein
    let events: Abschnitt<[MitgliedEvent]>
    let erneut: Erneut

    var body: some View {
        if let f = events.fehler {
            Section { FehlerZeile(text: f, erneut: erneut).gruppenZeile() } header: { GruppenKopf(titel: "Demnächst im Verein") }
        } else if let e = Veranstaltungen.eventDemnaechst(events.wert ?? [], now: Date()).first {
            let streifen = HomeLogik.eventStreifen(e)
            Section {
                Button { zuVerein(.veranstaltung(e.id)) } label: {
                    HStack(spacing: 14) {
                        Image(systemName: "calendar")
                            .font(.body.weight(.semibold))
                            .foregroundStyle(.white)
                            .frame(width: 30, height: 30)
                            .background(Farbe.blue, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
                            .accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(streifen.titel).foregroundStyle(Farbe.ink)
                            Text(streifen.datum).font(.subheadline).foregroundStyle(Farbe.muted)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        ZeilenPfeil()
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .gruppenZeile()
                .accessibilityLabel("Demnächst im Verein: \(streifen.datum), \(streifen.titel)")
            } header: {
                GruppenKopf(titel: "Demnächst im Verein")
            }
        }
    }
}
