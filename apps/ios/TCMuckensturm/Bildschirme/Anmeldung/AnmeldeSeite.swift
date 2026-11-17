/**
 * Der Rahmen der Anmeldeseiten (docs/design/stitch, "Anmelden")
 *
 * Weisser Grund wie der Rest der App: oben der Kicker "TC Muckensturm" und
 * der Titel, darunter das Formular. Hell oder dunkel folgt dem
 * Erscheinungsbild; es gibt keine blaue Buehne mehr.
 *
 * Dazu die Bausteine aller Anmeldeseiten: Eingabefeld (56 hoch), leiser
 * Verweis, Hinweis. Die Knoepfe kommen aus Knoepfe.swift.
 */

import SwiftUI

struct AnmeldeSeite<Inhalt: View>: View {
    let titel: String
    var unterzeile: String?
    @ViewBuilder let inhalt: Inhalt

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                VStack(alignment: .leading, spacing: Tokens.Abstand.s) {
                    Text("TC Muckensturm").kicker()
                    Text(titel)
                        .font(Schrift.display(.fett, 32, relativeTo: .largeTitle))
                        .tracking(Tokens.Schrift.laufweiteTitel)
                        .foregroundStyle(Farbe.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityAddTraits(.isHeader)
                    if let unterzeile {
                        Text(unterzeile)
                            .font(Schrift.text(.normal, 16))
                            .lineSpacing(4)
                            .foregroundStyle(Farbe.ink2)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.top, 2)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 56)
                .padding(.bottom, Tokens.Abstand.abschnitt)
                VStack(spacing: Tokens.Abstand.l) { inhalt }
            }
            .frame(maxWidth: 420)
            .padding(.horizontal, 24)
            .padding(.bottom, 36)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Farbe.bg)
    }
}

/// Eingabefeld der Anmeldeseiten: Beschriftung als Kicker darueber, 56 hoch, grauer Grund mit Linie.
/// Mit `passwort` verdeckt es die Eingabe und traegt rechts den Schalter "Anzeigen".
struct AnmeldeFeld: View {
    let beschriftung: String
    /// Fuer VoiceOver, wenn die Beschriftung allein nicht reicht ("Noch einmal").
    var bedienName: String?
    @Binding var text: String
    var passwort = false
    var inhaltsTyp: UITextContentType?
    var tastatur: UIKeyboardType = .default
    var absenden: SubmitLabel = .next
    var beimAbsenden: () -> Void = {}

    @State private var sichtbar = false

    var body: some View {
        VStack(alignment: .leading, spacing: Tokens.Abstand.s) {
            Text(beschriftung)
                .kicker()
                .accessibilityHidden(true)
            HStack(spacing: 0) {
                Group {
                    if passwort && !sichtbar {
                        SecureField("", text: $text)
                    } else {
                        TextField("", text: $text)
                    }
                }
                .textContentType(inhaltsTyp)
                .keyboardType(tastatur)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(absenden)
                .onSubmit(beimAbsenden)
                .font(Schrift.text(.normal, 16))
                .foregroundStyle(Farbe.ink)
                .accessibilityLabel(bedienName ?? beschriftung)
                .padding(.leading, 20)
                .padding(.trailing, passwort ? 0 : 20)
                .frame(minHeight: 56)

                if passwort {
                    PasswortSchalter(sichtbar: $sichtbar)
                        .padding(.trailing, 10)
                }
            }
            .background(Farbe.surf2, in: RoundedRectangle(cornerRadius: Tokens.Radius.feld))
            .overlay(
                RoundedRectangle(cornerRadius: Tokens.Radius.feld)
                    .strokeBorder(Farbe.line2, lineWidth: 1)
            )
        }
    }
}

/// "Anzeigen" am Passwortfeld (U31). Die Beschriftung sagt, was ein Tippen tut.
struct PasswortSchalter: View {
    @Binding var sichtbar: Bool

    var body: some View {
        Button {
            sichtbar.toggle()
        } label: {
            Text(sichtbar ? "Verbergen" : "Anzeigen")
                .font(Schrift.display(.halbfett, 14))
                .foregroundStyle(Farbe.blueInk)
                .padding(.horizontal, 10)
                .frame(minWidth: 44, minHeight: 44)
        }
        .accessibilityLabel("Passwort anzeigen")
        .accessibilityValue(sichtbar ? "Ein" : "Aus")
        .accessibilityAddTraits(.isToggle)
    }
}

/// Leiser Verweis in blueInk, etwa "Passwort vergessen?"
struct LeiserVerweis: View {
    let text: String
    var rechts = false
    let aktion: () -> Void

    var body: some View {
        Button(action: aktion) {
            Text(text)
                .font(Schrift.display(.halbfett, 14.5))
                .foregroundStyle(Farbe.blueInk)
                .frame(minHeight: 44)
        }
        .frame(maxWidth: .infinity, alignment: rechts ? .trailing : .center)
    }
}

/// Hinweis: Fehler in redInk auf roter Toenung, Erfolg in greenInk.
struct AnmeldeHinweis: View {
    let text: String
    var ok = false

    var body: some View {
        Text(text)
            .font(Schrift.text(.normal, 16))
            .foregroundStyle(ok ? Farbe.greenInk : Farbe.redInk)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 18)
            .padding(.vertical, 14)
            .background(
                (ok ? Farbe.green : Farbe.red).opacity(0.12),
                in: RoundedRectangle(cornerRadius: Tokens.Radius.feld)
            )
    }
}

/// "Noch kein Mitglied? Antrag stellen" - Text in muted, der Verweis in blueInk.
struct AnmeldeFusszeile: View {
    let text: String
    let verweis: String
    let ziel: URL

    var body: some View {
        HStack(spacing: 4) {
            Text(text).foregroundStyle(Farbe.muted)
            Link(destination: ziel) {
                Text(verweis)
                    .font(Schrift.display(.halbfett, 14.5))
                    .foregroundStyle(Farbe.blueInk)
                    .frame(minHeight: 44)
            }
        }
        .font(Schrift.text(.normal, 14))
        .frame(maxWidth: .infinity)
    }
}
