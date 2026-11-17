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
            case let .verwalten(b, _, tag):
                VerwaltenInhalt(modell: modell, b: b, tag: tag, kicker: kicker)
            }
        }
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

/// Die Zeit gross als Titel, daneben eine Marke, darunter Platz und Tag, rechts das X.
private struct PlatzBlattKopf: View {
    enum Marke: Equatable {
        case keine
        /// Gelb heisst "deins": das eigene Spiel.
        case dein
        /// Hellblau: hier wird noch jemand gesucht.
        case sucht
    }

    @Environment(\.blattSchliessen) private var schliessen
    let kicker: String
    let titel: String
    var marke: Marke = .keine

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
                    .fixedSize(horizontal: false, vertical: true)
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
        switch marke {
        case .keine: EmptyView()
        case .dein: DeinMarker("Dein Spiel")
        case .sucht: BlaueMarke("Mitspieler gesucht")
        }
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

/// Zwei Knoepfe im Fuss nebeneinander: die Aktion nimmt den Platz, der Weg zurueck steht neutral daneben.
private struct FussPaar: View {
    let text: String
    var stufe: KnopfStufe = .haupt
    var gesperrt = false
    let aktion: () -> Void
    let zurueckText: String
    var zurueckGesperrt = false
    let zurueck: () -> Void

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 10) {
                Knopf(text, stufe: stufe, groesse: .gross, breit: true, gesperrt: gesperrt, aktion: aktion)
                Knopf(zurueckText, stufe: .leise, groesse: .gross, gesperrt: zurueckGesperrt, aktion: zurueck)
                    .fixedSize()
            }
            VStack(spacing: 10) {
                Knopf(text, stufe: stufe, groesse: .gross, breit: true, gesperrt: gesperrt, aktion: aktion)
                Knopf(zurueckText, stufe: .leise, groesse: .gross, breit: true, gesperrt: zurueckGesperrt, aktion: zurueck)
            }
        }
    }
}

/// Zerstoerendes als roter Textverweis mit Kreuz im Kreis ("Buchung stornieren") - der Weg zur Bestaetigung.
private struct GefahrVerweis: View {
    let text: String
    var gesperrt = false
    let aktion: () -> Void

    var body: some View {
        Button(action: aktion) {
            Label(text, systemImage: "xmark.circle")
                .font(Schrift.display(.halbfett, 16))
                .foregroundStyle(Farbe.redInk)
                .frame(maxWidth: .infinity, minHeight: 48)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(gesperrt)
        .opacity(gesperrt ? 0.5 : 1)
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
            .frame(maxWidth: .infinity, alignment: .center)
            .multilineTextAlignment(.center)
    }
}

/// Was im Weg liegt, bevor verdraengt wird: rot getoent mit Ausrufezeichen.
private struct Warnhinweis: View {
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "exclamationmark.circle")
                .font(.system(size: 18, weight: .medium))
                .foregroundStyle(Farbe.redInk)
                .accessibilityHidden(true)
            Text(text)
                .font(Schrift.text(.normal, 15))
                .foregroundStyle(Farbe.redInk)
                .lineSpacing(2)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Farbe.red.opacity(0.08), in: RoundedRectangle(cornerRadius: Tokens.Radius.karte))
        .overlay(RoundedRectangle(cornerRadius: Tokens.Radius.karte).strokeBorder(Farbe.red.opacity(0.35), lineWidth: 1))
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

/// Eine Auswahl als Feld mit Pfeil (Kategorie, Uhrzeit): tippen oeffnet die Liste.
private struct Auswahlfeld: View {
    let name: String
    let optionen: [(wert: String, label: String)]
    let wert: String
    /// Mittig und in Zahlenschrift fuer Uhrzeiten
    var zahl = false
    let wahl: (String) -> Void

