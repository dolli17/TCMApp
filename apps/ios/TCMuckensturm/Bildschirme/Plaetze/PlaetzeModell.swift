/**
 * Zustand und Aktionen des Tabs Plaetze (apps/mobile/app/(tabs)/plaetze/index.tsx)
 *
 * Laedt den Tag, haelt ihn ueber Realtime aktuell und fuehrt aus, was im
 * Blatt angestossen wird. Klappt eine Aktion, schliesst das Blatt, die
 * Meldung kommt als Toast und die betroffene Belegung ist kurz
 * hervorgehoben (U16). Scheitert sie, bleibt das Blatt offen und der Grund
 * der Datenbank steht ueber dem Knopf.
 */

import Foundation
import Observation
import Supabase

/// Was im Blatt gerade bearbeitet wird.
enum Fenster: Identifiable, Equatable {
    /// stunde ist der Anzeigeblock (bei 60 Minuten 17:00-18:00), start die vorgewaehlte Zeit.
    case buchen(courtId: String, platzName: String, tag: String, stunde: Int, startzeiten: [Int], start: Int)
    case verwalten(belegung: TagesBelegung, platzName: String, tag: String)

    var id: String {
        switch self {
        case let .buchen(courtId, _, tag, stunde, _, _): "buchen-\(courtId)-\(tag)-\(stunde)"
        case let .verwalten(b, _, _): "verwalten-\(b.bookingId)"
        }
    }

    var tag: String {
        switch self {
        case let .buchen(_, _, tag, _, _, _), let .verwalten(_, _, tag): tag
        }
    }

    var platzName: String {
        switch self {
        case let .buchen(_, name, _, _, _, _), let .verwalten(_, name, _): name
        }
    }
}

/// Die ausgewaehlte freie Stelle im Raster: Platz, Beginn und wie lange er frei ist.
struct Auswahl: Equatable {
    let courtId: String
    let minute: Int
    let bis: Int
}

/// Wohin nach einer Aktion der Blick soll: eine bestehende Buchung oder Platz und Beginn einer neuen.
enum Markierung: Equatable {
    case buchung(String)
    case stelle(courtId: String, beginn: Date)

    func trifft(_ b: TagesBelegung) -> Bool {
        switch self {
        case let .buchung(id): b.bookingId == id
        case let .stelle(courtId, beginn): b.courtId == courtId && Zeit.datum(b.startsAt) == beginn
        }
    }
}

enum Ansicht: String {
    case uebersicht = "uebersicht"
    case freieZeiten = "freie-zeiten"
}

struct ToastMeldung: Equatable, Identifiable {
    let id = UUID()
    let ok: Bool
    let text: String
}

@MainActor @Observable
final class PlaetzeModell {
    static let ansichtSchluessel = "tcm-plaetze-ansicht"

    let daten: Platzdaten

    var datum = Zeit.berlinDay(Date())
    /// Ohne gemerkte Wahl beginnt es mit Freie Zeiten: dort sind alle Ziele gross (U18).
    var ansicht: Ansicht = Ansicht(rawValue: UserDefaults.standard.string(forKey: ansichtSchluessel) ?? "") ?? .freieZeiten
    var auswahl: Auswahl?
    var tagwahlOffen = false

    var plaetze: [AktiverPlatz] = []
    var belegung: [TagesBelegung] = []
    var arten: [Buchungsart] = []
    var blockungsarten: [Buchungsart] = []
    var verzeichnis: [Mitglied] = []
    var kontingent = Kontingent.leer
    var einstellungen: Buchungseinstellungen?
    var darfPlaetze = false
    var meineId: String?
    var meinName: MeinName?

    var fenster: Fenster?
    var fensterFehler: String?
    var laedt = true
    /// Fuer welchen Tag die Daten gerade stehen.
    var geladenFuer: String?
    var aktualisiert = false
    var laeuft = false
    var meldung: ToastMeldung?
    /// Plan nicht ladbar: steht oben mit "Erneut versuchen" statt als Toast (U3).
    var ladeFehler: String?
    var markiert: Markierung?

    @ObservationIgnored private var letztesNachladen: Date?
    @ObservationIgnored private var nachladenWartet = false

    init(client: SupabaseClient) {
        daten = Platzdaten(client: client)
    }

    // MARK: - Einstellungen

    var oeffnung: Int { Zeit.timeToMinutes(einstellungen?.openingTime ?? "08:00") }
    var schluss: Int { Zeit.timeToMinutes(einstellungen?.closingTime ?? "21:00") }
    var raster: Int { einstellungen?.slotMinutes ?? 30 }
    var anzeige: Int { einstellungen?.displayMinutes ?? 60 }
    var dauer: Int { arten.first?.durationMinutes ?? 60 }
    var vorlauf: Int { einstellungen?.leadDays ?? 7 }
    var gastgebuehr: Int { einstellungen?.guestFeeCents ?? 0 }
    var heute: String { Zeit.berlinDay(Date()) }
    var tage: [String] { PlaetzeLogik.tage(heute: heute, vorlauf: vorlauf) }

