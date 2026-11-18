/**
 * Das Buchungsblatt (apps/mobile/src/components/BuchungsFenster.tsx)
 *
 * Dasselbe Blatt fuer Buchen, Bearbeiten, Mitspielen, Stornieren und - als
 * eigene Ansicht im selben Blatt - fuer Sperren und Umsetzen mit
 * Platzrechten. Aufbau nach docs/design/stitch ("Platz buchen", "Eigenes
 * Spiel", "Umsetzen", "Plaetze sperren"): oben fest die Uhrzeit gross mit dem
 * Schliessen-Knopf, in der Mitte der rollende Inhalt mit Kicker-Abschnitten,
 * unten fest und abgesetzt die eine Hauptaktion (BlattGeruest). Nur
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
        Group {
            switch fenster {
            case let .buchen(courtId, platzName, tag, stunde, startzeiten, start):
                BuchenInhalt(
                    modell: modell, courtId: courtId, platzName: platzName, tag: tag, stunde: stunde,
                    startzeiten: startzeiten, vorgabe: start, kicker: kicker
                )
                .presentationDetents([.large])
            case let .verwalten(b, _, tag):
                // Die Karte waehlt ihre Hoehen selbst (halb und ganz, wie in Karten).
                VerwaltenInhalt(modell: modell, b: b, tag: tag, kicker: kicker)
            }
        }
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

// MARK: - Geruest

/**
 * Der Aufbau jedes Blatts: Kopf fest oben, Inhalt rollt, Fuss fest unten
 * hinter einer feinen Linie. So bleibt die Hauptaktion immer erreichbar.
 */
struct BlattGeruest<Kopf: View, Inhalt: View, Fuss: View>: View {
    @ViewBuilder let kopf: Kopf
    @ViewBuilder let inhalt: Inhalt
    @ViewBuilder let fuss: Fuss

    var body: some View {
        VStack(spacing: 0) {
            kopf
                .padding(.horizontal, Tokens.Abstand.rand)
                .padding(.top, 26)
                .padding(.bottom, 18)
            ScrollView {
                VStack(alignment: .leading, spacing: 22) { inhalt }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, Tokens.Abstand.rand)
                    .padding(.top, 4)
                    .padding(.bottom, 24)
            }
            .scrollDismissesKeyboard(.interactively)
            .scrollBounceBehavior(.basedOnSize)
            Farbe.line.frame(height: 1)
            VStack(spacing: 10) { fuss }
                .padding(.horizontal, Tokens.Abstand.rand)
                .padding(.top, 14)
                .padding(.bottom, 10)
        }
        .background(Farbe.surf)
    }
}

// MARK: - Bausteine

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

/// Rueckmeldung der Datenbank, steht ueber dem Hauptknopf.
private struct FehlerText: View {
    let text: String?

    var body: some View {
        if let text {
            Text(text)
                .font(Schrift.text(.mittel, 14))
                .foregroundStyle(Farbe.redInk)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                .onAppear { UIAccessibility.post(notification: .announcement, argument: text) }
        }
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

/**
 * Optionen als gleich breite Pillen im Raster ("17:00 | 17:30"): gewaehlt
 * hellblau mit blauer Linie, sonst weiss mit Linie, nicht waehlbar grau.
 */
private struct Segmente<Wert: Hashable>: View {
    let beschriftung: String
    let optionen: [(wert: Wert, label: String, aus: Bool)]
    @Binding var wert: Wert
    /// Spalten des Rasters; ohne Angabe alle nebeneinander, hoechstens vier.
    var spalten: Int?
    var hoehe: CGFloat = 48

    var body: some View {
        let n = max(1, spalten ?? min(optionen.count, 4))
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: n), spacing: 8) {
            ForEach(optionen, id: \.wert) { o in
                let aktiv = o.wert == wert
                Button { wert = o.wert } label: {
                    let text = Text(o.label)
                        .monospacedDigit()
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .frame(maxWidth: .infinity)
                    if o.aus {
                        text
                            .font(Schrift.display(.halbfett, 15))
                            .foregroundStyle(Farbe.muted.opacity(0.7))
                            .padding(.horizontal, 6)
                            .frame(minHeight: hoehe)
                            .background(Farbe.surf2, in: Capsule())
                            .overlay(Capsule().strokeBorder(Farbe.line, lineWidth: 1))
                    } else {
                        text.auswahlPille(aktiv, hoehe: hoehe, rand: 6)
                    }
                }
                .buttonStyle(.plain)
                .disabled(o.aus)
                .accessibilityAddTraits(aktiv ? [.isSelected] : [])
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(beschriftung)
    }
}

/**
 * "Nur für …": Alle/Damen/Herren und der LK-Bereich von/bis. Minus und Plus
 * gehen in ganzen LK, die Zahl dazwischen oeffnet die Liste in 0,1-Schritten.
 */
private struct NurFuer: View {
    @Binding var filter: Suchfilter
    var speichern: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("Nur für …").font(Schrift.display(.halbfett, 15)).foregroundStyle(Farbe.ink)
                Spacer(minLength: 8)
                Text(filter.zusammenfassung)
                    .font(Schrift.text(.halbfett, 14))
                    .foregroundStyle(filter.istEingeschraenkt ? Farbe.blueInk : Farbe.muted)
                    .lineLimit(1)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Nur für, \(filter.vorleseText)")
            Segmente(
                beschriftung: "Für wen",
                optionen: SucheFuer.allCases.map { ($0, $0.label, false) },
                wert: $filter.fuer,
                hoehe: 40
            )
            HStack(alignment: .top, spacing: 12) {
                lkWahl("LK von", wert: filter.vonZehntel) { filter = filter.mitVon($0) }
                lkWahl("LK bis", wert: filter.bisZehntel) { filter = filter.mitBis($0) }
            }
            Text("1 ist die beste LK, 25 die schwächste. Wer keine LK eingetragen hat, sieht die Suche nur, wenn „bis“ auf 25 steht.")
                .font(Schrift.text(.normal, 13))
                .foregroundStyle(Farbe.muted)
                .fixedSize(horizontal: false, vertical: true)
            if filter.istEingeschraenkt {
                Knopf("Für alle öffnen", stufe: .leise, groesse: .klein) { filter = .offen }
            }
            if let speichern {
                // Zweitaktion: die Hauptaktion des Blatts steht im Fuss.
                Knopf("Filter speichern", breit: true, aktion: speichern)
            }
        }
        .padding(18)
        .background(Farbe.surf2, in: RoundedRectangle(cornerRadius: Tokens.Radius.karte))
        .overlay(RoundedRectangle(cornerRadius: Tokens.Radius.karte).strokeBorder(Farbe.line, lineWidth: 1))
    }

