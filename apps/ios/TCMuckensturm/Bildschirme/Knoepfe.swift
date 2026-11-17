/**
 * Knoepfe, Marker und Auswahl nach dem Design "Stitch" (docs/design/stitch)
 *
 * Alle Bildschirme nehmen dieselben Pillen in drei Stufen, wie .knopf im Web
 * (apps/web/src/app/globals.css):
 *
 *   haupt        kraeftiges Blau, weisse Schrift - die eine Hauptaktion
 *   zweit        hellblau mit blauer Schrift - alles Zweite ("Mitspielen")
 *   leise        weiss mit Linie - neutral ("Doch nicht", "Abbrechen")
 *   gefahr       rot gefuellt - nur als Bestaetigung neben einem "Doch nicht"
 *   gefahrLeise  roter Text mit roter Linie - der Weg zur Bestaetigung
 *
 * Gelb ist kein Knopf. Gelb heisst "deins" und steht nur im DeinMarker.
 * Ausgewaehltes (Chips, Optionen) ist hellblau mit blauer Linie.
 */

import SwiftUI

enum KnopfStufe: Sendable {
    case haupt, zweit, leise, gefahr, gefahrLeise
}

enum KnopfGroesse: Sendable {
    case klein, normal, gross

    var hoehe: CGFloat {
        switch self {
        case .klein: 40
        case .normal: 52
        case .gross: 56
        }
    }

    var schrift: CGFloat { self == .klein ? 14 : 16 }
    var rand: CGFloat { self == .klein ? 14 : 20 }
}

/// Das Aussehen eines Knopfs; als ButtonStyle auch fuer Link und Menu-Label nutzbar.
struct KnopfStil: ButtonStyle {
    var stufe: KnopfStufe = .zweit
    var groesse: KnopfGroesse = .normal
    /// Volle Breite (im Fuss eines Blatts)
    var breit = false
    /// Schmalerer Innenrand, wenn zwei Knoepfe nebeneinander stehen
    var eng = false

    func makeBody(configuration: Configuration) -> some View {
        KnopfFlaeche(stufe: stufe, groesse: groesse, breit: breit, eng: eng, gedrueckt: configuration.isPressed) {
            configuration.label
        }
    }
}

extension ButtonStyle where Self == KnopfStil {
    static func knopf(
        _ stufe: KnopfStufe = .zweit, _ groesse: KnopfGroesse = .normal, breit: Bool = false, eng: Bool = false
    ) -> KnopfStil {
        KnopfStil(stufe: stufe, groesse: groesse, breit: breit, eng: eng)
    }
}

/// Die Pille selbst - auch fuer Stellen, die kein Button sind (Link).
struct KnopfFlaeche<Inhalt: View>: View {
    @Environment(\.isEnabled) private var aktiv
    var stufe: KnopfStufe = .zweit
    var groesse: KnopfGroesse = .normal
    var breit = false
    var eng = false
    var gedrueckt = false
    @ViewBuilder let inhalt: Inhalt

    var body: some View {
        // Gesperrt ist die Hauptaktion neutral statt blassblau (U26): der Grund steht daneben.
        let neutral = !aktiv && (stufe == .haupt || stufe == .gefahr)
        let (grund, tinte, linie) = farben(neutral: neutral)
        HStack(spacing: eng ? 6 : 8) { inhalt }
            .font(Schrift.display(.halbfett, eng ? groesse.schrift - 1 : groesse.schrift))
            .foregroundStyle(tinte)
            .lineLimit(1)
            .minimumScaleFactor(0.75)
            .padding(.horizontal, eng ? 10 : groesse.rand)
            .frame(maxWidth: breit ? .infinity : nil, minHeight: groesse.hoehe)
            .background(grund, in: Capsule())
            .overlay(Capsule().strokeBorder(linie, lineWidth: 1))
            .contentShape(Capsule())
            .opacity(gedrueckt ? 0.82 : (!aktiv && !neutral ? 0.5 : 1))
    }

    private func farben(neutral: Bool) -> (Color, Color, Color) {
        if neutral { return (Farbe.surf3, Farbe.muted, .clear) }
        switch stufe {
        case .haupt: return (Farbe.blue, Farbe.onBrand, .clear)
        case .zweit: return (Farbe.blueSoft, Farbe.blueInk, Farbe.blue.opacity(0.22))
        case .leise: return (Farbe.surf, Farbe.ink, Farbe.line2)
        case .gefahr: return (Farbe.red, Farbe.onBrand, .clear)
        case .gefahrLeise: return (.clear, Farbe.redInk, Farbe.red.opacity(0.4))
        }
    }
}

/// Ein Knopf mit Text und optionalem Symbol davor.
struct Knopf: View {
    let text: String
    var symbol: String?
    var stufe: KnopfStufe = .zweit
    var groesse: KnopfGroesse = .normal
    var breit = false
    var eng = false
    var gesperrt = false
    let aktion: () -> Void

