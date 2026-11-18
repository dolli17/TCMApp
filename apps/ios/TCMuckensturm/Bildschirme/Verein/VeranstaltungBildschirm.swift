/**
 * Eine Veranstaltung (apps/mobile/app/(tabs)/verein/veranstaltung/[id].tsx)
 *
 * Gestaltet wie Apples App Einladungen: oben gross Titel und Datum, darunter
 * "Zum Kalender" und "Teilen", dann die Eckdaten als Zeilen mit Symbolen,
 * die Beschreibung und der eigene Stand. Angemeldet wird ueber den Knopf
 * unten; er oeffnet die Anmeldekarte (AnmeldeKarte) mit ✕ und ✓. Wer schon
 * dabei ist, sieht oben gelb seinen Stand ("deins"), kann die Anmeldung
 * aendern oder sich ueber ein Action Sheet abmelden.
 *
 * Ob es klappt, entscheiden die RPCs; die Knoepfe zeigen nur, was gerade
 * geht. Der Betrag kommt aus der eigenen Forderung (meine_forderung_* in
 * events_fuer_mitglied) - so steht hier dasselbe wie im Konto.
 */

import EventKit
import EventKitUI
import SwiftUI

struct VeranstaltungBildschirm: View {
    @Environment(Sitzung.self) private var sitzung
    let id: String
    @State private var detail: VeranstaltungDetail?
    @State private var fehler: String?
    @State private var laedt = true
    @State private var aktualisiert = false
    @State private var meldung: Ergebnis?
    /// Die Anmeldekarte: neu anmelden oder die bestehende Anmeldung aendern.
    @State private var karte: AnmeldeKarte.Art?
    @State private var abmeldeFrage = false
    @State private var laeuft = false
    @State private var kalender = false