    private func lkWahl(_ name: String, wert: Int, setze: @escaping (Int) -> Void) -> some View {
        let (unten, oben) = (Suchfilter.stufen.first ?? wert, Suchfilter.stufen.last ?? wert)
        return VStack(alignment: .leading, spacing: 6) {
            Text(name).font(Schrift.text(.halbfett, 13)).foregroundStyle(Farbe.ink2).accessibilityHidden(true)
            HStack(spacing: 2) {
                schritt("minus", aus: wert <= unten, label: "\(name) verringern") { setze(max(unten, wert - 10)) }
                Menu {
                    Picker(name, selection: Binding(get: { wert }, set: setze)) {
                        ForEach(Suchfilter.stufen, id: \.self) { z in Text("\(z / 10),\(z % 10)").tag(z) }
                    }
                } label: {
                    Text(wert % 10 == 0 ? "\(wert / 10)" : "\(wert / 10),\(wert % 10)")
                        .font(Schrift.display(.halbfett, 18))
                        .monospacedDigit()
                        .foregroundStyle(Farbe.ink)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .frame(maxWidth: .infinity, minHeight: 40)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel(name)
                .accessibilityValue("\(wert / 10),\(wert % 10)")
                schritt("plus", aus: wert >= oben, label: "\(name) erhöhen") { setze(min(oben, wert + 10)) }
            }
            .padding(4)
            .background(Farbe.surf, in: Capsule())
            .overlay(Capsule().strokeBorder(Farbe.line2, lineWidth: 1))
        }
        .frame(maxWidth: .infinity)
    }

    private func schritt(_ symbol: String, aus: Bool, label: String, aktion: @escaping () -> Void) -> some View {
        Button(action: aktion) {
            Image(systemName: symbol)
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(Farbe.ink)
                .frame(width: 40, height: 40)
                .background(Farbe.surf, in: Circle())
                .overlay(Circle().strokeBorder(Farbe.line2, lineWidth: 1))
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .disabled(aus)
        .opacity(aus ? 0.4 : 1)
        .accessibilityLabel(label)
    }
}

/// Ein Mitspieler als Chip mit X zum Entfernen (Buchen).
private struct Chip: View {
    let name: String
    var weg: (() -> Void)?
    var wegLabel: String?

    var body: some View {
        HStack(spacing: 2) {
            Text(name)
                .font(Schrift.text(.halbfett, 15))
                .foregroundStyle(Farbe.ink)
                .lineLimit(1)
            if let weg {
                Button(action: weg) {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(Farbe.muted)
                        .frame(width: 34, height: 40)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(wegLabel ?? "Entfernen")
            }
        }
        .padding(.leading, 16)
        .padding(.trailing, weg == nil ? 16 : 4)
        .frame(minHeight: 40)
        .background(Farbe.surf2, in: Capsule())
        .overlay(Capsule().strokeBorder(Farbe.line2, lineWidth: 1))
    }
}

/// Ein Mitspieler als Zeile (bestehendes Spiel): Initialen im Kreis, Name, optional ein X. `leer` ist ein freier Platz.
private struct SpielerZeile: View {
    let kuerzel: String
    let name: String
    var leer = false
    var weg: (() -> Void)?
    var wegLabel: String?

    var body: some View {
        HStack(spacing: 12) {
            Group {
                if leer {
                    Image(systemName: "person.badge.plus")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(Farbe.muted)
                        .frame(width: 36, height: 36)
                        .overlay(Circle().strokeBorder(Farbe.line2, style: StrokeStyle(lineWidth: 1.5, dash: [4, 3])))
                } else {
                    Text(kuerzel)
                        .font(Schrift.display(.fett, Tokens.Schrift.kicker))
                        .dynamicTypeSize(...DynamicTypeSize.xLarge)
                        .foregroundStyle(Farbe.blueInk)
                        .frame(width: 36, height: 36)
                        .background(Farbe.blueSoft, in: Circle())
                }
            }
            .accessibilityHidden(true)
            Text(name)
                .font(leer ? Schrift.text(.normal, 16).italic() : Schrift.display(.halbfett, 16))
                .foregroundStyle(leer ? Farbe.muted : Farbe.ink)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
            if let weg {
                Button(action: weg) {
                    Image(systemName: "xmark")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Farbe.muted)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(wegLabel ?? "Entfernen")
            }
        }
        .padding(.leading, 12)
        .padding(.trailing, weg == nil ? 16 : 4)
        .frame(minHeight: 56)
        .background(leer ? Color.clear : Farbe.surf2, in: Capsule())
        .overlay {
            if leer {
                Capsule().strokeBorder(Farbe.line2, style: StrokeStyle(lineWidth: 1.5, dash: [5, 4]))
            } else {
                Capsule().strokeBorder(Farbe.line, lineWidth: 1)
            }
        }
    }
}

// MARK: - Wer spielt mit?

/**
 * Mitspieler durch Tippen finden - rund 300 Mitglieder sind als Auswahlliste
 * am Telefon unbenutzbar. Das Suchfeld steht immer da; Gaeste kommen ueber
 * einen eigenen Verweis: sie kosten Geld, und das soll eine bewusste Handlung
 * sein. Beim Buchen stehen die Gewaehlten als Chips, am bestehenden Spiel als
 * Zeilen mit dem Bucher voran.
 */
private struct Mitspieler: View {
    /// Der Bucher als erste Zeile; ohne ihn (Buchen) stehen Chips.
    var kopf: (kuerzel: String, name: String)?
    let verzeichnis: [Mitglied]
    @Binding var mitglieder: [String]
    @Binding var gaeste: [String]
    let maxWeitere: Int
    /// Wie viele mitspielen, aus der Buchungsart: "1 weitere Person".
    let umfang: String
    let gastgebuehrCents: Int
    /// Von aussen gesetzt holt es den Fokus ins Suchfeld (gesperrter Buchen-Knopf).
    @Binding var suchen: Bool

    @State private var suche = ""
    @FocusState private var fokus: Bool

    private var voll: Bool { mitglieder.count + gaeste.count >= maxWeitere }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Feldname(text: "Wer spielt mit?", zusatz: umfang.isEmpty ? nil : umfang)
            if let kopf {
                VStack(spacing: 8) {
                    SpielerZeile(kuerzel: kopf.kuerzel, name: kopf.name)
                    ForEach(mitglieder, id: \.self) { id in
                        if let m = verzeichnis.first(where: { $0.id == id }) {
                            SpielerZeile(
                                kuerzel: PlaetzeLogik.initialen(m.firstName, m.lastName), name: m.name,
                                weg: { mitglieder.removeAll { $0 == id } }, wegLabel: "\(m.name) entfernen"
                            )
                        }
                    }
                    ForEach(Array(gaeste.enumerated()), id: \.offset) { i, g in
                        SpielerZeile(kuerzel: "G", name: g, weg: { gaeste.remove(at: i) }, wegLabel: "Gast \(i + 1) entfernen")
                    }
                }
                .padding(.bottom, 10)
            } else if !mitglieder.isEmpty || !gaeste.isEmpty {
                UmbruchStapel(abstand: 8, zeilenabstand: 8) {
                    ForEach(mitglieder, id: \.self) { id in
                        if let m = verzeichnis.first(where: { $0.id == id }) {
                            Chip(name: m.name, weg: { mitglieder.removeAll { $0 == id } }, wegLabel: "\(m.name) entfernen")
                        }
                    }
                    ForEach(Array(gaeste.enumerated()), id: \.offset) { i, g in
                        Chip(name: g, weg: { gaeste.remove(at: i) }, wegLabel: "Gast \(i + 1) entfernen")
                    }
                }
                .padding(.bottom, 10)
            }

            if voll {
                Text("Für diese Spielform sind alle Plätze besetzt.").leise()
            } else {
                suchfeld
                treffer
                Button { gaeste.append(gast) } label: {
                    Label(PlaetzeLogik.gastText(gebuehrCents: gastgebuehrCents), systemImage: "plus")
                        .font(Schrift.display(.halbfett, 15))
                        .foregroundStyle(Farbe.blueInk)
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.top, 2)
                .accessibilityLabel(gastgebuehrCents > 0 ? "Gast hinzufügen, \(Geld.formatCents(gastgebuehrCents))" : "Gast hinzufügen")
            }

            if !gaeste.isEmpty && gastgebuehrCents > 0 {
                Text(PlaetzeLogik.gastHinweis(gebuehrCents: gastgebuehrCents)).leise()
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 4)
            }
        }
        .onChange(of: suchen) { _, neu in
            if neu {
                fokus = true
                suchen = false
            }
        }
    }

