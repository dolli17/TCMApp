/**
 * Kein Zugang mehr (B22)
 *
 * Wie apps/mobile/app/kein-zugang.tsx. Die Weiche hat schon abgemeldet
 * (Sitzung.entscheiden); hier steht, warum, und wie man den Vorstand erreicht.
 */

import SwiftUI

struct KeinZugangBildschirm: View {
    @Environment(Sitzung.self) private var sitzung
    let grund: ZugangsGrund

    var body: some View {
        AnmeldeSeite(titel: KeinZugang.titel, unterzeile: KeinZugang.text(grund), symbol: "person.crop.circle.badge.xmark") {
            Section {
                Label {
                    Text("\(KeinZugang.kontakt) Du bist abgemeldet.").foregroundStyle(Farbe.ink)
                } icon: {
                    Image(systemName: "info.circle.fill").foregroundStyle(Farbe.blue)
                }
                .gruppenZeile()
            }
            // Blau der Kontakt, leise der Weg zu einem anderen Konto.
            KnopfZeile {
                // Der Kontakt steht im Impressum; ohne Adresse (lokal) fuehrt der Knopf zur Anmeldung.
                if let kontakt = sitzung.umgebung.webLink("/impressum#kontakt") {
                    Link(destination: kontakt) {
                        Text("Vorstand kontaktieren").font(.headline).frame(maxWidth: .infinity, minHeight: 50)
                    }
                    .buttonStyle(.borderedProminent)
                    .buttonBorderShape(.capsule)
                    .tint(Farbe.blue)
                    LeiserVerweis(text: "Mit einem anderen Konto anmelden") { sitzung.zurAnmeldung() }
                } else {
                    BreiterKnopf(text: "Zur Anmeldung") { sitzung.zurAnmeldung() }
                }
            }
        }
    }
}
