import SwiftUI
import UIKit
import XCTest
@testable import TCMuckensturm

/**
 * Bildschirme ohne Geraetebedienung rendern
 *
 * Gegenstueck zu den Roborazzi-Tests in apps/android: die Ansicht kommt in
 * ein eigenes Fenster der Test-App (UIHostingController), hell oder dunkel,
 * in fester Groesse. Geprueft wird, dass sie ohne Absturz rendert, dass das
 * Bild nicht leer ist und dass die wichtigen Texte da sind - gelesen aus dem
 * Accessibility-Baum, den auch VoiceOver sieht. Ohne Bildvergleich: die
 * Schrift- und Kantenglaettung des CI-Simulators ist nicht in der Hand.
 *
 * Die Bilder haengen am Testergebnis; mit TEST_RUNNER_TCM_SCREENSHOTS=<ordner>
 * landen sie zusaetzlich als PNG dort.
 */
@MainActor
final class Buehne {
    /// iPhone 17 in Punkten - fest, damit das Layout nicht vom Simulator der CI abhaengt.
    static let groesse = CGSize(width: 402, height: 874)

    let fenster: UIWindow
    private(set) var dunkel = false

    /**
     * SwiftUI baut den Accessibility-Baum erst, wenn eine Hilfstechnik laeuft.
     * UI-Tests schalten dafuer die Automation ein (libAccessibility); dasselbe
     * hier - nur im Testprozess im Simulator, die App selbst ruft das nie auf.
     */
    private static let accessibilityAn: Bool = {
        guard let bibliothek = dlopen("/usr/lib/libAccessibility.dylib", RTLD_NOW),
              let symbol = dlsym(bibliothek, "_AXSSetAutomationEnabled")
        else { return false }
        typealias Setzen = @convention(c) (Int32) -> Void
        unsafeBitCast(symbol, to: Setzen.self)(1)
        return true
    }()

    init() async throws {
        XCTAssertTrue(Self.accessibilityAn, "Accessibility liess sich nicht einschalten - Texte sind dann nicht auffindbar.")
        var szene: UIWindowScene?
        for _ in 0..<100 {
            szene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
            if szene != nil { break }
            try await Task.sleep(for: .milliseconds(50))
        }
        fenster = UIWindow(windowScene: try XCTUnwrap(szene, "Die Test-App hat keine Szene."))
        fenster.frame = CGRect(origin: .zero, size: Self.groesse)
    }

    /// Setzt die Ansicht ins Fenster. `schrift`: etwa .accessibility2 fuer grosse Schrift.
    func zeige(_ ansicht: some View, dunkel: Bool = false, schrift: DynamicTypeSize? = nil) {
        self.dunkel = dunkel
        let inhalt = ansicht
            .dynamicTypeSize(schrift ?? .large)
            .environment(\.locale, Locale(identifier: "de_DE"))
        let host = UIHostingController(rootView: inhalt)
        fenster.overrideUserInterfaceStyle = dunkel ? .dark : .light
        fenster.rootViewController = host
        fenster.isHidden = false
        fenster.makeKeyAndVisible()
        fenster.layoutIfNeeded()
    }

    /// Fenster leeren; laufende Aufgaben der Ansicht enden damit.
    func raeumeAb() {
        fenster.rootViewController?.presentedViewController?.dismiss(animated: false)
        fenster.rootViewController = nil
        fenster.isHidden = true
    }

    // MARK: - Warten

    /// Laesst die Hauptschleife laufen, bis die Bedingung gilt. false nach Ablauf der Frist.
    @discardableResult
    func warte(hoechstens sekunden: Double = 6, bis bedingung: () -> Bool) async -> Bool {
        let ende = Date().addingTimeInterval(sekunden)
        while true {
            fenster.layoutIfNeeded()
            if bedingung() { return true }
            if Date() > ende { return false }
            try? await Task.sleep(for: .milliseconds(20))
        }
    }

    /// Wartet, bis alle Texte im Baum stehen. Gibt zurueck, was fehlt.
    func warteAuf(_ texte: [String], hoechstens sekunden: Double = 6) async -> [String] {
        var fehlt = texte
        await warte(hoechstens: sekunden) {
            let alles = self.texte().joined(separator: "\n")
            fehlt = texte.filter { !alles.contains($0) }
            return fehlt.isEmpty
        }
        return fehlt
    }

    /// Ein paar Durchlaeufe der Hauptschleife - fuer Zustaende, die sich nicht aendern sollen.
    func atme(_ sekunden: Double = 0.15) async {
        try? await Task.sleep(for: .seconds(sekunden))
        fenster.layoutIfNeeded()
    }