    private var suchfeld: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(Farbe.muted)
                .accessibilityHidden(true)
            TextField("", text: $suche, prompt: Text("Namen tippen …").foregroundColor(Farbe.muted))
                .font(Schrift.text(.normal, 16))
                .foregroundStyle(Farbe.ink)
                .textInputAutocapitalization(.words)
                .autocorrectionDisabled()
                .focused($fokus)
                .accessibilityLabel("Mitspieler suchen")
        }
        .padding(.horizontal, 18)
        .frame(minHeight: 52)
        .background(Farbe.surf2, in: RoundedRectangle(cornerRadius: Tokens.Radius.feld))
        .overlay(
            RoundedRectangle(cornerRadius: Tokens.Radius.feld)
                .strokeBorder(fokus ? Farbe.blue : Farbe.line2, lineWidth: fokus ? 1.5 : 1)
        )
        .contentShape(Rectangle())
        .onTapGesture { fokus = true }
    }

    @ViewBuilder private var treffer: some View {
        if !suche.trimmingCharacters(in: .whitespaces).isEmpty {
            let gefunden = PlaetzeLogik.treffer(suche, in: verzeichnis, ohne: mitglieder)
            if gefunden.isEmpty {
                Text("Niemand gefunden.").leise().padding(.top, 8)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(gefunden.enumerated()), id: \.element.id) { i, m in
                        if i > 0 { Farbe.line.frame(height: 1) }
                        Button {
                            mitglieder.append(m.id)
                            suche = ""
                        } label: {
                            Text("\(m.lastName ?? ""), \(m.firstName ?? "")")
                                .font(Schrift.text(.normal, 16))
                                .foregroundStyle(Farbe.ink)
                                .padding(.horizontal, 18)
                                .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .background(Farbe.surf, in: RoundedRectangle(cornerRadius: 20))
                .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(Farbe.line2, lineWidth: 1))
                .padding(.top, 8)
            }
        }
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
    @State private var sperrenOffen = false
    @State private var suche = ""
    @FocusState private var suchfokus: Bool
    @Environment(\.blattSchliessen) private var schliessen

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
        buchen
    }

    /**
     * Buchen als natives Formular (Apple HIG): Titel "Platz buchen" mit
     * "Abbrechen" in der Leiste, oben gross die Zeit, darunter gruppierte
     * Abschnitte. Unten fest die eine Hauptaktion.
     */
    private var buchen: some View {
        let m = modell
        let gewaehlt = m.arten.first { $0.code == art }
        let info = gewaehlt?.info
        let dauer = gewaehlt?.durationMinutes ?? 60
        let maxWeitere = max((gewaehlt?.maxPlayers ?? 2) - 1, 0)
        let nochPlatz = mitglieder.count + gaeste.count < maxWeitere
        let hinweis = PlaetzeLogik.buchenHinweis(art: info, mitglieder: mitglieder.count, gaeste: gaeste.count, sucht: sucht)
        let haelften = Array(stride(from: stunde, to: stunde + m.anzeige, by: max(m.raster, 1)))
        let artWahl = Binding(get: { art }, set: { (neu: String) in
            art = neu
            let k = PlaetzeLogik.kuerze(
                mitglieder: mitglieder, gaeste: gaeste, maxPlayers: m.arten.first { $0.code == neu }?.maxPlayers ?? 2
            )
            mitglieder = k.mitglieder
            gaeste = k.gaeste
        })

        let gesperrt = m.laeuft || hinweis != nil
        let buchen = {
            Task {
                await m.buchen(
                    courtId: courtId, tag: tag, start: start, typ: art, mitglieder: mitglieder, gaeste: gaeste,
                    sucht: sucht, filter: filter
                )
            }
        }

        return NavigationStack {
            List {

                // Kopf wie an der Karte einer bestehenden Buchung: die Zeit gross, darunter Platz und Tag.
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("\(Zeit.minutesToTime(start)) – \(Zeit.minutesToTime(start + dauer))")
                            .font(.largeTitle.weight(.bold))
                            .monospacedDigit()
                            .foregroundStyle(Farbe.ink)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                            .accessibilityAddTraits(.isHeader)
                        Text(kicker).font(.subheadline).foregroundStyle(Farbe.muted)
                        Label("\(gewaehlt?.name ?? "Spiel") · Stornieren geht bis Spielbeginn", systemImage: "tennis.racket")
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(Farbe.ink2)
                    }
                    .listRowInsets(EdgeInsets(top: 0, leading: 4, bottom: 4, trailing: 4))
                    .listRowBackground(Color.clear)
                }

                Section {
                    Segmente(
                        beschriftung: "Beginn",
                        optionen: haelften.map { ($0, Zeit.minutesToTime($0), !startzeiten.contains($0)) },
                        wert: $start,
                        hoehe: 40
                    )
                    .padding(.vertical, 4)
                    .gruppenZeile()
                } header: {
                    GruppenKopf(titel: "Beginn")
                }

                Section {
                    if m.arten.count <= 3 {
                        Picker("Spielform", selection: artWahl) {
                            ForEach(m.arten, id: \.code) { Text($0.name ?? $0.code).tag($0.code) }
                        }
                        .pickerStyle(.segmented)
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                    } else {
                        Picker("Spielform", selection: artWahl) {
                            ForEach(m.arten, id: \.code) { Text($0.name ?? $0.code).tag($0.code) }
                        }
                        .pickerStyle(.menu)
                        .gruppenZeile()
                    }
                } header: {
                    GruppenKopf(titel: "Spielform")
                }

                mitspielerAbschnitt(
                    m, maxWeitere: maxWeitere, umfang: info.map(Platzplan.otherPlayersLabel) ?? "",
                    hinweis: m.laeuft ? nil : hinweis
                )

                if nochPlatz {
                    Section {
                        Toggle("Mitspieler gesucht", isOn: $sucht)
                            .tint(Farbe.blue)
                            .gruppenZeile()
                    } header: {
                        GruppenKopf(titel: "Details")
                    } footer: {
                        Text("Dein Spiel erscheint unter „Offene Spiele“. Wer mag, trägt sich selbst ein.")
                            .foregroundStyle(Farbe.muted)
                    }
                    if sucht {
                        Section {
                            NurFuer(filter: $filter, speichern: nil)
                                .listRowInsets(EdgeInsets())
                                .listRowBackground(Color.clear)
                        }
                    }
                }

                // Sperren ist die Ausnahme, nicht der Regelfall: abgesetzt am Ende.
                if m.darfPlaetze {
                    Section {
                        Button {
                            m.fensterFehler = nil
                            sperrenOffen = true
                        } label: {
                            HStack(spacing: 14) {
                                IconKachel(symbol: "lock.fill", farbe: Farbe.muted)
                                Text("Stattdessen sperren").foregroundStyle(Farbe.ink)
                                Spacer()
                                ZeilenPfeil()
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .gruppenZeile()
                    }
                }
            }
            .gruppenListe()
            .listSectionSpacing(20)
            .scrollDismissesKeyboard(.interactively)
            // Fehler unten statt oben in der Liste: die Aktion sitzt oben im ✓, gerollt ist oft weit nach unten.
            .bestaetigung(Binding(get: { m.fensterFehler }, set: { m.fensterFehler = $0 }), ok: false)
            .navigationTitle("Neue Buchung")
            .navigationBarTitleDisplayMode(.inline)
            // Sperren als Unterseite mit "‹ Zurück", wie Umsetzen in der Buchungskarte.
            .navigationDestination(isPresented: $sperrenOffen) {
                SperrAnsicht(modell: m, courtId: courtId, platzName: platzName, tag: tag, stunde: stunde, kicker: kicker)
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { schliessen() } label: { Image(systemName: "xmark") }
                        .accessibilityLabel("Abbrechen")
                }
                // ✓ bucht - wie "Hinzufügen" bei einem neuen Termin in Kalender.
                ToolbarItem(placement: .confirmationAction) {
                    if m.laeuft {
                        ProgressView()
                    } else {
                        Button { buchen() } label: { Image(systemName: "checkmark") }
                            .tint(Farbe.blue)
                            .disabled(gesperrt)
                            .accessibilityLabel("\(platzName) buchen")
                            .accessibilityHint(hinweis ?? "")
                    }
                }
            }
        }
    }

    /// "Wer spielt mit?": Gewaehlte als Zeilen (wischen oder X entfernt), darunter das Suchfeld und "Gast hinzufügen".
    private func mitspielerAbschnitt(_ m: PlaetzeModell, maxWeitere: Int, umfang: String, hinweis: String?) -> some View {
        let verzeichnis = m.verzeichnis.filter { $0.id != m.meineId }
        let voll = mitglieder.count + gaeste.count >= maxWeitere
        let gefunden = suche.trimmingCharacters(in: .whitespaces).isEmpty
            ? [] : PlaetzeLogik.treffer(suche, in: verzeichnis, ohne: mitglieder)
        return Section {
            PersonZeile(kuerzel: "Du", name: "Du", zusatz: "bucht")
            ForEach(mitglieder, id: \.self) { id in
                if let mg = verzeichnis.first(where: { $0.id == id }) {
                    personZeile(PlaetzeLogik.initialen(mg.firstName, mg.lastName), mg.name, label: "\(mg.name) entfernen") {
                        mitglieder.removeAll { $0 == id }
                    }
                }
            }
            ForEach(Array(gaeste.enumerated()), id: \.offset) { i, g in
                personZeile("G", g, label: "Gast \(i + 1) entfernen") { gaeste.remove(at: i) }
            }
            if maxWeitere > 0 && !voll {
                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass").foregroundStyle(Farbe.muted).accessibilityHidden(true)
                    TextField("Mitspieler hinzufügen …", text: $suche)
                        .textInputAutocapitalization(.words)
                        .autocorrectionDisabled()
                        .focused($suchfokus)
                        .accessibilityLabel("Mitspieler suchen")
                }
                .gruppenZeile()
                if !suche.trimmingCharacters(in: .whitespaces).isEmpty && gefunden.isEmpty {
                    Text("Niemand gefunden.").foregroundStyle(Farbe.muted).gruppenZeile()
                }
                ForEach(gefunden, id: \.id) { mg in
                    Button {
                        mitglieder.append(mg.id)
                        suche = ""
                    } label: {
                        HStack {
                            Text("\(mg.lastName ?? ""), \(mg.firstName ?? "")").foregroundStyle(Farbe.ink)
                            Spacer()
                            Image(systemName: "plus.circle.fill").foregroundStyle(Farbe.blue).accessibilityHidden(true)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .gruppenZeile()
                }
                Button { gaeste.append(gast) } label: {
                    Label(PlaetzeLogik.gastText(gebuehrCents: m.gastgebuehr), systemImage: "plus.circle.fill")
                        .foregroundStyle(Farbe.blueInk)
                }
                .buttonStyle(.borderless)
                .gruppenZeile()
                .accessibilityLabel(m.gastgebuehr > 0 ? "Gast hinzufügen, \(Geld.formatCents(m.gastgebuehr))" : "Gast hinzufügen")
            }
        } header: {
            GruppenKopf(titel: "Spieler", zusatz: umfang.isEmpty ? nil : umfang)
        } footer: {
            VStack(alignment: .leading, spacing: 4) {
                // Was zum Buchen noch fehlt - neutral, es ist kein Fehler; solange ist ✓ gesperrt.
                if let hinweis { Text(hinweis).foregroundStyle(Farbe.ink2) }
                if !gaeste.isEmpty && m.gastgebuehr > 0 {
                    Text(PlaetzeLogik.gastHinweis(gebuehrCents: m.gastgebuehr)).foregroundStyle(Farbe.muted)
                }
            }
        }
    }

    private func personZeile(_ kuerzel: String, _ name: String, label: String, weg: @escaping () -> Void) -> some View {
        PersonZeile(kuerzel: kuerzel, name: name, weg: weg, wegLabel: label)
    }
}

