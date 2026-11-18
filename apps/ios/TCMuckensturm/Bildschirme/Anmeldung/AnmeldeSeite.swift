/**
 * Der Rahmen der Anmeldeseiten
 *
 * Gestaltet wie die Anmeldung in den iOS-Einstellungen: oben das Vereinslogo
 * (dunkel in Weiss) oder ein Symbol als App-Kachel, grosser Titel und Erklaerung mittig, darunter die Felder als
 * gruppierte Liste, die eine Hauptaktion als breiter Knopf und leise Verweise.
 * Hell oder dunkel folgt dem Erscheinungsbild.
 *
 * Dazu die Bausteine aller Anmeldeseiten: Eingabezeile, Hinweiszeile, breiter
 * Knopf. Der Inhalt besteht aus Sections.
 */

import SwiftUI

struct AnmeldeSeite<Inhalt: View>: View {
    let titel: String
    var unterzeile: String?
    /// Ohne Symbol steht oben das Vereinslogo (Anmelden, Passwort vergessen).
    var symbol: String?
    @ViewBuilder let inhalt: Inhalt

    @Environment(Sitzung.self) private var sitzung

    var body: some View {
        List {
            Section {
                VStack(spacing: 12) {
                    if let symbol {
                        Image(systemName: symbol)
                            .font(.system(size: 38, weight: .semibold))
                            .foregroundStyle(.white)
                            .frame(width: 76, height: 76)
                            .background(Farbe.blue.gradient, in: RoundedRectangle(cornerRadius: 17, style: .continuous))
                            .accessibilityHidden(true)
                        Text("TC Muckensturm")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Farbe.muted)
                    } else {
                        Image("Logo")
                            .resizable()
                            .scaledToFit()
                            .frame(width: 230)
                            .padding(.bottom, 8)
                            .accessibilityLabel("TC Muckensturm")
                    }
                    Text(titel)
                        .font(.title.weight(.bold))
                        .foregroundStyle(Farbe.ink)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityAddTraits(.isHeader)
                    if let unterzeile {
                        Text(unterzeile)
                            .font(.body)
                            .foregroundStyle(Farbe.ink2)
                            .multilineTextAlignment(.center)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.top, 24)
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: 0, leading: 8, bottom: 0, trailing: 8))
            }
            inhalt
            // Unten leise Datenschutz und Impressum (liegen im Web; lokal ohne Adresse fehlen sie).
            if let datenschutz = sitzung.umgebung.webLink("/datenschutz"), let impressum = sitzung.umgebung.webLink("/impressum") {
                Section {
                    HStack(spacing: 8) {
                        Link("Datenschutz", destination: datenschutz)
                        Text("·").accessibilityHidden(true)
                        Link("Impressum", destination: impressum)
                    }
                    .font(.footnote)
                    .tint(Farbe.muted)
                    .foregroundStyle(Farbe.muted)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .listRowBackground(Color.clear)
                }
            }
        }
        .gruppenListe()
        .listSectionSpacing(20)
        .scrollDismissesKeyboard(.interactively)
        .frame(maxWidth: 520)
        .frame(maxWidth: .infinity)
        .background(GruppenGrund())
    }
}

/// Eingabezeile der Anmeldeseiten: die Beschriftung steht als Platzhalter im Feld.
/// Mit `passwort` verdeckt es die Eingabe und traegt rechts ein Auge zum Anzeigen.
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
        HStack(spacing: 8) {
            Group {
                if passwort && !sichtbar {
                    SecureField("", text: $text, prompt: Text(beschriftung).foregroundStyle(Farbe.muted))
                } else {
                    TextField("", text: $text, prompt: Text(beschriftung).foregroundStyle(Farbe.muted))
                }
            }
            .textContentType(inhaltsTyp)
            .keyboardType(tastatur)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .submitLabel(absenden)
            .onSubmit(beimAbsenden)
            .foregroundStyle(Farbe.ink)
            .accessibilityLabel(bedienName ?? beschriftung)
            .frame(minHeight: 32)
            if passwort {
                PasswortSchalter(sichtbar: $sichtbar)
            }
        }
        .gruppenZeile()
    }
}

/// Das Auge am Passwortfeld (U31). Die Beschriftung sagt, was ein Tippen tut.
struct PasswortSchalter: View {
    @Binding var sichtbar: Bool

    var body: some View {
        Button {
            sichtbar.toggle()
        } label: {
            Image(systemName: sichtbar ? "eye.slash" : "eye")
                .foregroundStyle(Farbe.muted)
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.borderless)
        .accessibilityLabel("Passwort anzeigen")
        .accessibilityValue(sichtbar ? "Ein" : "Aus")
        .accessibilityAddTraits(.isToggle)
    }
}

/// Leiser Verweis in Blau, etwa "Passwort vergessen?" - als Zeile ohne Grund.
struct LeiserVerweis: View {
    let text: String
    var rechts = false
    let aktion: () -> Void

    var body: some View {
        Button(text, action: aktion)
            .buttonStyle(.borderless)
            .font(.subheadline.weight(.medium))
            .tint(Farbe.blueInk)
            .frame(maxWidth: .infinity, minHeight: 44, alignment: rechts ? .trailing : .center)
            .listRowBackground(Color.clear)
    }
}

/// Hinweis als Zeile: Fehler rot mit Warnsymbol, Erfolg gruen mit Haken.
struct AnmeldeHinweis: View {
    let text: String
    var ok = false

    var body: some View {
        Label(text, systemImage: ok ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
            .foregroundStyle(ok ? Farbe.greenInk : Farbe.redInk)
            .fixedSize(horizontal: false, vertical: true)
            .gruppenZeile()
            .onAppear { UIAccessibility.post(notification: .announcement, argument: text) }
    }
}

/// Die eine Hauptaktion: breit, gefuellt, Kapsel - wie "Anmelden" im Event.
struct BreiterKnopf: View {
    let text: String
    var laeuft = false
    var gesperrt = false
    var rolle: ButtonRole?
    let aktion: () -> Void

    var body: some View {
        Button(role: rolle, action: aktion) {
            HStack(spacing: 8) {
                if laeuft { ProgressView().tint(.white) }
                Text(text).font(.headline)
            }
            .frame(maxWidth: .infinity, minHeight: 50)
        }
        .buttonStyle(.borderedProminent)
        .buttonBorderShape(.capsule)
        .tint(rolle == .destructive ? Farbe.red : Farbe.blue)
        .disabled(gesperrt || laeuft)
    }
}

/// Der breite Knopf als Zeile ohne Grund am Ende der Liste.
struct KnopfZeile<Inhalt: View>: View {
    @ViewBuilder let inhalt: Inhalt

    var body: some View {
        Section {
            VStack(spacing: 4) { inhalt }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
        }
    }
}

/// "Noch kein Mitglied? Antrag stellen" - Text leise, der Verweis in Blau.
struct AnmeldeFusszeile: View {
    let text: String
    let verweis: String
    let ziel: URL

    var body: some View {
        HStack(spacing: 4) {
            Text(text).foregroundStyle(Farbe.muted)
            Link(verweis, destination: ziel)
                .fontWeight(.semibold)
                .tint(Farbe.blueInk)
        }
        .font(.subheadline)
        .frame(maxWidth: .infinity, minHeight: 44)
    }
}
