/**
 * Bausteine der Bildschirme nach der Anmeldung
 *
 * Nachbauten der Expo-Komponenten (apps/mobile/src/components): grosser
 * Kopf, Abschnittskopf, Leerzustand, Fehlerzeile mit "Erneut versuchen",
 * Karte, Kicker und Zeitleiste. Masse und Texte wie dort, Farben und
 * Groessen aus den Tokens.
 */

import SwiftUI

// MARK: - Karte und Schrift

extension View {
    /// stil.listenkarte bzw. stil.karte: surf, Linie, kleiner Schatten (im Dunkeln keiner)
    func karte(radius: CGFloat = Tokens.Radius.karte, padding: CGFloat? = 12, gross: Bool = false) -> some View {
        modifier(KartenStil(radius: radius, padding: padding, gross: gross))
    }

    /// stil.kicker: Barlow Semi Condensed 700, gross geschrieben, gesperrt
    func kicker(farbe: Color = Farbe.muted) -> some View {
        font(Schrift.display(.fett, Tokens.Schrift.kicker, relativeTo: .caption))
            .textCase(.uppercase)
            .tracking(Tokens.Schrift.kicker * Tokens.Schrift.laufweiteKicker)
            .foregroundStyle(farbe)
    }

    /// stil.leise
    func leise() -> some View {
        font(Schrift.text(.normal, Tokens.Schrift.klein, relativeTo: .footnote)).foregroundStyle(Farbe.muted)
    }
}

private struct KartenStil: ViewModifier {
    @Environment(\.colorScheme) private var schema
    let radius: CGFloat
    let padding: CGFloat?
    let gross: Bool

    func body(content: Content) -> some View {
        let stufen = schema == .dark ? Tokens.Schattenstufen.dunkel : Tokens.Schattenstufen.hell
        let schatten = gross ? stufen.normal : stufen.klein
        content
            .padding(padding ?? 0)
            .background(Farbe.surf, in: RoundedRectangle(cornerRadius: radius))
            .overlay(RoundedRectangle(cornerRadius: radius).strokeBorder(Farbe.line, lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: radius))
            .shadow(color: schatten.farbe, radius: schatten.radius / 2, x: schatten.x, y: schatten.y)
    }
}

// MARK: - Kopf

/**
 * Der grosse Titel-Kopf (GrosserKopf.tsx): optional ein Kicker, Titel in
 * 34/800, rechts Glocke und Avatar. Der Titel darf zweizeilig werden (U52).
 */
struct GrosserKopf: View {
    let titel: String
    var kicker: String?
    var name: MeinName?

    var body: some View {
        HStack(alignment: .bottom, spacing: Tokens.Abstand.m) {
            VStack(alignment: .leading, spacing: 4) {
                if let kicker {
                    Text(kicker).kicker()
                }
                Text(titel)
                    .font(Schrift.text(.extrafett, Tokens.Schrift.seitentitel, relativeTo: .largeTitle))
                    .tracking(Tokens.Schrift.laufweiteTitel)
                    .foregroundStyle(Farbe.ink)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                    .accessibilityAddTraits(.isHeader)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            HStack(spacing: 10) {
                Glocke()
                Avatar(name: name)
            }
        }
        .padding(.top, 16)
        .padding(.bottom, Tokens.Abstand.m)
    }
}

/// Initialen auf brand; fuehrt ins Konto.
struct Avatar: View {
    @Environment(\.zuTab) private var zuTab
    let name: MeinName?