/// Eine Person: Initialen im Kreis, Name; zum Entfernen links ein rotes ⊖ wie in Kontakte.
private struct PersonZeile: View {
    let kuerzel: String
    let name: String
    var zusatz: String?
    var weg: (() -> Void)?
    var wegLabel: String?

    var body: some View {
        HStack(spacing: 12) {
            if let weg {
                Button(action: weg) {
                    Image(systemName: "minus.circle.fill")
                        .font(.title3)
                        .symbolRenderingMode(.palette)
                        .foregroundStyle(.white, Farbe.red)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(wegLabel ?? "\(name) entfernen")
            }
            Text(kuerzel)
                .font(.footnote.weight(.bold))
                .dynamicTypeSize(...DynamicTypeSize.xLarge)
                .foregroundStyle(Farbe.blueInk)
                .frame(width: 32, height: 32)
                .background(Farbe.blueSoft, in: Circle())
                .accessibilityHidden(true)
            Text(name).foregroundStyle(Farbe.ink).lineLimit(1)
            Spacer(minLength: 0)
            if let zusatz { Text(zusatz).font(.subheadline).foregroundStyle(Farbe.muted) }
        }
        .gruppenZeile()
    }
}

/**
 * Sperren statt buchen: eine Unterseite des Buchungsfensters. Gesperrt wird
 * der ganze Anzeigeblock; Kategorie als Menue, Grund als Feld. ✓ sperrt;
 * liegen Buchungen im Weg, fragt ein Action Sheet, ob sie verdraengt werden.
 */
private struct SperrAnsicht: View {
    let modell: PlaetzeModell
    let courtId: String
    let platzName: String
    let tag: String
    let stunde: Int
    let kicker: String

    @State private var grund = ""
    @State private var art: String
    @State private var kollisionen: Int?

    init(modell: PlaetzeModell, courtId: String, platzName: String, tag: String, stunde: Int, kicker: String) {
        self.modell = modell
        self.courtId = courtId
        self.platzName = platzName
        self.tag = tag
        self.stunde = stunde
        self.kicker = kicker
        // Vorgabe bleibt die Platzpflege; sonst die erste Kategorie.
        _art = State(initialValue: modell.blockungsarten.first { $0.code == "platzpflege" }?.code
            ?? modell.blockungsarten.first?.code ?? "platzpflege")
    }

    var body: some View {
        let m = modell
        let bis = stunde + m.anzeige
        List {
            Section {
                VStack(alignment: .leading, spacing: 4) {
                    Text("\(Zeit.minutesToTime(stunde)) – \(Zeit.minutesToTime(bis))")
                        .font(.largeTitle.weight(.bold))
                        .monospacedDigit()
                        .foregroundStyle(Farbe.ink)
                    Text(kicker).font(.subheadline).foregroundStyle(Farbe.ink2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .listRowInsets(EdgeInsets(top: 0, leading: 4, bottom: 0, trailing: 4))
            .listRowBackground(Color.clear)
            Section {
                Picker("Kategorie", selection: Binding(get: { art }, set: { art = $0; kollisionen = nil })) {
                    ForEach(m.blockungsarten, id: \.code) { Text($0.name ?? $0.code).tag($0.code) }
                }
                .pickerStyle(.menu)
                .gruppenZeile()
                TextField("", text: $grund, prompt: Text("Grund, etwa nach Regen").foregroundStyle(Farbe.muted))
                    .accessibilityLabel("Grund der Sperrung, freiwillig")
                    .gruppenZeile()
            } footer: {
                Text("Gesperrt wird \(Zeit.minutesToTime(stunde))–\(Zeit.minutesToTime(bis)) Uhr auf \(platzName).")
                    .foregroundStyle(Farbe.muted)
            }
        }
        .gruppenListe()
        .listSectionSpacing(20)
        .scrollDismissesKeyboard(.interactively)
        // Fehler unten statt oben in der Liste: die Aktion sitzt oben im ✓, gerollt ist oft weit nach unten.
        .bestaetigung(Binding(get: { m.fensterFehler }, set: { m.fensterFehler = $0 }), ok: false)
        .navigationTitle("Platz sperren")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                if m.laeuft {
                    ProgressView()
                } else {
                    Button { sperren(verdraengen: false) } label: { Image(systemName: "checkmark") }
                        .accessibilityLabel("Sperren")
                }
            }
        }
        .confirmationDialog(
            kollisionen.map(PlaetzeLogik.imWegText) ?? "",
            isPresented: Binding(get: { kollisionen != nil }, set: { if !$0 { kollisionen = nil } }),
            titleVisibility: .visible
        ) {
            if let n = kollisionen {
                Button(PlaetzeLogik.verdraengenText(n), role: .destructive) { sperren(verdraengen: true) }
            }
            Button("Abbrechen", role: .cancel) {}
        }
        .onDisappear { m.fensterFehler = nil }
    }

    private func sperren(verdraengen: Bool) {
        let bis = stunde + modell.anzeige
        Task {
            kollisionen = await modell.sperren(
                courtId: courtId, tag: tag, von: stunde, bis: bis, typ: art, grund: grund, verdraengen: verdraengen
            )
        }
    }
}

// MARK: - Bearbeiten, Mitspielen, Stornieren

/**
 * Eine bestehende Buchung, Sperrung oder ein Training als Karte - nach dem
 * Vorbild der Karten-App (Blatt mit halber und ganzer Hoehe, Aktionsreihe)
 * und der Kontakte-App (Bearbeiten in derselben Ansicht: ✕ verwirft, ✓
 * speichert). Stornieren fragt per Action Sheet, mit Grund per Alert.
 */
private struct VerwaltenInhalt: View {
    @Environment(\.blattSchliessen) private var schliessen
    let modell: PlaetzeModell
    let b: TagesBelegung
    let tag: String
    let kicker: String

