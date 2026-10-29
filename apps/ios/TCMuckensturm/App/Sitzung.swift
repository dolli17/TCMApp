/**
 * Sitzung und Weiche der App
 *
 * Haelt den Supabase-Client, hoert auf An- und Abmeldung und legt danach
 * fest, welcher Bildschirm zu sehen ist (StartLogik). An- und Abmelden laufen
 * nur hier durch - so gibt es fuer beides genau eine Stelle.
 *
 * Dazu der Link aus der E-Mail (Einladung, Passwort vergessen): Solange einer
 * offen ist, liegt "Passwort festlegen" ueber der Weiche (PasswortAblauf).
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
    /// Der offene Link aus der E-Mail; nil, solange keiner offen ist.
    private(set) var passwort: PasswortZustand?

    @ObservationIgnored private var beobachter: Task<Void, Never>?
    /// Zaehlt Entscheidungen mit; eine aeltere, die spaeter fertig wird, verfaellt.
    @ObservationIgnored private var runde = 0
    /// Der Link, ueber den noch die Rueckfrage entscheidet.
    @ObservationIgnored private var offenerLink: LinkInhalt?
    /// Wie `runde`, fuer Links: oeffnet jemand einen neuen, verfaellt das Ergebnis des alten.
    @ObservationIgnored private var linkRunde = 0

    /// Laenger wartet niemand vor einem Ladekreis (wie FRIST_MS in passwort-setzen.tsx).
    static let frist = Duration.seconds(15)

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

    // MARK: - Passwort vergessen und setzen

    /**
     * Fordert den Link zum Neusetzen an. Gibt bei Erfolg nil zurueck, sonst den
     * Text fuer die Anzeige. Erfolg heisst nur "abgeschickt": ob es die Adresse
     * gibt, verraet die Antwort nicht (PasswortTexte.unterwegs).
     */
    func passwortLinkAnfordern(email: String) async -> String? {
        do {
            try await client.auth.resetPasswordForEmail(
                email.trimmingCharacters(in: .whitespacesAndNewlines),
                redirectTo: umgebung.passwortRueckleitung
            )
            return nil
        } catch {
            let form = AuthFehlerForm.aus(error)
            // Kein Netz oder Server gestoert: sonst wartet jemand auf eine Mail, die
            // nie verschickt wurde (U19). "Zu viele Versuche" dagegen nicht - das
            // meldet Auth nur fuer Adressen, die es gibt.
            let zuViele = Anmeldefehler.stoerungText(form) == Anmeldefehler.zuVieleVersuche
            return zuViele ? nil : Anmeldefehler.stoerungText(form)
        }
    }

    /**
     * onOpenURL: nimmt Links nach passwort-setzen an. Gibt false zurueck,
     * wenn der Link nicht hierher gehoert.
     */
    @discardableResult
    func linkOeffnen(_ url: URL) -> Bool {
        guard let link = Passwortlink.auswerten(url) else { return false }
        linkRunde += 1
        offenerLink = link
        ausfuehren(PasswortAblauf.beimOeffnen(link, angemeldet: angemeldetesKonto))
        return true
    }

    /// "Fortfahren" in der Rueckfrage: abmelden, dann den Link einloesen.
    func linkBestaetigen() {
        guard case .rueckfrage = passwort else { return }
        ausfuehren(PasswortAblauf.nachBestaetigung)
    }

    /// "Abbrechen" in der Rueckfrage, "Zurueck" oder fertig: den Link verwerfen, zurueck in die Weiche.
    func passwortSchliessen() {
        linkRunde += 1
        offenerLink = nil
        passwort = nil
    }

    /// Speichert das neue Passwort. Gibt bei Erfolg nil zurueck, sonst den Text fuer die Anzeige.
    func passwortSpeichern(_ neu: String) async -> String? {
        do {
            _ = try await client.auth.update(user: UserAttributes(password: neu))
            return nil
        } catch {
            return Anmeldefehler.passwortFehlerText(AuthFehlerForm.aus(error))
        }
    }

    private var angemeldetesKonto: AngemeldetesKonto? {
        guard let sitzung = client.auth.currentSession else { return nil }
        return AngemeldetesKonto(nutzerID: sitzung.user.id.uuidString.lowercased(), email: sitzung.user.email)
    }

    private func ausfuehren(_ schritt: PasswortAblauf.Schritt) {
        switch schritt {
        case let .rueckfrage(email):
            passwort = .rueckfrage(email: email)
        case .eigenesKonto:
            offenerLink = nil
            passwort = .bereit(konto: client.auth.currentUser?.email)
        case let .fehler(text):
            offenerLink = nil
            passwort = .fehler(text)
        case let .einloesen(vorherAbmelden):
            guard let link = offenerLink else { return }
            offenerLink = nil
            passwort = .laden
            let meine = linkRunde
            Task { await einloesen(link, vorherAbmelden: vorherAbmelden, runde: meine) }
        }
    }

    private func einloesen(_ link: LinkInhalt, vorherAbmelden: Bool, runde meine: Int) async {
        // Nie zwei Konten zugleich. Abgemeldet wird nur ueber die eine Stelle.
        if vorherAbmelden { await abmelden() }
        let auth = client.auth
        do {
            let konto: String? = try await mitFrist(Self.frist) {
                switch link {
                case let .token(tokenHash, typ):
                    let art: EmailOTPType = typ == .invite ? .invite : .recovery
                    return try await auth.verifyOTP(tokenHash: tokenHash, type: art).user.email
                case let .fragment(accessToken, refreshToken):
                    // Uebergang, bis die Cloud-Vorlagen token_hash schicken (S20).
                    return try await auth.setSession(accessToken: accessToken, refreshToken: refreshToken).user.email
                case .ungueltig, .ohne:
                    throw AuthError.sessionMissing
                }
            }
            guard meine == linkRunde else { return }
            passwort = .bereit(konto: konto)
        } catch {
            guard meine == linkRunde else { return }
            let frist = error is Zeitueberschreitung
            passwort = .fehler(PasswortAblauf.einloeseFehlerText(
                frist ? nil : AuthFehlerForm.aus(error),
                zeitUeberschritten: frist
            ))
        }
    }

    /// Von "Kein Zugang" zurueck zur Anmeldung.
    func zurAnmeldung() {
        runde += 1
        ziel = .anmelden
    }
}

/// Was "Passwort festlegen" gerade zeigt.
enum PasswortZustand: Equatable, Sendable {
    /// Ein anderes Konto ist angemeldet - erst fragen.
    case rueckfrage(email: String?)
    /// Der Link wird eingeloest.
    case laden
    /// Bereit fuer das neue Passwort; `konto` ist die Adresse, fuer die es gilt.
    case bereit(konto: String?)
    case fehler(String)
}
