/**
 * Bausteine des Konto-Tabs
 *
 * Nachbauten der Bausteine unten in konto.tsx (Gruppe, Zeile, Eintrag,
 * Verweis, Marke, Statusmarke) und der Formularteile (stil.feld,
 * stil.hinweisFehler, Segmente, BlattKopf). Masse wie dort.
 */

import SwiftUI

/// Abschnittskopf "Abrechnung", "Einstellungen" (stil.abschnitt)
struct KontoAbschnitt: View {
    let titel: String

    var body: some View {
        Text(titel)
            .font(Schrift.text(.fett, Tokens.Schrift.titel, relativeTo: .title2))
            .tracking(-0.2)
            .foregroundStyle(Farbe.ink)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, Tokens.Abstand.abschnitt - Tokens.Abstand.m)
            .accessibilityAddTraits(.isHeader)
    }
}

/// Eine Liste in einer Karte; die Zeilen trennt je eine Linie.
struct KontoGruppe<Inhalt: View>: View {
    @ViewBuilder let inhalt: Inhalt

    var body: some View {
        VStack(spacing: 0) { inhalt }
            .karte(padding: 0)
    }
}

/// Die Trennlinie zwischen zwei Zeilen einer Gruppe.
struct KontoLinie: View {
    var body: some View {
        Rectangle().fill(Farbe.line).frame(height: 1)
    }
}

/// Fuer Zeilen, die man antippt: leicht abgedunkelt, solange der Finger drauf ist.
struct ZeilenDruck: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .contentShape(Rectangle())
            .background(configuration.isPressed ? Farbe.ink.opacity(0.04) : .clear)
    }
}

/// Kleines Symbol auf surf2 links in einer Einstellungszeile.
struct Symbolkachel: View {
    let symbol: String

    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: 15, weight: .medium))
            .foregroundStyle(Farbe.ink2)
            .frame(width: 32, height: 32)
            .background(Farbe.surf2, in: RoundedRectangle(cornerRadius: 10))
            .accessibilityHidden(true)
    }
}

/// Pfeil rechts: oeffnet ein Blatt.
struct Pfeil: View {
    var body: some View {
        Image(systemName: "chevron.right")
            .font(.system(size: 13, weight: .bold))
            .foregroundStyle(Farbe.muted)
            .accessibilityHidden(true)
    }
}

/// Eine Einstellung, die ein Blatt oeffnet (Eintrag in konto.tsx).
struct KontoEintrag: View {
    let titel: String
    let symbol: String
    let aktion: () -> Void

    var body: some View {
        Button(action: aktion) {
            HStack(spacing: 12) {
                Symbolkachel(symbol: symbol)
                Text(titel)
                    .font(Schrift.text(.halbfett, 15.5))
                    .foregroundStyle(Farbe.ink)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Pfeil()
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 56)
        }
        .buttonStyle(ZeilenDruck())
    }
}

/// Ein Verweis ins Web ist ein Link; was ein Blatt oeffnet oder etwas tut, ein Knopf.
struct KontoVerweis: View {
    let titel: String
    var rot = false
    var pfeil = false
    var link = false
    let aktion: () -> Void

    var body: some View {
        Button(action: aktion) {
            HStack(spacing: 12) {
                Text(titel)
                    .font(Schrift.text(rot ? .fett : .halbfett, 15.5))
                    .foregroundStyle(rot ? Farbe.redInk : Farbe.ink)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if pfeil { Pfeil() }
            }
            .padding(.horizontal, 16)
            .frame(minHeight: pfeil ? 56 : 52)
        }
        .buttonStyle(ZeilenDruck())
        .accessibilityAddTraits(link ? .isLink : [])
        .accessibilityRemoveTraits(link ? .isButton : [])
    }
}

/// Graue Marke im Profilkopf ("Mitglied seit 2019")
struct KontoMarke: View {
    let text: String

    var body: some View {
        Text(text)
            .font(Schrift.text(.halbfett, Tokens.Schrift.klein))
            .foregroundStyle(Farbe.ink2)
            .padding(.horizontal, 10)
            .padding(.vertical, 3)
            .frame(minHeight: 26)
            .background(Farbe.surf2, in: Capsule())
    }
}

/// Der Stand einer Forderung - zurueckgebucht in rot, denn da muss das Mitglied etwas tun.
struct StatusmarkeAnsicht: View {
    let marke: Statusmarke

    var body: some View {
        let (grund, schrift): (Color, Color) = switch marke.ton {
        case .gold: (Farbe.goldSoft, Farbe.goldInk)
        case .rot: (Farbe.red.opacity(0.14), Farbe.redInk)
        case .grau: (Farbe.surf2, Farbe.ink2)
        }
        Text(marke.text)
            .font(Schrift.text(.fett, Tokens.Schrift.klein))
            .foregroundStyle(schrift)
            .padding(.horizontal, 8)
            .padding(.vertical, 2)
            .frame(minHeight: 22)
            .background(grund, in: Capsule())
            .padding(.top, 5)
    }
}

/// Betrag rechts in einer Zeile: Semi Condensed, Ziffern gleich breit.
struct Betrag: View {
    let text: String
    var groesse: CGFloat = 19

    var body: some View {
        Text(text)
            .font(Schrift.display(.fett, groesse))
            .monospacedDigit()
            .foregroundStyle(Farbe.ink)
    }
}

