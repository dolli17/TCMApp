/**
 * Eine Veranstaltung (apps/mobile/app/(tabs)/verein/veranstaltung/[id].tsx)
 *
 * Blauer Kopf mit Titel, Eckdaten mit Belegung als Zahl (keine Namen),
 * Beschreibung und darunter die eigene Anmeldung: mit Begleitpersonen und
 * Bemerkung anmelden, aendern, abmelden, Stand auf der Warteliste.
 *
 * Ob es klappt, entscheiden die RPCs; die Knoepfe zeigen nur, was gerade
 * geht. Der Betrag kommt aus der eigenen Forderung (meine_forderung_* in
 * events_fuer_mitglied) - so steht hier dasselbe wie im Konto.
 */

import SwiftUI

struct VeranstaltungBildschirm: View {
    @Environment(Sitzung.self) private var sitzung
    let id: String
    @State private var detail: VeranstaltungDetail?
    @State private var fehler: String?
    @State private var laedt = true
    @State private var aktualisiert = false
    /// Hier statt in der Anmeldung: die baut sich nach einer Aenderung neu auf, die Meldung bleibt.
    @State private var meldung: Ergebnis?

    var body: some View {
        let jetzt = Date()
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Kopf(titel: detail?.event.title)
                VStack(alignment: .leading, spacing: Tokens.Abstand.m) {
                    if let fehler {
                        Fehlerzeile(text: fehler, laeuft: aktualisiert) { Task { await laden(nachladen: true) } }
                    }
                    if laedt && detail == nil {
                        ProgressView().tint(Farbe.muted).frame(maxWidth: .infinity).padding(.top, 40)
                    } else if let d = detail {
                        inhalt(d, jetzt: jetzt)
                    } else if fehler == nil {
                        Text("Diese Veranstaltung gibt es nicht (mehr).").leise()
                    }
                }
                .padding(.horizontal, Tokens.Abstand.rand)
                .padding(.top, Tokens.Abstand.rand)
                .padding(.bottom, Tokens.Abstand.abschnitt * 2)
            }
        }
        .background(Farbe.bg)
        .refreshable { await laden(nachladen: true) }
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Farbe.brand, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .task { await laden(nachladen: false) }
    }

    @ViewBuilder private func inhalt(_ d: VeranstaltungDetail, jetzt: Date) -> some View {
        let e = d.event
        HStack(spacing: 6) {
            ForEach(VereinLogik.marken(e, now: jetzt), id: \.text) { MarkeKlein(text: $0.text, ton: $0.ton) }
        }
        Text(Veranstaltungen.eventLangeZeit(startsAt: e.startsAt, endsAt: e.endsAt))
            .font(Schrift.text(.normal, 14))
            .foregroundStyle(Farbe.muted)

        Eckdaten(e: e)

        if let text = e.description, !text.isEmpty {
            Text(text)
                .font(Schrift.text(.normal, Tokens.Schrift.normal))
                .foregroundStyle(Farbe.ink)
                .lineSpacing(5)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                .karte(padding: 16)
        }

        // Neu aufgebaut, wenn sich der eigene Stand aendert: das Formular startet mit dem neuen Stand.
        AnmeldungKarte(detail: d, meldung: $meldung) { await laden(nachladen: false) }
            .id("\(e.meinStatus ?? "")-\(e.meineBegleitpersonen ?? 0)-\(e.meineBemerkung ?? "")-\(e.status ?? "")")
    }

    private func laden(nachladen: Bool) async {
        if nachladen { aktualisiert = true }
        do {
            detail = try await Vereinsdaten(client: sitzung.client).veranstaltung(id)
            fehler = nil
        } catch {
            fehler = Meldung.aus(error).text
        }
        laedt = false
        aktualisiert = false
    }
}

// MARK: - Kopf

/// Der blaue Kopf unter der Navigationsleiste, die ebenfalls blau ist.
private struct Kopf: View {
    let titel: String?

    var body: some View {
        Text(titel ?? " ")
            .font(Schrift.display(.fett, 28, relativeTo: .largeTitle))
            .foregroundStyle(Farbe.onBrand)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, Tokens.Abstand.rand)
            .padding(.top, 6)
            .padding(.bottom, 18)
            .background {
                ZStack {
                    Farbe.brand
                    Platzlinien()
                }
                // Beim Herunterziehen bleibt es oben blau.
                .padding(.top, -400)
            }
            .accessibilityAddTraits(.isHeader)
    }
}