    init(
        _ text: String, symbol: String? = nil, stufe: KnopfStufe = .zweit, groesse: KnopfGroesse = .normal,
        breit: Bool = false, eng: Bool = false, gesperrt: Bool = false, aktion: @escaping () -> Void
    ) {
        self.eng = eng
        self.text = text
        self.symbol = symbol
        self.stufe = stufe
        self.groesse = groesse
        self.breit = breit
        self.gesperrt = gesperrt
        self.aktion = aktion
    }

    var body: some View {
        Button(action: aktion) {
            if let symbol {
                Image(systemName: symbol).font(.system(size: groesse.schrift + (eng ? 0 : 2), weight: .medium)).accessibilityHidden(true)
            }
            Text(text)
        }
        .buttonStyle(.knopf(stufe, groesse, breit: breit, eng: eng))
        .disabled(gesperrt)
    }
}

/// Gelb heisst "deins": eigener Termin, eigenes Spiel, "Du bist dabei" (.dein-marker im Web).
struct DeinMarker: View {
    let text: String

    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text)
            .font(Schrift.display(.halbfett, 12.5, relativeTo: .caption))
            .foregroundStyle(Farbe.onGold)
            .lineLimit(1)
            .padding(.horizontal, 10)
            .frame(minHeight: 24)
            .background(Farbe.gold, in: Capsule())
    }
}

/// Hellblaue Marke fuer Zaehler und Status ohne Besitz ("Doppel", "Mitspieler gesucht").
struct BlaueMarke: View {
    let text: String

    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text)
            .font(Schrift.display(.halbfett, 12.5, relativeTo: .caption))
            .foregroundStyle(Farbe.blueInk)
            .lineLimit(1)
            .padding(.horizontal, 10)
            .frame(minHeight: 24)
            .background(Farbe.blueSoft, in: Capsule())
    }
}

extension View {
    /// Eine waehlbare Pille (Chip, Option): gewaehlt hellblau mit blauer Linie, sonst weiss mit Linie.
    func auswahlPille(_ gewaehlt: Bool, hoehe: CGFloat = 44, rand: CGFloat = 16) -> some View {
        font(Schrift.display(.halbfett, 15))
            .foregroundStyle(gewaehlt ? Farbe.blueInk : Farbe.ink)
            .padding(.horizontal, rand)
            .frame(minHeight: hoehe)
            .background(gewaehlt ? Farbe.blueSoft : Farbe.surf, in: Capsule())
            .overlay(Capsule().strokeBorder(gewaehlt ? Farbe.blue : Farbe.line2, lineWidth: gewaehlt ? 1.5 : 1))
            .contentShape(Capsule())
    }
}

/**
 * Umschalter aus zwei oder mehr Segmenten ("Belegung | Meine & offene Spiele"):
 * Schiene in surf2, das gewaehlte Segment als weisse Pille.
 */
struct SegmentLeiste<Wert: Hashable>: View {
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
                    .font(Schrift.display(aktiv ? .halbfett : .mittel, 15))
                    .foregroundStyle(aktiv ? Farbe.ink : Farbe.muted)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                    .frame(maxWidth: .infinity, minHeight: 40)
                    .padding(.horizontal, 6)
                    .background {
                        if aktiv {
                            RoundedRectangle(cornerRadius: 22)
                                .fill(Farbe.segAktiv)
                                .overlay(RoundedRectangle(cornerRadius: 22).strokeBorder(Farbe.line, lineWidth: 1))
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
        .background(Farbe.surf2, in: RoundedRectangle(cornerRadius: 26))
        .overlay(RoundedRectangle(cornerRadius: 26).strokeBorder(Farbe.line, lineWidth: 1))
        .opacity(gesperrt ? 0.6 : 1)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(beschriftung)
    }
}

/// Rundes Schliessen-Kreuz oben rechts in einem Blatt.
struct SchliessenKnopf: View {
    let aktion: () -> Void

    var body: some View {
        Button(action: aktion) {
            Image(systemName: "xmark")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Farbe.ink2)
                .frame(width: 44, height: 44)
                .background(Farbe.chip, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Schließen")
    }
}

/// Die eine Hauptaktion eines Bildschirms oder Blatts: blau gefuellt, volle Breite.
struct Hauptknopf: View {
    let text: String
    var gesperrt = false
    let aktion: () -> Void

    var body: some View {
        Knopf(text, stufe: .haupt, breit: true, gesperrt: gesperrt, aktion: aktion)
    }
}

/// Neutraler Knopf mit Linie in voller Breite; rot als Weg zu etwas Zerstoerendem.
struct LeiserKnopf: View {
    let text: String
    var rot = false
    var gesperrt = false
    let aktion: () -> Void

    var body: some View {
        Knopf(text, stufe: rot ? .gefahrLeise : .leise, breit: true, gesperrt: gesperrt, aktion: aktion)
    }
}