    @State private var mitglieder: [String]
    @State private var gaeste: [String]
    @State private var sucht: Bool
    /// "Nur für …" der Suche, beim Oeffnen aus day_schedule
    @State private var filter: Suchfilter
    @State private var bearbeiten = false
    @State private var umsetzOffen = false
    @State private var sperreOffen = false
    @State private var stornoFragen = false
    @State private var grundFragen = false
    @State private var verwerfenFragen = false
    @State private var grund = ""
    @State private var suche = ""
    @State private var hoehe: PresentationDetent = .medium
    @FocusState private var suchfokus: Bool
    /// Einmal beim Oeffnen: die Uhr soll nicht unter dem Finger Knoepfe wegnehmen.
    @State private var jetzt = Date()

    init(modell: PlaetzeModell, b: TagesBelegung, tag: String, kicker: String) {
        self.modell = modell
        self.b = b
        self.tag = tag
        self.kicker = kicker
        _mitglieder = State(initialValue: (b.playerMemberIds ?? []).compactMap { $0 })
        _gaeste = State(initialValue: (b.guestNames ?? []).compactMap { $0 })
        _sucht = State(initialValue: b.partnerWanted == true)
        _filter = State(initialValue: b.suchfilter)
    }

    private var zeit: String {
        "\(Zeit.minutesToTime(Zeit.minutesOf(b.startsAt))) – \(Zeit.minutesToTime(Zeit.minutesOf(b.endsAt)))"
    }

    var body: some View {
        let v = Verwalten(b, darfPlaetze: modell.darfPlaetze, jetzt: jetzt)
        karte(v)
        .presentationDetents(umsetzOffen || sperreOffen ? [.large] : [.medium, .large], selection: $hoehe)
        // Beim Bearbeiten nicht versehentlich wegwischen; ✕ fragt nach, wenn etwas geaendert ist.
        .interactiveDismissDisabled(bearbeiten)
        .onChange(of: umsetzOffen || sperreOffen || bearbeiten) { _, gross in
            if gross { hoehe = .large }
        }
        #if DEBUG
        // Fuer Bildschirmfotos per simctl: `-TCMBearbeiten` oeffnet die Karte gleich zum Bearbeiten.
        // `-TCMUmsetzen` und `-TCMSperre` oeffnen die Unterseiten (nur mit Platzrechten).
        .onAppear {
            let argumente = ProcessInfo.processInfo.arguments
            if argumente.contains("-TCMBearbeiten") { bearbeiten = true }
            if argumente.contains("-TCMUmsetzen") { umsetzOffen = true }
            if argumente.contains("-TCMSperre") { sperreOffen = true }
        }
        #endif
    }

    // MARK: Ableitungen

    private func vorher() -> (mitglieder: [String], gaeste: [String]) {
        ((b.playerMemberIds ?? []).compactMap { $0 }, (b.guestNames ?? []).compactMap { $0 })
    }

    private var spielerGeaendert: Bool {
        let (m, g) = vorher()
        return mitglieder.sorted() != m.sorted() || gaeste.sorted() != g.sorted()
    }

    private var sucheGeaendert: Bool {
        sucht != (b.partnerWanted == true) || (sucht && filter != b.suchfilter)
    }

    private func verwerfen() {
        let (m, g) = vorher()
        mitglieder = m
        gaeste = g
        sucht = b.partnerWanted == true
        filter = b.suchfilter
        suche = ""
        bearbeiten = false
        modell.fensterFehler = nil
    }

    private func titel(_ v: Verwalten) -> String {
        v.serientermin ? "Training" : v.nurStorno ? "Sperrung" : "Buchung"
    }

    // MARK: Karte

    private func karte(_ v: Verwalten) -> some View {
        let m = modell
        let eigen = b.isOwn == true
        let kannBearbeiten = !v.nurStorno && v.darfVerwalten
        let gesuchtZeile = kannBearbeiten && ((b.frei ?? 0) > 0 || b.partnerWanted == true)

        return NavigationStack {
            List {
                kopf(v, eigen: eigen)
                if !bearbeiten { aktionen(v) }
                if !v.nurStorno { spieler(v, kannBearbeiten: kannBearbeiten) }
                if !v.nurStorno { details(v, gesuchtZeile: gesuchtZeile) }
                if v.darfVerwalten && !bearbeiten {
                    Section {
                        Button(role: .destructive) {
                            m.fensterFehler = nil
                            if v.grundNoetig || v.serientermin { grundFragen = true } else { stornoFragen = true }
                        } label: {
                            Text(v.stornoText(bestaetigen: false))
                                .foregroundStyle(Farbe.redInk)
                                .frame(maxWidth: .infinity)
                        }
                        .disabled(m.laeuft)
                        .gruppenZeile()
                    } footer: {
                        if eigen && !v.nurStorno && !v.laeuftSchon {
                            Text("Stornieren geht bis Spielbeginn").foregroundStyle(Farbe.muted).frame(maxWidth: .infinity)
                        }
                    }
                }
            }
            .gruppenListe()
            .listSectionSpacing(20)
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle(bearbeiten ? "Bearbeiten" : titel(v))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { leiste(v, kannBearbeiten: kannBearbeiten, gesuchtZeile: gesuchtZeile) }
            // Umsetzen und Sperrung bearbeiten als Unterseiten der Karte, mit "‹ Zurück" wie in Einstellungen.
            .navigationDestination(isPresented: Binding(get: { umsetzOffen && v.kannUmsetzen }, set: { umsetzOffen = $0 })) {
                UmsetzAnsicht(modell: modell, b: b, planTag: tag, jetzt: jetzt, bisher: "\(kicker), \(zeit)")
            }
            .navigationDestination(isPresented: Binding(get: { sperreOffen && v.kannSperreAendern }, set: { sperreOffen = $0 })) {
                SperreBearbeiten(modell: modell, sperre: b, tag: tag)
            }
            .safeAreaInset(edge: .bottom) {
                if m.fensterFehler != nil || (v.kannMitspielen && !bearbeiten) {
                    VStack(spacing: 8) {
                        FehlerText(text: m.fensterFehler)
                        if v.kannMitspielen && !bearbeiten {
                            Button { Task { await m.beitreten(b.bookingId) } } label: {
                                Text(m.laeuft ? "Wird eingetragen …" : "Mitspielen")
                                    .font(.headline)
                                    .frame(maxWidth: .infinity, minHeight: 30)
                            }
                            .buttonStyle(.borderedProminent)
                            .buttonBorderShape(.capsule)
                            .controlSize(.large)
                            .tint(Farbe.blue)
                            .disabled(m.laeuft)
                        }
                    }
                    .padding(.horizontal, Tokens.Abstand.rand)
                    .padding(.vertical, 10)
                    .background(.bar)
                }
            }
        }
        .confirmationDialog(
            "\(v.stornoText(bestaetigen: false))?", isPresented: $stornoFragen, titleVisibility: .visible
        ) {
            Button(v.stornoText(bestaetigen: false), role: .destructive) { ausfuehren(v) }
        }
        .alert(v.stornoText(bestaetigen: false), isPresented: $grundFragen) {
            TextField(v.grundNoetig ? "Grund" : "Grund (freiwillig)", text: $grund)
            Button(v.stornoText(bestaetigen: false), role: .destructive) {
                if v.grundNoetig && grund.trimmingCharacters(in: .whitespaces).isEmpty {
                    m.fensterFehler = "Bitte gib einen Grund an – er steht in der Nachricht an die Betroffenen."
                } else {
                    ausfuehren(v)
                }
            }
            Button("Abbrechen", role: .cancel) { grund = "" }
        } message: {
            Text(v.serientermin ? "Zum Beispiel „Ferien“." : "Der Grund steht in der Nachricht an die Betroffenen.")
        }
        .confirmationDialog("Änderungen verwerfen?", isPresented: $verwerfenFragen, titleVisibility: .visible) {
            Button("Änderungen verwerfen", role: .destructive) { verwerfen() }
            Button("Weiter bearbeiten", role: .cancel) {}
        }
    }

