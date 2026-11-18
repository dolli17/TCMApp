import Foundation
import Supabase
import XCTest
@testable import TCMuckensturm

/**
 * Supabase ohne Netz
 *
 * Ein `URLProtocol` faengt jede Anfrage des Clients ab und antwortet aus dem
 * Drehbuch der `Attrappe`: je RPC eine Antwort, als Vorgabe die Datei
 * `Antworten/<rpc>.json`. Die Dateien sind Aufzeichnungen vom lokalen Stack
 * (scripts/aufzeichnen.sh, bereinigt mit scripts/beispiele.py). Jede Anfrage
 * wird mitgeschrieben, damit Tests Namen und Parameter der RPCs pruefen.
 *
 * Die Adresse zeigt auf einen geschlossenen Port des eigenen Rechners: was am
 * Protokoll vorbeigeht (der Realtime-Kanal), scheitert sofort und lokal.
 */
final class Attrappe: @unchecked Sendable {
    struct Anfrage: Sendable {
        let methode: String
        let pfad: String
        let abfrage: String
        let koerper: Data
        let kopf: [String: String]

        /// Name der RPC, sonst nil (Auth).
        var rpc: String? {
            guard let r = pfad.range(of: "/rest/v1/rpc/") else { return nil }
            return String(pfad[r.upperBound...])
        }

        /// Der Koerper als JSON-Objekt; leer, wenn keiner da ist.
        var werte: [String: Any] {
            (try? JSONSerialization.jsonObject(with: koerper)) as? [String: Any] ?? [:]
        }

        func text(_ schluessel: String) -> String? { werte[schluessel] as? String }
    }

    enum Antwort: Sendable {
        case json(String, status: Int = 200)
        /// Kein Netz o. Ae.: die Anfrage scheitert mit diesem URLError.
        case netzfehler(URLError.Code)
        /// Antwortet nie - fuer den Zustand "laedt".
        case haengt

        /// Ein Fehler, wie PostgREST ihn schickt (Aufzeichnung: P0002 kommt mit 500, PGRST301 mit 401).
        static func fehler(_ code: String, _ message: String, details: String? = nil, status: Int = 400) -> Antwort {
            let objekt: [String: Any] = ["code": code, "message": message, "details": details ?? NSNull(), "hint": NSNull()]
            let daten = try! JSONSerialization.data(withJSONObject: objekt)
            return .json(String(decoding: daten, as: UTF8.self), status: status)
        }

        /**
         * Ein Fehler, wie Auth (GoTrue) ihn einem Client schickt, der wie supabase-swift
         * `X-Supabase-Api-Version: 2024-01-01` mitsendet: der Code als Text in `code`.
         * (Die Aufzeichnungen per curl ohne diese Kopfzeile zeigen die alte Form mit `error_code`.)
         */
        static func authFehler(_ code: String, _ message: String, status: Int = 400) -> Antwort {
            let daten = try! JSONSerialization.data(withJSONObject: ["code": code, "message": message])
            return .json(String(decoding: daten, as: UTF8.self), status: status)
        }

        static let leer = Antwort.json("", status: 204)
        static let abgelaufen = Antwort.fehler("PGRST301", "JWT expired", status: 401)
    }

    let id = UUID().uuidString
    private let schloss = NSLock()
    private var drehbuch: [String: @Sendable (Anfrage) -> Antwort] = [:]
    private var fuerAlle: (@Sendable (Anfrage) -> Antwort?)?
    private var gesehen: [Anfrage] = []

    init() {
        Self.register(self)
    }

    // MARK: - Drehbuch

    /// Die Antwort einer RPC festlegen.
    func setze(_ rpc: String, _ antwort: Antwort) {
        setze(rpc) { _ in antwort }
    }

    func setze(_ rpc: String, _ antwort: @escaping @Sendable (Anfrage) -> Antwort) {
        schloss.withLock { drehbuch[rpc] = antwort }
    }

    func setze(_ rpc: String, json: String) {
        setze(rpc, .json(json))
    }

    /// Geht jeder anderen Regel vor; nil laesst die Anfrage zum Drehbuch durch.
    func setzeFuerAlle(_ antwort: (@Sendable (Anfrage) -> Antwort?)?) {
        schloss.withLock { fuerAlle = antwort }
    }

    /// Alles scheitert wie ohne Netz.
    func netzAus() {
        setzeFuerAlle { _ in .netzfehler(.notConnectedToInternet) }
    }

