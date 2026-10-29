/**
 * Der Rahmen der Anmeldeseiten (Entwurf AppLogin, docs/design/clubhaus)
 *
 * Wie apps/mobile/src/components/AnmeldeSeite.tsx: oben eine Flaeche in
 * brand mit einem Tennisplatz in Perspektive und dem gelben Ball, das weisse
 * Logo, der Titel unten links; darunter das Formular auf dunklem Grund. Immer
 * dunkel, egal welches Erscheinungsbild gewaehlt ist.
 *
 * Dazu die Bausteine aller Anmeldeseiten: Eingabefeld (54 hoch), gelber
 * Hauptknopf, leiser Verweis, Hinweis.
 */

import SwiftUI

struct AnmeldeSeite<Inhalt: View>: View {
    let titel: String
    var unterzeile: String?
    @ViewBuilder let inhalt: Inhalt

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                Buehne(titel: titel, unterzeile: unterzeile)
                VStack(spacing: Tokens.abstand.l) { inhalt }
                    .frame(maxWidth: 420)
                    .padding(.horizontal, 24)
                    .padding(.top, Tokens.abstand.s)
                    .padding(.bottom, 36)
            }
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Farbe.bg)
        .ignoresSafeArea(edges: .top)
        .environment(\.colorScheme, .dark)
        .preferredColorScheme(.dark)
    }
}

/// Die obere Flaeche: Platz, Ball, Logo, Titel.
private struct Buehne: View {
    let titel: String
    let unterzeile: String?

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            Farbe.brand
            Platz()
                .stroke(Farbe.onBrand.opacity(0.22), lineWidth: 2.5)
            Platz(nurHorizont: true)
                .stroke(Farbe.onBrand.opacity(0.4), style: StrokeStyle(lineWidth: 2.5, dash: [3, 5]))
            Circle()
                .fill(Farbe.gold)
                .frame(width: 38, height: 38)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                .padding(.top, 96)
                .padding(.trailing, 54)
                .accessibilityHidden(true)
            LinearGradient(colors: [Farbe.bg.opacity(0), Farbe.bg], startPoint: .top, endPoint: .bottom)
                .frame(height: 160)
            Image("LogoWeiss")
                .resizable()
                .scaledToFit()
                .frame(width: 126, height: 36, alignment: .leading)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .padding(.top, 60)
                .padding(.leading, 24)
                .accessibilityLabel("TC Muckensturm")
            VStack(alignment: .leading, spacing: Tokens.abstand.s) {
                Text(titel)
                    .font(Schrift.text(.extrafett, 36, relativeTo: .largeTitle))
                    .tracking(-0.7)
                    .foregroundStyle(Farbe.onBrand)
                    .accessibilityAddTraits(.isHeader)
                if let unterzeile {
                    Text(unterzeile)
                        .font(Schrift.text(.normal, 15))
                        .foregroundStyle(Farbe.ink2)
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 22)
        }
        .frame(height: 360)
        .clipped()
    }
}

/// Ein Tennisplatz in Perspektive, dezent - dieselben Linien wie das SVG der Expo-App (390 x 360).
private struct Platz: Shape {
    /// Nur die gestrichelte Linie am Horizont (eigene Strichart).
    var nurHorizont = false

    func path(in rect: CGRect) -> Path {
        // preserveAspectRatio="xMidYMax slice": fuellen, unten und mittig ausrichten.
        let skala = max(rect.width / 390, rect.height / 360)
        let dx = (rect.width - 390 * skala) / 2
        let dy = rect.height - 360 * skala
        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: dx + x * skala, y: dy + y * skala) }

        var pfad = Path()
        if nurHorizont {
            pfad.move(to: p(0, 110)); pfad.addLine(to: p(390, 110))
            return pfad
        }
        pfad.move(to: p(40, 360)); pfad.addLine(to: p(130, 110)); pfad.addLine(to: p(260, 110)); pfad.addLine(to: p(350, 360))
        pfad.move(to: p(78, 255)); pfad.addLine(to: p(312, 255))
        pfad.move(to: p(100, 195)); pfad.addLine(to: p(290, 195))
        pfad.move(to: p(60, 305)); pfad.addLine(to: p(330, 305))
        pfad.move(to: p(195, 195)); pfad.addLine(to: p(195, 305))
        return pfad
    }
}