    // MARK: - Accessibility

    /// Ein Knoten des Accessibility-Baums.
    struct Knoten {
        let objekt: NSObject
        let label: String
        let wert: String
        let merkmale: UIAccessibilityTraits
    }

    /// Alle Knoten des Fensters samt Blaettern, die gerade darueber liegen.
    func knoten() -> [Knoten] {
        var ergebnis: [Knoten] = []
        var gesehen = Set<ObjectIdentifier>()
        func sammle(_ objekt: NSObject, tiefe: Int) {
            guard tiefe < 60, gesehen.insert(ObjectIdentifier(objekt)).inserted else { return }
            let label = objekt.accessibilityLabel ?? ""
            let wert = objekt.accessibilityValue ?? ""
            if !label.isEmpty || !wert.isEmpty {
                ergebnis.append(Knoten(objekt: objekt, label: label, wert: wert, merkmale: objekt.accessibilityTraits))
            }
            if let kinder = objekt.accessibilityElements {
                for kind in kinder { if let k = kind as? NSObject { sammle(k, tiefe: tiefe + 1) } }
            } else {
                let anzahl = objekt.accessibilityElementCount()
                if anzahl != NSNotFound, anzahl > 0 {
                    for i in 0..<anzahl { if let k = objekt.accessibilityElement(at: i) as? NSObject { sammle(k, tiefe: tiefe + 1) } }
                }
            }
            if let ansicht = objekt as? UIView {
                for unter in ansicht.subviews { sammle(unter, tiefe: tiefe + 1) }
            }
        }
        var controller = fenster.rootViewController
        while let c = controller {
            if let v = c.viewIfLoaded { sammle(v, tiefe: 0) }
            controller = c.presentedViewController
        }
        return ergebnis
    }

    /// Was VoiceOver vorlesen wuerde: Labels und Werte.
    func texte() -> [String] {
        knoten().flatMap { [$0.label, $0.wert] }.filter { !$0.isEmpty }
    }

    func enthaelt(_ text: String) -> Bool {
        texte().contains { $0.contains(text) }
    }

    /// Loest das Element mit diesem Label aus (wie ein Doppeltipp mit VoiceOver). false, wenn es keins gibt.
    @discardableResult
    func tippe(_ label: String, genau: Bool = true) -> Bool {
        let treffer = knoten().filter { genau ? $0.label == label : $0.label.contains(label) }
        // Das letzte zuerst: liegt ein Blatt darueber, steht sein Knopf hinten.
        for k in treffer.reversed() where k.objekt.accessibilityActivate() { return true }
        return false
    }

    /// Rollt die groesste Liste ans Ende (oder zurueck an den Anfang): eine List legt nur an, was sichtbar ist.
    func rolle(ansEnde: Bool = true) async {
        func rollen(_ v: UIView) -> [UIScrollView] { ((v as? UIScrollView).map { [$0] } ?? []) + v.subviews.flatMap(rollen) }
        guard let liste = rollen(fenster).max(by: { $0.contentSize.height < $1.contentSize.height }) else { return }
        // Mehrmals: beim Rollen legt die Liste neue Zeilen an und waechst.
        for _ in 0..<(ansEnde ? 5 : 1) {
            let y = ansEnde
                ? max(0, liste.contentSize.height - liste.bounds.height + liste.adjustedContentInset.bottom)
                : -liste.adjustedContentInset.top
            liste.setContentOffset(CGPoint(x: 0, y: y), animated: false)
            await atme()
        }
    }

    // MARK: - Bild

    func bild() -> UIImage {
        fenster.layoutIfNeeded()
        let format = UIGraphicsImageRendererFormat()
        format.scale = 2
        return UIGraphicsImageRenderer(bounds: fenster.bounds, format: format).image { _ in
            fenster.drawHierarchy(in: fenster.bounds, afterScreenUpdates: true)
        }
    }
}

/// Grobe Kennzahlen eines Bildes: genug, um "leer" und "hell statt dunkel" zu erkennen.
struct Bildwerte {
    /// Mittlere Helligkeit 0…1
    let helligkeit: Double
    /// Anzahl deutlich verschiedener Farben (auf 4 Bit je Kanal gerundet)
    let farben: Int

