import XCTest
@testable import TCMuckensturm

final class ThemeTests: XCTestCase {
    func testHexUndRgba() throws {
        let blau = try XCTUnwrap(UIColor.zerlegen("#1466A8"))
        XCTAssertEqual(blau.0, 0x14 / 255, accuracy: 0.001)
        XCTAssertEqual(blau.2, 0xA8 / 255, accuracy: 0.001)
        XCTAssertEqual(blau.3, 1)
        let glas = try XCTUnwrap(UIColor.zerlegen("rgba(255,255,255,.82)"))
        XCTAssertEqual(glas.3, 0.82, accuracy: 0.001)
        XCTAssertNil(UIColor.zerlegen("blau"))
    }

    /// Jede Farbe beider Paletten laesst sich lesen.
    func testAlleTokenFarbenLesbar() {
        for palette in [Tokens.farben.hell, Tokens.farben.dunkel] {
            for kind in Mirror(reflecting: palette).children {
                let wert = kind.value as? String ?? ""
                XCTAssertNotNil(UIColor.zerlegen(wert), "\(kind.label ?? "?") = \(wert)")
            }
        }
    }

    /// Die Schriften sind im Bundle registriert (UIAppFonts).
    func testBarlowIstGeladen() {
        for name in ["Barlow-Regular", "Barlow-ExtraBold", "BarlowSemiCondensed-Bold"] {
            XCTAssertNotNil(UIFont(name: name, size: 16), name)
        }
    }
}