    var body: some View {
        let label = optionen.first { $0.wert == wert }?.label ?? ""
        Menu {
            ForEach(optionen, id: \.wert) { o in
                Button { wahl(o.wert) } label: {
                    if o.wert == wert { Label(o.label, systemImage: "checkmark") } else { Text(o.label) }
                }
            }
        } label: {
            HStack(spacing: 8) {
                Text(label)
                    .font(zahl ? Schrift.display(.halbfett, 16) : Schrift.text(.mittel, 16))
                    .monospacedDigit()
                    .foregroundStyle(Farbe.ink)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: zahl ? .center : .leading)
                if !zahl {
                    Image(systemName: "chevron.down")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Farbe.muted)
                        .accessibilityHidden(true)
                }
            }
            .padding(.horizontal, zahl ? 10 : 20)
            .frame(minHeight: 52)
            .background(Farbe.surf2, in: RoundedRectangle(cornerRadius: Tokens.Radius.feld))
            .overlay(RoundedRectangle(cornerRadius: Tokens.Radius.feld).strokeBorder(Farbe.line2, lineWidth: 1))
            .contentShape(Rectangle())
        }
        .accessibilityLabel(name)
        .accessibilityValue(label)
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

/// Eine Zeile, die in eine andere Ansicht des Blatts fuehrt ("Umsetzen"): Symbol im Kreis, Titel, Pfeil.
private struct AktionsZeile: View {
    let symbol: String
    let titel: String
    var unterzeile: String?
    let aktion: () -> Void

    var body: some View {
        Button(action: aktion) {
            HStack(spacing: 14) {
                Image(systemName: symbol)
                    .font(.system(size: 17, weight: .medium))
                    .foregroundStyle(Farbe.blueInk)
                    .frame(width: 40, height: 40)
                    .background(Farbe.blueSoft, in: Circle())
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(titel).font(Schrift.display(.halbfett, 16)).foregroundStyle(Farbe.ink)
                    if let unterzeile {
                        Text(unterzeile).font(Schrift.text(.normal, 14)).foregroundStyle(Farbe.muted)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Farbe.muted)
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .frame(minHeight: 68)
            .background(Farbe.surf2, in: RoundedRectangle(cornerRadius: Tokens.Radius.karte))
            .overlay(RoundedRectangle(cornerRadius: Tokens.Radius.karte).strokeBorder(Farbe.line, lineWidth: 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(titel)
    }
}

/**
 * "Mitspieler gesucht" als Zeile mit Schalter, die Erklaerung darunter - ohne
 * sie raet man, was das bewirkt. Ist die Suche an und `filter` gesetzt, folgt
 * die Karte "Nur für …". `speichern` gibt es nur an einer bestehenden
 * Buchung, wenn der Filter geaendert wurde.
 */
private struct GesuchtZeile: View {
    let an: Bool
    var deaktiviert = false
    var filter: Binding<Suchfilter>?
    var speichern: (() -> Void)?
    let wechsel: (Bool) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Toggle(isOn: Binding(get: { an }, set: wechsel)) {
                Text("Mitspieler gesucht").font(Schrift.display(.halbfett, 17)).foregroundStyle(Farbe.ink)
            }
            .tint(Farbe.blue)
            .frame(minHeight: 44)
            Text("Dein Spiel erscheint unter „Offene Spiele“. Wer mag, trägt sich selbst ein.")
                .font(Schrift.text(.normal, 14.5))
                .foregroundStyle(Farbe.muted)
                .lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)
            if an, let filter {
                NurFuer(filter: filter, speichern: speichern).padding(.top, 10)
            }
        }
        .disabled(deaktiviert)
        .padding(.top, 14)
        .overlay(alignment: .top) { Farbe.line.frame(height: 1) }
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
        if sperrenOffen {
            SperrAnsicht(modell: modell, courtId: courtId, platzName: platzName, tag: tag, stunde: stunde, kicker: kicker) {
                sperrenOffen = false
            }
        } else {
            buchen
        }
    }

    private var buchen: some View {
        let m = modell
        let gewaehlt = m.arten.first { $0.code == art }
        let info = gewaehlt?.info
        let dauer = gewaehlt?.durationMinutes ?? 60
        let maxWeitere = max((gewaehlt?.maxPlayers ?? 2) - 1, 0)
        let nochPlatz = mitglieder.count + gaeste.count < maxWeitere
        let hinweis = PlaetzeLogik.buchenHinweis(art: info, mitglieder: mitglieder.count, gaeste: gaeste.count, sucht: sucht)
        let haelften = Array(stride(from: stunde, to: stunde + m.anzeige, by: max(m.raster, 1)))

        return BlattGeruest {
            PlatzBlattKopf(kicker: kicker, titel: "\(Zeit.minutesToTime(start)) – \(Zeit.minutesToTime(start + dauer))")
        } inhalt: {
            VStack(alignment: .leading, spacing: 0) {
                Feldname(text: "Beginn")
                Segmente(
                    beschriftung: "Beginn",
                    optionen: haelften.map { ($0, Zeit.minutesToTime($0), !startzeiten.contains($0)) },
                    wert: $start
                )
            }
            VStack(alignment: .leading, spacing: 0) {
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
                    }),
                    spalten: min(max(m.arten.count, 2), 3)
                )
            }
            // Sich selbst mitzunehmen weist die Datenbank ab - der Bucher zaehlt ohnehin mit.
            if maxWeitere > 0 {
                Mitspieler(
                    verzeichnis: m.verzeichnis.filter { $0.id != m.meineId },
                    mitglieder: $mitglieder, gaeste: $gaeste, maxWeitere: maxWeitere,
                    umfang: info.map(Platzplan.otherPlayersLabel) ?? "",
                    gastgebuehrCents: m.gastgebuehr, suchen: $suchen
                )
            }
            if nochPlatz { GesuchtZeile(an: sucht, filter: $filter) { sucht = $0 } }
            // Sperren ist die Ausnahme, nicht der Regelfall: abgesetzt am Ende.
            if m.darfPlaetze {
                AktionsZeile(symbol: "lock", titel: "Stattdessen sperren") {
                    m.fensterFehler = nil
                    sperrenOffen = true
                }
            }
        } fuss: {
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
    }
}

