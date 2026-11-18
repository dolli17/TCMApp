/**
 * Passwort festlegen
 *
 * Ziel des Links aus der E-Mail (Einladung, Passwort vergessen), wie
 * apps/mobile/app/passwort-setzen.tsx. Den Link loest Sitzung ein; dieser
 * Bildschirm zeigt nur, was Sitzung.passwort meldet. Nach dem Speichern geht
 * es in die Weiche.
 *
 * Wie im Web steht ueber den Feldern, fuer welches Konto das Passwort gilt.
 */

import SwiftUI

struct PasswortSetzenBildschirm: View {
    @Environment(Sitzung.self) private var sitzung
    let zustand: PasswortZustand

    @State private var passwort = ""
    @State private var wiederholung = ""
    @State private var fehler: String?
    @State private var laeuft = false
    @State private var vergessenOffen = false

    var body: some View {
        NavigationStack {
            AnmeldeSeite(titel: PasswortTexte.setzenTitel, unterzeile: PasswortTexte.setzenUnterzeile, symbol: "lock.fill") {
                inhalt
            }
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(isPresented: $vergessenOffen) {
                PasswortVergessenBildschirm(zurueck: sitzung.passwortSchliessen)
            }
        }
        .alert(PasswortTexte.rueckfrageTitel, isPresented: rueckfrageOffen) {
            Button("Abbrechen", role: .cancel) { sitzung.passwortSchliessen() }
            Button("Fortfahren", role: .destructive) { sitzung.linkBestaetigen() }
        } message: {
            if case let .rueckfrage(email) = zustand {
                Text(PasswortTexte.rueckfrage(email: email))
            }
        }
    }

    @ViewBuilder private var inhalt: some View {
        switch zustand {
        case .rueckfrage, .laden:
            Section {
                ProgressView().tint(Farbe.muted).frame(maxWidth: .infinity, minHeight: 80)
            }
            .listRowBackground(Color.clear)
        case let .fehler(text):
            Section { AnmeldeHinweis(text: text) }
            KnopfZeile {
                BreiterKnopf(text: "Neuen Link anfordern") { vergessenOffen = true }
                LeiserVerweis(text: "Zurück zur Anmeldung", aktion: sitzung.passwortSchliessen)
            }
        case let .bereit(konto):
            Section {
                if let konto {
                    // Wie im Web: fuer welches Konto das Passwort gilt.
                    LabeledContent("Konto", value: konto).gruppenZeile()
                }
                AnmeldeFeld(
                    beschriftung: "Neues Passwort",
                    text: $passwort,
                    passwort: true,
                    inhaltsTyp: .newPassword
                )
                AnmeldeFeld(
                    beschriftung: "Noch einmal",
                    bedienName: "Passwort wiederholen",
                    text: $wiederholung,
                    passwort: true,
                    inhaltsTyp: .newPassword,
                    absenden: .go,
                    beimAbsenden: speichern
                )
                if let fehler {
                    AnmeldeHinweis(text: fehler)
                }
            }
            KnopfZeile {
                BreiterKnopf(text: "Speichern", laeuft: laeuft, aktion: speichern)
            }
        }
    }

    private var rueckfrageOffen: Binding<Bool> {
        Binding(
            get: { if case .rueckfrage = zustand { true } else { false } },
            // Schliesst iOS den Dialog selbst, entscheiden die Knoepfe oben.
            set: { _ in }
        )
    }

    private func speichern() {
        guard !laeuft else { return }
        fehler = PasswortRegeln.pruefen(passwort: passwort, wiederholung: wiederholung)
        guard fehler == nil else { return }
        laeuft = true
        Task {
            let meldung = await sitzung.passwortSpeichern(passwort)
            laeuft = false
            if let meldung {
                fehler = meldung
            } else {
                // In die Weiche: sie kennt das offene Onboarding und "Kein Zugang".
                sitzung.passwortSchliessen()
            }
        }
    }
}