    var body: some View {
        let jetzt = Date()
        List {
            if let fehler {
                Section {
                    FehlerZeile(text: fehler, erneut: Erneut(laeuft: aktualisiert) { Task { await laden(nachladen: true) } })
                        .gruppenZeile()
                }
            }
            if laedt && detail == nil {
                Section {
                    ProgressView().tint(Farbe.muted).frame(maxWidth: .infinity).padding(.vertical, 24)
                }
                .listRowBackground(Color.clear)
            } else if let d = detail {
                inhalt(d, jetzt: jetzt)
            } else if fehler == nil {
                Section {
                    Text("Diese Veranstaltung gibt es nicht (mehr).").foregroundStyle(Farbe.muted).gruppenZeile()
                }
            }
        }
        .gruppenListe()
        .listSectionSpacing(20)
        .refreshable { await laden(nachladen: true) }
        // Die eine Hauptaktion steht unten fest; die Tab-Leiste weicht ihr.
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if let e = detail?.event, !VereinLogik.dabei(e), Veranstaltungen.eventAnmeldbar(e, now: jetzt) {
                Button { meldung = nil; karte = .neu } label: {
                    Text(Veranstaltungen.eventNurWarteliste(e, begleitpersonen: 0) ? "Auf die Warteliste" : "Anmelden")
                        .font(.headline)
                        .frame(maxWidth: .infinity, minHeight: 50)
                }
                .buttonStyle(.borderedProminent)
                .buttonBorderShape(.capsule)
                .tint(Farbe.blue)
                .padding(.horizontal, Tokens.Abstand.rand)
                .padding(.top, 10)
                .padding(.bottom, 8)
                .background(.bar)
            }
        }
        .toolbar(.hidden, for: .tabBar)
        .navigationTitle(detail?.event.title ?? "")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $karte) { art in
            if let e = detail?.event {
                AnmeldeKarte(e: e, art: art) { r in
                    meldung = r
                    Task { await laden(nachladen: false) }
                }
            }
        }
        .sheet(isPresented: $kalender) {
            if let e = detail?.event { KalenderBlatt(e: e).ignoresSafeArea() }
        }
        .confirmationDialog(
            detail.map { VereinLogik.abmeldenFrage($0.event, now: jetzt) } ?? "",
            isPresented: $abmeldeFrage,
            titleVisibility: .visible
        ) {
            if let e = detail?.event {
                Button(Veranstaltungen.eventAbmeldenKnopf(e, now: jetzt), role: .destructive) { abmelden(e.id) }
            }
            Button("Abbrechen", role: .cancel) {}
        }
        .sensoryFeedback(trigger: meldung) { _, neu in
            guard let neu else { return nil }
            return neu.ok ? .success : .error
        }
        .task { await laden(nachladen: false) }
        #if DEBUG
        // Fuer Bildschirmfotos per simctl (README): `-TCMAnmeldeKarte` oeffnet die Karte nach dem Laden.
        .task(id: detail == nil) {
            if detail != nil, ProcessInfo.processInfo.arguments.contains("-TCMAnmeldeKarte") {
                try? await Task.sleep(for: .milliseconds(400))
                karte = VereinLogik.dabei(detail!.event) ? .aendern : .neu
            }
        }
        #endif
    }

    @ViewBuilder private func inhalt(_ d: VeranstaltungDetail, jetzt: Date) -> some View {
        let e = d.event
        let dabei = VereinLogik.dabei(e)
        Section {
            Kopf(e: e, jetzt: jetzt)
        }
        .listRowInsets(EdgeInsets(top: 4, leading: 4, bottom: 4, trailing: 4))
        .listRowBackground(Color.clear)

        Section {
            HStack(spacing: 10) {
                AktionsKachel(titel: "Zum Kalender", symbol: "calendar.badge.plus") { kalender = true }
                ShareLink(item: VereinLogik.teilenText(e)) {
                    AktionsKachelInhalt(titel: "Teilen", symbol: "square.and.arrow.up")
                }
                .buttonStyle(.plain)
            }
        }
        .listRowInsets(EdgeInsets())
        .listRowBackground(Color.clear)

        if let meldung {
            Section {
                Label(meldung.meldung, systemImage: meldung.ok ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                    .foregroundStyle(meldung.ok ? Farbe.greenInk : Farbe.redInk)
                    .gruppenZeile()
                    .onAppear { UIAccessibility.post(notification: .announcement, argument: meldung.meldung) }
            }
        }

        if dabei {
            meinStand(d, jetzt: jetzt)
        }

        Section {
            Eckdaten(e: e)
        } header: {
            GruppenKopf(titel: "Details")
        }

        if let text = Platzplan.nichtLeer(e.description) {
            Section {
                Text(text)
                    .foregroundStyle(Farbe.ink2)
                    .lineSpacing(3)
                    .padding(.vertical, 4)
                    .gruppenZeile()
            } header: {
                GruppenKopf(titel: "Beschreibung")
            }
        }

        if !dabei && !Veranstaltungen.eventAnmeldbar(e, now: jetzt) {
            Section {
                Text(VereinLogik.nichtsZuTun(e, now: jetzt)).foregroundStyle(Farbe.muted).gruppenZeile()
            }
        } else if !dabei, let gebuehr = Veranstaltungen.eventGebuehrHinweis(e) {
            Section {} footer: { Text(gebuehr).foregroundStyle(Farbe.muted) }
        }
    }

    // MARK: - Der eigene Stand

    @ViewBuilder private func meinStand(_ d: VeranstaltungDetail, jetzt: Date) -> some View {
        let e = d.event
        let wartet = e.meinStatus == "waitlisted"
        let aendern = Veranstaltungen.eventAenderbar(e, now: jetzt)
        let abmelden = Veranstaltungen.eventAbmeldbar(e, now: jetzt)
        Section {
            HStack(spacing: 12) {
                Image(systemName: wartet ? "hourglass" : "checkmark")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(wartet ? Farbe.ink2 : Farbe.onGold)
                    .frame(width: 32, height: 32)
                    // Gelb heisst "deins": die eigene Anmeldung.
                    .background(wartet ? Farbe.surf3 : Farbe.gold, in: Circle())
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(wartet ? "Du stehst auf der Warteliste" : "Du bist angemeldet")
                        .font(.headline)
                        .foregroundStyle(Farbe.ink)
                    Text(standText(e, wartet: wartet)).font(.subheadline).foregroundStyle(Farbe.ink2)
                }
            }
            .padding(.vertical, 4)
            .gruppenZeile()
            .accessibilityElement(children: .combine)
            if wartet {
                Text(Veranstaltungen.eventWartelisteText(platz: d.wartePlatz, laenge: e.warteliste ?? 0))
                    .font(.subheadline)
                    .foregroundStyle(Farbe.muted)
                    .gruppenZeile()
            }
            if let b = Platzplan.nichtLeer(e.meineBemerkung) {
                LabeledContent("Bemerkung") { Text(b).foregroundStyle(Farbe.ink2) }
                    .gruppenZeile()
            }
            if aendern {
                Button("Anmeldung ändern") { meldung = nil; karte = .aendern }
                    .foregroundStyle(Farbe.blueInk)
                    .gruppenZeile()
            }
            if abmelden {
                Button(role: .destructive) { abmeldeFrage = true } label: {
                    HStack {
                        Text(Veranstaltungen.eventAbmeldenKnopf(e, now: jetzt))
                        if laeuft { Spacer(); ProgressView() }
                    }
                }
                .disabled(laeuft)
                .gruppenZeile()
            }
        } header: {
            GruppenKopf(titel: "Deine Anmeldung")
        }
    }

    /// "Du + 1 Begleitperson · 36,00 € offen"
    private func standText(_ e: MitgliedEvent, wartet: Bool) -> String {
        let personen = Veranstaltungen.eventPersonenText(e.meineBegleitpersonen ?? 0)
        guard !wartet, let cents = e.meineForderungCents else { return personen }
        return "\(personen) · \(Geld.formatCents(cents)) \(VereinLogik.forderungText(status: e.meineForderungStatus))"
    }

    // MARK: - Handlungen

    private func abmelden(_ id: String) {
        let daten = Vereinsdaten(client: sitzung.client)
        Task {
            laeuft = true
            let r = await daten.meldeAb(id)
            laeuft = false
            meldung = r
            if r.ok { await laden(nachladen: false) }
        }
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

/// Gross Titel und Datum wie in Einladungen; darueber klein die Art, bei Absage rot.
private struct Kopf: View {
    let e: MitgliedEvent
    let jetzt: Date

    var body: some View {
        let abgesagt = e.status == "cancelled"
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Text(Veranstaltungen.kindLabel[e.kind ?? ""] ?? "Veranstaltung")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Farbe.blueInk)
                if abgesagt {
                    Text("· Abgesagt").font(.subheadline.weight(.semibold)).foregroundStyle(Farbe.redInk)
                } else if Veranstaltungen.eventVorbei(e, now: jetzt) {
                    Text("· Vorbei").font(.subheadline.weight(.semibold)).foregroundStyle(Farbe.muted)
                }
            }
            Text(e.title ?? "")
                .font(.largeTitle.weight(.bold))
                .foregroundStyle(Farbe.ink)
                .strikethrough(abgesagt)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            Text(Veranstaltungen.eventZeitText(startsAt: e.startsAt, endsAt: e.endsAt))
                .font(.title3)
                .foregroundStyle(Farbe.ink2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Zwei gleich breite Kacheln unter dem Kopf, wie die Aktionsreihe der Buchungskarte.
private struct AktionsKachel: View {
    let titel: String
    let symbol: String
    let aktion: () -> Void

    var body: some View {
        Button(action: aktion) { AktionsKachelInhalt(titel: titel, symbol: symbol) }
            .buttonStyle(.plain)
    }
}

private struct AktionsKachelInhalt: View {
    let titel: String
    let symbol: String

    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: symbol).font(.title3).frame(height: 26)
            Text(titel).font(.footnote.weight(.semibold))
        }
        .foregroundStyle(Farbe.blueInk)
        .frame(maxWidth: .infinity, minHeight: 64)
        .background(Farbe.surf, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .contentShape(Rectangle())
    }
}

