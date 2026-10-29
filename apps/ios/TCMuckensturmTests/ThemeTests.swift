import SwiftUI
import XCTest
@testable import TCMuckensturm

final class ThemeTests: XCTestCase {
    private func rgba(_ farbe: Color, _ stil: UIUserInterfaceStyle) -> [CGFloat] {
        let ui = UIColor(farbe).resolvedColor(with: UITraitCollection(userInterfaceStyle: stil))
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        ui.getRed(&r, green: &g, blue: &b, alpha: &a)
        return [r, g, b, a]
    }

    private func anteile(_ rgba: UInt32) -> [CGFloat] {
        [24, 16, 8, 0].map { CGFloat((rgba >> $0) & 0xFF) / 255 }
    }

    private func assertGleich(_ ist: [CGFloat], _ soll: [CGFloat], _ text: String, line: UInt = #line) {
        for (i, s) in zip(ist, soll) { XCTAssertEqual(i, s, accuracy: 0.002, text, line: line) }
    }

    /// Farbe.* folgt dem Erscheinungsbild: ink ist hell #0A1624, dunkel #F3F7FB (tokens.ts).
    func testFarbeFolgtHellUndDunkel() {
        assertGleich(rgba(Farbe.ink, .light), anteile(0x0A1624FF), "ink hell")
        assertGleich(rgba(Farbe.ink, .dark), anteile(0xF3F7FBFF), "ink dunkel")
        // rgba(255,210,31,.14) im Dunkeln
        assertGleich(rgba(Farbe.goldSoft, .dark), anteile(0xFFD21F24), "goldSoft dunkel")
    }

    /// Die feste Palette gleicht der dynamischen im jeweiligen Erscheinungsbild.
    func testFestePalettenPassenZurDynamischen() {
        assertGleich(rgba(Tokens.Palette.hell.brand, .dark), rgba(Farbe.brand, .light), "brand")
        assertGleich(rgba(Tokens.Palette.dunkel.bg, .light), rgba(Farbe.bg, .dark), "bg")
    }

    func testAbstandUndRadiusAusTokens() {
        XCTAssertEqual(Tokens.Abstand.rand, 20)
        XCTAssertEqual(Tokens.Radius.feld, 16)
        XCTAssertEqual(Tokens.Schrift.seitentitel, 34)
    }

    /// Die Schriften sind im Bundle registriert (UIAppFonts).
    func testBarlowIstGeladen() {
        for name in [Tokens.Schrift.textNormal, Tokens.Schrift.textExtrafett, Tokens.Schrift.displayFett] {
            XCTAssertNotNil(UIFont(name: name, size: 16), name)
        }
    }
}