    /// Nichts antwortet - die Bildschirme bleiben beim Laden.
    func allesHaengt() {
        setzeFuerAlle { _ in .haengt }
    }

    /// Jede RPC scheitert mit einem Satz der Datenbank; Auth bleibt unberuehrt.
    func alleRpcsScheitern(_ satz: String = "Der Server ist gerade nicht erreichbar.") {
        setzeFuerAlle { $0.rpc == nil ? nil : .fehler("P0001", satz) }
    }

    // MARK: - Mitschrift

    var anfragen: [Anfrage] { schloss.withLock { gesehen } }

    /// Die Aufrufe einer RPC in der Reihenfolge, in der sie kamen.
    func aufrufe(_ rpc: String) -> [Anfrage] { anfragen.filter { $0.rpc == rpc } }

    /// Die Parameter des letzten Aufrufs.
    func letzte(_ rpc: String) -> [String: Any]? { aufrufe(rpc).last?.werte }

    var rpcs: [String] { anfragen.compactMap(\.rpc) }

    // MARK: - Antworten

    fileprivate func antwort(auf a: Anfrage) -> Antwort {
        let (alle, regel): ((@Sendable (Anfrage) -> Antwort?)?, (@Sendable (Anfrage) -> Antwort)?) = schloss.withLock {
            gesehen.append(a)
            return (fuerAlle, a.rpc.flatMap { drehbuch[$0] } ?? drehbuch[a.pfad])
        }
        if let antwort = alle?(a) { return antwort }
        if let regel { return regel(a) }
        return Self.vorgabe(a)
    }

    /// Ohne Drehbuch: die aufgezeichnete Antwort, bei schreibenden RPCs 204 ohne Inhalt.
    private static func vorgabe(_ a: Anfrage) -> Antwort {
        if let rpc = a.rpc {
            var name = rpc
            if rpc == "booking_types_aktiv", a.text("p_applies_to") == "blocking" { name += "-blocking" }
            // events_fuer_mitglied?id=eq.<id>: nur die eine Zeile
            if rpc == "events_fuer_mitglied", let r = a.abfrage.range(of: "id=eq.") {
                let id = String(a.abfrage[r.upperBound...].prefix { $0 != "&" })
                return .json(Beispiel.gefiltert("events_fuer_mitglied") { ($0["id"] as? String) == id })
            }
            // day_schedule: die Belegung des Aufnahmetags gilt fuer jeden gefragten Tag.
            if rpc == "day_schedule", let tag = a.text("p_date"), let text = Beispiel.text(name) {
                return .json(text.replacingOccurrences(of: Beispiel.tag(0), with: tag))
            }
            if let text = Beispiel.text(name) { return .json(text) }
            return .leer
        }
        switch a.pfad {
        case let p where p.hasSuffix("/auth/v1/token"), let p where p.hasSuffix("/auth/v1/verify"):
            return .json(Beispiel.text("auth-token")!)
        case let p where p.hasSuffix("/auth/v1/user"):
            return .json(Beispiel.nutzer)
        case let p where p.hasSuffix("/auth/v1/recover"):
            return .json("{}")
        default:
            return .leer
        }
    }

    // MARK: - Client

    static let kopfzeile = "X-TCM-Attrappe"
    static let speicherSchluessel = "tcm-test-sitzung"

    enum Anmeldung {
        case keine
        case gueltig
        /// Das Zugriffstoken ist abgelaufen; der Client muss es erst erneuern.
        case abgelaufen
    }

    let speicher = Sitzungsspeicher()

    func client(_ anmeldung: Anmeldung = .gueltig) -> SupabaseClient {
        let konfiguration = URLSessionConfiguration.ephemeral
        konfiguration.protocolClasses = [AttrappenProtokoll.self]
        if anmeldung != .keine {
            speicher.lege(Beispiel.sitzung(abgelaufen: anmeldung == .abgelaufen), unter: Self.speicherSchluessel)
        }
        return SupabaseClient(
            supabaseURL: URL(string: "http://127.0.0.1:9")!,
            supabaseKey: "attrappe",
            options: SupabaseClientOptions(
                auth: .init(
                    storage: speicher,
                    storageKey: Self.speicherSchluessel,
                    flowType: .implicit,
                    autoRefreshToken: false,
                    emitLocalSessionAsInitialSession: true
                ),
                global: .init(headers: [Self.kopfzeile: id], session: URLSession(configuration: konfiguration))
            )
        )
    }