/**
 * Sperren statt buchen (docs/design/stitch, "Plaetze sperren"): Kategorie und
 * Grund, gesperrt wird der ganze Anzeigeblock. Zweistufig: liegen Buchungen
 * im Weg, nennt der erste Versuch ihre Zahl, erst der zweite verdraengt sie.
 */
private struct SperrAnsicht: View {
    let modell: PlaetzeModell
    let courtId: String
    let platzName: String
    let tag: String
    let stunde: Int
    let kicker: String
    let zurueck: () -> Void

    @State private var grund = ""
    @State private var art: String
    @State private var kollisionen: Int?

    init(modell: PlaetzeModell, courtId: String, platzName: String, tag: String, stunde: Int, kicker: String, zurueck: @escaping () -> Void) {
        self.modell = modell
        self.courtId = courtId
        self.platzName = platzName
        self.tag = tag
        self.stunde = stunde
        self.kicker = kicker
        self.zurueck = zurueck
        // Vorgabe bleibt die Platzpflege; sonst die erste Kategorie.
        _art = State(initialValue: modell.blockungsarten.first { $0.code == "platzpflege" }?.code
            ?? modell.blockungsarten.first?.code ?? "platzpflege")
    }

    var body: some View {
        let m = modell
        let bis = stunde + m.anzeige
        BlattGeruest {
            PlatzBlattKopf(kicker: kicker, titel: "\(Zeit.minutesToTime(stunde)) – \(Zeit.minutesToTime(bis))")
        } inhalt: {
            VStack(alignment: .leading, spacing: 0) {
                Feldname(text: "Kategorie")
                Auswahlfeld(name: "Kategorie", optionen: m.blockungsarten.map { ($0.code, $0.name ?? $0.code) }, wert: art) {
                    art = $0
                    kollisionen = nil
                }
            }
            VStack(alignment: .leading, spacing: 0) {
                Feldname(text: "Grund (freiwillig)")
                Eingabe(platzhalter: "z. B. nach Regen", bedienName: "Grund der Sperrung, freiwillig", text: $grund)
            }
            Text("Gesperrt wird \(Zeit.minutesToTime(stunde))–\(Zeit.minutesToTime(bis)) Uhr auf \(platzName).").leise()
            if let n = kollisionen { Warnhinweis(text: PlaetzeLogik.imWegText(n)) }
        } fuss: {
            FehlerText(text: m.fensterFehler)
            // Rot gefuellt nur als Bestaetigung, daneben der neutrale Weg zurueck.
            FussPaar(
                text: kollisionen.map(PlaetzeLogik.verdraengenText) ?? "Sperren",
                stufe: kollisionen != nil ? .gefahr : .haupt,
                gesperrt: m.laeuft,
                aktion: {
                    Task {
                        kollisionen = await m.sperren(
                            courtId: courtId, tag: tag, von: stunde, bis: bis, typ: art, grund: grund,
                            verdraengen: kollisionen != nil
                        )
                    }
                },
                zurueckText: "Doch nicht",
                zurueck: {
                    m.fensterFehler = nil
                    zurueck()
                }
            )
        }
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

    private var zeit: String {
        "\(Zeit.minutesToTime(Zeit.minutesOf(b.startsAt))) – \(Zeit.minutesToTime(Zeit.minutesOf(b.endsAt)))"
    }

    var body: some View {
        let v = Verwalten(b, darfPlaetze: modell.darfPlaetze, jetzt: jetzt)
        if umsetzOffen && v.kannUmsetzen {
            UmsetzAnsicht(modell: modell, b: b, planTag: tag, jetzt: jetzt, bisher: "\(kicker), \(zeit)") { umsetzOffen = false }
        } else if bearbeitenOffen && v.kannSperreAendern {
            SperreBearbeiten(modell: modell, sperre: b, tag: tag) { bearbeitenOffen = false }
        } else {
            uebersicht(v)
        }
    }

    private func uebersicht(_ v: Verwalten) -> some View {
        let m = modell
        let art = m.arten.first { $0.code == b.typeCode }
        let maxWeitere = max((art?.maxPlayers ?? 4) - 1, 0)
        let vorher = (b.playerMemberIds ?? []).compactMap { $0 }
        let vorherGaeste = (b.guestNames ?? []).compactMap { $0 }
        let geaendert = mitglieder.sorted() != vorher.sorted() || gaeste.sorted() != vorherGaeste.sorted()
        let eigen = b.isOwn == true
        let bucher = (kuerzel: eigen ? "Du" : PlaetzeLogik.initialen(name: b.ownerName), name: eigen ? "Du" : (b.ownerName ?? "Bucher"))
        let sucht = Verwalten.suchtText(b)
        let gesuchtZeile = !v.nurStorno && v.darfVerwalten && ((b.frei ?? 0) > 0 || b.partnerWanted == true)
        // Das eigene, noch nicht laufende Spiel: ohne Infokarte, wie im Entwurf "Eigenes Spiel".
        let schlicht = eigen && !v.nurStorno && !v.laeuftSchon

        return BlattGeruest {
            // Am eigenen Spiel steht die Spielform im Kicker; wer gebucht hat, sagt der gelbe Marker.
            PlatzBlattKopf(
                kicker: schlicht ? [kicker, b.typeName].compactMap { Platzplan.nichtLeer($0) }.joined(separator: " · ") : kicker,
                titel: zeit,
                marke: eigen && !v.nurStorno ? .dein : sucht != nil ? .sucht : .keine
            )
        } inhalt: {
            // Was das ist und wer gebucht hat
            VStack(alignment: .leading, spacing: 8) {
                if !schlicht {
                HStack(spacing: 12) {
                    Image(systemName: v.nurStorno ? "lock" : v.serientermin ? "repeat" : "tennis.racket")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(Farbe.blueInk)
                        .accessibilityHidden(true)
                    Text(v.untertitel)
                        .font(Schrift.display(.halbfett, 16))
                        .foregroundStyle(Farbe.ink)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.horizontal, 18)
                .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
                .background(Farbe.surf2, in: RoundedRectangle(cornerRadius: Tokens.Radius.feld))
                .overlay(RoundedRectangle(cornerRadius: Tokens.Radius.feld).strokeBorder(Farbe.line, lineWidth: 1))
                }
                if v.nurStorno && !v.serientermin, let g = Platzplan.blockingLabel(title: b.title, typeName: b.typeName).grund {
                    Text(g).leise()
                }
                if m.darfPlaetze && !eigen && !v.nurStorno {
                    Text("Du bearbeitest eine fremde Buchung mit Platzrechten.").leise()
                }
                if v.laeuftSchon {
                    Text("Die Spielzeit läuft bereits – Änderungen nur mit Platzrechten.").leise()
                }
            }
            .fixedSize(horizontal: false, vertical: true)

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
                    VStack(spacing: 8) {
                        SpielerZeile(kuerzel: bucher.kuerzel, name: bucher.name)
                        ForEach(Array((b.players ?? []).compactMap { $0 }.enumerated()), id: \.offset) { _, p in
                            SpielerZeile(kuerzel: PlaetzeLogik.initialen(name: p), name: p)
                        }
                        ForEach(0..<max(b.frei ?? 0, 0), id: \.self) { _ in
                            SpielerZeile(kuerzel: "", name: "frei", leer: true)
                        }
                    }
                }
            }

            // Mit dem Schalter darunter sagt der Satz nichts Neues.
            if let sucht, !gesuchtZeile {
                Label(sucht, systemImage: "info.circle")
                    .font(Schrift.text(.normal, 14.5))
                    .foregroundStyle(Farbe.ink2)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, -8)
            }

