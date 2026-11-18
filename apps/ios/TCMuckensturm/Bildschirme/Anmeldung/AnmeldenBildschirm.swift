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
            AnmeldeSeite(titel: "Willkommen zurück auf dem Platz.", unterzeile: "Melde dich mit deiner Vereins-E-Mail an.") {
                Section {
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
                    // Die Meldung verraet bewusst nicht, ob die Adresse existiert.
                    if let fehler {
                        AnmeldeHinweis(text: fehler)
                    }
                }
                KnopfZeile {
                    BreiterKnopf(text: "Anmelden", laeuft: laeuft, aktion: absenden)
                    LeiserVerweis(text: "Passwort vergessen?") { vergessenOffen = true }
                    // Der Mitgliedsantrag liegt im Web; ohne Adresse (lokal) bleibt die Zeile weg.
                    if let antrag = sitzung.umgebung.webLink("/antrag") {
                        AnmeldeFusszeile(text: "Noch kein Mitglied?", verweis: "Antrag stellen", ziel: antrag)
                    }
                }
            }
            .toolbar(.hidden, for: .navigationBar)
            .sensoryFeedback(.error, trigger: fehler) { _, neu in neu != nil }
            .navigationDestination(isPresented: $vergessenOffen) {
                PasswortVergessenBildschirm(email: email) { vergessenOffen = false }
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