    init(_ bild: UIImage) {
        let breite = 100, hoehe = 218
        var pixel = [UInt8](repeating: 0, count: breite * hoehe * 4)
        let kontext = CGContext(
            data: &pixel, width: breite, height: hoehe, bitsPerComponent: 8, bytesPerRow: breite * 4,
            space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        )!
        if let cg = bild.cgImage {
            kontext.interpolationQuality = .none
            kontext.draw(cg, in: CGRect(x: 0, y: 0, width: breite, height: hoehe))
        }
        var summe = 0.0
        var menge = Set<Int>()
        for i in stride(from: 0, to: pixel.count, by: 4) {
            let (r, g, b) = (Int(pixel[i]), Int(pixel[i + 1]), Int(pixel[i + 2]))
            summe += (0.299 * Double(r) + 0.587 * Double(g) + 0.114 * Double(b)) / 255
            menge.insert((r >> 4) << 8 | (g >> 4) << 4 | (b >> 4))
        }
        helligkeit = summe / Double(breite * hoehe)
        farben = menge.count
    }
}

/// Basis der Bildschirmtests: Buehne auf- und abbauen, hell und dunkel pruefen.
@MainActor
class BildschirmTestfall: XCTestCase {
    private(set) var buehne: Buehne!

    override func setUp() async throws {
        try await super.setUp()
        continueAfterFailure = true
        buehne = try await Buehne()
        // Reste frueherer Laeufe: der Reiter im Verein und das Erscheinungsbild sollen nichts faerben.
        UserDefaults.standard.removeObject(forKey: VereinZustand.reiterSchluessel)
        UserDefaults.standard.removeObject(forKey: Erscheinungsbild.schluessel)
        UserDefaults.standard.removeObject(forKey: PushZentrale.markeSchluessel)
    }

    override func tearDown() async throws {
        buehne.raeumeAb()
        buehne = nil
        try await super.tearDown()
    }

    enum Schema: CaseIterable {
        case hell, dunkel
        var name: String { self == .hell ? "hell" : "dunkel" }
    }

    /**
     * Rendert die Ansicht hell und dunkel (oder nur in `schemata`) und prueft:
     * die erwarteten Texte erscheinen, das Bild ist nicht leer, dunkel ist dunkler als hell.
     *
     * - Parameter name: Name des Bildes, etwa "home" -> home-hell.png / home-dunkel.png
     * - Parameter nicht: Texte, die gerade nicht erscheinen duerfen (etwa der eines anderen Zustands)
     * - Parameter danach: laeuft je Schema nach dem Laden, vor dem Bild - etwa um ein Blatt zu oeffnen
     */
    func pruefe(
        _ name: String,
        schemata: [Schema] = Schema.allCases,
        schrift: DynamicTypeSize? = nil,
        erwartet: [String],
        nicht: [String] = [],
        // Grosszuegig: auf dem CI-Rechner brauchen etwa die Wiederholversuche
        // bei Netzfehlern laenger. Bei Erfolg kehrt das Warten sofort zurueck.
        hoechstens: Double = 20,
        danach: ((Buehne) async -> Void)? = nil,
        file: StaticString = #filePath, line: UInt = #line,
        @ViewBuilder ansicht: () -> some View
    ) async {
        var helligkeit: [Schema: Double] = [:]
        for schema in schemata {
            buehne.zeige(ansicht(), dunkel: schema == .dunkel, schrift: schrift)
            let fehlt = await buehne.warteAuf(erwartet, hoechstens: hoechstens)
            XCTAssertTrue(fehlt.isEmpty, "\(name)-\(schema.name): es fehlt \(fehlt) in \(buehne.texte())", file: file, line: line)
            await danach?(buehne)
            let alles = buehne.texte().joined(separator: "\n")
            for text in nicht {
                XCTAssertFalse(alles.contains(text), "\(name)-\(schema.name): „\(text)“ sollte nicht erscheinen", file: file, line: line)
            }
            let bild = buehne.bild()
            XCTAssertEqual(bild.size, Buehne.groesse, file: file, line: line)
            let werte = Bildwerte(bild)
            XCTAssertGreaterThan(werte.farben, 3, "\(name)-\(schema.name): das Bild ist leer", file: file, line: line)
            helligkeit[schema] = werte.helligkeit
            haengeAn(bild, name: "\(name)-\(schema.name)")
            buehne.raeumeAb()
        }
        if let hell = helligkeit[.hell], let dunkel = helligkeit[.dunkel] {
            XCTAssertGreaterThan(hell, dunkel + 0.2, "\(name): dunkel ist nicht dunkler als hell", file: file, line: line)
        }
    }

    func haengeAn(_ bild: UIImage, name: String) {
        guard let png = bild.pngData() else { return }
        let anhang = XCTAttachment(data: png, uniformTypeIdentifier: "public.png")
        anhang.name = name
        add(anhang)
        if let ordner = ProcessInfo.processInfo.environment["TCM_SCREENSHOTS"] {
            try? png.write(to: URL(fileURLWithPath: ordner).appendingPathComponent("\(name).png"))
        }
    }
}