            if gesuchtZeile {
                GesuchtZeile(
                    an: b.partnerWanted == true, deaktiviert: m.laeuft, filter: $filter,
                    speichern: b.partnerWanted == true && filter != b.suchfilter
                        ? { Task { await m.filterAendern(b.bookingId, filter: filter) } }
                        : nil
                ) { an in
                    Task { await m.ausschreiben(b.bookingId, gesucht: an, filter: filter) }
                }
            }

            // Umsetzen ist die Ausnahme, wenn ein Platz ausfaellt: eine eigene Ansicht im Blatt.
            if v.kannUmsetzen {
                AktionsZeile(symbol: "calendar.badge.clock", titel: "Umsetzen", unterzeile: "Anderer Platz oder andere Zeit") {
                    m.fensterFehler = nil
                    stornoOffen = false
                    umsetzOffen = true
                }
            }
        } fuss: {
            FehlerText(text: m.fensterFehler)

            if v.kannSperreAendern && !stornoOffen {
                BlattHauptknopf(text: "Sperrung bearbeiten", gesperrt: m.laeuft) {
                    m.fensterFehler = nil
                    bearbeitenOffen = true
                }
            }
            if v.kannMitspielen {
                BlattHauptknopf(text: m.laeuft ? "Wird eingetragen …" : "Mitspielen", gesperrt: m.laeuft) {
                    Task { await m.beitreten(b.bookingId) }
                }
            }
            if !v.nurStorno && v.darfVerwalten && geaendert && !stornoOffen {
                BlattHauptknopf(text: m.laeuft ? "Wird gespeichert …" : "Mitspieler speichern", gesperrt: m.laeuft) {
                    Task { await m.speichern(b.bookingId, mitglieder: mitglieder, gaeste: gaeste) }
                }
            }
            if v.darfVerwalten {
                if stornoOffen {
                    if v.grundFeld {
                        VStack(alignment: .leading, spacing: 0) {
                            Feldname(text: v.grundNoetig ? "Grund" : "Grund (freiwillig)")
                            Eingabe(
                                platzhalter: v.serientermin ? "z. B. Ferien" : "Steht in der Nachricht an die Betroffenen",
                                bedienName: "Grund", text: $grund
                            )
                        }
                    }
                    // Rot gefuellt nur als Bestaetigung, daneben der neutrale Weg zurueck (U76).
                    FussPaar(
                        text: v.stornoText(bestaetigen: true), stufe: .gefahr,
                        gesperrt: m.laeuft || (v.grundNoetig && grund.trimmingCharacters(in: .whitespaces).isEmpty),
                        aktion: {
                            if v.serientermin {
                                Task { await m.terminAbsagen(b.bookingId, grund: grund) }
                            } else if v.nurStorno {
                                Task { await m.sperreAufheben(b.bookingId) }
                            } else {
                                Task { await m.stornieren(b.bookingId, grund: grund) }
                            }
                        },
                        zurueckText: "Abbrechen", zurueckGesperrt: m.laeuft,
                        zurueck: {
                            stornoOffen = false
                            grund = ""
                        }
                    )
                } else {
                    GefahrVerweis(text: v.stornoText(bestaetigen: false), gesperrt: m.laeuft) { stornoOffen = true }
                }
            }
            if eigen && !v.nurStorno && !v.laeuftSchon {
                Fussnote(text: "Stornieren geht bis Spielbeginn")
            }
        }
    }
}