/// Eingabefeld der Anmeldeseiten: Beschriftung darueber, 54 hoch, Radius 16.
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
        VStack(alignment: .leading, spacing: Tokens.abstand.s) {
            Text(beschriftung)
                .font(Schrift.text(.halbfett, 13, relativeTo: .footnote))
                .foregroundStyle(Farbe.ink2)
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
                .padding(.leading, 16)
                .padding(.trailing, passwort ? 0 : 16)
                .frame(minHeight: 54)

                if passwort {
                    PasswortSchalter(sichtbar: $sichtbar)
                        .padding(.trailing, 6)
                }
            }
            .background(Farbe.surf, in: RoundedRectangle(cornerRadius: Tokens.radius.feld))
            .overlay(
                RoundedRectangle(cornerRadius: Tokens.radius.feld)
                    .strokeBorder(Farbe.rahmen, lineWidth: 1.5)
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
                .font(Schrift.text(.fett, 14))
                .foregroundStyle(Farbe.ink2)
                .padding(.horizontal, 10)
                .frame(minWidth: 44, minHeight: 44)
        }
        .accessibilityLabel("Passwort anzeigen")
        .accessibilityValue(sichtbar ? "Ein" : "Aus")
        .accessibilityAddTraits(.isToggle)
    }
}

/// Der gelbe Hauptknopf, 58 hoch.
struct GelberKnopf: View {
    let text: String
    var gesperrt = false
    let aktion: () -> Void

    var body: some View {
        Button(action: aktion) {
            Text(text)
                .font(Schrift.text(.extrafett, 17, relativeTo: .headline))
                .foregroundStyle(Farbe.onGold)
                .frame(maxWidth: .infinity, minHeight: 58)
                .background(Farbe.gold, in: RoundedRectangle(cornerRadius: 18))
        }
        .buttonStyle(Gedrueckt())
        .disabled(gesperrt)
        .opacity(gesperrt ? 0.6 : 1)
    }
}

private struct Gedrueckt: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.opacity(configuration.isPressed ? 0.85 : 1)
    }
}

/// Leiser Verweis in ink2, etwa "Passwort vergessen?"
struct LeiserVerweis: View {
    let text: String
    var rechts = false
    let aktion: () -> Void

    var body: some View {
        Button(action: aktion) {
            Text(text)
                .font(Schrift.text(.halbfett, 14))
                .foregroundStyle(Farbe.ink2)
                .frame(minHeight: 44)
        }
        .frame(maxWidth: .infinity, alignment: rechts ? .trailing : .center)
    }
}

/// Hinweis auf dunklem Grund: Fehler in redInk auf roter Toenung, Erfolg in greenInk.
struct AnmeldeHinweis: View {
    let text: String
    var ok = false

    var body: some View {
        Text(text)
            .font(Schrift.text(.normal, 16))
            .foregroundStyle(ok ? Farbe.greenInk : Farbe.redInk)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(
                (ok ? Farbe.green : Farbe.red).opacity(0.16),
                in: RoundedRectangle(cornerRadius: Tokens.radius.feld)
            )
    }
}

/// "Noch kein Mitglied? Antrag stellen" - Text in muted, der Verweis in gold.
struct AnmeldeFusszeile: View {
    let text: String
    let verweis: String
    let ziel: URL

    var body: some View {
        HStack(spacing: 4) {
            Text(text).foregroundStyle(Farbe.muted)
            Link(destination: ziel) {
                Text(verweis)
                    .font(Schrift.text(.fett, 14))
                    .foregroundStyle(Farbe.gold)
                    .frame(minHeight: 44)
            }
        }
        .font(Schrift.text(.normal, 14))
        .frame(maxWidth: .infinity)
    }
}