// MARK: - Eckdaten

/// Die Eckdaten als Zeilen mit Symbol-Kachel, wie in Einladungen und Kalender.
private struct Eckdaten: View {
    let e: MitgliedEvent

    var body: some View {
        if let ort = Platzplan.nichtLeer(e.location) {
            let url = URL(string: "maps://?q=\(ort.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")")
            if let url {
                Link(destination: url) {
                    HStack {
                        Zeile.inhalt(symbol: "map.fill", farbe: Farbe.blue, titel: ort, zusatz: "In Karten öffnen")
                        ZeilenPfeil()
                    }
                }
                .buttonStyle(.plain)
                .gruppenZeile()
            }
        }
        if let fee = e.feeCents, fee != 0 {
            Zeile(symbol: "eurosign", farbe: Farbe.gold, titel: "\(Geld.formatCents(fee)) pro Person", zusatz: VereinLogik.preisHinweis(e))
        }
        if e.kind == "arbeitsdienst", let h = e.workHours {
            Zeile(
                symbol: "wrench.and.screwdriver.fill", farbe: Farbe.blue,
                titel: "\(Veranstaltungen.stundenText(h)) h Arbeitsdienst",
                zusatz: "Werden nach dem Termin für alle Anwesenden gutgeschrieben."
            )
        }
        if e.registrationEnabled == true {
            Zeile(
                symbol: "hourglass", farbe: Farbe.muted,
                titel: "Anmeldung bis \(Veranstaltungen.eventTagKurz(Veranstaltungen.eventSchluss(e)))",
                zusatz: (e.feeCents ?? 0) != 0 ? "Wer sich danach abmeldet, zahlt trotzdem." : nil
            )
            VStack(alignment: .leading, spacing: 8) {
                Zeile.inhalt(symbol: "person.2.fill", farbe: Farbe.blue, titel: Veranstaltungen.eventBelegungText(e), zusatz: nil)
                if let anteil = Veranstaltungen.eventBelegungAnteil(e) {
                    ProgressView(value: anteil).tint(Farbe.blue).padding(.leading, 41).accessibilityHidden(true)
                }
            }
            .gruppenZeile()
        }
    }

