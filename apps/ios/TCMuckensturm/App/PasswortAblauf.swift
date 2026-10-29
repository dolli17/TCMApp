/**
 * Passwort vergessen und setzen: Regeln, Texte und der Ablauf beim Oeffnen
 * eines Links
 *
 * Texte wie apps/mobile/app/passwort-vergessen.tsx und passwort-setzen.tsx.
 * Als reine Funktionen, damit sie ohne Netz testbar sind; das Netz spricht
 * Sitzung.
 *
 * Sicherheitsvorgabe (Security-Audit, Login-CSRF): Ist beim Oeffnen eines
 * Links schon ein anderes Konto angemeldet, meldet die App nicht still ab und
 * loest ein. Sie fragt erst nach - sonst koennte jemand einem anderen einen
 * Link zum eigenen Konto unterschieben, und der gaebe danach dort seine Daten
 * ein. Expo-App und Web melden in diesem Fall noch ohne Rueckfrage ab.
 */

import Foundation

enum PasswortTexte {
    static let vergessenTitel = "Passwort vergessen"
    static let vergessenUnterzeile = "Wir schicken dir einen Link zum Neusetzen."
    /// Dieselbe Meldung, ob es die Adresse gibt oder nicht (passwortLinkAnfordern in daten.ts).
    static let unterwegs = "Wenn es zu dieser Adresse ein Konto gibt, ist die E-Mail unterwegs."
    /// Die Mail landet bei manchen Anbietern im Spam (U31).
    static let spam = "Schau auch im Spam-Ordner nach."
    static let ohneRueckleitung = "Für diese Konfiguration ist keine Rückleitung eingerichtet (SITE_URL oder URL-Schema)."

    static let setzenTitel = "Passwort festlegen"
    static let setzenUnterzeile = "Mindestens acht Zeichen."
    static let abgelaufen = "Dieser Link ist abgelaufen oder wurde schon benutzt."
    static let ohneToken =
        "Dieser Link ist unvollständig. Öffne ihn bitte direkt aus der E-Mail oder fordere einen neuen an."
    static let keinNetz = "Keine Verbindung zum Server. Prüfe dein Internet und öffne den Link noch einmal."
    static let zuKurz = "Das Passwort braucht mindestens acht Zeichen."
    static let ungleich = "Die beiden Eingaben stimmen nicht überein."

    static let rueckfrageTitel = "Anderes Konto"
    static func rueckfrage(email: String?) -> String {
        let wer = email.map { "als \($0)" } ?? "mit einem anderen Konto"
        return "Du bist \(wer) angemeldet. Mit diesem Link meldest du dich ab und setzt das Passwort für ein anderes Konto. Fortfahren?"
    }
}

enum PasswortRegeln {
    /// Wie Expo-App und Web (dort mit minLength=8).
    static let mindestlaenge = 8

    /// nil, wenn das Passwort so gespeichert werden darf; sonst der Hinweis.
    static func pruefen(passwort: String, wiederholung: String) -> String? {
        // Gezaehlt wie String.length in JavaScript, damit dieselben Passwoerter durchgehen.
        if passwort.utf16.count < mindestlaenge { return PasswortTexte.zuKurz }
        if passwort != wiederholung { return PasswortTexte.ungleich }
        return nil
    }
}

/// Wer gerade angemeldet ist - so viel braucht die Rueckfrage.
struct AngemeldetesKonto: Equatable, Sendable {
    /// Kleingeschrieben, wie im Token (sub).
    let nutzerID: String
    let email: String?
}

enum PasswortAblauf {
    enum Schritt: Equatable, Sendable {
        /// Den Link einloesen; mit `abmelden` vorher die bisherige Sitzung beenden.
        case einloesen(abmelden: Bool)
        /// Erst fragen: ein anderes Konto ist angemeldet.
        case rueckfrage(email: String?)
        /// Ohne Link, aber angemeldet: das eigene Passwort aendern.
        case eigenesKonto
        case fehler(String)
    }

    /**
     * Was beim Oeffnen eines Links geschieht.
     *
     * Ein token_hash verraet nicht, zu welchem Konto er gehoert. Ist jemand
     * angemeldet, fragt die App deshalb immer. Beim Fragment steht die
     * Nutzer-ID im Token: gehoert es zum angemeldeten Konto, gibt es nichts zu
     * fragen und nichts abzumelden.
     */
    static func beimOeffnen(_ link: LinkInhalt, angemeldet: AngemeldetesKonto?) -> Schritt {
        switch link {
        case .ungueltig:
            return .fehler(PasswortTexte.abgelaufen)
        case .ohne:
            return angemeldet == nil ? .fehler(PasswortTexte.ohneToken) : .eigenesKonto
        case .token:
            guard let angemeldet else { return .einloesen(abmelden: false) }
            return .rueckfrage(email: angemeldet.email)
        case let .fragment(accessToken, _):
            guard let angemeldet else { return .einloesen(abmelden: false) }
            if Passwortlink.nutzerID(ausToken: accessToken) == angemeldet.nutzerID {
                return .einloesen(abmelden: false)
            }
            return .rueckfrage(email: angemeldet.email)
        }
    }

    /// Nach "Fortfahren" in der Rueckfrage.
    static let nachBestaetigung = Schritt.einloesen(abmelden: true)

    /**
     * Text, wenn das Einloesen scheitert. Ohne Netz (oder nach der Frist) soll
     * niemand lesen, der Link sei abgelaufen - er gilt ja noch.
     */
    static func einloeseFehlerText(_ fehler: AuthFehlerForm?, zeitUeberschritten: Bool = false) -> String {
        if zeitUeberschritten { return PasswortTexte.keinNetz }
        guard let fehler else { return PasswortTexte.abgelaufen }
        if let stoerung = Anmeldefehler.stoerungText(fehler) {
            return stoerung == Anmeldefehler.verbindung ? PasswortTexte.keinNetz : stoerung
        }
        return PasswortTexte.abgelaufen
    }
}