    /// Wie die App sie baut, nur mit dem Client der Attrappe. Mit Webadresse, damit Links erscheinen.
    static let umgebung = try! Umgebung(info: [
        Umgebung.schluesselURL: "http://127.0.0.1:9",
        Umgebung.schluesselKey: "attrappe",
        Umgebung.schluesselSite: "https://app.example.invalid",
        Umgebung.schluesselURLSchema: "tcmtest",
    ])

    @MainActor
    func sitzung(_ anmeldung: Anmeldung = .gueltig) -> Sitzung {
        Sitzung(umgebung: Self.umgebung, client: client(anmeldung))
    }

    // MARK: - Verzeichnis

    private static let verzeichnisSchloss = NSLock()
    nonisolated(unsafe) private static var verzeichnis: [String: Attrappe] = [:]

    private static func register(_ a: Attrappe) {
        verzeichnisSchloss.withLock { verzeichnis[a.id] = a }
    }

    fileprivate static func finde(_ id: String?) -> Attrappe? {
        guard let id else { return nil }
        return verzeichnisSchloss.withLock { verzeichnis[id] }
    }
}

/// Haelt die Sitzung im Speicher statt im Schluesselbund.
final class Sitzungsspeicher: AuthLocalStorage, @unchecked Sendable {
    private let schloss = NSLock()
    private var werte: [String: Data] = [:]

    func store(key: String, value: Data) throws { schloss.withLock { werte[key] = value } }
    func retrieve(key: String) throws -> Data? { schloss.withLock { werte[key] } }
    func remove(key: String) throws { schloss.withLock { werte[key] = nil } }

    func lege(_ sitzung: Session, unter schluessel: String) {
        // Der Client liest mit einem schlichten JSONDecoder (SessionStorage in supabase-swift).
        try? store(key: schluessel, value: try! JSONEncoder().encode(sitzung))
    }

    var istLeer: Bool { schloss.withLock { werte.isEmpty } }
}

final class AttrappenProtokoll: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let url = request.url!
        let teile = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let anfrage = Attrappe.Anfrage(
            methode: request.httpMethod ?? "GET",
            pfad: teile?.path ?? url.path,
            abfrage: teile?.percentEncodedQuery?.removingPercentEncoding ?? "",
            koerper: Self.koerper(request),
            kopf: request.allHTTPHeaderFields ?? [:]
        )
        guard let attrappe = Attrappe.finde(request.value(forHTTPHeaderField: Attrappe.kopfzeile)) else {
            client?.urlProtocol(self, didFailWithError: URLError(.unsupportedURL))
            return
        }
        switch attrappe.antwort(auf: anfrage) {
        case .haengt:
            break
        case let .netzfehler(code):
            client?.urlProtocol(self, didFailWithError: URLError(code))
        case let .json(text, status):
            let antwort = HTTPURLResponse(
                url: url, statusCode: status, httpVersion: "HTTP/1.1",
                headerFields: anfrage.pfad.hasPrefix("/auth/")
                    ? ["Content-Type": "application/json", "X-Supabase-Api-Version": "2024-01-01"]
                    : ["Content-Type": "application/json; charset=utf-8"]
            )!
            client?.urlProtocol(self, didReceive: antwort, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: Data(text.utf8))
            client?.urlProtocolDidFinishLoading(self)
        }
    }

    override func stopLoading() {}

    /// URLSession reicht den Koerper als Strom durch; `httpBody` ist hier meist leer.
    private static func koerper(_ request: URLRequest) -> Data {
        if let daten = request.httpBody { return daten }
        guard let strom = request.httpBodyStream else { return Data() }
        strom.open()
        defer { strom.close() }
        var daten = Data()
        var puffer = [UInt8](repeating: 0, count: 4096)
        while strom.hasBytesAvailable {
            let n = strom.read(&puffer, maxLength: puffer.count)
            if n <= 0 { break }
            daten.append(puffer, count: n)
        }
        return daten
    }
}

// MARK: - Beispielantworten

/// Die aufgezeichneten Antworten aus `Antworten/`.
enum Beispiel {
    /// Tag der Aufzeichnung. Fuer die Bildschirme wandern alle Daten mit, so dass er "heute" ist.
    static let aufnahmetag = "2026-11-17"

    private final class Anker {}

    /// Unveraendert, wie aufgezeichnet - fuer die Tests der Dekodierung.
    static func roh(_ name: String) -> String? {
        guard let url = Bundle(for: Anker.self).url(forResource: name, withExtension: "json") else { return nil }
        return try? String(contentsOf: url, encoding: .utf8)
    }

