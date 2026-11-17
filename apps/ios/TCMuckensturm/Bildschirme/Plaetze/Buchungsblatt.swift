/**
 * Das Buchungsblatt (apps/mobile/src/components/BuchungsFenster.tsx)
 *
 * Dasselbe Blatt fuer Buchen, Bearbeiten, Mitspielen, Stornieren und -
 * abgesetzt unten - fuer Sperren und Umsetzen mit Platzrechten. Nur
 * Darstellung: ob gebucht werden darf, entscheidet create_booking; die
 * Startzeiten, die hier waehlbar sind, kommen aus canStartAt, die Knoepfe aus
 * bookingActions. Texte wortgleich mit der Expo-App.
 */

import SwiftUI

/**
 * Gaeste haben keinen Namen - es geht um die Gebuehr und den belegten Platz.
 * Die Datenbank verlangt einen nicht leeren guest_name, also traegt jeder
 * Gastplatz genau dieses Wort.
 */
private let gast = "Gast"

struct Buchungsblatt: View {
    @Environment(\.dismiss) private var schliessen
    let modell: PlaetzeModell
    let fenster: Fenster

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                switch fenster {
                case let .buchen(courtId, platzName, tag, stunde, startzeiten, start):
                    BuchenInhalt(
                        modell: modell, courtId: courtId, platzName: platzName, tag: tag, stunde: stunde,
                        startzeiten: startzeiten, vorgabe: start, kicker: kicker
                    )
                case let .verwalten(b, _, tag):
                    VerwaltenInhalt(modell: modell, b: b, tag: tag, kicker: kicker)
                }
            }
            .padding(.horizontal, Tokens.Abstand.rand)
            .padding(.top, 24)
            .padding(.bottom, 32)
        }
        .scrollDismissesKeyboard(.interactively)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationCornerRadius(Tokens.Radius.blatt)
        .presentationBackground(Farbe.surf)
        .environment(\.blattSchliessen) { schliessen() }
    }

    private var kicker: String { "\(fenster.platzName) · \(PlaetzeLogik.tagText(fenster.tag))" }
}

private struct BlattSchliessenSchluessel: EnvironmentKey {
    static let defaultValue: @MainActor () -> Void = {}
}

private extension EnvironmentValues {
    var blattSchliessen: @MainActor () -> Void {
        get { self[BlattSchliessenSchluessel.self] }
        set { self[BlattSchliessenSchluessel.self] = newValue }
    }
}

// MARK: - Bausteine

/// Die Zeit gross als Titel, darunter Platz und Tag, rechts das X. Am eigenen Spiel der gelbe Marker.
private struct PlatzBlattKopf: View {
    @Environment(\.blattSchliessen) private var schliessen
    let kicker: String
    let titel: String
    var eigenes = false

    var body: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 6) {
                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .center, spacing: 12) { zeit; marker }
                    VStack(alignment: .leading, spacing: 6) { zeit; marker }
                }
                Text(kicker)
                    .font(Schrift.text(.normal, 16))
                    .foregroundStyle(Farbe.muted)
            }
            Spacer(minLength: 8)
            SchliessenKnopf(aktion: schliessen)
        }
    }

    private var zeit: some View {
        Text(titel)
            .font(Schrift.display(.fett, 32, relativeTo: .title))
            .tracking(-0.8)
            .monospacedDigit()
            .foregroundStyle(Farbe.ink)
            .lineLimit(1)
            .accessibilityAddTraits(.isHeader)
    }

    @ViewBuilder private var marker: some View {
        if eigenes { DeinMarker("Dein Spiel") }
    }
}

private struct Feldname: View {
    let text: String
    var zusatz: String?

    var body: some View {
        (Text(text.uppercased()).font(Schrift.display(.fett, Tokens.Schrift.kicker, relativeTo: .caption))
            + Text(zusatz.map { " · \($0)" } ?? "").font(Schrift.text(.mittel, 13)))
            .tracking(0.6)
            .foregroundStyle(Farbe.muted)
            .padding(.bottom, 10)
            .accessibilityLabel(text + (zusatz.map { ", \($0)" } ?? ""))
    }
}

/**
 * Die eine Hauptaktion des Blatts: blau, volle Breite. Gesperrt ist sie
 * neutral statt blassblau (U26). Mit `beiGesperrt` nimmt der gesperrte Knopf
 * das Tippen noch an und fuehrt zum naechsten Schritt.
 */
private struct BlattHauptknopf: View {
    let text: String
    var gesperrt = false
    var grund: String?
    var beiGesperrt: (() -> Void)?
    let aktion: () -> Void

    var body: some View {
        Button { gesperrt ? beiGesperrt?() : aktion() } label: {
            KnopfFlaeche(stufe: .haupt, groesse: .gross, breit: true) { Text(text) }
                .environment(\.isEnabled, !gesperrt)
        }
        .buttonStyle(.plain)
        .disabled(gesperrt && beiGesperrt == nil)
        .accessibilityHint(gesperrt ? (grund ?? "") : "")
    }
}

/// Alles neben der Hauptaktion: neutral mit Linie, hellblau als Zweitaktion, rot fuers Zerstoerende.
private struct Nebenknopf: View {
    let text: String
    var stufe: KnopfStufe = .leise
    var gesperrt = false
    var klein = false
    let aktion: () -> Void

    var body: some View {
        Knopf(text, stufe: stufe, groesse: klein ? .klein : .normal, breit: !klein, gesperrt: gesperrt, aktion: aktion)
    }
}

/// Rueckmeldung der Datenbank, steht ueber dem Hauptknopf.
private struct FehlerText: View {
    let text: String?

    var body: some View {
        if let text {
            Text(text)
                .font(Schrift.text(.mittel, 14))
                .foregroundStyle(Farbe.redInk)
                .fixedSize(horizontal: false, vertical: true)
                .onAppear { UIAccessibility.post(notification: .announcement, argument: text) }
        }
    }
}

private struct Fussnote: View {
    let text: String

    var body: some View {
        Text(text)
            .font(Schrift.text(.normal, Tokens.Schrift.klein))
            .foregroundStyle(Farbe.muted)
            .frame(maxWidth: .infinity)
    }
}

