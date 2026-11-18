/**
 * Bausteine der Bildschirme nach der Anmeldung
 *
 * Grosser Kopf, Abschnittskopf, Leerzustand, Fehlerzeile mit "Erneut
 * versuchen", Karte und Kicker nach dem Design "Stitch" (docs/design/stitch).
 * Farben und Groessen aus den Tokens; die Knoepfe stehen in Knoepfe.swift.
 */

import SwiftUI

// MARK: - Karte und Schrift

extension View {
    /// Karte: surf mit feiner Linie, Radius 24 bis 32, ohne Schatten (docs/design/stitch)
    func karte(radius: CGFloat = Tokens.Radius.karte, padding: CGFloat? = 12, gross: Bool = false) -> some View {
        modifier(KartenStil(radius: radius, padding: padding, gross: gross))
    }

    /// Kicker: Space Grotesk 700, gross geschrieben, gesperrt
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
    let radius: CGFloat
    let padding: CGFloat?
    let gross: Bool

    func body(content: Content) -> some View {
        content
            .padding(padding ?? 0)
            .background(Farbe.surf, in: RoundedRectangle(cornerRadius: radius))
            .overlay(RoundedRectangle(cornerRadius: radius).strokeBorder(Farbe.line, lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: radius))
    }
}

// MARK: - Kopf

/// Abschnittskopf mit optionalem Zaehler ("3 Plaetze") oder Link rechts ("Alle"); label sagt dem
/// Screenreader, was gemeint ist (U6).
struct Kopfzeile: View {
    let titel: String
    var zaehler: String?
    var link: (text: String, label: String?, aktion: () -> Void)?

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(titel)
                .font(Schrift.display(.halbfett, Tokens.Schrift.titel, relativeTo: .title2))
                .tracking(-0.2)
                .foregroundStyle(Farbe.ink)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: Tokens.Abstand.s)
            if let zaehler {
                Text(zaehler).kicker()
            }
            if let link {
                Button(action: link.aktion) {
                    Text(link.text)
                        .font(Schrift.display(.halbfett, 14))
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
                Text(titel).font(Schrift.display(.halbfett, 22)).foregroundStyle(Farbe.ink)
            }
            Text(text).leise().lineSpacing(3).fixedSize(horizontal: false, vertical: true)
            if let handlung {
                Knopf(handlung.text, stufe: .leise, groesse: .klein, aktion: handlung.aktion)
                    .padding(.top, 10)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .karte(radius: titel != nil ? Tokens.Radius.karteGross : Tokens.Radius.karte, padding: titel != nil ? 22 : 18)
    }
}

/**
 * Fehler, wenn noch gar nichts geladen ist (docs/design/stitch, "Verein
 * Fehlerzustand"): mittig ein Symbol, der Satz und neutral "Erneut versuchen".
 * Steht schon Inhalt da, bleibt es bei der Fehlerzeile darueber.
 */
struct Fehlerzustand: View {
    let text: String
    var laeuft = false
    let onErneut: () -> Void

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "icloud.slash")
                .font(.system(size: 22, weight: .medium))
                .foregroundStyle(Farbe.ink2)
                .frame(width: 56, height: 56)
                .background(Farbe.chip, in: Circle())
                .accessibilityHidden(true)
            Text(text)
                .font(Schrift.display(.halbfett, 18, relativeTo: .title3))
                .foregroundStyle(Farbe.ink)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            Knopf(laeuft ? "Wird geladen…" : "Erneut versuchen", stufe: .leise, gesperrt: laeuft, aktion: onErneut)
                .padding(.top, 6)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, Tokens.Abstand.m)
        .padding(.top, 96)
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
                Knopf(laeuft ? "Wird geladen…" : "Erneut versuchen", stufe: .gefahrLeise, groesse: .klein, gesperrt: laeuft, aktion: onErneut)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Farbe.red.opacity(schema == .dark ? 0.16 : 0.08), in: RoundedRectangle(cornerRadius: Tokens.Radius.karte))
    }
}
