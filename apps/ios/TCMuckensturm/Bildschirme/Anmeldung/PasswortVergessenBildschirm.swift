/**
 * Passwort vergessen
 *
 * Wie apps/mobile/app/passwort-vergessen.tsx. Fordert den Link an; er fuehrt
 * auf <SITE_URL>/passwort-setzen (Universal Link) und oeffnet die App, sonst
 * das Web. Lokal ohne Web nimmt er das eigene Schema (Umgebung).
 */

import SwiftUI

struct PasswortVergessenBildschirm: View {
    @Environment(Sitzung.self) private var sitzung
    /// Vorbelegt mit dem, was auf der Anmeldung schon steht.
    var email = ""
    /// "Zurueck zur Anmeldung"
    let zurueck: () -> Void

    @State private var eingabe: String?
    @State private var meldung: String?
    @State private var fehler: String?
    @State private var laeuft = false

    private var adresse: Binding<String> {
        Binding(get: { eingabe ?? email }, set: { eingabe = $0 })
    }

    var body: some View {
        AnmeldeSeite(titel: PasswortTexte.vergessenTitel, unterzeile: PasswortTexte.vergessenUnterzeile) {
            Section {
                AnmeldeFeld(
                    beschriftung: "E-Mail",
                    text: adresse,
                    inhaltsTyp: .emailAddress,
                    tastatur: .emailAddress,
                    absenden: .send,
                    beimAbsenden: absenden
                )
                // Die Meldung ist dieselbe, ob es die Adresse gibt oder nicht.
                if let meldung {
                    AnmeldeHinweis(text: "\(meldung) \(PasswortTexte.spam)", ok: true)
                }
                if let fehler {
                    AnmeldeHinweis(text: fehler)
                }
            }
            KnopfZeile {
                BreiterKnopf(text: "Link anfordern", laeuft: laeuft, aktion: absenden)
                LeiserVerweis(text: "Zurück zur Anmeldung", aktion: zurueck)
            }
        }
        .toolbar(.hidden, for: .navigationBar)
        .sensoryFeedback(.success, trigger: meldung) { _, neu in neu != nil }
    }

    private func absenden() {
        guard !laeuft else { return }
        meldung = nil
        fehler = nil
        laeuft = true
        Task {
            let stoerung = await sitzung.passwortLinkAnfordern(email: adresse.wrappedValue)
            laeuft = false
            if let stoerung {
                fehler = stoerung
            } else {
                meldung = PasswortTexte.unterwegs
            }
        }
    }
}