/// Was zum Buchen noch fehlt - neutral, es ist kein Fehler.
private struct Besetzungshinweis: View {
    let text: String

    var body: some View {
        Text(text)
            .font(Schrift.text(.normal, 14))
            .foregroundStyle(Farbe.ink2)
            .lineSpacing(2)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.vertical, 12)
            .padding(.horizontal, 14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Farbe.chip, in: RoundedRectangle(cornerRadius: 20))
    }
}

/// Ein Eingabefeld: surf2 mit feiner Linie, Radius des Felds.
private struct Eingabe: View {
    let platzhalter: String
    let bedienName: String
    @Binding var text: String

    var body: some View {
        TextField("", text: $text, prompt: Text(platzhalter).foregroundColor(Farbe.muted))
            .font(Schrift.text(.normal, 16))
            .foregroundStyle(Farbe.ink)
            .padding(.horizontal, 20)
            .frame(minHeight: 52)
            .background(Farbe.surf2, in: RoundedRectangle(cornerRadius: Tokens.Radius.feld))
            .overlay(RoundedRectangle(cornerRadius: Tokens.Radius.feld).strokeBorder(Farbe.line2, lineWidth: 1))
            .accessibilityLabel(bedienName)
    }
}

/// Optionen nebeneinander als Pillen ("17:00 | 17:30"): gewaehlt hellblau mit blauer Linie.
/// Einzelne Werte lassen sich abschalten.
private struct Segmente<Wert: Hashable>: View {
    let beschriftung: String
    let optionen: [(wert: Wert, label: String, aus: Bool)]
    @Binding var wert: Wert

