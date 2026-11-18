/**
 * Bausteine des Konto-Tabs
 *
 * Nachbauten der Bausteine unten in konto.tsx (Gruppe, Zeile, Eintrag,
 * Verweis, Marke, Statusmarke) und der Formularteile (stil.feld,
 * stil.hinweisFehler, Segmente, BlattKopf). Masse wie dort.
 */

import SwiftUI

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

/// Der Stand einer Forderung - zurueckgebucht in rot, denn da muss das Mitglied etwas tun.
struct StatusmarkeAnsicht: View {
    let marke: Statusmarke

    var body: some View {
        let (grund, schrift): (Color, Color) = switch marke.ton {
        // Der Kern nennt den Ton "gold"; gemeint ist ein Stand, kein "deins": hellblau.
        case .gold: (Farbe.blueSoft, Farbe.blueInk)
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

/// Titel und Schliessen oben in einem Blatt (BlattKopf in Blatt.tsx).
struct BlattKopf: View {
    let titel: String
    let zu: () -> Void

    var body: some View {
        HStack(alignment: .center) {
            Text(titel)
                .font(Schrift.display(.fett, 22, relativeTo: .title2))
                .foregroundStyle(Farbe.ink)
                .accessibilityAddTraits(.isHeader)
                .frame(maxWidth: .infinity, alignment: .leading)
            SchliessenKnopf(aktion: zu)
        }
    }
}