    private func ausfuehren(_ v: Verwalten) {
        let m = modell
        if v.serientermin {
            Task { await m.terminAbsagen(b.bookingId, grund: grund) }
        } else if v.nurStorno {
            Task { await m.sperreAufheben(b.bookingId) }
        } else {
            Task { await m.stornieren(b.bookingId, grund: grund) }
        }
    }

    // MARK: Leiste: ✕ links, rechts "Bearbeiten" bzw. ✓

    @ToolbarContentBuilder
    private func leiste(_ v: Verwalten, kannBearbeiten: Bool, gesuchtZeile: Bool) -> some ToolbarContent {
        ToolbarItem(placement: .cancellationAction) {
            Button {
                if !bearbeiten {
                    schliessen()
                } else if spielerGeaendert || sucheGeaendert {
                    verwerfenFragen = true
                } else {
                    verwerfen()
                }
            } label: {
                Image(systemName: "xmark")
            }
            .accessibilityLabel(bearbeiten ? "Abbrechen" : "Schließen")
        }
        if bearbeiten {
            ToolbarItem(placement: .confirmationAction) {
                Button {
                    let mitspieler = spielerGeaendert ? (mitglieder, gaeste) : nil
                    let neueSuche = gesuchtZeile && sucheGeaendert ? (sucht, filter) : nil
                    if mitspieler == nil && neueSuche == nil {
                        bearbeiten = false
                    } else {
                        Task { await modell.bearbeitungSpeichern(b.bookingId, mitspieler: mitspieler, suche: neueSuche) }
                    }
                } label: {
                    Image(systemName: "checkmark")
                }
                .tint(Farbe.blue)
                .disabled(modell.laeuft)
                .accessibilityLabel("Fertig")
            }
        } else if kannBearbeiten || v.kannSperreAendern {
            ToolbarItem(placement: .primaryAction) {
                Button("Bearbeiten") {
                    modell.fensterFehler = nil
                    if v.kannSperreAendern { sperreOffen = true } else { bearbeiten = true }
                }
                .disabled(modell.laeuft)
            }
        }
    }

    // MARK: Kopf