    private struct Zeile: View {
        let symbol: String
        let farbe: Color
        let titel: String
        var zusatz: String?

        var body: some View {
            Self.inhalt(symbol: symbol, farbe: farbe, titel: titel, zusatz: zusatz).gruppenZeile()
        }

        static func inhalt(symbol: String, farbe: Color, titel: String, zusatz: String?) -> some View {
            HStack(spacing: 12) {
                IconKachel(symbol: symbol, farbe: farbe)
                VStack(alignment: .leading, spacing: 2) {
                    Text(titel).foregroundStyle(Farbe.ink).fixedSize(horizontal: false, vertical: true)
                    if let zusatz {
                        Text(zusatz).font(.footnote).foregroundStyle(Farbe.muted).fixedSize(horizontal: false, vertical: true)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.vertical, 2)
            .accessibilityElement(children: .combine)
        }
    }
}

// MARK: - Die Anmeldekarte

/**
 * Anmelden oder die Anmeldung aendern - eine Karte wie die Buchungskarte:
 * ✕ links schliesst, ✓ rechts schickt ab. Begleitpersonen als Kapsel
 * "− n +", die Bemerkung als Feld. Schlaegt es fehl, bleibt die Karte offen
 * und zeigt den Grund; klappt es, schliesst sie und die Seite zeigt die Meldung.
 */
struct AnmeldeKarte: View {
    enum Art: String, Identifiable {
        case neu, aendern
        var id: String { rawValue }
    }

    @Environment(Sitzung.self) private var sitzung
    @Environment(\.dismiss) private var schliessen
    let e: MitgliedEvent
    let art: Art
    let fertig: (Ergebnis) -> Void

