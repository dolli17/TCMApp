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
        AnmeldeSeite(titel: KeinZugang.titel, unterzeile: KeinZugang.text(grund)) {
            Text("\(KeinZugang.kontakt) Du bist abgemeldet.")
                .font(Schrift.text(.normal, 16))
                .lineSpacing(8)
                .foregroundStyle(Farbe.ink2)
                .frame(maxWidth: .infinity, alignment: .leading)

            VStack(spacing: Tokens.abstand.l) {
                // Der Kontakt steht im Impressum; ohne Adresse (lokal) fuehrt der Knopf zur Anmeldung.
                if let kontakt = sitzung.umgebung.webLink("/impressum#kontakt") {
                    Link(destination: kontakt) {
                        Text("Vorstand kontaktieren")
                            .font(Schrift.text(.extrafett, 17, relativeTo: .headline))
                            .foregroundStyle(Farbe.onGold)
                            .frame(maxWidth: .infinity, minHeight: 58)
                            .background(Farbe.gold, in: RoundedRectangle(cornerRadius: 18))
                    }
                    LeiserVerweis(text: "Mit einem anderen Konto anmelden") { sitzung.zurAnmeldung() }
                } else {
                    GelberKnopf(text: "Zur Anmeldung") { sitzung.zurAnmeldung() }
                }
            }
            .padding(.top, Tokens.abstand.abschnitt)
        }
    }
}
