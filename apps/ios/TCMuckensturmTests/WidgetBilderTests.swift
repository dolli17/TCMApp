import SwiftUI
import WidgetKit
import XCTest
@testable import TCMuckensturm

/**
 * Bilder der Widgets mit ImageRenderer - Home-Screen-Widgets lassen sich im
 * Simulator nicht ohne Klicks platzieren. Mit den Beispieldaten
 * (WidgetSchnappschuss.beispiel) um 14:00. Ziel: TCM_SCREENSHOTS (beim Aufruf
 * als TEST_RUNNER_TCM_SCREENSHOTS setzen), sonst nur als Anhang im Testergebnis.
 */
@MainActor
final class WidgetBilderTests: XCTestCase {
    private let jetzt = Zeit.datum("2026-09-28T12:00:00Z")!

    func testWidgetsHell() throws {
        try bild(.light, name: "widgets-hell")
    }

    func testWidgetsDunkel() throws {
        try bild(.dark, name: "widgets-dunkel")
    }

    private func bild(_ schema: ColorScheme, name: String) throws {
        let daten = WidgetZustand.daten(.beispiel(jetzt: jetzt))
        let tafel = VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 22) {
                rahmen(.systemSmall) { SpieleWidgetAnsicht(zustand: daten, jetzt: jetzt, familie: .systemSmall) }
                rahmen(.systemSmall) { VeranstaltungWidgetAnsicht(zustand: daten, jetzt: jetzt, familie: .systemSmall) }
            }
            rahmen(.systemMedium) { SpieleWidgetAnsicht(zustand: daten, jetzt: jetzt, familie: .systemMedium) }
            rahmen(.systemMedium) { PlaetzeWidgetAnsicht(zustand: daten, jetzt: jetzt, familie: .systemMedium) }
            rahmen(.systemLarge) { PlaetzeWidgetAnsicht(zustand: daten, jetzt: jetzt, familie: .systemLarge) }
            HStack(alignment: .top, spacing: 22) {
                rahmen(.systemSmall) { SpieleWidgetAnsicht(zustand: .abgemeldet, jetzt: jetzt, familie: .systemSmall) }
                VStack(alignment: .leading, spacing: 14) {
                    sperrbildschirm(breite: 172, hoehe: 76) {
                        SpieleWidgetAnsicht(zustand: daten, jetzt: jetzt, familie: .accessoryRectangular)
                    }
                    sperrbildschirm(breite: 172, hoehe: 22) {
                        SpieleWidgetAnsicht(zustand: daten, jetzt: jetzt, familie: .accessoryInline)
                            .font(.system(size: 13, weight: .semibold))
                    }
                }
            }
        }
        .padding(24)
        .background(schema == .dark ? Color(white: 0.08) : Color(red: 0.80, green: 0.86, blue: 0.93))
        .environment(\.colorScheme, schema)
        .environment(\.widgetVorschau, true)

        let renderer = ImageRenderer(content: tafel)
        renderer.scale = 2
        let png = try XCTUnwrap(renderer.uiImage?.pngData())
        let anhang = XCTAttachment(data: png, uniformTypeIdentifier: "public.png")
        anhang.name = name
        anhang.lifetime = .keepAlways
        add(anhang)
        if let ordner = ProcessInfo.processInfo.environment["TCM_SCREENSHOTS"] {
            try png.write(to: URL(fileURLWithPath: ordner).appendingPathComponent("\(name).png"))
        }
    }

    /// Groessen wie auf einem iPhone mit 402 pt Breite (iPhone 17).
    private func rahmen(_ familie: WidgetFamily, @ViewBuilder _ inhalt: () -> some View) -> some View {
        let groesse: CGSize = switch familie {
        case .systemSmall: CGSize(width: 170, height: 170)
        case .systemMedium: CGSize(width: 364, height: 170)
        default: CGSize(width: 364, height: 382)
        }
        return inhalt()
            .frame(width: groesse.width, height: groesse.height)
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    /// Sperrbildschirm: einfarbig hell auf dunklem Grund, wie das System es zeigt.
    private func sperrbildschirm(breite: CGFloat, hoehe: CGFloat, @ViewBuilder _ inhalt: () -> some View) -> some View {
        inhalt()
            .foregroundStyle(.white)
            .frame(width: breite, height: hoehe, alignment: .leading)
            .padding(8)
            .background(Color.black.opacity(0.55), in: RoundedRectangle(cornerRadius: 12))
            .environment(\.colorScheme, .dark)
    }
}
