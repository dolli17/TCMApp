import XCTest
@testable import TCMuckensturm

final class UmgebungTests: XCTestCase {
    private let vollstaendig: [String: Any] = [
        "TCMSupabaseURL": "https://beispiel.supabase.co",
        "TCMSupabaseKey": "sb_publishable_test",
        "TCMSiteURL": "https://app.beispiel.de/",
        "TCMAppGroup": "group.de.tcmuckensturm.app",
    ]

    func testLiestAlleWerte() throws {
        let u = try Umgebung(info: vollstaendig)
        XCTAssertEqual(u.supabaseURL.absoluteString, "https://beispiel.supabase.co")
        XCTAssertEqual(u.supabaseKey, "sb_publishable_test")
        XCTAssertEqual(u.siteURL?.absoluteString, "https://app.beispiel.de")
        XCTAssertEqual(u.appGroup, "group.de.tcmuckensturm.app")
    }

    func testFehlendeURLWirft() {
        var info = vollstaendig
        info["TCMSupabaseURL"] = "  "
        XCTAssertThrowsError(try Umgebung(info: info)) {
            XCTAssertEqual($0 as? Umgebung.Fehler, .fehlt("TCMSupabaseURL"))
        }
    }

    func testFehlenderSchluesselWirft() {
        var info = vollstaendig
        info.removeValue(forKey: "TCMSupabaseKey")
        XCTAssertThrowsError(try Umgebung(info: info)) {
            XCTAssertEqual($0 as? Umgebung.Fehler, .fehlt("TCMSupabaseKey"))
        }
    }

    func testUngueltigeURLWirft() {
        var info = vollstaendig
        info["TCMSupabaseURL"] = "127.0.0.1:54321"
        XCTAssertThrowsError(try Umgebung(info: info)) {
            XCTAssertEqual($0 as? Umgebung.Fehler, .ungueltig("TCMSupabaseURL"))
        }
    }

    func testOhneSiteGibtEsKeineWebLinks() throws {
        var info = vollstaendig
        info["TCMSiteURL"] = ""
        info["TCMAppGroup"] = ""
        let u = try Umgebung(info: info)
        XCTAssertNil(u.siteURL)
        XCTAssertNil(u.appGroup)
        XCTAssertNil(u.webLink("/antrag"))
    }

    func testWebLinkSetztGenauEinenSchraegstrich() throws {
        let u = try Umgebung(info: vollstaendig)
        XCTAssertEqual(u.webLink("/antrag")?.absoluteString, "https://app.beispiel.de/antrag")
        XCTAssertEqual(u.webLink("impressum#kontakt")?.absoluteString, "https://app.beispiel.de/impressum#kontakt")
    }

    /// Die xcconfig-Werte (http:/$()/…) kommen in der gebauten App als echte Adresse an.
    func testAppBundleHatEineGueltigeUmgebung() throws {
        let u = try Umgebung.ausBundle(Bundle(for: Sitzung.self))
        XCTAssertTrue(["http", "https"].contains(u.supabaseURL.scheme ?? ""))
        XCTAssertNotNil(u.appGroup)
    }
}