    @State private var begleitung = 0
    @State private var bemerkung = ""
    @State private var fehler: String?
    @State private var laeuft = false
    @State private var verwerfen = false
    @FocusState private var feld: Bool

    static let maxBegleitung = 20

    private var geaendert: Bool {
        art == .neu
            ? begleitung != 0 || !bemerkung.isEmpty
            : begleitung != (e.meineBegleitpersonen ?? 0) || bemerkung != (e.meineBemerkung ?? "")
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(e.title ?? "").font(.title2.weight(.bold)).foregroundStyle(Farbe.ink)
                        Text(Veranstaltungen.eventZeitText(startsAt: e.startsAt, endsAt: e.endsAt))
                            .font(.subheadline)
                            .foregroundStyle(Farbe.ink2)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .listRowInsets(EdgeInsets(top: 0, leading: 4, bottom: 0, trailing: 4))
                .listRowBackground(Color.clear)

                if let fehler {
                    Section {
                        Label(fehler, systemImage: "exclamationmark.triangle.fill").foregroundStyle(Farbe.redInk).gruppenZeile()
                    }
                }

                Section {
                    PersonZeile(text: "Du", zusatz: "meldest dich an")
                    if e.companionsAllowed == true {
                        HStack(spacing: 12) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Begleitpersonen").foregroundStyle(Farbe.ink)
                                Text(VereinLogik.begleitHinweis(e)).font(.footnote).foregroundStyle(Farbe.muted)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            HStack(spacing: 0) {
                                knopf("minus", "Eine Begleitperson weniger", aus: begleitung <= 0) { begleitung -= 1 }
                                Text("\(begleitung)")
                                    .font(.body.weight(.semibold))
                                    .monospacedDigit()
                                    .foregroundStyle(Farbe.blueInk)
                                    .frame(minWidth: 22)
                                    .accessibilityLabel("\(begleitung) \(begleitung == 1 ? "Begleitperson" : "Begleitpersonen")")
                                knopf("plus", "Eine Begleitperson mehr", aus: begleitung >= Self.maxBegleitung) { begleitung += 1 }
                            }
                            .background(Farbe.blueSoft, in: Capsule())
                        }
                        .gruppenZeile()
                        .sensoryFeedback(.selection, trigger: begleitung)
                    }
                } header: {
                    GruppenKopf(titel: "Wer kommt")
                } footer: {
                    if art == .neu && Veranstaltungen.eventNurWarteliste(e, begleitpersonen: begleitung) {
                        Text(VereinLogik.wartelisteVorab(begleitpersonen: begleitung)).foregroundStyle(Farbe.muted)
                    }
                }