    private func kopf(_ v: Verwalten, eigen: Bool) -> some View {
        Section {
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text(zeit)
                        .font(.largeTitle.weight(.bold))
                        .monospacedDigit()
                        .foregroundStyle(Farbe.ink)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .accessibilityAddTraits(.isHeader)
                    Spacer(minLength: 0)
                    // Gelb heisst "deins"; hellblau: hier wird noch jemand gesucht.
                    if eigen && !v.nurStorno {
                        DeinMarker("Dein Spiel")
                    } else if b.binDabei == true {
                        DeinMarker("Du bist dabei")
                    } else if Verwalten.suchtText(b) != nil {
                        BlaueMarke("Mitspieler gesucht")
                    }
                }
                Text(kicker).font(.subheadline).foregroundStyle(Farbe.muted)
                Label(v.untertitel, systemImage: v.nurStorno && !v.serientermin ? "lock.fill" : v.serientermin ? "repeat" : "tennis.racket")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Farbe.ink2)
                    .fixedSize(horizontal: false, vertical: true)
                if v.nurStorno && !v.serientermin, let g = Platzplan.blockingLabel(title: b.title, typeName: b.typeName).grund {
                    Text(g).font(.footnote).foregroundStyle(Farbe.muted)
                }
                if modell.darfPlaetze && !eigen && !v.nurStorno {
                    Text("Du bearbeitest eine fremde Buchung mit Platzrechten.").font(.footnote).foregroundStyle(Farbe.muted)
                }
                if v.laeuftSchon {
                    Text("Die Spielzeit läuft bereits – Änderungen nur mit Platzrechten.").font(.footnote).foregroundStyle(Farbe.muted)
                }
            }
            .listRowInsets(EdgeInsets(top: 0, leading: 4, bottom: 4, trailing: 4))
            .listRowBackground(Color.clear)
        }
    }

    // MARK: Aktionsreihe wie in Karten

    @ViewBuilder private func aktionen(_ v: Verwalten) -> some View {
        let teilen = !v.nurStorno
        if teilen || v.kannUmsetzen {
            Section {
                HStack(spacing: 10) {
                    if teilen {
                        ShareLink(item: "Tennis: \(kicker), \(zeit) Uhr") {
                            aktionsKnopf("Teilen", symbol: "square.and.arrow.up")
                        }
                    }
                    if v.kannUmsetzen {
                        Button {
                            modell.fensterFehler = nil
                            umsetzOffen = true
                        } label: {
                            aktionsKnopf("Umsetzen", symbol: "arrow.left.arrow.right")
                        }
                    }
                }
                .buttonStyle(.plain)
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
            }
        }
    }

    private func aktionsKnopf(_ text: String, symbol: String) -> some View {
        VStack(spacing: 4) {
            Image(systemName: symbol).font(.body.weight(.semibold))
            Text(text).font(.footnote.weight(.semibold)).lineLimit(1)
        }
        .foregroundStyle(Farbe.blueInk)
        .frame(maxWidth: .infinity, minHeight: 56)
        .background(Farbe.surf, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .contentShape(Rectangle())
    }

    // MARK: Spieler

    private func spieler(_ v: Verwalten, kannBearbeiten: Bool) -> some View {
        let m = modell
        let eigen = b.isOwn == true
        let art = m.arten.first { $0.code == b.typeCode }
        let maxWeitere = max((art?.maxPlayers ?? 4) - 1, 0)
        let verzeichnis = m.verzeichnis.filter { $0.id != b.ownerMemberId }
        let voll = mitglieder.count + gaeste.count >= maxWeitere
        let gefunden = suche.trimmingCharacters(in: .whitespaces).isEmpty
            ? [] : PlaetzeLogik.treffer(suche, in: verzeichnis, ohne: mitglieder)
        let umfang = art.map { Platzplan.otherPlayersLabel($0.info) }

        return Section {
            personZeile(
                eigen ? "Du" : PlaetzeLogik.initialen(name: b.ownerName),
                eigen ? "Du" : (b.ownerName ?? "Bucher"),
                zusatz: "hat gebucht"
            )
            if bearbeiten {
                ForEach(mitglieder, id: \.self) { id in
                    let name = verzeichnis.first(where: { $0.id == id })?.name ?? "Mitglied"
                    personZeile(PlaetzeLogik.initialen(name: name), name) { mitglieder.removeAll { $0 == id } }
                }
                ForEach(Array(gaeste.enumerated()), id: \.offset) { i, g in
                    personZeile("G", g) { gaeste.remove(at: i) }
                }
                if !voll {
                    HStack(spacing: 10) {
                        Image(systemName: "magnifyingglass").foregroundStyle(Farbe.muted).accessibilityHidden(true)
                        TextField("Mitspieler hinzufügen …", text: $suche)
                            .textInputAutocapitalization(.words)
                            .autocorrectionDisabled()
                            .focused($suchfokus)
                            .accessibilityLabel("Mitspieler suchen")
                    }
                    .gruppenZeile()
                    if !suche.trimmingCharacters(in: .whitespaces).isEmpty && gefunden.isEmpty {
                        Text("Niemand gefunden.").foregroundStyle(Farbe.muted).gruppenZeile()
                    }
                    ForEach(gefunden, id: \.id) { mg in
                        Button {
                            mitglieder.append(mg.id)
                            suche = ""
                        } label: {
                            HStack {
                                Text("\(mg.lastName ?? ""), \(mg.firstName ?? "")").foregroundStyle(Farbe.ink)
                                Spacer()
                                Image(systemName: "plus.circle.fill").foregroundStyle(Farbe.blue).accessibilityHidden(true)
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .gruppenZeile()
                    }
                    Button { gaeste.append(gast) } label: {
                        Label(PlaetzeLogik.gastText(gebuehrCents: m.gastgebuehr), systemImage: "plus.circle.fill")
                            .foregroundStyle(Farbe.blueInk)
                    }
                    .buttonStyle(.borderless)
                    .gruppenZeile()
                }
            } else {
                ForEach(Array((b.players ?? []).compactMap { $0 }.enumerated()), id: \.offset) { _, p in
                    personZeile(PlaetzeLogik.initialen(name: p), p)
                }
                ForEach(0..<max(b.frei ?? 0, 0), id: \.self) { _ in
                    HStack(spacing: 12) {
                        Image(systemName: "person.badge.plus")
                            .font(.footnote.weight(.medium))
                            .foregroundStyle(Farbe.muted)
                            .frame(width: 32, height: 32)
                            .overlay(Circle().strokeBorder(Farbe.line2, style: StrokeStyle(lineWidth: 1.5, dash: [4, 3])))
                            .accessibilityHidden(true)
                        Text("frei").italic().foregroundStyle(Farbe.muted)
                    }
                    .gruppenZeile()
                }
            }
        } header: {
            GruppenKopf(titel: "Spieler", zusatz: bearbeiten ? umfang : nil)
        } footer: {
            if bearbeiten && !gaeste.isEmpty && m.gastgebuehr > 0 {
                Text(PlaetzeLogik.gastHinweis(gebuehrCents: m.gastgebuehr)).foregroundStyle(Farbe.muted)
            }
        }
    }

    private func personZeile(_ kuerzel: String, _ name: String, zusatz: String? = nil, weg: (() -> Void)? = nil) -> some View {
        PersonZeile(kuerzel: kuerzel, name: name, zusatz: zusatz, weg: weg)
    }

    // MARK: Details

    @ViewBuilder private func details(_ v: Verwalten, gesuchtZeile: Bool) -> some View {
        let sucheText = Verwalten.suchtText(b)
        Section {
            HStack {
                Text("Spielform").foregroundStyle(Farbe.ink)
                Spacer()
                Text(b.typeName ?? "–").foregroundStyle(Farbe.muted)
            }
            .gruppenZeile()
            if bearbeiten && gesuchtZeile {
                Toggle("Mitspieler gesucht", isOn: $sucht)
                    .tint(Farbe.blue)
                    .gruppenZeile()
            } else if gesuchtZeile || b.partnerWanted == true {
                HStack {
                    Text("Mitspieler gesucht").foregroundStyle(Farbe.ink)
                    Spacer()
                    Text(b.partnerWanted == true ? (b.suchfilter.kurztext ?? "Ja") : "Nein").foregroundStyle(Farbe.muted)
                }
                .gruppenZeile()
            }
        } header: {
            GruppenKopf(titel: "Details")
        } footer: {
            if bearbeiten && gesuchtZeile {
                Text("Dein Spiel erscheint unter „Offene Spiele“. Wer mag, trägt sich selbst ein.").foregroundStyle(Farbe.muted)
            } else if let sucheText {
                Text(sucheText).foregroundStyle(Farbe.muted)
            }
        }
        if bearbeiten && gesuchtZeile && sucht {
            Section {
                NurFuer(filter: $filter, speichern: nil)
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
            }
        }
    }
}

// MARK: - Sperrung bearbeiten

/**
 * Zeit, Plaetze, Kategorie und Grund einer Sperrung - eine Unterseite der
 * Karte wie in Einstellungen: Plaetze mit Haken, Zeiten und Kategorie als
 * Menue. ✓ speichert; liegen Buchungen im Weg, fragt ein Action Sheet, ob
 * sie verdraengt werden sollen. Der Tag bleibt der des Plans.
 */
private struct SperreBearbeiten: View {
    let modell: PlaetzeModell
    let sperre: TagesBelegung
    let tag: String

    @State private var plaetze: [String]
    @State private var von: Int
    @State private var bis: Int
    @State private var art: String
    @State private var grund: String
    @State private var kollisionen: Int?

    init(modell: PlaetzeModell, sperre: TagesBelegung, tag: String) {
        self.modell = modell
        self.sperre = sperre
        self.tag = tag
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
        var arten = m.blockungsarten.map { (wert: $0.code, label: $0.name ?? $0.code) }
        if let code = sperre.typeCode, !arten.contains(where: { $0.wert == code }) {
            arten.insert((code, sperre.typeName ?? code), at: 0)
        }
        return List {
            Section {
                ForEach(m.plaetze) { p in
                    let aktiv = plaetze.contains(p.id)
                    Button {
                        if aktiv { plaetze.removeAll { $0 == p.id } } else { plaetze.append(p.id) }
                        kollisionen = nil
                    } label: {
                        HStack {
                            Text(p.name ?? p.shortName ?? "").foregroundStyle(Farbe.ink)
                            Spacer()
                            if aktiv { Image(systemName: "checkmark").font(.body.weight(.semibold)).foregroundStyle(Farbe.blue) }
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .gruppenZeile()
                    .accessibilityAddTraits(aktiv ? [.isSelected] : [])
                }
            } header: {
                GruppenKopf(titel: "Plätze")
            } footer: {
                if plaetze.isEmpty { Text("Mindestens einen Platz wählen.").foregroundStyle(Farbe.redInk) }
            }
            Section {
                Picker("Von", selection: Binding(get: { von }, set: { von = $0; kollisionen = nil })) {
                    ForEach(Array(stride(from: 0, through: bis - schritt, by: schritt)), id: \.self) {
                        Text(Zeit.minutesToTime($0)).tag($0)
                    }
                }
                .gruppenZeile()
                Picker("Bis", selection: Binding(get: { bis }, set: { bis = $0; kollisionen = nil })) {
                    ForEach(Array(stride(from: von + schritt, through: 24 * 60, by: schritt)), id: \.self) {
                        Text(Zeit.minutesToTime($0)).tag($0)
                    }
                }
                .gruppenZeile()
            } header: {
                GruppenKopf(titel: "Zeit")
            }
            .pickerStyle(.menu)
            Section {
                Picker("Kategorie", selection: Binding(get: { art }, set: { art = $0; kollisionen = nil })) {
                    ForEach(arten, id: \.wert) { Text($0.label).tag($0.wert) }
                }
                .pickerStyle(.menu)
                .gruppenZeile()
                TextField("", text: $grund, prompt: Text("Grund, etwa nach Regen").foregroundStyle(Farbe.muted))
                    .accessibilityLabel("Grund der Sperrung, freiwillig")
                    .gruppenZeile()
            } header: {
                GruppenKopf(titel: "Art")
            }
        }
        .gruppenListe()
        .listSectionSpacing(20)
        .scrollDismissesKeyboard(.interactively)
        // Fehler unten statt oben in der Liste: die Aktion sitzt oben im ✓, gerollt ist oft weit nach unten.
        .bestaetigung(Binding(get: { m.fensterFehler }, set: { m.fensterFehler = $0 }), ok: false)
        .navigationTitle("Sperrung bearbeiten")
        .navigationBarTitleDisplayMode(.inline)
        .titelUnterzeile(PlaetzeLogik.tagText(tag))
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                if m.laeuft {
                    ProgressView()
                } else {
                    Button { speichern(verdraengen: false) } label: { Image(systemName: "checkmark") }
                        .disabled(plaetze.isEmpty)
                        .accessibilityLabel("Änderungen speichern")
                }
            }
        }
        // Buchungen im Weg: verdraengen ist destruktiv, also als Action Sheet mit rotem Knopf oben.
        .confirmationDialog(
            kollisionen.map(PlaetzeLogik.imWegText) ?? "",
            isPresented: Binding(get: { kollisionen != nil }, set: { if !$0 { kollisionen = nil } }),
            titleVisibility: .visible
        ) {
            if let n = kollisionen {
                Button(PlaetzeLogik.verdraengenText(n), role: .destructive) { speichern(verdraengen: true) }
            }
            Button("Abbrechen", role: .cancel) {}
        }
        .onDisappear { m.fensterFehler = nil }
    }

    private func speichern(verdraengen: Bool) {
        Task {
            kollisionen = await modell.sperreAendern(
                sperre.bookingId, platzIds: plaetze, tag: tag, von: von, bis: bis, typ: art, grund: grund, verdraengen: verdraengen
            )
        }
    }
}

// MARK: - Umsetzen

/**
 * Wohin mit der Buchung? Tag, Platz und Beginn - eine Unterseite der Karte.
 * Was waehlbar ist, rechnet umsetzZiele aus der Belegung des Zieltags; fuer
 * einen anderen Tag wird day_schedule nachgeladen. Eine laufende Buchung
 * wechselt nur den Platz. Belegte Plaetze stehen grau mit "belegt" da.
 */
private struct UmsetzAnsicht: View {
    let modell: PlaetzeModell
    let b: TagesBelegung
    let planTag: String
    let jetzt: Date
    /// "Platz 3 · Montag, 16.11., 18:00 – 19:00"
    let bisher: String

    @State private var tag: String
    @State private var andererTag: (tag: String, belegung: [TagesBelegung])?
    @State private var ladeFehler: String?
    @State private var platzWahl: String?
    @State private var minuteWahl: Int?
    @State private var grund = ""
    @FocusState private var grundFokus: Bool

    init(modell: PlaetzeModell, b: TagesBelegung, planTag: String, jetzt: Date, bisher: String) {
        self.modell = modell
        self.b = b
        self.planTag = planTag
        self.jetzt = jetzt
        self.bisher = bisher
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

        List {
            Section {
                LabeledContent("Bisher") { Text(bisher).foregroundStyle(Farbe.ink2).multilineTextAlignment(.trailing) }
                    .gruppenZeile()
                if let platz, let minute {
                    LabeledContent("Neu") {
                        Text("\(platz.name ?? "") · \(PlaetzeLogik.tagText(tag)), \(Zeit.minutesToTime(minute)) – \(Zeit.minutesToTime(minute + dauer))")
                            .fontWeight(.semibold)
                            .foregroundStyle(Farbe.blueInk)
                            .multilineTextAlignment(.trailing)
                    }
                    .gruppenZeile()
                }
            } footer: {
                Text("Bucher und Mitspieler werden benachrichtigt.").foregroundStyle(Farbe.muted)
            }

            if laeuftSchon {
                Section {
                    Label("Die Buchung läuft schon – sie kann nur noch den Platz wechseln.", systemImage: "clock")
                        .foregroundStyle(Farbe.ink2)
                        .gruppenZeile()
                }
            } else {
                Section {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            ForEach(tage, id: \.self) { t in
                                TagKachel(tag: t, heute: Zeit.berlinDay(jetzt), aktiv: t == tag) { Task { await waehle(t) } }
                            }
                        }
                        .padding(.horizontal, 4)
                    }
                } header: {
                    GruppenKopf(titel: "Tag")
                }
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
            }

            if let ladeFehler {
                Section { Text(ladeFehler).foregroundStyle(Farbe.redInk).gruppenZeile() }
            } else if belegung == nil {
                Section { ProgressView().frame(maxWidth: .infinity).gruppenZeile() }
            } else if ziele.isEmpty {
                Section {
                    Text("An diesem Tag ist kein Platz frei, auf den die Buchung passt.").foregroundStyle(Farbe.muted).gruppenZeile()
                }
            } else {
                Section {
                    ForEach(m.plaetze) { p in
                        let frei = mitZiel.contains(p)
                        let aktiv = p.id == platz?.id
                        Button { platzWahl = p.id } label: {
                            HStack {
                                Text(p.name ?? p.shortName ?? "").foregroundStyle(frei ? Farbe.ink : Farbe.muted)
                                if p.id == b.courtId {
                                    Text("bisher").font(.footnote).foregroundStyle(Farbe.muted)
                                }
                                Spacer()
                                if !frei {
                                    Text("belegt").font(.subheadline).foregroundStyle(Farbe.muted)
                                } else if aktiv {
                                    Image(systemName: "checkmark").font(.body.weight(.semibold)).foregroundStyle(Farbe.blue)
                                }
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .disabled(!frei)
                        .gruppenZeile()
                        .accessibilityAddTraits(aktiv ? [.isSelected] : [])
                    }
                } header: {
                    GruppenKopf(titel: "Platz")
                }
                Section {
                    Picker("Beginn", selection: Binding(get: { minute ?? -1 }, set: { minuteWahl = $0 })) {
                        ForEach(zeiten, id: \.self) { Text(Zeit.minutesToTime($0)).tag($0) }
                    }
                    .pickerStyle(.menu)
                    .gruppenZeile()
                } footer: {
                    Text("Die Dauer bleibt: \(dauer) Minuten.").foregroundStyle(Farbe.muted)
                }
            }

            Section {
                TextField("", text: $grund, prompt: Text("z. B. Platz 3 steht unter Wasser").foregroundStyle(Farbe.muted), axis: .vertical)
                    .lineLimit(1...3)
                    .focused($grundFokus)
                    .accessibilityLabel("Grund fürs Umsetzen")
                    .gruppenZeile()
            } header: {
                GruppenKopf(titel: grundNoetig ? "Grund" : "Grund (freiwillig)")
            } footer: {
                if grundNoetig { Text("Bei fremden Buchungen erfährt der Bucher den Grund.").foregroundStyle(Farbe.muted) }
            }
        }
        .gruppenListe()
        .listSectionSpacing(20)
        .scrollDismissesKeyboard(.interactively)
        // Fehler unten statt oben in der Liste: die Aktion sitzt oben im ✓, gerollt ist oft weit nach unten.
        .bestaetigung(Binding(get: { m.fensterFehler }, set: { m.fensterFehler = $0 }), ok: false)
        .navigationTitle("Umsetzen")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                if m.laeuft {
                    ProgressView()
                } else {
                    Button {
                        guard let platz, let minute else { return }
                        grundFokus = false
                        Task { await m.umsetzen(b.bookingId, courtId: platz.id, tag: tag, minute: minute, grund: grund) }
                    } label: { Image(systemName: "checkmark") }
                    .disabled(!bereit)
                    .accessibilityLabel("Hierhin umsetzen")
                }
            }
        }
        .onDisappear { m.fensterFehler = nil }
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