    // MARK: - Laden

    /**
     * still: ohne Ladekreis nachladen. Das Nachladen durch Realtime oder durch
     * Herunterziehen darf den Inhalt nicht gegen einen Ladekreis tauschen.
     */
    func laden(_ tag: String? = nil, still: Bool = false) async {
        let tag = tag ?? datum
        if !still { laedt = true }
        let d = daten
        do {
            async let p = d.start.plaetze()
            async let b = d.start.tagesplan(tag)
            async let k = d.kontingent()
            async let e = d.start.buchungseinstellungen()
            async let a = d.start.buchungsarten()
            async let ba = d.blockungsarten()
            async let v = d.verzeichnis()
            async let ich = d.ich()
            let werte = try await (p, b, k, e, a, ba, v, ich)
            // Inzwischen auf einen anderen Tag gewechselt: diese Antwort gilt nicht mehr.
            guard tag == datum else { return }
            (plaetze, belegung, kontingent, einstellungen, arten, blockungsarten, verzeichnis) =
                (werte.0, werte.1, werte.2, werte.3, werte.4, werte.5, werte.6)
            darfPlaetze = werte.7?.platzRechte == true
            meineId = werte.7?.memberId
            meinName = werte.7?.name
            geladenFuer = tag
            ladeFehler = nil
        } catch {
            if tag == datum { ladeFehler = Meldung.aus(error).text }
        }
        if tag == datum { laedt = false }
    }

    /// Herunterziehen laedt nach, ohne den Plan gegen einen Ladekreis zu tauschen.
    func vonHand() async {
        aktualisiert = true
        await laden(still: true)
        aktualisiert = false
    }

    /**
     * Der Plan haelt sich selbst aktuell: Kanal plan-<datum> auf bookings.
     * Eine Serienanlage mit sechzig Terminen loest sechzig Ereignisse in
     * Sekunden aus - hoechstens ein Nachladen pro Sekunde. Endet, wenn die
     * Aufgabe abgebrochen wird (Tageswechsel, Bildschirm weg).
     */
    func beobachte(tag: String) async {
        let client = daten.client
        let kanal = client.channel("plan-\(tag)")
        let aenderungen = kanal.postgresChange(AnyAction.self, schema: "public", table: "bookings")
        do {
            try await kanal.subscribeWithError()
        } catch {
            // Ohne Kanal bleibt das Nachladen von Hand und beim Zurueckkehren.
        }
        for await _ in aenderungen {
            if Task.isCancelled { break }
            auffrischen()
        }
        await client.removeChannel(kanal)
    }

    private func auffrischen() {
        let warten = PlaetzeLogik.drosselWartezeit(jetzt: Date(), letzte: letztesNachladen)
        if warten <= 0 {
            letztesNachladen = Date()
            Task { await laden(still: true) }
            return
        }
        guard !nachladenWartet else { return }
        nachladenWartet = true
        Task {
            try? await Task.sleep(for: .seconds(warten))
            nachladenWartet = false
            letztesNachladen = Date()
            await laden(still: true)
        }
    }

    // MARK: - Tag und Ansicht

    func waehleTag(_ t: String) {
        guard t != datum else { return }
        datum = t
        auswahl = nil
        laedt = true
    }

    func waehleAnsicht(_ a: Ansicht) {
        ansicht = a
        auswahl = nil
        UserDefaults.standard.set(a.rawValue, forKey: Self.ansichtSchluessel)
    }

    // MARK: - Blatt oeffnen

    func platz(_ id: String) -> AktiverPlatz? { plaetze.first { $0.id == id } }

    func oeffnebar(_ b: TagesBelegung) -> Bool { PlaetzeLogik.oeffnebar(b, darfPlaetze: darfPlaetze) }

    func buchenAuf(_ platz: AktiverPlatz, minute: Int) {
        if PlaetzeLogik.kontingentAus(kontingent) {
            meldung = ToastMeldung(ok: false, text: PlaetzeLogik.kontingentAusText)
            return
        }
        let stunde = PlaetzeLogik.stunde(von: minute, oeffnung: oeffnung, anzeige: anzeige)
        fensterFehler = nil
        fenster = .buchen(
            courtId: platz.id, platzName: platz.name ?? "", tag: datum, stunde: stunde,
            startzeiten: PlaetzeLogik.startzeiten(
                tag: datum, courtId: platz.id, stunde: stunde, anzeige: anzeige, raster: raster, dauer: dauer,
                schluss: schluss, belegung: belegung, vorlauf: vorlauf, jetzt: Date()
            ),
            start: minute
        )
    }