                Section {
                    TextField("z. B. vegetarisch", text: $bemerkung, axis: .vertical)
                        .lineLimit(1...4)
                        .focused($feld)
                        .foregroundStyle(Farbe.ink)
                        .accessibilityLabel("Bemerkung")
                        .gruppenZeile()
                        .onChange(of: bemerkung) { _, neu in
                            if neu.count > 500 { bemerkung = String(neu.prefix(500)) }
                        }
                } header: {
                    GruppenKopf(titel: "Bemerkung")
                } footer: {
                    if let fee = e.feeCents, fee != 0 {
                        let summe = Geld.formatCents(Veranstaltungen.eventGebuehrCents(fee, begleitpersonen: begleitung))
                        Text("\(summe) für \(begleitung + 1) \(begleitung == 0 ? "Person" : "Personen"). "
                            + (Veranstaltungen.eventGebuehrHinweis(e) ?? ""))
                            .foregroundStyle(Farbe.muted)
                    }
                }
            }
            .gruppenListe()
            .listSectionSpacing(20)
            .navigationTitle(art == .neu ? "Anmelden" : "Anmeldung ändern")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { geaendert ? (verwerfen = true) : schliessen() } label: { Image(systemName: "xmark") }
                        .accessibilityLabel("Schließen")
                        .confirmationDialog("Änderungen verwerfen?", isPresented: $verwerfen, titleVisibility: .visible) {
                            Button("Verwerfen", role: .destructive) { schliessen() }
                            Button("Weiter bearbeiten", role: .cancel) {}
                        }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if laeuft {
                        ProgressView()
                    } else {
                        Button { absenden() } label: { Image(systemName: "checkmark") }
                            .disabled(art == .aendern && !geaendert)
                            .accessibilityLabel(
                                art == .neu ? Veranstaltungen.eventAnmeldenKnopf(e, begleitpersonen: begleitung) : "Änderung speichern"
                            )
                    }
                }
            }
        }
        .tint(Farbe.blue)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .interactiveDismissDisabled(geaendert || laeuft)
        .onAppear {
            if art == .aendern {
                begleitung = e.meineBegleitpersonen ?? 0
                bemerkung = e.meineBemerkung ?? ""
            }
        }
    }

    private func knopf(_ symbol: String, _ label: String, aus: Bool, aktion: @escaping () -> Void) -> some View {
        Button(action: aktion) {
            Image(systemName: symbol)
                .font(.subheadline.weight(.bold))
                .foregroundStyle(Farbe.blueInk)
                .frame(width: 40, height: 36)
                .contentShape(Rectangle())
        }
        .buttonStyle(.borderless)
        .disabled(aus)
        .opacity(aus ? 0.4 : 1)
        .accessibilityLabel(label)
    }

    private func absenden() {
        let daten = Vereinsdaten(client: sitzung.client)
        let (b, text, id) = (begleitung, bemerkung, e.id)
        feld = false
        Task {
            laeuft = true
            let r = art == .neu
                ? await daten.meldeAn(id, begleitpersonen: b, bemerkung: text)
                : await daten.aendereAnmeldung(id, begleitpersonen: b, bemerkung: text)
            laeuft = false
            if r.ok {
                fertig(r)
                schliessen()
            } else {
                fehler = r.meldung
            }
        }
    }
}

/// "Du · meldest dich an" mit Initialen-Kreis in Gelb ("deins").
private struct PersonZeile: View {
    let text: String
    let zusatz: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "person.fill")
                .font(.subheadline)
                .foregroundStyle(Farbe.onGold)
                .frame(width: 32, height: 32)
                .background(Farbe.gold, in: Circle())
                .accessibilityHidden(true)
            Text(text).foregroundStyle(Farbe.ink)
            Spacer()
            Text(zusatz).font(.subheadline).foregroundStyle(Farbe.muted)
        }
        .gruppenZeile()
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Kalender

/// Apples Fenster "Neues Ereignis", vorausgefuellt. Braucht keinen Kalenderzugriff:
/// das Fenster laeuft ausserhalb der App, gespeichert wird erst, wenn man "Hinzufügen" tippt.
private struct KalenderBlatt: UIViewControllerRepresentable {
    let e: MitgliedEvent

    func makeUIViewController(context: Context) -> EKEventEditViewController {
        let store = EKEventStore()
        let ereignis = EKEvent(eventStore: store)
        ereignis.title = e.title
        ereignis.location = e.location
        ereignis.notes = e.description
        let beginn = Zeit.datum(e.startsAt) ?? Date()
        ereignis.startDate = beginn
        ereignis.endDate = e.endsAt.flatMap(Zeit.datum) ?? beginn.addingTimeInterval(2 * 3600)
        let vc = EKEventEditViewController()
        vc.eventStore = store
        vc.event = ereignis
        vc.editViewDelegate = context.coordinator
        return vc
    }

    func updateUIViewController(_ vc: EKEventEditViewController, context: Context) {}

    func makeCoordinator() -> Koordinator { Koordinator() }

    final class Koordinator: NSObject, EKEventEditViewDelegate {
        func eventEditViewController(_ controller: EKEventEditViewController, didCompleteWith action: EKEventEditViewAction) {
            controller.dismiss(animated: true)
        }
    }
}
