/**
 * Konto, Bereich "Mannschaft", als reine Funktionen
 *
 * Texte, Sichtbarkeit und Hinweise fuer Einladungen, Kader und die
 * Funktionen des Mannschaftsfuehrers (MF) nach dem Vertrag vom 02.11.2026.
 * Was erlaubt ist, entscheidet die Datenbank; hier steht nur, was die App
 * anbietet und wie sie es beschriftet. Geprueft in MannschaftLogikTests.
 */

import Foundation

enum MannschaftLogik {
    static let titel = "Mannschaft"
    static let telefonLabel = "Mannschaftsführer darf meine Telefonnummer sehen"
    static let telefonBeschreibung = "Er sieht dann im Kader deine Mobilnummer, sonst deine Telefonnummer."
    static let keineMannschaft = "Du bist in keiner Mannschaft."
    static let mfErklaerung = "Wen du einlädst, bekommt eine Nachricht und steht im Kader, sobald er annimmt. Einladungen verfallen nach 30 Tagen."
    static let mfKannNichtAustreten = "Als Mannschaftsführer kannst du nicht austreten. Das ändert der Vorstand."
    static let telefonNichtFreigegeben = "Telefon nicht freigegeben"
    static let zurueckgezogenMeldung = "Einladung zurückgezogen."
    static let sucheLabel = "Name suchen"
    static let keineKandidaten = "Niemand gefunden."

    /// Die Arten in `notifications`, die zur Mannschaft fuehren.
    static let nachrichtenArten: Set<String> = ["team_invited", "team_invitation_answered", "team_removed", "team_left"]

    static func istMannschaftsNachricht(_ kind: String?) -> Bool {
        nachrichtenArten.contains(kind ?? "")
    }

    // MARK: - Konto

    /**
     * Der Eintrag "Mannschaft" erscheint mit Mannschaft oder offenen
     * Einladungen. Kann meine_mannschaft() nicht laden, reicht die Mannschaft
     * aus dem Profil - dann zeigt der Bildschirm den Fehler.
     */
    static func zeigeEintrag(profilTeam: String?, mannschaft: MeineMannschaft?, einladungen: Int) -> Bool {
        mannschaft != nil || einladungen > 0 || !(profilTeam ?? "").isEmpty
    }

    /// "Herren 40 · Mannschaftsführer · 1 Einladung" - was unter dem Eintrag steht.
    static func uebersicht(mannschaft: MeineMannschaft?, profilTeam: String?, einladungen: Int) -> String? {
        var teile: [String] = []
        if let m = mannschaft {
            teile.append(m.name)
            if m.ichBinMf { teile.append("Mannschaftsführer") }
        } else if let team = profilTeam, !team.isEmpty {
            teile.append(team)
        }
        if einladungen == 1 {
            teile.append("1 Einladung")
        } else if einladungen > 1 {
            teile.append("\(einladungen) Einladungen")
        }
        return teile.isEmpty ? nil : teile.joined(separator: " · ")
    }

    // MARK: - Namen und LK

    static func name(_ vorname: String?, _ nachname: String?) -> String {
        [vorname, nachname].compactMap { $0.map(Profil.trim) }.filter { !$0.isEmpty }.joined(separator: " ")
    }

    /// "LK14,5" lesbar normalisiert, anders Geschriebenes wie gespeichert, leer -> nil.
    static func lk(_ text: String?) -> String? {
        let t = Profil.trim(text ?? "")
        if t.isEmpty { return nil }
        return LkEingabe.normalisiert(t) ?? t
    }

    // MARK: - Kader

    /// "LK14,5 · Mannschaftsführer", ohne LK "ohne LK".
    static func kaderUnterzeile(_ k: KaderMitglied) -> String {
        var teile = [lk(k.tennisLk) ?? "ohne LK"]
        if k.isTeamCaptain == true { teile.append("Mannschaftsführer") }
        return teile.joined(separator: " · ")
    }

    /// Der MF traegt andere aus, nicht sich selbst (der einzige MF im Kader ist er).
    static func darfAustragen(_ k: KaderMitglied, in m: MeineMannschaft) -> Bool {
        m.ichBinMf && k.isTeamCaptain != true
    }

    /// Der MF sieht, ob ein Spieler die Nummer freigegeben hat; Spieler sehen gar nichts dazu.
    static func telefonZeile(_ k: KaderMitglied, in m: MeineMannschaft) -> String? {
        guard m.ichBinMf, k.isTeamCaptain != true else { return nil }
        let nummer = Profil.trim(k.telefon ?? "")
        return nummer.isEmpty ? telefonNichtFreigegeben : nummer
    }

    /// tel:-Adresse aus einer Nummer, wie Menschen sie schreiben; nur Ziffern und ein fuehrendes +.
    static func telefonLink(_ nummer: String?) -> URL? {
        let t = Profil.trim(nummer ?? "")
        var ziffern = t.filter(\.isNumber).filter(\.isASCII)
        guard ziffern.count >= 3 else { return nil }
        if t.hasPrefix("+") { ziffern = "+" + ziffern }
        return URL(string: "tel:\(ziffern)")
    }