// MARK: - Sperrung bearbeiten

/**
 * Zeit, Plaetze, Kategorie und Grund einer Sperrung (docs/design/stitch,
 * "Plaetze sperren") - wie beim Sperren zweistufig. Der Tag bleibt der des
 * Plans.
 */
private struct SperreBearbeiten: View {
    @Environment(\.blattSchliessen) private var schliessen
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
        var arten = m.blockungsarten.map { (wert: $0.code, label: $0.name ?? $0.code) }
        if let code = sperre.typeCode, !arten.contains(where: { $0.wert == code }) {
            arten.insert((code, sperre.typeName ?? code), at: 0)
        }
        let zeiten = { (a: Int, b: Int) in
            stride(from: a, through: b, by: schritt).map { (wert: String($0), label: Zeit.minutesToTime($0)) }
        }

        return BlattGeruest {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Sperrung bearbeiten")
                        .font(Schrift.display(.fett, 28, relativeTo: .title))
                        .tracking(-0.6)
                        .foregroundStyle(Farbe.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityAddTraits(.isHeader)
                    Text(PlaetzeLogik.tagText(tag)).font(Schrift.text(.normal, 16)).foregroundStyle(Farbe.muted)
                }
                Spacer(minLength: 8)
                SchliessenKnopf(aktion: schliessen)
            }
        } inhalt: {
            VStack(alignment: .leading, spacing: 0) {
                Feldname(text: "Plätze")
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 4), spacing: 8) {
                    ForEach(m.plaetze) { p in
                        let aktiv = plaetze.contains(p.id)
                        Button {
                            if aktiv { plaetze.removeAll { $0 == p.id } } else { plaetze.append(p.id) }
                            kollisionen = nil
                        } label: {
                            Text(p.shortName ?? p.name ?? "")
                                .lineLimit(1)
                                .minimumScaleFactor(0.7)
                                .frame(maxWidth: .infinity)
                                .auswahlPille(aktiv, hoehe: 48, rand: 6)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(p.name ?? "")
                        .accessibilityAddTraits(aktiv ? [.isSelected] : [])
                    }
                }
            }
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 0) {
                    Feldname(text: "Von")
                    Auswahlfeld(name: "Von", optionen: zeiten(0, bis - schritt), wert: String(von), zahl: true) {
                        von = Int($0) ?? von
                        kollisionen = nil
                    }
                }
                VStack(alignment: .leading, spacing: 0) {
                    Feldname(text: "Bis")
                    Auswahlfeld(name: "Bis", optionen: zeiten(von + schritt, 24 * 60), wert: String(bis), zahl: true) {
                        bis = Int($0) ?? bis
                        kollisionen = nil
                    }
                }
            }
            VStack(alignment: .leading, spacing: 0) {
                Feldname(text: "Kategorie")
                Auswahlfeld(name: "Kategorie", optionen: arten, wert: art) {
                    art = $0
                    kollisionen = nil
                }
            }
            VStack(alignment: .leading, spacing: 0) {
                Feldname(text: "Grund (freiwillig)")
                Eingabe(platzhalter: "z. B. nach Regen", bedienName: "Grund der Sperrung, freiwillig", text: $grund)
            }
            if let n = kollisionen { Warnhinweis(text: PlaetzeLogik.imWegText(n)) }
        } fuss: {
            FehlerText(text: m.fensterFehler)
            // Rot gefuellt nur als Bestaetigung, daneben der neutrale Weg zurueck.
            FussPaar(
                text: kollisionen.map(PlaetzeLogik.verdraengenText) ?? (m.laeuft ? "Wird gespeichert …" : "Änderungen speichern"),
                stufe: kollisionen != nil ? .gefahr : .haupt,
                gesperrt: m.laeuft || plaetze.isEmpty,
                aktion: { speichern(verdraengen: kollisionen != nil) },
                zurueckText: "Doch nicht",
                zurueck: {
                    m.fensterFehler = nil
                    zurueck()
                }
            )
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

// MARK: - Umsetzen

/**
 * Wohin mit der Buchung? Tag, Platz und Beginn (docs/design/stitch,
 * "Umsetzen"). Was waehlbar ist, rechnet umsetzZiele aus der Belegung des
 * Zieltags; fuer einen anderen Tag wird day_schedule nachgeladen. Eine
 * laufende Buchung wechselt nur den Platz.
 */
private struct UmsetzAnsicht: View {
    @Environment(\.blattSchliessen) private var schliessen
    let modell: PlaetzeModell
    let b: TagesBelegung
    let planTag: String
    let jetzt: Date
    /// "Platz 3 · Montag, 16.11., 18:00 – 19:00"
    let bisher: String
    let zurueck: () -> Void

    @State private var tag: String
    @State private var andererTag: (tag: String, belegung: [TagesBelegung])?
    @State private var ladeFehler: String?
    @State private var platzWahl: String?
    @State private var minuteWahl: Int?
    @State private var grund = ""

    init(modell: PlaetzeModell, b: TagesBelegung, planTag: String, jetzt: Date, bisher: String, zurueck: @escaping () -> Void) {
        self.modell = modell
        self.b = b
        self.planTag = planTag
        self.jetzt = jetzt
        self.bisher = bisher
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

        BlattGeruest {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Umsetzen")
                        .font(Schrift.display(.fett, 32, relativeTo: .title))
                        .tracking(-0.8)
                        .foregroundStyle(Farbe.ink)
                        .accessibilityAddTraits(.isHeader)
                    Text("Bisher: \(bisher)")
                        .font(Schrift.text(.normal, 16))
                        .foregroundStyle(Farbe.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 8)
                SchliessenKnopf(aktion: schliessen)
            }
        } inhalt: {
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
                        .padding(.horizontal, Tokens.Abstand.rand)
                        .padding(.vertical, 2)
                    }
                    .padding(.horizontal, -Tokens.Abstand.rand)
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
                        optionen: m.plaetze.map { p in (p.id, p.name ?? p.shortName ?? "", !mitZiel.contains(p)) },
                        wert: Binding(get: { platz?.id ?? "" }, set: { platzWahl = $0 }),
                        spalten: 4
                    )
                }
                VStack(alignment: .leading, spacing: 0) {
                    Feldname(text: "Beginn")
                    Segmente(
                        beschriftung: "Beginn",
                        optionen: zeiten.map { ($0, Zeit.minutesToTime($0), false) },
                        wert: Binding(get: { minute ?? -1 }, set: { minuteWahl = $0 }),
                        spalten: 3
                    )
                }
            }

            VStack(alignment: .leading, spacing: 0) {
                Feldname(text: grundNoetig ? "Grund" : "Grund (freiwillig)")
                Eingabe(platzhalter: "z. B. Platz 3 steht unter Wasser", bedienName: "Grund fürs Umsetzen", text: $grund)
            }

            if let platz, let minute {
                HStack(alignment: .top, spacing: 14) {
                    Image(systemName: "clock.arrow.circlepath")
                        .font(.system(size: 17, weight: .medium))
                        .foregroundStyle(Farbe.blueInk)
                        .frame(width: 40, height: 40)
                        .background(Farbe.blueSoft, in: Circle())
                        .accessibilityHidden(true)
                    Text("Neu: \(platz.name ?? "") · \(PlaetzeLogik.tagText(tag)) · \(Zeit.minutesToTime(minute))–\(Zeit.minutesToTime(minute + dauer)) Uhr. Bucher und Mitspieler werden benachrichtigt.")
                        .font(Schrift.text(.mittel, 15))
                        .foregroundStyle(Farbe.ink)
                        .lineSpacing(2)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(16)
                .background(Farbe.surf2, in: RoundedRectangle(cornerRadius: Tokens.Radius.karte))
                .overlay(RoundedRectangle(cornerRadius: Tokens.Radius.karte).strokeBorder(Farbe.line, lineWidth: 1))
            }
        } fuss: {
            FehlerText(text: m.fensterFehler)
            FussPaar(
                text: m.laeuft ? "Wird umgesetzt …" : "Hierhin umsetzen",
                gesperrt: m.laeuft || !bereit,
                aktion: {
                    guard let platz, let minute else { return }
                    Task { await m.umsetzen(b.bookingId, courtId: platz.id, tag: tag, minute: minute, grund: grund) }
                },
                zurueckText: "Doch nicht",
                zurueck: {
                    m.fensterFehler = nil
                    zurueck()
                }
            )
        }
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