    var body: some View {
        HStack(spacing: 8) {
            ForEach(optionen, id: \.wert) { o in
                let aktiv = o.wert == wert
                Button { wert = o.wert } label: {
                    Text(o.label)
                        .monospacedDigit()
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .frame(maxWidth: .infinity)
                        .auswahlPille(aktiv, hoehe: 48, rand: 6)
                }
                .buttonStyle(.plain)
                .disabled(o.aus)
                .opacity(o.aus ? 0.35 : 1)
                .accessibilityAddTraits(aktiv ? [.isSelected] : [])
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(beschriftung)
    }
}

/// Chips zum Antippen, einzeln oder mehrfach (Chipwahl in der Verwaltung).
private struct Chipwahl: View {
    let optionen: [(wert: String, label: String)]
    let gewaehlt: (String) -> Bool
    let wahl: (String) -> Void

    var body: some View {
        UmbruchStapel(abstand: 8, zeilenabstand: 8) {
            ForEach(optionen, id: \.wert) { o in
                let aktiv = gewaehlt(o.wert)
                Button { wahl(o.wert) } label: {
                    Text(o.label).auswahlPille(aktiv, hoehe: 40, rand: 14)
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(aktiv ? [.isSelected] : [])
            }
        }
    }
}

/**
 * "Mitspieler gesucht" mit Erklaerung - ohne sie raet man, was das bewirkt.
 * Ist die Suche an und `filter` gesetzt, steht darunter "Nur für …".
 * `speichern` gibt es nur an einer bestehenden Buchung, wenn der Filter
 * geaendert wurde.
 */
private struct GesuchtKarte: View {
    let an: Bool
    var deaktiviert = false
    var filter: Binding<Suchfilter>?
    var speichern: (() -> Void)?
    let wechsel: (Bool) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Toggle(isOn: Binding(get: { an }, set: wechsel)) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Mitspieler gesucht").font(Schrift.display(.halbfett, 16)).foregroundStyle(Farbe.ink)
                    Text("Dein Spiel erscheint unter „Offene Spiele“. Wer mag, trägt sich selbst ein.")
                        .font(Schrift.text(.normal, 13))
                        .foregroundStyle(Farbe.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .tint(Farbe.blue)
            if an, let filter {
                Farbe.line.frame(height: 1)
                NurFuer(filter: filter, speichern: speichern)
            }
        }
        .disabled(deaktiviert)
        .padding(18)
        .background(Farbe.surf2, in: RoundedRectangle(cornerRadius: Tokens.Radius.karte))
        .overlay(RoundedRectangle(cornerRadius: Tokens.Radius.karte).strokeBorder(Farbe.line, lineWidth: 1))
    }
}

/**
 * "Nur für …": LK-Bereich von/bis in 0,1-Schritten und Alle/Damen/Herren.
 * Zugeklappt steht rechts, was gilt; ein eingeschraenkter Filter oeffnet
 * sich von selbst, damit man ihn sieht.
 */
private struct NurFuer: View {
    @Binding var filter: Suchfilter
    var speichern: (() -> Void)?

    @State private var offen: Bool

    init(filter: Binding<Suchfilter>, speichern: (() -> Void)?) {
        _filter = filter
        self.speichern = speichern
        _offen = State(initialValue: filter.wrappedValue.istEingeschraenkt)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Button { withAnimation(.snappy) { offen.toggle() } } label: {
                HStack(spacing: 8) {
                    Text("Nur für …").font(Schrift.display(.halbfett, 15)).foregroundStyle(Farbe.ink)
                    Spacer(minLength: 8)
                    Text(filter.zusammenfassung)
                        .font(Schrift.text(.halbfett, 14))
                        .foregroundStyle(filter.istEingeschraenkt ? Farbe.blueInk : Farbe.muted)
                        .lineLimit(1)
                    Image(systemName: "chevron.down")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(Farbe.ink2)
                        .rotationEffect(.degrees(offen ? 180 : 0))
                }
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Nur für, \(filter.vorleseText)")
            .accessibilityHint(offen ? "Zuklappen" : "Suche auf LK oder Damen und Herren einschränken")

            if offen {
                Segmente(
                    beschriftung: "Für wen",
                    optionen: SucheFuer.allCases.map { ($0, $0.label, false) },
                    wert: $filter.fuer
                )
                HStack(spacing: 10) {
                    lkWahl("LK von", wert: filter.vonZehntel) { filter = filter.mitVon($0) }
                    Text("–").font(Schrift.text(.fett, 17)).foregroundStyle(Farbe.ink2).accessibilityHidden(true)
                    lkWahl("LK bis", wert: filter.bisZehntel) { filter = filter.mitBis($0) }
                }
                Text("1 ist die beste LK, 25 die schwächste. Wer keine LK eingetragen hat, sieht die Suche nur, wenn „bis“ auf 25 steht.")
                    .font(Schrift.text(.normal, 13))
                    .foregroundStyle(Farbe.muted)
                    .fixedSize(horizontal: false, vertical: true)
                if filter.istEingeschraenkt {
                    Nebenknopf(text: "Für alle öffnen", klein: true) { filter = .offen }
                }
            }
            if let speichern {
                // Zweitaktion: die Hauptaktion des Blatts steht unten.
                Nebenknopf(text: "Filter speichern", stufe: .zweit, aktion: speichern)
            }
        }
    }

    private func lkWahl(_ name: String, wert: Int, setze: @escaping (Int) -> Void) -> some View {
        VStack(spacing: 2) {
            Text(name).font(Schrift.text(.halbfett, 13)).foregroundStyle(Farbe.ink2).accessibilityHidden(true)
            Picker(name, selection: Binding(get: { wert }, set: setze)) {
                ForEach(Suchfilter.stufen, id: \.self) { z in
                    Text("\(z / 10),\(z % 10)")
                        .font(Schrift.text(.halbfett, 17))
                        .monospacedDigit()
                        .tag(z)
                }
            }
            .pickerStyle(.wheel)
            .frame(height: 112)
            .clipped()
            .background(Farbe.surf, in: RoundedRectangle(cornerRadius: 18))
            .accessibilityLabel(name)
        }
        .frame(maxWidth: .infinity)
    }
}

/// Ein Mitspieler als Chip: Initialen im Kreis, Name, optional ein X zum Entfernen.
private struct Chip: View {
    let kuerzel: String
    let name: String
    var gelb = false
    var istGast = false
    var leer = false
    var weg: (() -> Void)?
    var wegLabel: String?

    var body: some View {
        HStack(spacing: 8) {
            Text(kuerzel)
                .font(Schrift.display(.fett, Tokens.Schrift.kicker))
                .dynamicTypeSize(...DynamicTypeSize.xLarge)
                // Gelb heisst "deins": nur der eigene Chip. Alle anderen sind neutral.
                .foregroundStyle(gelb ? Farbe.onGold : istGast ? Farbe.muted : Farbe.ink2)
                .frame(width: 32, height: 32)
                .background(leer ? Color.clear : gelb ? Farbe.gold : Farbe.surf3, in: Circle())
            Text(name)
                .font(Schrift.text(.halbfett, 14.5))
                .foregroundStyle(leer ? Farbe.muted : Farbe.ink)
                .lineLimit(1)
            if let weg {
                Button(action: weg) {
                    Image(systemName: "xmark")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(Farbe.ink2)
                        .frame(width: 32, height: 32)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(wegLabel ?? "Entfernen")
            }
        }
        .padding(.leading, 4)
        .padding(.trailing, weg == nil ? 14 : 4)
        .frame(minHeight: 40)
        .background(leer ? Color.clear : Farbe.surf2, in: Capsule())
        .overlay {
            if leer {
                Capsule().strokeBorder(Farbe.line2, style: StrokeStyle(lineWidth: 1.5, dash: [4, 3]))
            } else {
                Capsule().strokeBorder(Farbe.line, lineWidth: 1)
            }
        }
    }
}

// MARK: - Wer spielt mit?

/**
 * Mitspieler durch Tippen finden - rund 300 Mitglieder sind als Auswahlliste
 * am Telefon unbenutzbar. Gaeste kommen ueber einen eigenen Knopf: sie
 * kosten Geld, und das soll eine bewusste Handlung sein.
 */
private struct Mitspieler: View {
    let kopf: (kuerzel: String, name: String, gelb: Bool)
    let verzeichnis: [Mitglied]
    @Binding var mitglieder: [String]
    @Binding var gaeste: [String]
    let maxWeitere: Int
    /// Wie viele mitspielen, aus der Buchungsart: "1 weitere Person".
    let umfang: String
    /// Es fehlt noch jemand: "+ Mitglied" ist dann der naechste Schritt.
    var gefragt = false
    let gastgebuehrCents: Int
    @Binding var suchen: Bool

    @State private var suche = ""
    @FocusState private var fokus: Bool

    private var voll: Bool { mitglieder.count + gaeste.count >= maxWeitere }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Feldname(text: "Wer spielt mit?", zusatz: umfang.isEmpty ? nil : umfang)
            UmbruchStapel(abstand: 8, zeilenabstand: 8) {
                Chip(kuerzel: kopf.kuerzel, name: kopf.name, gelb: kopf.gelb)
                ForEach(mitglieder, id: \.self) { id in
                    if let m = verzeichnis.first(where: { $0.id == id }) {
                        Chip(
                            kuerzel: PlaetzeLogik.initialen(m.firstName, m.lastName), name: m.name,
                            weg: { mitglieder.removeAll { $0 == id } }, wegLabel: "\(m.name) entfernen"
                        )
                    }
                }
                ForEach(Array(gaeste.enumerated()), id: \.offset) { i, g in
                    Chip(kuerzel: "G", name: g, istGast: true, weg: { gaeste.remove(at: i) }, wegLabel: "Gast \(i + 1) entfernen")
                }
            }

            if voll {
                Text("Für diese Spielform sind alle Plätze besetzt.").leise().padding(.top, 10)
            } else {
                HStack(spacing: 8) {
                    Button { suchen.toggle() } label: {
                        Label("Mitglied", systemImage: "plus")
                            .foregroundStyle(gefragt ? Farbe.blueInk : Farbe.ink)
                            .modifier(Gestrichelt(betont: gefragt))
                    }
                    .buttonStyle(.plain)
                    .accessibilityValue(suchen ? "aufgeklappt" : "zugeklappt")
                    Button { gaeste.append(gast) } label: {
                        Label(PlaetzeLogik.gastText(gebuehrCents: gastgebuehrCents), systemImage: "plus")
                            .foregroundStyle(Farbe.ink)
                            .modifier(Gestrichelt(betont: false))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(gastgebuehrCents > 0 ? "Gast hinzufügen, \(Geld.formatCents(gastgebuehrCents))" : "Gast hinzufügen")
                }
                .padding(.top, 10)
            }

            if suchen && !voll {
                VStack(alignment: .leading, spacing: 6) {
                    TextField("", text: $suche, prompt: Text("Namen tippen …").foregroundColor(Farbe.muted))
                        .font(Schrift.text(.normal, 16))
                        .foregroundStyle(Farbe.ink)
                        .textInputAutocapitalization(.words)
                        .autocorrectionDisabled()
                        .focused($fokus)
                        .padding(.horizontal, 20)
                        .frame(minHeight: 52)
                        .background(Farbe.surf2, in: RoundedRectangle(cornerRadius: Tokens.Radius.feld))
                        .overlay(RoundedRectangle(cornerRadius: Tokens.Radius.feld).strokeBorder(Farbe.line2, lineWidth: 1))
                        .accessibilityLabel("Mitspieler suchen")
                    if !suche.trimmingCharacters(in: .whitespaces).isEmpty {
                        let treffer = PlaetzeLogik.treffer(suche, in: verzeichnis, ohne: mitglieder)
                        if treffer.isEmpty {
                            Text("Niemand gefunden.").leise()
                        } else {
                            ForEach(treffer) { m in
                                Button {
                                    mitglieder.append(m.id)
                                    suche = ""
                                    suchen = false
                                } label: {
                                    Text("\(m.lastName ?? ""), \(m.firstName ?? "")")
                                        .font(Schrift.text(.normal, 16))
                                        .foregroundStyle(Farbe.ink)
                                        .padding(.horizontal, 14)
                                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                                        .background(Farbe.surf2, in: RoundedRectangle(cornerRadius: 22))
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
                .padding(.top, 10)
                .onAppear { fokus = true }
            }

            if !gaeste.isEmpty && gastgebuehrCents > 0 {
                Text(PlaetzeLogik.gastHinweis(gebuehrCents: gastgebuehrCents)).leise()
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 10)
            }
        }
        // Ist das Feld schon offen, holt der gesperrte Buchen-Knopf den Fokus zurueck.
        .onChange(of: suchen) { _, neu in if neu { fokus = true } }
    }
}

private struct Gestrichelt: ViewModifier {
    let betont: Bool

    func body(content: Content) -> some View {
        content
            .font(Schrift.display(.halbfett, 15))
            .frame(maxWidth: .infinity, minHeight: 46)
            .background(betont ? Farbe.blueSoft : .clear, in: Capsule())
            .overlay(
                Capsule().strokeBorder(betont ? Farbe.blue : Farbe.line2, style: StrokeStyle(lineWidth: 1.5, dash: betont ? [] : [4, 3]))
            )
            .contentShape(Rectangle())
    }
}

// MARK: - Buchen

private struct BuchenInhalt: View {
    let modell: PlaetzeModell
    let courtId: String
    let platzName: String
    let tag: String
    let stunde: Int
    let startzeiten: [Int]
    let kicker: String

    @State private var start: Int
    @State private var art: String
    @State private var mitglieder: [String] = []
    @State private var gaeste: [String] = []
    @State private var sucht = false
    @State private var filter = Suchfilter.offen
    @State private var suchen = false

    init(modell: PlaetzeModell, courtId: String, platzName: String, tag: String, stunde: Int, startzeiten: [Int], vorgabe: Int, kicker: String) {
        self.modell = modell
        self.courtId = courtId
        self.platzName = platzName
        self.tag = tag
        self.stunde = stunde
        self.startzeiten = startzeiten
        self.kicker = kicker
        _start = State(initialValue: startzeiten.contains(vorgabe) ? vorgabe : (startzeiten.first ?? stunde))
        _art = State(initialValue: modell.arten.first?.code ?? "einzel")
    }

    var body: some View {
        let m = modell
        let gewaehlt = m.arten.first { $0.code == art }
        let info = gewaehlt?.info
        let dauer = gewaehlt?.durationMinutes ?? 60
        let maxWeitere = max((gewaehlt?.maxPlayers ?? 2) - 1, 0)
        let nochPlatz = mitglieder.count + gaeste.count < maxWeitere
        let hinweis = PlaetzeLogik.buchenHinweis(art: info, mitglieder: mitglieder.count, gaeste: gaeste.count, sucht: sucht)
        let fehlen = info.map { sucht && nochPlatz ? 0 : Platzplan.missingPlayers($0, memberCount: mitglieder.count, guestCount: gaeste.count) } ?? 0
        let haelften = Array(stride(from: stunde, to: stunde + m.anzeige, by: max(m.raster, 1)))
        let ich = m.verzeichnis.first { $0.id == m.meineId }

        PlatzBlattKopf(kicker: kicker, titel: "\(Zeit.minutesToTime(start)) – \(Zeit.minutesToTime(start + dauer))")

        let beginn = VStack(alignment: .leading, spacing: 0) {
            Feldname(text: "Beginn")
            Segmente(
                beschriftung: "Beginn",
                optionen: haelften.map { ($0, Zeit.minutesToTime($0), !startzeiten.contains($0)) },
                wert: $start
            )
        }
        let spielform = VStack(alignment: .leading, spacing: 0) {
            Feldname(text: "Spielform")
            Segmente(
                beschriftung: "Spielform",
                optionen: m.arten.map { ($0.code, $0.name ?? $0.code, false) },
                wert: Binding(get: { art }, set: { neu in
                    art = neu
                    let k = PlaetzeLogik.kuerze(
                        mitglieder: mitglieder, gaeste: gaeste, maxPlayers: m.arten.first { $0.code == neu }?.maxPlayers ?? 2
                    )
                    mitglieder = k.mitglieder
                    gaeste = k.gaeste
                })
            )
        }
        // Zwei Segmente nebeneinander, solange es je zwei Werte sind
        if haelften.count <= 2 && m.arten.count <= 2 {
            HStack(alignment: .top, spacing: 12) { beginn; spielform }
        } else {
            beginn
            spielform
        }

        // Sich selbst mitzunehmen weist die Datenbank ab - der Bucher zaehlt ohnehin mit.
        Mitspieler(
            kopf: (PlaetzeLogik.initialen(ich?.firstName, ich?.lastName), "Du", true),
            verzeichnis: m.verzeichnis.filter { $0.id != m.meineId },
            mitglieder: $mitglieder, gaeste: $gaeste, maxWeitere: maxWeitere,
            umfang: info.map(Platzplan.otherPlayersLabel) ?? "", gefragt: fehlen > 0,
            gastgebuehrCents: m.gastgebuehr, suchen: $suchen
        )

        if nochPlatz { GesuchtKarte(an: sucht, filter: $filter) { sucht = $0 } }

        VStack(spacing: 10) {
            FehlerText(text: m.fensterFehler)
            if let hinweis, !m.laeuft { Besetzungshinweis(text: hinweis) }
            BlattHauptknopf(
                text: m.laeuft ? "Wird gebucht …" : "\(platzName) buchen",
                gesperrt: m.laeuft || hinweis != nil,
                grund: hinweis,
                beiGesperrt: m.laeuft || maxWeitere == 0 ? nil : { suchen = true }
            ) {
                Task {
                    await m.buchen(
                        courtId: courtId, tag: tag, start: start, typ: art, mitglieder: mitglieder, gaeste: gaeste,
                        sucht: sucht, filter: filter
                    )
                }
            }
            Fussnote(text: "Stornieren geht bis Spielbeginn")
        }

        if m.darfPlaetze {
            SperrBereich(modell: m, courtId: courtId, platzName: platzName, tag: tag, stunde: stunde)
        }
    }
}

/**
 * Sperren steht abgesetzt unter dem Buchen: es ist die Ausnahme, nicht der
 * Regelfall. Gesperrt wird der ganze Anzeigeblock. Zweistufig: liegen
 * Buchungen im Weg, nennt der erste Versuch ihre Zahl, erst der zweite
 * verdraengt sie.
 */
private struct SperrBereich: View {
    let modell: PlaetzeModell
    let courtId: String
    let platzName: String
    let tag: String
    let stunde: Int

    @State private var grund: String?
    @State private var art = ""
    @State private var kollisionen: Int?

    var body: some View {
        let m = modell
        let bis = stunde + m.anzeige
        VStack(alignment: .leading, spacing: 10) {
            if grund == nil {
                Nebenknopf(text: "Stattdessen sperren", klein: true) {
                    // Vorgabe bleibt die Platzpflege; sonst die erste Kategorie.
                    art = m.blockungsarten.first { $0.code == "platzpflege" }?.code ?? m.blockungsarten.first?.code ?? "platzpflege"
                    grund = ""
                }
            } else {
                VStack(alignment: .leading, spacing: 0) {
                    Feldname(text: "Kategorie")
                    Chipwahl(optionen: m.blockungsarten.map { ($0.code, $0.name ?? $0.code) }, gewaehlt: { $0 == art }) {
                        art = $0
                        kollisionen = nil
                    }
                }
                VStack(alignment: .leading, spacing: 0) {
                    Feldname(text: "Grund (freiwillig)")
                    Eingabe(platzhalter: "z. B. nach Regen", bedienName: "Grund der Sperrung, freiwillig", text: Binding(get: { grund ?? "" }, set: { grund = $0 }))
                }
                Text("Gesperrt wird \(Zeit.minutesToTime(stunde))–\(Zeit.minutesToTime(bis)) Uhr auf \(platzName).").leise()
                Nebenknopf(
                    text: kollisionen.map(PlaetzeLogik.verdraengenText) ?? "Sperren",
                    stufe: kollisionen != nil ? .gefahr : .zweit,
                    gesperrt: m.laeuft
                ) {
                    Task {
                        kollisionen = await m.sperren(
                            courtId: courtId, tag: tag, von: stunde, bis: bis, typ: art, grund: grund ?? "",
                            verdraengen: kollisionen != nil
                        )
                    }
                }
                Nebenknopf(text: "Doch nicht", klein: true) {
                    grund = nil
                    kollisionen = nil
                }
            }
        }
        .padding(.top, 16)
        .overlay(alignment: .top) { Farbe.line.frame(height: 1) }
    }
}

// MARK: - Bearbeiten, Mitspielen, Stornieren

private struct VerwaltenInhalt: View {
    let modell: PlaetzeModell
    let b: TagesBelegung
    let tag: String
    let kicker: String

    @State private var mitglieder: [String]
    @State private var gaeste: [String]
    @State private var stornoOffen = false
    @State private var umsetzOffen = false
    @State private var bearbeitenOffen = false
    @State private var grund = ""
    @State private var suchen = false
    /// "Nur für …" der Suche, beim Oeffnen aus day_schedule
    @State private var filter: Suchfilter
    /// Einmal beim Oeffnen: die Uhr soll nicht unter dem Finger Knoepfe wegnehmen.
    @State private var jetzt = Date()

    init(modell: PlaetzeModell, b: TagesBelegung, tag: String, kicker: String) {
        self.modell = modell
        self.b = b
        self.tag = tag
        self.kicker = kicker
        _mitglieder = State(initialValue: (b.playerMemberIds ?? []).compactMap { $0 })
        _gaeste = State(initialValue: (b.guestNames ?? []).compactMap { $0 })
        _filter = State(initialValue: b.suchfilter)
    }

    var body: some View {
        let m = modell
        let v = Verwalten(b, darfPlaetze: m.darfPlaetze, jetzt: jetzt)
        let art = m.arten.first { $0.code == b.typeCode }
        let maxWeitere = max((art?.maxPlayers ?? 4) - 1, 0)
        let vorher = (b.playerMemberIds ?? []).compactMap { $0 }
        let vorherGaeste = (b.guestNames ?? []).compactMap { $0 }
        let geaendert = mitglieder.sorted() != vorher.sorted() || gaeste.sorted() != vorherGaeste.sorted()
        let bucher = (
            kuerzel: PlaetzeLogik.initialen(name: b.ownerName),
            name: b.isOwn == true ? "Du" : (b.ownerName ?? "Bucher"),
            gelb: b.isOwn == true
        )

        PlatzBlattKopf(
            kicker: kicker,
            titel: "\(Zeit.minutesToTime(Zeit.minutesOf(b.startsAt))) – \(Zeit.minutesToTime(Zeit.minutesOf(b.endsAt)))",
            eigenes: b.isOwn == true && !v.nurStorno
        )

        VStack(alignment: .leading, spacing: 4) {
            Text(v.untertitel).font(Schrift.display(.halbfett, 16)).foregroundStyle(Farbe.ink)
            if v.nurStorno && !v.serientermin, let g = Platzplan.blockingLabel(title: b.title, typeName: b.typeName).grund {
                Text(g).leise()
            }
            if m.darfPlaetze && b.isOwn != true && !v.nurStorno {
                Text("Du bearbeitest eine fremde Buchung mit Platzrechten.").leise()
            }
            if v.laeuftSchon {
                Text("Die Spielzeit läuft bereits – Änderungen nur mit Platzrechten.").leise()
            }
            if let t = Verwalten.suchtText(b) {
                Text(t).font(Schrift.text(.fett, Tokens.Schrift.klein)).foregroundStyle(Farbe.blueInk)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
        .padding(.top, -8)

        if !v.nurStorno && v.darfVerwalten {
            Mitspieler(
                kopf: bucher,
                verzeichnis: m.verzeichnis.filter { $0.id != b.ownerMemberId },
                mitglieder: $mitglieder, gaeste: $gaeste, maxWeitere: maxWeitere,
                umfang: art.map { Platzplan.otherPlayersLabel($0.info) } ?? "",
                gastgebuehrCents: m.gastgebuehr, suchen: $suchen
            )
        }

        if !v.nurStorno && !v.darfVerwalten {
            VStack(alignment: .leading, spacing: 0) {
                Feldname(text: "Wer spielt mit?")
                UmbruchStapel(abstand: 8, zeilenabstand: 8) {
                    Chip(kuerzel: bucher.kuerzel, name: bucher.name, gelb: bucher.gelb)
                    ForEach(Array((b.players ?? []).compactMap { $0 }.enumerated()), id: \.offset) { _, p in
                        Chip(kuerzel: PlaetzeLogik.initialen(name: p), name: p)
                    }
                    ForEach(0..<max(b.frei ?? 0, 0), id: \.self) { _ in
                        Chip(kuerzel: "", name: "frei", leer: true)
                    }
                }
            }
        }

        if !v.nurStorno && v.darfVerwalten && ((b.frei ?? 0) > 0 || b.partnerWanted == true) {
            GesuchtKarte(
                an: b.partnerWanted == true, deaktiviert: m.laeuft, filter: $filter,
                speichern: b.partnerWanted == true && filter != b.suchfilter
                    ? { Task { await m.filterAendern(b.bookingId, filter: filter) } }
                    : nil
            ) { an in
                Task { await m.ausschreiben(b.bookingId, gesucht: an, filter: filter) }
            }
        }

        if bearbeitenOffen && v.kannSperreAendern {
            SperreBearbeiten(modell: m, sperre: b, tag: tag) { bearbeitenOffen = false }
        } else {
            VStack(spacing: 10) {
                // Beim Umsetzen steht der Fehler dort, wo getippt wurde.
                FehlerText(text: umsetzOffen ? nil : m.fensterFehler)

                if v.kannSperreAendern && !stornoOffen {
                    BlattHauptknopf(text: "Sperrung bearbeiten", gesperrt: m.laeuft) { bearbeitenOffen = true }
                }
                if v.kannMitspielen {
                    BlattHauptknopf(text: m.laeuft ? "Wird eingetragen …" : "Mitspielen", gesperrt: m.laeuft) {
                        Task { await m.beitreten(b.bookingId) }
                    }
                }
                if !v.nurStorno && v.darfVerwalten && geaendert {
                    BlattHauptknopf(text: m.laeuft ? "Wird gespeichert …" : "Mitspieler speichern", gesperrt: m.laeuft) {
                        Task { await m.speichern(b.bookingId, mitglieder: mitglieder, gaeste: gaeste) }
                    }
                }
                if v.darfVerwalten && stornoOffen && v.grundFeld {
                    VStack(alignment: .leading, spacing: 0) {
                        Feldname(text: v.grundNoetig ? "Grund" : "Grund (freiwillig)")
                        Eingabe(
                            platzhalter: v.serientermin ? "z. B. Ferien" : "Steht in der Nachricht an die Betroffenen",
                            bedienName: "Grund", text: $grund
                        )
                    }
                }
                // Im zweiten Schritt steht "Abbrechen" daneben: zurueck, ohne das Blatt zu schliessen (U76).
                if v.darfVerwalten {
                    ViewThatFits(in: .horizontal) {
                        HStack(spacing: 10) { stornoKnoepfe(v) }
                        VStack(spacing: 10) { stornoKnoepfe(v) }
                    }
                }
                if b.isOwn == true && !v.nurStorno && !v.laeuftSchon {
                    Fussnote(text: "Stornieren geht bis Spielbeginn")
                }
            }
        }

        // Abgesetzt wie das Sperren: Umsetzen ist die Ausnahme, wenn ein Platz ausfaellt.
        if v.kannUmsetzen {
            VStack(alignment: .leading, spacing: 10) {
                if umsetzOffen {
                    UmsetzBereich(modell: m, b: b, planTag: tag, jetzt: jetzt) { umsetzOffen = false }
                } else {
                    Nebenknopf(text: "Umsetzen", klein: true) {
                        umsetzOffen = true
                        stornoOffen = false
                    }
                }
            }
            .padding(.top, 16)
            .overlay(alignment: .top) { Farbe.line.frame(height: 1) }
        }
    }

    @ViewBuilder private func stornoKnoepfe(_ v: Verwalten) -> some View {
        let m = modell
        // Rot gefuellt nur als Bestaetigung, daneben der neutrale Weg zurueck.
        Nebenknopf(
            text: v.stornoText(bestaetigen: stornoOffen),
            stufe: stornoOffen ? .gefahr : .gefahrLeise,
            gesperrt: m.laeuft || (stornoOffen && v.grundNoetig && grund.trimmingCharacters(in: .whitespaces).isEmpty)
        ) {
            if !stornoOffen {
                stornoOffen = true
                umsetzOffen = false
            } else if v.serientermin {
                Task { await m.terminAbsagen(b.bookingId, grund: grund) }
            } else if v.nurStorno {
                Task { await m.sperreAufheben(b.bookingId) }
            } else {
                Task { await m.stornieren(b.bookingId, grund: grund) }
            }
        }
        if stornoOffen {
            Nebenknopf(text: "Abbrechen", gesperrt: m.laeuft) {
                stornoOffen = false
                grund = ""
            }
        }
    }
}

// MARK: - Sperrung bearbeiten

/**
 * Zeit, Plaetze, Kategorie und Grund einer Sperrung - wie beim Sperren
 * zweistufig. Der Tag bleibt der des Plans.
 */
private struct SperreBearbeiten: View {
    let modell: PlaetzeModell
    let sperre: TagesBelegung
    let tag: String
    let zurueck: () -> Void

    @State private var plaetze: [String]
    @State private var von: Int
    @State private var bis: Int
    @State private var art: String
    @State private var grund: String
    @State private var kollisionen: Int?

    init(modell: PlaetzeModell, sperre: TagesBelegung, tag: String, zurueck: @escaping () -> Void) {
        self.modell = modell
        self.sperre = sperre
        self.tag = tag
        self.zurueck = zurueck
        let zeit = Platzplan.sperrZeit(sperre)
        _plaetze = State(initialValue: [sperre.courtId])
        _von = State(initialValue: zeit.von)
        _bis = State(initialValue: zeit.bis)
        // Eine abgeschaltete Kategorie bleibt waehlbar, solange die Sperrung sie traegt.
        _art = State(initialValue: sperre.typeCode ?? modell.blockungsarten.first?.code ?? "platzpflege")
        _grund = State(initialValue: Platzplan.nichtLeer(sperre.title) ?? "")
    }

    var body: some View {
        let m = modell
        let schritt = max(m.raster, 1)
        var arten = m.blockungsarten.map { ($0.code, $0.name ?? $0.code) }
        if let code = sperre.typeCode, !arten.contains(where: { $0.0 == code }) {
            arten.insert((code, sperre.typeName ?? code), at: 0)
        }

        return VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 0) {
                Feldname(text: "Plätze")
                Chipwahl(optionen: m.plaetze.map { ($0.id, $0.name ?? "") }, gewaehlt: { plaetze.contains($0) }) { id in
                    if plaetze.contains(id) { plaetze.removeAll { $0 == id } } else { plaetze.append(id) }
                    kollisionen = nil
                }
            }
            VStack(alignment: .leading, spacing: 8) {
                Feldname(text: "Zeit").padding(.bottom, -8)
                Zeitschritt(name: "Von", minute: von, schritt: schritt, min: 0, max: bis - schritt) { von = $0; kollisionen = nil }
                Zeitschritt(name: "Bis", minute: bis, schritt: schritt, min: von + schritt, max: 24 * 60) { bis = $0; kollisionen = nil }
            }
            VStack(alignment: .leading, spacing: 0) {
                Feldname(text: "Kategorie")
                Chipwahl(optionen: arten, gewaehlt: { $0 == art }) { art = $0; kollisionen = nil }
            }
            VStack(alignment: .leading, spacing: 0) {
                Feldname(text: "Grund (freiwillig)")
                Eingabe(platzhalter: "z. B. nach Regen", bedienName: "Grund der Sperrung, freiwillig", text: $grund)
            }
            VStack(spacing: 10) {
                FehlerText(text: m.fensterFehler)
                if let n = kollisionen {
                    Text(PlaetzeLogik.imWegText(n)).leise().frame(maxWidth: .infinity, alignment: .leading)
                    Nebenknopf(text: PlaetzeLogik.verdraengenText(n), stufe: .gefahr, gesperrt: m.laeuft) { speichern(verdraengen: true) }
                } else {
                    BlattHauptknopf(text: m.laeuft ? "Wird gespeichert …" : "Änderungen speichern", gesperrt: m.laeuft || plaetze.isEmpty) {
                        speichern(verdraengen: false)
                    }
                }
                Nebenknopf(text: "Doch nicht", klein: true, aktion: zurueck)
            }
        }
    }

    private func speichern(verdraengen: Bool) {
        Task {
            kollisionen = await modell.sperreAendern(
                sperre.bookingId, platzIds: plaetze, tag: tag, von: von, bis: bis, typ: art, grund: grund, verdraengen: verdraengen
            )
        }
    }
}

/// Eine Uhrzeit mit Minus und Plus, im Raster des Plans.
private struct Zeitschritt: View {
    let name: String
    let minute: Int
    let schritt: Int
    let min: Int
    let max: Int
    let wert: (Int) -> Void

    var body: some View {
        HStack(spacing: 12) {
            Text(name).font(Schrift.text(.halbfett, 15)).foregroundStyle(Farbe.ink2).frame(maxWidth: .infinity, alignment: .leading)
            knopf("minus", aus: minute - schritt < min, label: "\(name) \(schritt) Minuten früher") { wert(minute - schritt) }
            Text(Zeit.minutesToTime(minute))
                .font(Schrift.display(.fett, 20))
                .monospacedDigit()
                .foregroundStyle(Farbe.ink)
                .frame(minWidth: 64)
                .accessibilityLabel("\(name) \(Zeit.minutesToTime(minute)) Uhr")
            knopf("plus", aus: minute + schritt > max, label: "\(name) \(schritt) Minuten später") { wert(minute + schritt) }
        }
        .padding(6)
        .padding(.leading, 14)
        .background(Farbe.surf2, in: Capsule())
        .overlay(Capsule().strokeBorder(Farbe.line, lineWidth: 1))
    }

    private func knopf(_ symbol: String, aus: Bool, label: String, aktion: @escaping () -> Void) -> some View {
        Button(action: aktion) {
            Image(systemName: symbol)
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(Farbe.ink)
                .frame(width: 44, height: 44)
                .background(Farbe.surf3, in: Circle())
        }
        .buttonStyle(.plain)
        .disabled(aus)
        .opacity(aus ? 0.4 : 1)
        .accessibilityLabel(label)
    }
}

// MARK: - Umsetzen

/**
 * Wohin mit der Buchung? Platz, Tag und Beginn. Was waehlbar ist, rechnet
 * umsetzZiele aus der Belegung des Zieltags; fuer einen anderen Tag wird
 * day_schedule nachgeladen. Eine laufende Buchung wechselt nur den Platz.
 */
private struct UmsetzBereich: View {
    let modell: PlaetzeModell
    let b: TagesBelegung
    let planTag: String
    let jetzt: Date
    let zurueck: () -> Void

    @State private var tag: String
    @State private var andererTag: (tag: String, belegung: [TagesBelegung])?
    @State private var ladeFehler: String?
    @State private var platzWahl: String?
    @State private var minuteWahl: Int?
    @State private var grund = ""

    init(modell: PlaetzeModell, b: TagesBelegung, planTag: String, jetzt: Date, zurueck: @escaping () -> Void) {
        self.modell = modell
        self.b = b
        self.planTag = planTag
        self.jetzt = jetzt
        self.zurueck = zurueck
        _tag = State(initialValue: planTag)
    }

    var body: some View {
        let m = modell
        let laeuftSchon = (Zeit.datum(b.startsAt) ?? .distantPast) <= jetzt
        let belegung: [TagesBelegung]? = tag == planTag ? m.belegung : andererTag?.tag == tag ? andererTag?.belegung : nil
        let ziele = belegung.map {
            Platzplan.umsetzZiele(
                booking: b, day: tag, courtIds: m.plaetze.map(\.id), openingMinutes: m.oeffnung,
                closingMinutes: m.schluss, slotMinutes: m.raster, occupied: $0, now: jetzt
            )
        } ?? []
        // Die Wahl bleibt, solange sie noch ein Ziel ist; vorgewaehlt wird ein anderer Platz zur selben Zeit.
        let mitZiel = m.plaetze.filter { p in ziele.contains { $0.courtId == p.id } }
        let platz = mitZiel.first { $0.id == platzWahl } ?? mitZiel.first { $0.id != b.courtId } ?? mitZiel.first
        let zeiten = ziele.filter { $0.courtId == platz?.id }.map(\.minute)
        let eigeneMinute = Zeit.minutesOf(b.startsAt)
        let minute = minuteWahl.flatMap { zeiten.contains($0) ? $0 : nil }
            ?? (zeiten.contains(eigeneMinute) ? eigeneMinute : zeiten.first)
        let dauer = Zeit.minutesOf(b.endsAt) - eigeneMinute
        let grundNoetig = b.isOwn != true
        let bereit = platz != nil && minute != nil && !(grundNoetig && grund.trimmingCharacters(in: .whitespaces).isEmpty)
        // Der Tag der Buchung steht immer zur Wahl.
        let tage = Array(Set([planTag] + m.tage)).filter { $0 >= Zeit.berlinDay(jetzt) }.sorted()

        if laeuftSchon {
            Text("Die Buchung läuft schon – sie kann nur noch den Platz wechseln.").leise()
        } else {
            VStack(alignment: .leading, spacing: 0) {
                Feldname(text: "Tag")
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(tage, id: \.self) { t in
                            TagKachel(tag: t, aktiv: t == tag) { Task { await waehle(t) } }
                        }
                    }
                }
            }
        }

        if let ladeFehler {
            Text(ladeFehler).font(Schrift.text(.mittel, 14)).foregroundStyle(Farbe.redInk)
        } else if belegung == nil {
            Text("Belegung wird geladen …").leise()
        } else if ziele.isEmpty {
            Text("An diesem Tag ist kein Platz frei, auf den die Buchung passt.").leise()
        } else {
            VStack(alignment: .leading, spacing: 0) {
                Feldname(text: "Platz")
                Segmente(
                    beschriftung: "Platz",
                    optionen: m.plaetze.map { p in (p.id, p.shortName ?? p.name ?? "", !mitZiel.contains(p)) },
                    wert: Binding(get: { platz?.id ?? "" }, set: { platzWahl = $0 })
                )
            }
            VStack(alignment: .leading, spacing: 0) {
                Feldname(text: "Beginn")
                UmbruchStapel(abstand: 8, zeilenabstand: 8) {
                    ForEach(zeiten, id: \.self) { z in
                        let aktiv = z == minute
                        Button { minuteWahl = z } label: {
                            Text(Zeit.minutesToTime(z))
                                .monospacedDigit()
                                .frame(minWidth: 40)
                                .auswahlPille(aktiv, hoehe: 40, rand: 12)
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(aktiv ? [.isSelected] : [])
                    }
                }
                .accessibilityElement(children: .contain)
                .accessibilityLabel("Beginn")
            }
        }

        VStack(alignment: .leading, spacing: 0) {
            Feldname(text: grundNoetig ? "Grund" : "Grund (freiwillig)")
            Eingabe(platzhalter: "z. B. Platz 3 steht unter Wasser", bedienName: "Grund fürs Umsetzen", text: $grund)
        }

        if let platz, let minute {
            Text("Neu: \(platz.name ?? "") · \(PlaetzeLogik.tagText(tag)) · \(Zeit.minutesToTime(minute))–\(Zeit.minutesToTime(minute + dauer)) Uhr. Bucher und Mitspieler werden benachrichtigt.")
                .leise()
                .fixedSize(horizontal: false, vertical: true)
        }

        FehlerText(text: m.fensterFehler)
        Nebenknopf(text: m.laeuft ? "Wird umgesetzt …" : "Hierhin umsetzen", stufe: .zweit, gesperrt: m.laeuft || !bereit) {
            guard let platz, let minute else { return }
            Task { await m.umsetzen(b.bookingId, courtId: platz.id, tag: tag, minute: minute, grund: grund) }
        }
        Nebenknopf(text: "Doch nicht", klein: true, aktion: zurueck)
    }

    /// Nur die letzte Anfrage zaehlt, wenn schnell durch die Tage getippt wird.
    private func waehle(_ neu: String) async {
        tag = neu
        ladeFehler = nil
        guard neu != planTag else { return }
        do {
            let belegung = try await modell.tagesplan(neu)
            if tag == neu { andererTag = (neu, belegung) }
        } catch {
            if tag == neu { ladeFehler = Meldung.aus(error).text }
        }
    }
}
