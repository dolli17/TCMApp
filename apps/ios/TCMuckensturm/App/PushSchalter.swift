/**
 * Der Schalter "Mitteilungen aufs Handy" (PushZeile in konto.tsx,
 * SchrittEinstellungen in onboarding.tsx)
 *
 * Das ist zugleich der Widerruf: ein zusaetzliches Ja/Nein in der Datenbank
 * waere eine Attrappe, denn abgeschaltet wird ohnehin ueber das Geraet oder
 * hier. Ein Fehlschlag steht als Satz darunter und haelt nichts anderes auf.
 * Erst hier fragt das Geraet nach der Erlaubnis.
 */

import SwiftUI

struct PushSchalter: View {
    @Environment(Sitzung.self) private var sitzung
    /// Im Konto mit Symbol links; im Onboarding mit Erklaerung darunter.
    var symbol: String?
    var beschreibung: String?

    @State private var an = false
    @State private var laeuft = false
    @State private var meldung: String?

    static let titel = "Mitteilungen aufs Handy"

    private var daten: Pushdaten { Pushdaten(client: sitzung.client) }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 12) {
                if let symbol { Symbolkachel(symbol: symbol) }
                VStack(alignment: .leading, spacing: 3) {
                    Text(Self.titel)
                        .font(Schrift.text(.halbfett, 15.5))
                        .foregroundStyle(Farbe.ink)
                    if symbol == nil, let text = meldung ?? beschreibung {
                        Text(text).leise().fixedSize(horizontal: false, vertical: true)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Toggle(Self.titel, isOn: Binding(get: { an }, set: { umschalten($0) }))
                    .labelsHidden()
                    .tint(Farbe.green)
                    .disabled(laeuft)
            }
            if symbol != nil, let meldung {
                Text(meldung).leise().padding(.leading, 44).fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(minHeight: 56)
        .accessibilityElement(children: .contain)
        .task { an = await PushZentrale.shared.istAngemeldet(daten) }
    }

    private func umschalten(_ ziel: Bool) {
        guard !laeuft else { return }
        laeuft = true
        let daten = daten
        Task {
            let zentrale = PushZentrale.shared
            let r = ziel ? await zentrale.anmelden(daten) : await zentrale.abmelden(daten)
            laeuft = false
            meldung = r.meldung.isEmpty ? nil : r.meldung
            if r.ok { an = ziel }
        }
    }
}
