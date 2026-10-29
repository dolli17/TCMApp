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
    /// "Zurueck zur Anmeldung"
    let zurueck: () -> Void

    @State private var email = ""
    @State private var meldung: String?
    @State private var fehler: String?
    @State private var laeuft = false

    var body: some View {
        AnmeldeSeite(titel: PasswortTexte.vergessenTitel, unterzeile: PasswortTexte.vergessenUnterzeile) {
            AnmeldeFeld(
                beschriftung: "E-Mail",
                text: $email,
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

            VStack(spacing: 6) {
                GelberKnopf(text: laeuft ? "Wird gesendet…" : "Link anfordern", gesperrt: laeuft, aktion: absenden)
                LeiserVerweis(text: "Zurück zur Anmeldung", aktion: zurueck)
            }
            .padding(.top, Tokens.Abstand.abschnitt)
        }
        .toolbar(.hidden, for: .navigationBar)
    }

    private func absenden() {
        guard !laeuft else { return }
        meldung = nil
        fehler = nil
        laeuft = true
        Task {
            let stoerung = await sitzung.passwortLinkAnfordern(email: email)
            laeuft = false
            if let stoerung {
                fehler = stoerung
            } else {
                meldung = PasswortTexte.unterwegs
            }
        }
    }
}