/// Hinweis im Formular (stil.hinweisFehler / stil.hinweisErfolg)
struct KontoHinweis: View {
    @Environment(\.colorScheme) private var schema
    let text: String
    var ok = false

    var body: some View {
        Text(text)
            .font(Schrift.text(.normal, Tokens.Schrift.normal))
            .foregroundStyle(ok ? Farbe.greenInk : Farbe.redInk)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(
                (ok ? Farbe.green : Farbe.red).opacity(schema == .dark ? 0.16 : 0.12),
                in: RoundedRectangle(cornerRadius: Tokens.Radius.feld)
            )
            .accessibilityAddTraits(.updatesFrequently)
    }
}

/// Eingabefeld mit Beschriftung darueber (stil.feldLabel, stil.feld); rot, wenn es beanstandet ist.
struct KontoFeld: View {
    let label: String
    @Binding var text: String
    var fehler: String?
    var inhaltsTyp: UITextContentType?
    var tastatur: UIKeyboardType = .default
    var grossschreibung: TextInputAutocapitalization = .sentences
    var mehrzeilig = false

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(label)
                .font(Schrift.text(.halbfett, Tokens.Schrift.klein, relativeTo: .footnote))
                .foregroundStyle(fehler != nil ? Farbe.red : Farbe.ink2)
                .accessibilityHidden(true)
            Group {
                if mehrzeilig {
                    TextField("", text: $text, axis: .vertical)
                        .lineLimit(4...10)
                } else {
                    TextField("", text: $text)
                }
            }
            .textContentType(inhaltsTyp)
            .keyboardType(tastatur)
            .textInputAutocapitalization(grossschreibung)
            .font(Schrift.text(.normal, Tokens.Schrift.normal))
            .foregroundStyle(Farbe.ink)
            .padding(13)
            .frame(minHeight: mehrzeilig ? 96 : 50, alignment: .topLeading)
            .background(Farbe.surf, in: RoundedRectangle(cornerRadius: Tokens.Radius.feld))
            .overlay(
                RoundedRectangle(cornerRadius: Tokens.Radius.feld)
                    .strokeBorder(fehler != nil ? Farbe.red : Farbe.rahmen, lineWidth: 1.5)
            )
            .accessibilityLabel(label)
            .accessibilityHint(fehler ?? "")
            if let fehler {
                KontoHinweis(text: fehler).padding(.top, -1)
            }
        }
    }
}

/// Auswahl nebeneinander oder untereinander (stil.segment, Segmente.tsx).
struct KontoSegmente<Wert: Hashable>: View {
    let beschriftung: String
    let optionen: [(wert: Wert, label: String)]
    let gewaehlt: Wert?
    var untereinander = false
    var gesperrt = false
    let wahl: (Wert) -> Void

    var body: some View {
        let knoepfe = ForEach(optionen, id: \.wert) { o in
            let aktiv = o.wert == gewaehlt
            Button { wahl(o.wert) } label: {
                Text(o.label)
                    .font(Schrift.display(.fett, 15))
                    .foregroundStyle(aktiv ? Farbe.ink : Farbe.muted)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity, minHeight: 38)
                    .padding(.horizontal, 6)
                    .background {
                        if aktiv {
                            RoundedRectangle(cornerRadius: Tokens.Radius.knopf - 4)
                                .fill(Farbe.segAktiv)
                                .overlay(
                                    RoundedRectangle(cornerRadius: Tokens.Radius.knopf - 4)
                                        .strokeBorder(Farbe.segAktivRand, lineWidth: 1.5)
                                )
                        }
                    }
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(gesperrt)
            .accessibilityAddTraits(aktiv ? .isSelected : [])
        }
        Group {
            if untereinander {
                VStack(spacing: 4) { knoepfe }
            } else {
                HStack(spacing: 4) { knoepfe }
            }
        }
        .padding(4)
        .background(Farbe.surf2, in: RoundedRectangle(cornerRadius: Tokens.Radius.knopf))
        .opacity(gesperrt ? 0.6 : 1)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(beschriftung)
    }
}

/// Titel und Schliessen oben in einem Blatt (BlattKopf in Blatt.tsx).
struct BlattKopf: View {
    let titel: String
    let zu: () -> Void

    var body: some View {
        HStack(alignment: .center) {
            Text(titel)
                .font(Schrift.text(.extrafett, Tokens.Schrift.titel, relativeTo: .title2))
                .foregroundStyle(Farbe.ink)
                .accessibilityAddTraits(.isHeader)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button(action: zu) {
                Image(systemName: "xmark")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Farbe.ink)
                    .frame(width: 44, height: 44)
                    .background(Farbe.surf2, in: Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Schließen")
        }
    }
}

/// Leiser Knopf mit Rand (stil.knopfLeise); rot fuer die Kuendigung.
struct LeiserKnopf: View {
    let text: String
    var rot = false
    var gesperrt = false
    let aktion: () -> Void

    var body: some View {
        Button(action: aktion) {
            Text(text)
                .font(Schrift.text(.fett, 16))
                .foregroundStyle(rot ? Farbe.redInk : Farbe.ink)
                .frame(maxWidth: .infinity, minHeight: 52)
                .overlay(
                    RoundedRectangle(cornerRadius: Tokens.Radius.knopf)
                        .strokeBorder(rot ? Farbe.red.opacity(0.5) : Farbe.line2, lineWidth: 1.5)
                )
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(gesperrt)
        .opacity(gesperrt ? 0.5 : 1)
    }
}