// MARK: - Eckdaten

private struct Eckdaten: View {
    let e: MitgliedEvent

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Eckdatum(label: "Wann", wert: Veranstaltungen.eventZeitText(startsAt: e.startsAt, endsAt: e.endsAt))
            if let ort = e.location, !ort.isEmpty {
                Eckdatum(label: "Ort", wert: ort)
            }
            if let fee = e.feeCents, fee != 0 {
                Eckdatum(label: "Preis", wert: "\(Geld.formatCents(fee)) pro Person", klein: VereinLogik.preisHinweis(e))
            }
            if e.kind == "arbeitsdienst", let h = e.workHours {
                Eckdatum(
                    label: "Stunden",
                    wert: "\(Veranstaltungen.stundenText(h)) Std. Arbeitsdienst",
                    klein: "Werden nach dem Termin für alle Anwesenden gutgeschrieben."
                )
            }
            if e.registrationEnabled == true {
                Eckdatum(
                    label: "Anmeldeschluss",
                    wert: Veranstaltungen.eventTagKurz(Veranstaltungen.eventSchluss(e)),
                    klein: (e.feeCents ?? 0) != 0 ? "Wer sich danach abmeldet, zahlt trotzdem." : nil
                )
                Eckdatum(label: "Belegung", wert: Veranstaltungen.eventBelegungText(e)) {
                    if let anteil = Veranstaltungen.eventBelegungAnteil(e) {
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                Capsule().fill(Farbe.surf2)
                                Capsule().fill(Farbe.green).frame(width: geo.size.width * anteil)
                            }
                        }
                        .frame(height: 8)
                        .padding(.top, 6)
                        .accessibilityHidden(true)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .karte(padding: 16)
    }
}

private struct Eckdatum<Zusatz: View>: View {
    @Environment(\.dynamicTypeSize) private var textgroesse
    let label: String
    let wert: String
    var klein: String?
    @ViewBuilder var zusatz: Zusatz

    var body: some View {
        // Bei grosser Schrift steht das Label ueber dem Wert.
        let layout = textgroesse >= .xxLarge
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 2))
            : AnyLayout(HStackLayout(alignment: .top, spacing: 12))
        layout {
            Text(label)
                .leise()
                .frame(width: textgroesse >= .xxLarge ? nil : 112, alignment: .leading)
            VStack(alignment: .leading, spacing: 2) {
                Text(wert)
                    .font(Schrift.text(.fett, Tokens.Schrift.normal))
                    .foregroundStyle(Farbe.ink)
                    .fixedSize(horizontal: false, vertical: true)
                if let klein {
                    Text(klein)
                        .font(Schrift.text(.normal, 13))
                        .foregroundStyle(Farbe.muted)
                        .lineSpacing(3)
                        .fixedSize(horizontal: false, vertical: true)
                }
                zusatz
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .combine)
    }
}

extension Eckdatum where Zusatz == EmptyView {
    init(label: String, wert: String, klein: String? = nil) {
        self.init(label: label, wert: wert, klein: klein) { EmptyView() }
    }
}

// MARK: - Die eigene Anmeldung

private struct AnmeldungKarte: View {
    @Environment(Sitzung.self) private var sitzung
    @Environment(\.colorScheme) private var schema
    let detail: VeranstaltungDetail
    @Binding var meldung: Ergebnis?
    let nachher: () async -> Void

    @State private var begleitung: Int
    @State private var bemerkung: String
    @State private var bearbeiten = false
    @State private var frage = false
    @State private var laeuft = false

    static let maxBegleitung = 20

    init(detail: VeranstaltungDetail, meldung: Binding<Ergebnis?>, nachher: @escaping () async -> Void) {
        self.detail = detail
        _meldung = meldung
        self.nachher = nachher
        let dabei = VereinLogik.dabei(detail.event)
        _begleitung = State(initialValue: dabei ? detail.event.meineBegleitpersonen ?? 0 : 0)
        _bemerkung = State(initialValue: dabei ? detail.event.meineBemerkung ?? "" : "")
    }

    private var e: MitgliedEvent { detail.event }