    static func daten(_ name: String) throws -> Data {
        Data(try XCTUnwrap(roh(name), "Antworten/\(name).json fehlt").utf8)
    }

    /// Mit verschobenen Daten: was am Aufnahmetag "morgen" war, ist es auch heute.
    static func text(_ name: String) -> String? {
        roh(name).map(verschoben)
    }

    /// Eine Liste auf die Zeilen kuerzen, die passen (und dabei die Daten verschieben).
    static func gefiltert(_ name: String, _ passt: ([String: Any]) -> Bool) -> String {
        veraendert(name) { zeilen in zeilen.filter(passt) }
    }

    /// Die Zeilen einer Liste aendern - etwa ein Feld setzen.
    static func veraendert(_ name: String, _ aendern: ([[String: Any]]) -> [[String: Any]]) -> String {
        let zeilen = (try? JSONSerialization.jsonObject(with: Data((text(name) ?? "[]").utf8))) as? [[String: Any]] ?? []
        return String(decoding: try! JSONSerialization.data(withJSONObject: aendern(zeilen)), as: UTF8.self)
    }

    /// Ein Objekt aendern (my_onboarding, meine_mannschaft).
    static func objekt(_ name: String, _ aendern: (inout [String: Any]) -> Void) -> String {
        var o = (try? JSONSerialization.jsonObject(with: Data((text(name) ?? "{}").utf8))) as? [String: Any] ?? [:]
        aendern(&o)
        return String(decoding: try! JSONSerialization.data(withJSONObject: o), as: UTF8.self)
    }

    /// Tage zwischen Aufnahme und heute (Europe/Berlin).
    static var verschiebung: Int {
        let von = tagesformat.date(from: aufnahmetag)!
        let bis = tagesformat.date(from: Zeit.berlinDay(Date()))!
        return Int((bis.timeIntervalSince(von) / 86400).rounded())
    }

    private static let tagesformat: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static func plus(_ tag: String, _ tage: Int) -> String {
        guard let d = tagesformat.date(from: tag) else { return tag }
        return tagesformat.string(from: d.addingTimeInterval(Double(tage) * 86400))
    }

    /**
     * Jedes Datum JJJJ-MM-TT im Text um `tage` verschieben; Uhrzeiten (UTC) bleiben.
     * Auch in Zeitstempeln ("2026-11-17T09:00:00") - zwischen Tag und "T" liegt keine
     * Wortgrenze, deshalb ohne \b. Nur Daten nahe am Aufnahmetag wandern mit;
     * Geburtstage und Eintrittsjahre bleiben, wie sie aufgezeichnet sind.
     */
    static func verschoben(_ text: String) -> String {
        let tage = verschiebung
        guard tage != 0 else { return text }
        let muster = try! NSRegularExpression(pattern: #"(?<!\d)\d{4}-\d{2}-\d{2}(?!\d)"#)
        let aufnahme = tagesformat.date(from: aufnahmetag)!
        let ns = text as NSString
        var ergebnis = ""
        var ende = 0
        for treffer in muster.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
            let datum = ns.substring(with: treffer.range)
            ergebnis += ns.substring(with: NSRange(location: ende, length: treffer.range.location - ende))
            let nah = tagesformat.date(from: datum).map { abs($0.timeIntervalSince(aufnahme)) <= 366 * 86400 } ?? false
            ergebnis += nah ? plus(datum, tage) : datum
            ende = treffer.range.location + treffer.range.length
        }
        return ergebnis + ns.substring(from: ende)
    }

    /// Ein Tag relativ zu heute, "JJJJ-MM-TT".
    static func tag(_ plus: Int) -> String {
        Self.plus(Zeit.berlinDay(Date()), plus)
    }

    // MARK: Auth

    static func sitzung(abgelaufen: Bool = false) -> Session {
        var s = try! AuthClient.Configuration.jsonDecoder.decode(Session.self, from: Data(roh("auth-token")!.utf8))
        if abgelaufen {
            s.expiresAt = Date().addingTimeInterval(-3600).timeIntervalSince1970
            s.expiresIn = 0
        }
        return s
    }

    /// Der Nutzer aus der Token-Antwort, wie /auth/v1/user ihn liefert.
    static var nutzer: String {
        let o = try! JSONSerialization.jsonObject(with: Data(roh("auth-token")!.utf8)) as! [String: Any]
        return String(decoding: try! JSONSerialization.data(withJSONObject: o["user"]!), as: UTF8.self)
    }
}
