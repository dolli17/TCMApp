/**
 * Eine Veranstaltung (apps/mobile/app/(tabs)/verein/veranstaltung/[id].tsx)
 *
 * Weisser Grund (docs/design/stitch): Titel, Eckdaten mit Belegung als Zahl (keine Namen),
 * Beschreibung und darunter die eigene Anmeldung: mit Begleitpersonen und
 * Bemerkung anmelden, aendern, abmelden, Stand auf der Warteliste.
 *
 * Ob es klappt, entscheiden die RPCs; die Knoepfe zeigen nur, was gerade
 * geht. Der Betrag kommt aus der eigenen Forderung (meine_forderung_* in
 * events_fuer_mitglied) - so steht hier dasselbe wie im Konto.
 *
 * Ist der grosse Titel im Kopf hinausgescrollt, steht er klein in der
 * Navigationsleiste (useKompakterTitel in der Expo-App). Die Leiste ist
 * neutral wie der Grund, der Zurueck-Knopf in blueInk.
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
    /// Der grosse Titel ist hinausgescrollt: dann steht er klein in der Leiste.
    @State private var kompakt = false
    /// Eingaben der Anmeldung; hier, weil die Hauptaktion unten fest steht und das Formular im Inhalt.
    @State private var form = AnmeldeForm()

    var body: some View {
        let jetzt = Date()
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Kopf(
                    titel: detail?.event.title,
                    marken: detail.map { VereinLogik.marken($0.event, now: jetzt) } ?? [],
                    kompakt: $kompakt
                )
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
                .tint(Farbe.blue)
            }
        }
        .background(Farbe.bg)
        .refreshable { await laden(nachladen: true) }
        // Die eine Hauptaktion steht unten fest (Entwurf "Veranstaltung Detail"); die Tab-Leiste weicht ihr.
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if let e = detail?.event, let text = hauptaktion(e, jetzt: jetzt) {
                VStack(spacing: 10) {
                    Hauptknopf(text: text, gesperrt: form.laeuft) { absenden(e) }
                    if form.bearbeiten {
                        LeiserKnopf(text: "Abbrechen") { form.bearbeiten = false }
                    }
                }
                .padding(.horizontal, Tokens.Abstand.rand)
                .padding(.top, 12)
                .padding(.bottom, 8)
                .background(Farbe.bg)
                .overlay(alignment: .top) { Farbe.line.frame(height: 1) }
            }
        }
        .toolbar(.hidden, for: .tabBar)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            // Klein in der Leiste erst, wenn der grosse Titel hinausgescrollt ist.
            ToolbarItem(placement: .principal) {
                Text(detail?.event.title ?? "")
                    .font(Schrift.display(.fett, 18))
                    .foregroundStyle(Farbe.ink)
                    .lineLimit(1)
                    .opacity(kompakt ? 1 : 0)
                    .accessibilityHidden(!kompakt)
                    // Die Leiste misst den Titel nur beim Anlegen; ohne neue id bliebe er leer (Laden) bzw. versteckt.
                    .id("\(detail?.event.title ?? "")-\(kompakt)")
            }
        }
        .tint(Farbe.blueInk)
        .toolbarBackground(Farbe.bg, for: .navigationBar)
        .task { await laden(nachladen: false) }
    }

    @ViewBuilder private func inhalt(_ d: VeranstaltungDetail, jetzt: Date) -> some View {
        let e = d.event
        Eckdaten(e: e)

        if let text = e.description, !text.isEmpty {
            Text(text)
                .font(Schrift.text(.normal, Tokens.Schrift.normal))
                .foregroundStyle(Farbe.ink2)
                .lineSpacing(5)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 2)
                .padding(.vertical, 6)
        }

        AnmeldungKarte(detail: d, form: form, meldung: $meldung, tue: tue)
    }

    /// Text der Hauptaktion unten - nil, wenn es gerade nichts abzuschicken gibt.
    private func hauptaktion(_ e: MitgliedEvent, jetzt: Date) -> String? {
        if VereinLogik.dabei(e) {
            return form.bearbeiten ? VereinLogik.aenderungKnopf(e, begleitpersonen: form.begleitung) : nil
        }
        return Veranstaltungen.eventAnmeldbar(e, now: jetzt)
            ? Veranstaltungen.eventAnmeldenKnopf(e, begleitpersonen: form.begleitung) : nil
    }

    private func absenden(_ e: MitgliedEvent) {
        let (b, text, aendern) = (form.begleitung, form.bemerkung, form.bearbeiten)
        tue({ aendern
            ? await $0.aendereAnmeldung(e.id, begleitpersonen: b, bemerkung: text)
            : await $0.meldeAn(e.id, begleitpersonen: b, bemerkung: text)
        }) {}
    }

    private func tue(_ arbeit: @escaping (Vereinsdaten) async -> Ergebnis, danach: @escaping () -> Void) {
        let daten = Vereinsdaten(client: sitzung.client)
        Task {
            form.laeuft = true
            let r = await arbeit(daten)
            form.laeuft = false
            meldung = r
            if r.ok {
                danach()
                await laden(nachladen: false)
            }
        }
    }

    private func laden(nachladen: Bool) async {
        if nachladen { aktualisiert = true }
        do {
            detail = try await Vereinsdaten(client: sitzung.client).veranstaltung(id)
            fehler = nil
            // Aendert sich der eigene Stand, startet das Formular mit dem neuen Stand.
            if let e = detail?.event { form.uebernimm(e) }
        } catch {
            fehler = Meldung.aus(error).text
        }
        laedt = false
        aktualisiert = false
    }
}

// MARK: - Kopf

/// Der grosse Titel unter der Navigationsleiste.
private struct Kopf: View {
    let titel: String?
    var marken: [MeineMarke] = []
    @Binding var kompakt: Bool
    /// Wo der Titel ohne Scrollen steht - Bezug fuer `kompakt`.
    @State private var basis: CGFloat?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Die Art steht als Marke ueber dem Titel.
            if !marken.isEmpty {
                HStack(spacing: 6) {
                    ForEach(marken, id: \.text) { MarkeKlein(text: $0.text, ton: $0.ton) }
                }
            }
            Text(titel ?? " ")
                .font(Schrift.display(.fett, 30, relativeTo: .largeTitle))
                .tracking(Tokens.Schrift.laufweiteTitel)
                .foregroundStyle(Farbe.ink)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
        }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, Tokens.Abstand.rand)
            .padding(.top, 6)
            .padding(.bottom, 4)
            .onGeometryChange(for: CGRect.self) { $0.frame(in: .scrollView) } action: { rahmen in
                let start = basis ?? rahmen.minY
                if basis == nil { basis = start }
                // Kompakt, sobald der Kopf zu zwei Dritteln unter der Leiste liegt.
                kompakt = start - rahmen.minY > rahmen.height * 2 / 3
            }
    }
}

// MARK: - Eckdaten

/// Die Eckdaten als Zeilen mit Linie: links das Etikett, rechts der Wert (Entwurf "Veranstaltung Detail").
private struct Eckdaten: View {
    let e: MitgliedEvent

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Eckdatum(label: "Wann", wert: Veranstaltungen.eventZeitText(startsAt: e.startsAt, endsAt: e.endsAt), fett: true)
            if let ort = e.location, !ort.isEmpty {
                KontoLinie()
                Eckdatum(label: "Ort", wert: ort)
            }
            if let fee = e.feeCents, fee != 0 {
                KontoLinie()
                Eckdatum(label: "Preis", wert: "\(Geld.formatCents(fee)) pro Person", klein: VereinLogik.preisHinweis(e), fett: true)
            }
            if e.kind == "arbeitsdienst", let h = e.workHours {
                KontoLinie()
                Eckdatum(
                    label: "Stunden",
                    wert: "\(Veranstaltungen.stundenText(h)) Std. Arbeitsdienst",
                    klein: "Werden nach dem Termin für alle Anwesenden gutgeschrieben."
                )
            }
            if e.registrationEnabled == true {
                KontoLinie()
                Eckdatum(
                    label: "Anmeldeschluss",
                    wert: Veranstaltungen.eventTagKurz(Veranstaltungen.eventSchluss(e)),
                    klein: (e.feeCents ?? 0) != 0 ? "Wer sich danach abmeldet, zahlt trotzdem." : nil
                )
                KontoLinie()
                Eckdatum(label: "Belegung", wert: Veranstaltungen.eventBelegungText(e), fett: true) {
                    if let anteil = Veranstaltungen.eventBelegungAnteil(e) {
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                Capsule().fill(Farbe.surf2)
                                Capsule().fill(Farbe.blue).frame(width: geo.size.width * anteil)
                            }
                        }
                        .frame(height: 6)
                        .padding(.top, 12)
                        .accessibilityHidden(true)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .karte(padding: 0)
    }
}

private struct Eckdatum<Zusatz: View>: View {
    @Environment(\.dynamicTypeSize) private var textgroesse
    let label: String
    let wert: String
    var klein: String?
    var fett = false
    @ViewBuilder var zusatz: Zusatz

    var body: some View {
        // Bei grosser Schrift steht das Etikett ueber dem Wert.
        let gross = textgroesse >= .xxLarge
        let layout = gross
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 2))
            : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: 16))
        VStack(alignment: .leading, spacing: 0) {
            layout {
                Text(label).kicker()
                VStack(alignment: gross ? .leading : .trailing, spacing: 3) {
                    Text(wert)
                        .font(Schrift.text(fett ? .fett : .normal, Tokens.Schrift.normal))
                        .foregroundStyle(Farbe.ink)
                        .multilineTextAlignment(gross ? .leading : .trailing)
                        .fixedSize(horizontal: false, vertical: true)
                    if let klein {
                        Text(klein)
                            .font(Schrift.text(.normal, 13))
                            .foregroundStyle(Farbe.muted)
                            .multilineTextAlignment(gross ? .leading : .trailing)
                            .lineSpacing(3)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .frame(maxWidth: .infinity, alignment: gross ? .leading : .trailing)
            }
            zusatz
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
        .accessibilityElement(children: .combine)
    }
}

extension Eckdatum where Zusatz == EmptyView {
    init(label: String, wert: String, klein: String? = nil, fett: Bool = false) {
        self.init(label: label, wert: wert, klein: klein, fett: fett) { EmptyView() }
    }
}

// MARK: - Die eigene Anmeldung

/// Die Eingaben der Anmeldung. Das Formular steht im Inhalt, die Hauptaktion unten fest - beide teilen sich das.
@MainActor @Observable
final class AnmeldeForm {
    var begleitung = 0
    var bemerkung = ""
    var bearbeiten = false
    var frage = false
    var laeuft = false
    private var stand: String?

    /// Setzt die Eingaben zurueck, sobald sich der eigene Stand geaendert hat.
    func uebernimm(_ e: MitgliedEvent) {
        let neu = "\(e.meinStatus ?? "")-\(e.meineBegleitpersonen ?? 0)-\(e.meineBemerkung ?? "")-\(e.status ?? "")"
        guard neu != stand else { return }
        stand = neu
        let dabei = VereinLogik.dabei(e)
        begleitung = dabei ? e.meineBegleitpersonen ?? 0 : 0
        bemerkung = dabei ? e.meineBemerkung ?? "" : ""
        bearbeiten = false
        frage = false
    }
}

private struct AnmeldungKarte: View {
    let detail: VeranstaltungDetail
    @Bindable var form: AnmeldeForm
    @Binding var meldung: Ergebnis?
    let tue: (@escaping (Vereinsdaten) async -> Ergebnis, @escaping () -> Void) -> Void

    static let maxBegleitung = 20

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
            .karte(padding: 20)
        } else {
            VStack(alignment: .leading, spacing: Tokens.Abstand.m) {
                hinweis
                Text(VereinLogik.nichtsZuTun(e, now: jetzt)).leise()
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .karte(padding: 20)
        }
    }

    // MARK: Schon dabei

    private func dabeiKarte(jetzt: Date) -> some View {
        let wartet = e.meinStatus == "waitlisted"
        let aendern = Veranstaltungen.eventAenderbar(e, now: jetzt)
        let abmelden = Veranstaltungen.eventAbmeldbar(e, now: jetzt)
        return VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .center, spacing: 14) {
                if !wartet {
                    // Gelb heisst "deins": die eigene Anmeldung.
                    Image(systemName: "checkmark")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(Farbe.onGold)
                        .frame(width: 40, height: 40)
                        .background(Farbe.gold, in: Circle())
                        .accessibilityHidden(true)
                }
                VStack(alignment: .leading, spacing: 3) {
                    titel(wartet ? "Du stehst auf der Warteliste" : "Du bist angemeldet")
                    if !form.bearbeiten {
                        Text(stand(wartet: wartet))
                            .font(Schrift.text(.fett, Tokens.Schrift.normal))
                            .foregroundStyle(Farbe.ink)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            hinweis
            if form.bearbeiten {
                formular(aendern: true)
            } else {
                if wartet {
                    Text(Veranstaltungen.eventWartelisteText(platz: detail.wartePlatz, laenge: e.warteliste ?? 0))
                        .leise()
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let b = e.meineBemerkung, !b.isEmpty {
                    Farbe.line2.frame(height: 1)
                    Text("Bemerkung: \(b)").leise().fixedSize(horizontal: false, vertical: true)
                }
                if form.frage {
                    VStack(alignment: .leading, spacing: 10) {
                        Text(VereinLogik.abmeldenFrage(e, now: jetzt))
                            .font(Schrift.text(.halbfett, Tokens.Schrift.normal))
                            .foregroundStyle(Farbe.ink)
                            .fixedSize(horizontal: false, vertical: true)
                        // Rot gefuellt nur als Bestaetigung, daneben der neutrale Weg zurueck.
                        HStack(spacing: 10) {
                            Knopf("Ja, abmelden", stufe: .gefahr, breit: true, eng: true, gesperrt: form.laeuft) {
                                tue({ [id = e.id] in await $0.meldeAb(id) }) { form.frage = false }
                            }
                            Knopf("Nein", stufe: .leise, eng: true) { form.frage = false }
                        }
                    }
                } else if aendern || abmelden {
                    // Aendern als Pille, Abmelden als roter Verweis daneben.
                    let knoepfe = Group {
                        if aendern {
                            Knopf("Anmeldung ändern") {
                                meldung = nil
                                form.bearbeiten = true
                            }
                        }
                        if abmelden {
                            Button { form.frage = true } label: {
                                Text(Veranstaltungen.eventAbmeldenKnopf(e, now: jetzt))
                                    .font(Schrift.display(.halbfett, 16))
                                    .foregroundStyle(Farbe.redInk)
                                    .multilineTextAlignment(.leading)
                                    .padding(.horizontal, 8)
                                    .frame(minHeight: 44)
                                    .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    ViewThatFits(in: .horizontal) {
                        HStack(spacing: 12) { knoepfe }
                        VStack(alignment: .leading, spacing: 6) { knoepfe }
                    }
                    .padding(.top, 2)
                }
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(wartet ? Farbe.surf2 : Farbe.blueSoft, in: RoundedRectangle(cornerRadius: Tokens.Radius.karte))
        .overlay(
            RoundedRectangle(cornerRadius: Tokens.Radius.karte)
                .strokeBorder(wartet ? Farbe.line2 : Farbe.blue.opacity(0.22), lineWidth: 1)
        )
    }

    /// "2 Personen · 36,00 € offen" - unter dem Titel der Karte
    private func stand(wartet: Bool) -> String {
        let personen = Veranstaltungen.eventPersonenText(e.meineBegleitpersonen ?? 0)
        guard !wartet, let cents = e.meineForderungCents else { return personen }
        return "\(personen) · \(Geld.formatCents(cents)) \(VereinLogik.forderungText(status: e.meineForderungStatus))"
    }

    // MARK: Formular

    /// Begleitpersonen und Bemerkung; abgeschickt wird mit der Hauptaktion unten am Bildschirm.
    private func formular(aendern: Bool) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            if e.companionsAllowed == true {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Begleitpersonen")
                            .font(Schrift.text(.normal, 17))
                            .foregroundStyle(Farbe.ink)
                        Text(VereinLogik.begleitHinweis(e)).leise()
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    HStack(spacing: 4) {
                        Zaehlknopf(zeichen: .minus, beschriftung: "Eine Begleitperson weniger", aus: form.begleitung <= 0) {
                            form.begleitung = max(0, form.begleitung - 1)
                        }
                        Zaehlerstand(
                            wert: form.begleitung,
                            label: "\(form.begleitung) \(form.begleitung == 1 ? "Begleitperson" : "Begleitpersonen")"
                        )
                        Zaehlknopf(
                            zeichen: .plus, betont: form.begleitung > 0, beschriftung: "Eine Begleitperson mehr",
                            aus: form.begleitung >= Self.maxBegleitung
                        ) {
                            form.begleitung = min(Self.maxBegleitung, form.begleitung + 1)
                        }
                    }
                }
            }
            Bemerkungsfeld(text: $form.bemerkung)
            if !aendern && Veranstaltungen.eventNurWarteliste(e, begleitpersonen: form.begleitung) {
                Text(VereinLogik.wartelisteVorab(begleitpersonen: form.begleitung))
                    .leise()
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    // MARK: Bausteine

    private func titel(_ text: String) -> some View {
        Text(text)
            .font(Schrift.display(.fett, Tokens.Schrift.titel, relativeTo: .title2))
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
}

/// Die Bemerkung zur Anmeldung (stil.feldLabel, stil.feld), hoechstens 500 Zeichen.
private struct Bemerkungsfeld: View {
    @Binding var text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text("Bemerkung").kicker().accessibilityHidden(true)
            TextField("", text: $text, prompt: Text("z. B. vegetarisch").foregroundStyle(Farbe.muted))
                .font(Schrift.text(.normal, Tokens.Schrift.normal))
                .foregroundStyle(Farbe.ink)
                .padding(.horizontal, 20)
                .frame(minHeight: 52)
                .background(Farbe.surf2, in: RoundedRectangle(cornerRadius: Tokens.Radius.feld))
                .overlay(RoundedRectangle(cornerRadius: Tokens.Radius.feld).strokeBorder(Farbe.line2, lineWidth: 1))
                .accessibilityLabel("Bemerkung")
                .onChange(of: text) { _, neu in
                    if neu.count > 500 { text = String(neu.prefix(500)) }
                }
        }
    }
}