    static func austragenFrage(_ k: KaderMitglied, team: String) -> String {
        "\(name(k.firstName, k.lastName)) aus \(team) austragen?"
    }

    static func austragenText(_ k: KaderMitglied) -> String {
        "\(name(k.firstName, k.lastName)) bekommt eine Nachricht. Zurück geht es nur mit einer neuen Einladung."
    }

    static func ausgetragenMeldung(_ k: KaderMitglied) -> String {
        "\(name(k.firstName, k.lastName)) ist nicht mehr im Kader."
    }

    static func austretenFrage(_ team: String) -> String {
        "Aus \(team) austreten?"
    }

    static let austretenText = "Der Mannschaftsführer bekommt eine Nachricht. Zurück geht es nur mit einer neuen Einladung."

    static func ausgetretenMeldung(_ team: String) -> String {
        "Du bist aus \(team) ausgetreten."
    }

    // MARK: - Einladungen an mich

    /// "Eingeladen von Max Muster · gültig bis 02.12.2026"
    static func einladungUnterzeile(_ e: MannschaftEinladung) -> String {
        var teile: [String] = []
        if let von = e.eingeladenVon.map(Profil.trim), !von.isEmpty { teile.append("Eingeladen von \(von)") }
        if let bis = e.expiresAt, !bis.isEmpty { teile.append("gültig bis \(KontoLogik.tagDatum(bis))") }
        return teile.joined(separator: " · ")
    }

    /**
     * Der Satz vor dem Annehmen: was die Datenbank in `hinweis` schreibt,
     * sonst selbst gebaut - der Wechsel oder, wenn Annehmen nicht geht, die
     * MF-Sperre. Ohne Wechsel und ohne Sperre nil.
     */
    static func hinweis(_ e: MannschaftEinladung) -> String? {
        if let h = e.hinweis.map(Profil.trim), !h.isEmpty { return h }
        let alt = Profil.trim(e.wechselVon ?? "")
        if !e.annehmenMoeglich {
            if alt.isEmpty { return "Du kannst diese Einladung gerade nicht annehmen." }
            return "Du bist Mannschaftsführer von \(alt). Das kann nur der Vorstand ändern."
        }
        if alt.isEmpty { return nil }
        return "Du wechselst damit aus \(alt) in \(e.teamName)."
    }

    static func beantwortetMeldung(_ e: MannschaftEinladung, angenommen: Bool) -> String {
        angenommen ? "Willkommen in \(e.teamName)." : "Einladung abgelehnt."
    }

    // MARK: - Fuer den MF

    /// "gültig bis 02.12.2026" unter einer verschickten Einladung.
    static func offeneUnterzeile(_ e: OffeneEinladung) -> String {
        guard let bis = e.expiresAt, !bis.isEmpty else { return "offen" }
        return "offen · gültig bis \(KontoLogik.tagDatum(bis))"
    }

    struct KandidatMarke: Equatable, Sendable {
        enum Ton: Equatable, Sendable { case gruen, grau }
        let text: String
        let ton: Ton
    }

    /// "Interesse" fuer Interessenten, "spielt in Herren 40" fuer alle, die schon woanders spielen.
    static func kandidatMarken(_ k: MannschaftKandidat) -> [KandidatMarke] {
        var marken: [KandidatMarke] = []
        if k.mannschaftInteresse == true { marken.append(.init(text: "Interesse", ton: .gruen)) }
        if let team = k.aktuelleMannschaft.map(Profil.trim), !team.isEmpty {
            marken.append(.init(text: "spielt in \(team)", ton: .grau))
        }
        return marken
    }

    static func kandidatUnterzeile(_ k: MannschaftKandidat) -> String {
        lk(k.tennisLk) ?? "ohne LK"
    }

    /// Schon Eingeladene sind ausgegraut und lassen sich nicht noch einmal einladen.
    static func kannEinladen(_ k: MannschaftKandidat) -> Bool {
        k.eingeladen != true
    }

    static func einladenKnopf(_ k: MannschaftKandidat) -> String {
        kannEinladen(k) ? "Einladen" : "Eingeladen"
    }

    static func eingeladenMeldung(_ k: MannschaftKandidat) -> String {
        "\(name(k.firstName, k.lastName)) ist eingeladen."
    }

    /// Nach dem Einladen bleibt die Zeile stehen, nur ausgegraut - ohne neu zu laden.
    static func alsEingeladen(_ liste: [MannschaftKandidat], _ memberId: String) -> [MannschaftKandidat] {
        liste.map { k in
            guard k.memberId == memberId else { return k }
            return MannschaftKandidat(
                memberId: k.memberId, firstName: k.firstName, lastName: k.lastName, tennisLk: k.tennisLk,
                mannschaftInteresse: k.mannschaftInteresse, aktuelleMannschaft: k.aktuelleMannschaft, eingeladen: true
            )
        }
    }
}
