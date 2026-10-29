/**
 * Sitzung und Weiche der App
 *
 * Haelt den Supabase-Client, hoert auf An- und Abmeldung und legt danach
 * fest, welcher Bildschirm zu sehen ist (StartLogik). An- und Abmelden laufen
 * nur hier durch - so gibt es fuer beides genau eine Stelle.
 */

import Foundation
import Observation
import Supabase

@MainActor
@Observable
final class Sitzung {
    let umgebung: Umgebung
    let client: SupabaseClient
    private(set) var ziel: StartZiel = .laden

    @ObservationIgnored private var beobachter: Task<Void, Never>?
    /// Zaehlt Entscheidungen mit; eine aeltere, die spaeter fertig wird, verfaellt.
    @ObservationIgnored private var runde = 0

    init(umgebung: Umgebung) {
        self.umgebung = umgebung
        self.client = SupabaseVerbindung.client(fuer: umgebung)
    }

    /// Startet die Beobachtung. Das erste Ereignis meldet die gespeicherte Sitzung.
    func starten() {
        guard beobachter == nil else { return }
        let auth = client.auth
        beobachter = Task { [weak self] in
            for await (ereignis, sitzung) in auth.authStateChanges {
                guard let self else { return }
                switch ereignis {
                case .initialSession, .signedIn:
                    await self.entscheiden(angemeldet: sitzung != nil)
                case .signedOut:
                    self.runde += 1
                    self.ziel = StartLogik.nachAbmelden(aktuell: self.ziel)
                default:
                    // Token erneuert, Nutzer geaendert usw.: kein Wechsel des Bildschirms.
                    break
                }
            }
        }
    }

    private func entscheiden(angemeldet: Bool) async {
        runde += 1
        let meine = runde
        guard angemeldet else {
            ziel = .anmelden
            return
        }
        let zugang = await ladeZugang()
        guard meine == runde else { return }
        let neu = StartLogik.ziel(angemeldet: true, zugang: zugang)
        ziel = neu
        // Wie kein-zugang.tsx: abmelden, damit der naechste Start bei der Anmeldung beginnt.
        if case .keinZugang = neu { await abmelden() }
    }

    /// mein_zugang(); nil, wenn das Lesen ausfaellt (siehe StartLogik).
    private func ladeZugang() async -> Zugang? {
        do {
            // Erneuert eine abgelaufene Sitzung, bevor gefragt wird.
            _ = try await client.auth.session
            let zeilen: [Zugang] = try await client.rpc("mein_zugang").execute().value
            return zeilen.first ?? Zugang(zugang: true, grund: nil, onboardingOffen: false)
        } catch {
            return nil
        }
    }

    // MARK: - An- und Abmelden

    /// Meldet an. Gibt bei Erfolg nil zurueck, sonst den Text fuer die Anzeige.
    /// Den Bildschirm wechselt danach die Weiche (Ereignis signedIn).
    func anmelden(email: String, passwort: String) async -> String? {
        do {
            try await client.auth.signIn(
                email: email.trimmingCharacters(in: .whitespacesAndNewlines),
                password: passwort
            )
            return nil
        } catch {
            return Anmeldefehler.anmeldeFehlerText(AuthFehlerForm.aus(error))
        }
    }

    /// Die eine Stelle zum Abmelden.
    func abmelden() async {
        // TODO: Push-Token abmelden, sobald es Push gibt (wie in apps/mobile/src/lib/push.ts).
        // signOut entfernt die Sitzung zuerst lokal und meldet dann den Server;
        // faellt der aus (kein Netz), ist man trotzdem abgemeldet.
        try? await client.auth.signOut()
    }

    /// Von "Kein Zugang" zurueck zur Anmeldung.
    func zurAnmeldung() {
        runde += 1
        ziel = .anmelden
    }
}