    var body: some View {
        let jetzt = Date()
        if VereinLogik.dabei(e) {
            dabeiKarte(jetzt: jetzt)
        } else if Veranstaltungen.eventAnmeldbar(e, now: jetzt) {
            VStack(alignment: .leading, spacing: Tokens.Abstand.m) {
                titel("Anmelden")
                hinweis
                formular(aendern: false)
                if let gebuehr = Veranstaltungen.eventGebuehrHinweis(e) {
                    Text(gebuehr)
                        .font(Schrift.text(.normal, 13))
                        .foregroundStyle(Farbe.muted)
                        .lineSpacing(4)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 4)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .karte(padding: 16)
        } else {
            VStack(alignment: .leading, spacing: Tokens.Abstand.m) {
                hinweis
                Text(VereinLogik.nichtsZuTun(e, now: jetzt)).leise()
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .karte(padding: 16)
        }
    }

    // MARK: Schon dabei

    private func dabeiKarte(jetzt: Date) -> some View {
        let wartet = e.meinStatus == "waitlisted"
        let gruen = Farbe.green
        return VStack(alignment: .leading, spacing: Tokens.Abstand.s) {
            titel(wartet ? "Du stehst auf der Warteliste" : "Du bist angemeldet")
            hinweis
            if bearbeiten {
                formular(aendern: true)
            } else {
                Text(Veranstaltungen.eventPersonenText(e.meineBegleitpersonen ?? 0))
                    .font(Schrift.text(.fett, Tokens.Schrift.normal))
                    .foregroundStyle(Farbe.ink)
                if wartet {
                    Text(Veranstaltungen.eventWartelisteText(platz: detail.wartePlatz, laenge: e.warteliste ?? 0))
                        .leise()
                        .fixedSize(horizontal: false, vertical: true)
                } else if let cents = e.meineForderungCents {
                    (Text(Geld.formatCents(cents)).font(Schrift.display(.fett, 20))
                        + Text(" \(VereinLogik.forderungText(status: e.meineForderungStatus))")
                        .font(Schrift.text(.normal, Tokens.Schrift.normal)))
                        .foregroundStyle(Farbe.ink)
                }
                if let b = e.meineBemerkung, !b.isEmpty {
                    Text("Bemerkung: \(b)").leise()
                }
                if frage {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(VereinLogik.abmeldenFrage(e, now: jetzt))
                            .font(Schrift.text(.halbfett, Tokens.Schrift.normal))
                            .foregroundStyle(Farbe.ink)
                            .fixedSize(horizontal: false, vertical: true)
                        Hauptknopf(text: "Ja, abmelden", rot: true, gesperrt: laeuft) {
                            tue({ await $0.meldeAb(e.id) }) { frage = false }
                        }
                        LeiserKnopf(text: "Nein") { frage = false }
                    }
                    .padding(.top, 6)
                } else {
                    VStack(spacing: 8) {
                        if Veranstaltungen.eventAenderbar(e, now: jetzt) {
                            LeiserKnopf(text: "Anmeldung ändern") {
                                meldung = nil
                                bearbeiten = true
                            }
                        }
                        if Veranstaltungen.eventAbmeldbar(e, now: jetzt) {
                            LeiserKnopf(text: Veranstaltungen.eventAbmeldenKnopf(e, now: jetzt), rot: true) { frage = true }
                        }
                    }
                    .padding(.top, 6)
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            wartet ? Farbe.goldSoft : gruen.opacity(schema == .dark ? 0.16 : 0.1),
            in: RoundedRectangle(cornerRadius: Tokens.Radius.karte)
        )
        .overlay(
            RoundedRectangle(cornerRadius: Tokens.Radius.karte)
                .strokeBorder(wartet ? Farbe.goldLine : gruen.opacity(0.35), lineWidth: 1)
        )
    }

    // MARK: Formular

    private func formular(aendern: Bool) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            if e.companionsAllowed == true {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Begleitpersonen")
                            .font(Schrift.text(.fett, Tokens.Schrift.normal))
                            .foregroundStyle(Farbe.ink)
                        Text(VereinLogik.begleitHinweis(e)).leise()
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    HStack(spacing: 4) {
                        Zaehlknopf(zeichen: .minus, beschriftung: "Eine Begleitperson weniger", aus: begleitung <= 0) {
                            begleitung = max(0, begleitung - 1)
                        }
                        Zaehlerstand(
                            wert: begleitung,
                            label: "\(begleitung) \(begleitung == 1 ? "Begleitperson" : "Begleitpersonen")"
                        )
                        Zaehlknopf(
                            zeichen: .plus, gelb: begleitung > 0, beschriftung: "Eine Begleitperson mehr",
                            aus: begleitung >= Self.maxBegleitung
                        ) {
                            begleitung = min(Self.maxBegleitung, begleitung + 1)
                        }
                    }
                }
            }
            Bemerkungsfeld(text: $bemerkung)
            if !aendern && Veranstaltungen.eventNurWarteliste(e, begleitpersonen: begleitung) {
                Text(VereinLogik.wartelisteVorab(begleitpersonen: begleitung))
                    .leise()
                    .fixedSize(horizontal: false, vertical: true)
            }
            Hauptknopf(
                text: aendern
                    ? VereinLogik.aenderungKnopf(e, begleitpersonen: begleitung)
                    : Veranstaltungen.eventAnmeldenKnopf(e, begleitpersonen: begleitung),
                gesperrt: laeuft
            ) {
                let (b, text) = (begleitung, bemerkung)
                tue({ aendern
                    ? await $0.aendereAnmeldung(e.id, begleitpersonen: b, bemerkung: text)
                    : await $0.meldeAn(e.id, begleitpersonen: b, bemerkung: text)
                }) { bearbeiten = false }
            }
            if aendern {
                LeiserKnopf(text: "Abbrechen") { bearbeiten = false }
            }
        }
    }

