/**
 * Bausteine der gruppierten Listen im Stil der iOS-Einstellungen
 *
 * Home, Plaetze und Konto stehen als eingerueckte, gruppierte Listen
 * (`.insetGrouped`) auf einem kuehlen Grund. Die Farben bleiben die des
 * Vereins (Tokens): Blau fuer Aktionen und Symbole, Gelb fuer "deins".
 */

import SwiftUI

/**
 * Der Grund hinter den Gruppen, aus den Vereinsfarben: hell ein kuehles Grau
 * (surf3 halb auf weiss), damit die weissen Gruppen sich abheben; dunkel der
 * dunkle Grund, auf dem die Gruppen (surf) heller stehen - wie bei Apple.
 */
struct GruppenGrund: View {
    @Environment(\.colorScheme) private var schema

    var body: some View {
        ZStack {
            Farbe.bg
            if schema == .light { Farbe.surf3.opacity(0.5) }
        }
        .ignoresSafeArea()
    }
}

/// Abschnittsueberschrift wie in den iOS-Einstellungen; rechts ein leiser Zusatz oder ein Verweis.
struct GruppenKopf: View {
    let titel: String
    var zusatz: String?
    /// Beschriftung des Verweises rechts ("Alle anzeigen"); braucht `aktion`.
    var verweis: String?
    var aktion: (() -> Void)?

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(titel).accessibilityAddTraits(.isHeader)
            Spacer(minLength: 8)
            if let verweis, let aktion {
                Button(verweis, action: aktion)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Farbe.blueInk)
                    .textCase(nil)
                    .buttonStyle(.borderless)
            } else if let zusatz {
                Text(zusatz).textCase(nil)
            }
        }
        .font(.footnote)
        .foregroundStyle(Farbe.muted)
    }
}

/// Grauer Pfeil am Ende einer Zeile, die weiterfuehrt.
struct ZeilenPfeil: View {
    var body: some View {
        Image(systemName: "chevron.right")
            .font(.footnote.weight(.semibold))
            .foregroundStyle(Farbe.line2)
            .accessibilityHidden(true)
    }
}

/// Symbol in einer abgerundeten Kachel links in einer Zeile - einheitlich im Vereinsblau, rot fuer Gefaehrliches.
struct IconKachel: View {
    let symbol: String
    var farbe: Color = Farbe.blue

    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(.white)
            .frame(width: 29, height: 29)
            .background(farbe, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
            .accessibilityHidden(true)
    }
}

extension View {
    /// Zeilengrund der Gruppen: surf (weiss bzw. dunkelblau), Trennlinien in line2.
    func gruppenZeile() -> some View {
        listRowBackground(Farbe.surf).listRowSeparatorTint(Farbe.line2)
    }

    /// Die gemeinsame Gestalt der Listen: eingerueckt gruppiert auf dem Vereinsgrund.
    func gruppenListe() -> some View {
        listStyle(.insetGrouped)
            .listSectionSpacing(24)
            .scrollContentBackground(.hidden)
            .background(GruppenGrund())
            .tint(Farbe.blue)
    }

    /// Unterzeile unter dem grossen Titel (ab iOS 26 nativ, vorher ohne).
    @ViewBuilder func titelUnterzeile(_ text: String?) -> some View {
        if #available(iOS 26.0, *), let text {
            navigationSubtitle(text)
        } else {
            self
        }
    }
}

/// Ein Ladefehler als Zeile, mit "Erneut versuchen".
struct FehlerZeile: View {
    let text: String
    let erneut: Erneut

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(text, systemImage: "exclamationmark.triangle")
                .font(.subheadline)
                .foregroundStyle(Farbe.redInk)
            Button(erneut.laeuft ? "Wird geladen…" : "Erneut versuchen", action: erneut.aktion)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Farbe.blueInk)
                .disabled(erneut.laeuft)
                .buttonStyle(.borderless)
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Bestaetigung

/**
 * Rueckmeldung nach einer Aktion als Leiste unten ueber der Tab-Leiste - sichtbar,
 * egal wohin gerollt ist oder welche Unterseite offen ist. Erfolg verschwindet
 * nach ein paar Sekunden, ein Fehler bleibt laenger; Antippen schliesst sie.
 * VoiceOver sagt sie an.
 */
private struct BestaetigungsLeiste: ViewModifier {
    @Binding var text: String?
    let ok: Bool

    func body(content: Content) -> some View {
        content.overlay(alignment: .bottom) {
            if let text {
                Label(text, systemImage: ok ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(ok ? Farbe.greenInk : Farbe.redInk)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .background(.regularMaterial, in: Capsule())
                    .shadow(color: .black.opacity(0.12), radius: 12, y: 4)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 12)
                    .onTapGesture { self.text = nil }
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .onAppear { UIAccessibility.post(notification: .announcement, argument: text) }
                    .task(id: text) {
                        try? await Task.sleep(for: .seconds(ok ? 4 : 8))
                        if self.text == text { self.text = nil }
                    }
            }
        }
        .animation(.snappy, value: text)
    }
}

extension View {
    /// Zeigt `text` als Bestaetigung (oder mit `ok: false` als Fehler) unten an.
    func bestaetigung(_ text: Binding<String?>, ok: Bool = true) -> some View {
        modifier(BestaetigungsLeiste(text: text, ok: ok))
    }
}