    func oeffne(_ b: TagesBelegung) {
        guard oeffnebar(b), let platz = platz(b.courtId) else { return }
        fensterFehler = nil
        fenster = .verwalten(belegung: b, platzName: platz.name ?? "", tag: datum)
    }

    func schliesseFenster() {
        fenster = nil
        fensterFehler = nil
    }

    // MARK: - Aktionen

    private func mitLauf(_ arbeit: () async -> PlatzErgebnis) async -> PlatzErgebnis {
        laeuft = true
        defer { laeuft = false }
        return await arbeit()
    }

    private func ergebnis(_ r: PlatzErgebnis, ziel: Markierung? = nil) async {
        if r.ok {
            meldung = ToastMeldung(ok: true, text: r.meldung)
            markiert = ziel
            fenster = nil
            auswahl = nil
            fensterFehler = nil
            await laden(still: true)
        } else {
            fensterFehler = r.meldung
        }
    }

    /// Der Zeitpunkt wird in Europe/Berlin gebildet, nicht in der Zeitzone des Telefons.
    func buchen(courtId: String, tag: String, start: Int, typ: String, mitglieder: [String], gaeste: [String], sucht: Bool) async {
        let beginn = Zeit.berlinTime(day: tag, minutes: start)
        let r = await mitLauf {
            await daten.bucheplatz(courtId: courtId, beginn: beginn, typ: typ, mitspieler: mitglieder, gaeste: gaeste, sucheMitspieler: sucht)
        }
        await ergebnis(r, ziel: .stelle(courtId: courtId, beginn: beginn))
    }

    func speichern(_ id: String, mitglieder: [String], gaeste: [String]) async {
        await ergebnis(await mitLauf { await daten.aendereMitspieler(bookingId: id, mitglieder: mitglieder, gaeste: gaeste) }, ziel: .buchung(id))
    }

    func stornieren(_ id: String, grund: String) async {
        await ergebnis(await mitLauf { await daten.storniereBuchung(id, grund: grund) })
    }

    func terminAbsagen(_ id: String, grund: String) async {
        await ergebnis(await mitLauf { await daten.sageSerienterminAb(id, grund: grund) })
    }

    func sperreAufheben(_ id: String) async {
        await ergebnis(await mitLauf { await daten.hebeSperreAuf(id) })
    }

    func ausschreiben(_ id: String, gesucht: Bool) async {
        await ergebnis(await mitLauf { await daten.sucheMitspieler(id, gesucht: gesucht) }, ziel: .buchung(id))
    }

    func beitreten(_ id: String) async {
        await ergebnis(await mitLauf { await daten.spieleMit(id) }, ziel: .buchung(id))
    }

    func umsetzen(_ id: String, courtId: String, tag: String, minute: Int, grund: String) async {
        await ergebnis(
            await mitLauf { await daten.setzeUm(bookingId: id, platzId: courtId, tag: tag, minute: minute, grund: grund) },
            ziel: .buchung(id)
        )
    }

    /**
     * Sperren. Liegen Buchungen im Weg, kommt deren Zahl zurueck und das Blatt
     * fragt selbst nach ("1 Buchung verdraengen") - sonst nil.
     */
    func sperren(courtId: String, tag: String, von: Int, bis: Int, typ: String, grund: String, verdraengen: Bool) async -> Int? {
        let beginn = Zeit.berlinTime(day: tag, minutes: von)
        let r = await mitLauf {
            await daten.sperre(
                platzId: courtId, von: beginn, bis: Zeit.berlinTime(day: tag, minutes: bis), typCode: typ,
                grund: grund, verdraengen: verdraengen
            )
        }
        return await kollisionOderErgebnis(r, ziel: .stelle(courtId: courtId, beginn: beginn))
    }

    func sperreAendern(
        _ id: String, platzIds: [String], tag: String, von: Int, bis: Int, typ: String, grund: String, verdraengen: Bool
    ) async -> Int? {
        let r = await mitLauf {
            await daten.aendereSperre(
                bookingId: id, platzIds: platzIds, von: Zeit.berlinTime(day: tag, minutes: von),
                bis: Zeit.berlinTime(day: tag, minutes: bis), typCode: typ, grund: grund, verdraengen: verdraengen
            )
        }
        return await kollisionOderErgebnis(r, ziel: .buchung(id))
    }

    private func kollisionOderErgebnis(_ r: PlatzErgebnis, ziel: Markierung) async -> Int? {
        if let n = r.kollisionen, !r.ok {
            fensterFehler = nil
            return n
        }
        await ergebnis(r, ziel: ziel)
        return nil
    }

    /// Belegung eines anderen Tages, fuer das Umsetzen dorthin.
    func tagesplan(_ tag: String) async throws -> [TagesBelegung] {
        try await daten.start.tagesplan(tag)
    }
}