    var body: some View {
        Button { zuTab(.konto) } label: {
            Text(HomeLogik.initialen(name))
                .font(Schrift.text(.fett, 15))
                .dynamicTypeSize(...DynamicTypeSize.xLarge)
                .foregroundStyle(Farbe.onBrand)
                .frame(width: 44, height: 44)
                .background(Farbe.brand, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Konto")
    }
}

/// Abschnittskopf mit optionalem Link rechts ("Alle"); label sagt dem Screenreader, was gemeint ist (U6).
struct Kopfzeile: View {
    let titel: String
    var link: (text: String, label: String?, aktion: () -> Void)?

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(titel)
                .font(Schrift.text(.fett, Tokens.Schrift.titel, relativeTo: .title2))
                .tracking(-0.2)
                .foregroundStyle(Farbe.ink)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: Tokens.Abstand.s)
            if let link {
                Button(action: link.aktion) {
                    Text(link.text)
                        .font(Schrift.text(.halbfett, 14))
                        .foregroundStyle(Farbe.blueInk)
                        .frame(minHeight: 44)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(link.label ?? link.text)
                .accessibilityAddTraits(.isLink)
            }
        }
        .padding(.top, Tokens.Abstand.abschnitt - Tokens.Abstand.m - 12)
    }
}

// MARK: - Leer und Fehler

/// Wenn eine Liste leer ist (Leerzustand.tsx, U27)
struct Leerzustand: View {
    var titel: String?
    let text: String
    var handlung: (text: String, aktion: () -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let titel {
                Text(titel).font(Schrift.text(.fett, 18)).foregroundStyle(Farbe.ink)
            }
            Text(text).leise().lineSpacing(3).fixedSize(horizontal: false, vertical: true)
            if let handlung {
                Button(action: handlung.aktion) {
                    Text(handlung.text)
                        .font(Schrift.display(.fett, Tokens.Schrift.normal))
                        .foregroundStyle(Farbe.ink)
                        .padding(.horizontal, 16)
                        .frame(minHeight: 44)
                        .overlay(RoundedRectangle(cornerRadius: Tokens.Radius.knopf).strokeBorder(Farbe.line2, lineWidth: 1.5))
                }
                .buttonStyle(.plain)
                .padding(.top, 10)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .karte(radius: titel != nil ? Tokens.Radius.karteGross : Tokens.Radius.karte, padding: titel != nil ? 20 : 16, gross: true)
    }
}

/// Ein Ladefehler mit dem Weg zurueck (Fehlerzeile.tsx, U3)
struct Fehlerzeile: View {
    @Environment(\.colorScheme) private var schema
    let text: String
    var laeuft = false
    var onErneut: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(text).font(Schrift.text(.normal, Tokens.Schrift.normal)).foregroundStyle(Farbe.redInk)
                .fixedSize(horizontal: false, vertical: true)
            if let onErneut {
                Button(action: onErneut) {
                    Text(laeuft ? "Wird geladen…" : "Erneut versuchen")
                        .font(Schrift.text(.fett, 15))
                        .foregroundStyle(Farbe.redInk)
                        .padding(.horizontal, 16)
                        .frame(minHeight: 44)
                        .overlay(Capsule().strokeBorder(Farbe.red.opacity(0.4), lineWidth: 1.5))
                }
                .buttonStyle(.plain)
                .disabled(laeuft)
                .opacity(laeuft ? 0.6 : 1)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Farbe.red.opacity(schema == .dark ? 0.16 : 0.12), in: RoundedRectangle(cornerRadius: Tokens.Radius.feld))
    }
}

// MARK: - Zeitleiste

/**
 * Die Zeitleiste eines Platzes (MiniZeitleiste.tsx): belegt blau, eigene
 * Buchung gelb, Mitspieler gesucht gelblich mit gestrichelter Kante, Serie
 * schraffiert, Sperrung flach in surf3. Dazu die senkrechte Marke fuer jetzt.
 */
struct MiniZeitleiste: View {
    let segmente: [TimelineSegment]
    var markierung: Double?
    var hoehe: CGFloat = 8

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            ZStack(alignment: .leading) {
                Capsule().fill(Farbe.surf2)
                ForEach(Array(segmente.enumerated()), id: \.offset) { _, s in
                    segment(s)
                        .frame(width: max(0, w * s.width / 100), height: hoehe)
                        .offset(x: w * s.left / 100)
                }
            }
            .clipShape(Capsule())
            .overlay(alignment: .leading) {
                if let markierung {
                    RoundedRectangle(cornerRadius: 1)
                        .fill(Farbe.ink)
                        .frame(width: 2, height: hoehe)
                        .offset(x: min(w - 2, w * markierung / 100))
                }
            }
        }
        .frame(height: hoehe)
        // Schmuck; was die Leiste zeigt, steht daneben als Text.
        .accessibilityHidden(true)
    }

    @ViewBuilder private func segment(_ s: TimelineSegment) -> some View {
        switch s.art {
        case .belegt: Capsule().fill(Farbe.blue)
        case .eigen: Capsule().fill(Farbe.gold)
        case .sucht:
            Capsule().fill(Farbe.goldSoft)
                .overlay(Capsule().strokeBorder(Farbe.goldLine, style: StrokeStyle(lineWidth: 1.5, dash: [3, 2])))
        case .gesperrt: Capsule().fill(Farbe.surf3)
        case .serie:
            Capsule().fill(Farbe.surf3)
                .overlay(Schraffur().stroke(Farbe.rahmen.opacity(0.6), lineWidth: 1.5))
                .clipShape(Capsule())
        }
    }
}

/// Schraege Linien fuer Serien (Training)
private struct Schraffur: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        var x = -rect.height
        while x < rect.width {
            p.move(to: CGPoint(x: x, y: rect.height))
            p.addLine(to: CGPoint(x: x + rect.height, y: 0))
            x += 5
        }
        return p
    }
}