    // MARK: Bausteine

    private func titel(_ text: String) -> some View {
        Text(text)
            .font(Schrift.text(.fett, Tokens.Schrift.titel, relativeTo: .title2))
            .tracking(-0.2)
            .foregroundStyle(Farbe.ink)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityAddTraits(.isHeader)
    }

    @ViewBuilder private var hinweis: some View {
        if let meldung {
            KontoHinweis(text: meldung.meldung, ok: meldung.ok)
                .onAppear { UIAccessibility.post(notification: .announcement, argument: meldung.meldung) }
        }
    }

    private func tue(_ arbeit: @escaping (Vereinsdaten) async -> Ergebnis, danach: @escaping () -> Void) {
        let daten = Vereinsdaten(client: sitzung.client)
        Task {
            laeuft = true
            let r = await arbeit(daten)
            laeuft = false
            meldung = r
            if r.ok {
                danach()
                await nachher()
            }
        }
    }
}

/// Die Bemerkung zur Anmeldung (stil.feldLabel, stil.feld), hoechstens 500 Zeichen.
private struct Bemerkungsfeld: View {
    @Binding var text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text("Bemerkung")
                .font(Schrift.text(.halbfett, Tokens.Schrift.klein, relativeTo: .footnote))
                .foregroundStyle(Farbe.ink2)
                .accessibilityHidden(true)
            TextField("", text: $text, prompt: Text("z. B. vegetarisch").foregroundStyle(Farbe.muted))
                .font(Schrift.text(.normal, Tokens.Schrift.normal))
                .foregroundStyle(Farbe.ink)
                .padding(13)
                .frame(minHeight: 50)
                .background(Farbe.surf, in: RoundedRectangle(cornerRadius: Tokens.Radius.feld))
                .overlay(RoundedRectangle(cornerRadius: Tokens.Radius.feld).strokeBorder(Farbe.rahmen, lineWidth: 1.5))
                .accessibilityLabel("Bemerkung")
                .onChange(of: text) { _, neu in
                    if neu.count > 500 { text = String(neu.prefix(500)) }
                }
        }
    }
}

/// Gelber Hauptknopf (stil.knopfGold), rot fuer das Abmelden.
private struct Hauptknopf: View {
    let text: String
    var rot = false
    var gesperrt = false
    let aktion: () -> Void

    var body: some View {
        Button(action: aktion) {
            Text(text)
                .font(Schrift.text(.extrafett, 16))
                .foregroundStyle(rot ? Color.white : Farbe.onGold)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 16)
                .frame(maxWidth: .infinity, minHeight: 52)
                .background(rot ? Farbe.red : Farbe.gold, in: RoundedRectangle(cornerRadius: Tokens.Radius.knopf))
        }
        .buttonStyle(.plain)
        .disabled(gesperrt)
        .opacity(gesperrt ? 0.6 : 1)
    }
}
