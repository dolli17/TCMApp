/**
 * Anmeldung (Entwurf AppLogin, docs/design/clubhaus)
 *
 * Wie apps/mobile/app/anmelden.tsx. Die Felder tragen textContentType
 * username/password, damit iOS gespeicherte Passwoerter aus dem Schluesselbund
 * anbietet. Nach dem Anmelden wechselt die Weiche (Sitzung) den Bildschirm -
 * sie kennt das offene Onboarding und "Kein Zugang".
 */

import SwiftUI

struct AnmeldenBildschirm: View {
    @Environment(Sitzung.self) private var sitzung
    @State private var email = ""
    @State private var passwort = ""
    @State private var fehler: String?
    @State private var laeuft = false
    @State private var vergessenOffen = false

    var body: some View {
        NavigationStack {
            AnmeldeSeite(titel: "Willkommen zurück auf dem Platz.") {
                AnmeldeFeld(
                    beschriftung: "E-Mail",
                    text: $email,
                    inhaltsTyp: .username,
                    tastatur: .emailAddress
                )
                AnmeldeFeld(
                    beschriftung: "Passwort",
                    text: $passwort,
                    passwort: true,
                    inhaltsTyp: .password,
                    absenden: .go,
                    beimAbsenden: absenden
                )
                LeiserVerweis(text: "Passwort vergessen?", rechts: true) { vergessenOffen = true }

                // Die Meldung verraet bewusst nicht, ob die Adresse existiert.
                if let fehler {
                    AnmeldeHinweis(text: fehler)
                }

                VStack(spacing: Tokens.Abstand.l) {
                    GelberKnopf(text: laeuft ? "Anmelden…" : "Anmelden", gesperrt: laeuft, aktion: absenden)
                    // Der Mitgliedsantrag liegt im Web; ohne Adresse (lokal) bleibt die Zeile weg.
                    if let antrag = sitzung.umgebung.webLink("/antrag") {
                        AnmeldeFusszeile(text: "Noch kein Mitglied?", verweis: "Antrag stellen", ziel: antrag)
                    }
                }
                .padding(.top, Tokens.Abstand.abschnitt)
            }
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(isPresented: $vergessenOffen) {
                PasswortVergessenBildschirm { vergessenOffen = false }
            }
        }
        #if DEBUG
        // Fuer Bildschirmfotos per simctl (README): `xcrun simctl launch … -TCMPasswortVergessen`
        .onAppear {
            if ProcessInfo.processInfo.arguments.contains("-TCMPasswortVergessen") { vergessenOffen = true }
        }
        #endif
    }

    private func absenden() {
        guard !laeuft else { return }
        fehler = nil
        laeuft = true
        Task {
            let meldung = await sitzung.anmelden(email: email, passwort: passwort)
            laeuft = false
            fehler = meldung
        }
    }
}
