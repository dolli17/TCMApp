import XCTest
@testable import TCMuckensturm

/// Push: Marke als Hex und das Ziel beim Tippen (data aus notification-pushes, Funktion daten).
final class PushTests: XCTestCase {
    func testMarkeAlsHex() {
        XCTAssertEqual(Pushmarke.hex(Data([0x00, 0x0f, 0xa0, 0xff])), "000fa0ff")
        XCTAssertEqual(Pushmarke.hex(Data()), "")
        XCTAssertEqual(Pushmarke.hex(Data(repeating: 0xab, count: 32)).count, 64)
    }

    func testZielAusDemPfad() {
        let id = "8f0c2b1e-4a5d-4c3e-9b7a-1d2e3f4a5b6c"
        XCTAssertEqual(PushZiel.aus(["ziel": "/nachrichten"]), .nachrichten)
        XCTAssertEqual(PushZiel.aus(["ziel": "/verein/veranstaltung/\(id)", "kind": "event_reminder", "event_id": id]),
                       .veranstaltung(id: id))
        XCTAssertEqual(PushZiel.aus(["ziel": "/plaetze?tag=2026-10-30"]), .plaetze(.belegung))
        XCTAssertEqual(PushZiel.aus(["ziel": "/konto"]), .tab(.konto))
        XCTAssertEqual(PushZiel.aus(["ziel": "/"]), .tab(.home))
        XCTAssertEqual(PushZiel.aus(["ziel": "/verein"]), .tab(.verein))
    }

    /// Die alten Adressen der Expo-App und des Webs fuehren auf Meine & offene Spiele.
    func testZielSpiele() {
        XCTAssertEqual(PushZiel.ausPfad("/plaetze"), .plaetze(.belegung))
        XCTAssertEqual(PushZiel.ausPfad("/plaetze/spiele"), .plaetze(.spiele(offeneZuerst: false)))
        XCTAssertEqual(PushZiel.ausPfad("/plaetze/meine"), .plaetze(.spiele(offeneZuerst: false)))
        XCTAssertEqual(PushZiel.ausPfad("/plaetze/offen"), .plaetze(.spiele(offeneZuerst: true)))
        XCTAssertEqual(PushZiel.ausPfad("/plaetze/spiele?zeige=offen"), .plaetze(.spiele(offeneZuerst: true)))
        XCTAssertEqual(PushZiel.ausPfad("/plaetze/spiele?a=1&zeige=offen#x"), .plaetze(.spiele(offeneZuerst: true)))
        XCTAssertEqual(PushZiel.ausPfad("/plaetze/spiele#zeige=offen"), .plaetze(.spiele(offeneZuerst: false)))
        XCTAssertEqual(PushZiel.ausPfad("/plan"), .plaetze(.belegung))
        XCTAssertEqual(PushZiel.ausPfad("/plan/meine"), .plaetze(.spiele(offeneZuerst: false)))
        XCTAssertEqual(PushZiel.ausPfad("/plan/offen"), .plaetze(.spiele(offeneZuerst: true)))
        XCTAssertEqual(PushZiel.ausPfad("/plan/spiele"), .plaetze(.spiele(offeneZuerst: false)))
        // Unbekanntes darunter: wenigstens der Tab
        XCTAssertEqual(PushZiel.ausPfad("/plaetze/gibtsnicht"), .tab(.plaetze))
    }

    /// Ohne brauchbaren Pfad entscheiden event_id, dann kind.
    func testRueckfall() {
        let id = "8f0c2b1e-4a5d-4c3e-9b7a-1d2e3f4a5b6c"
        XCTAssertEqual(PushZiel.aus(["event_id": id]), .veranstaltung(id: id))
        XCTAssertEqual(PushZiel.aus(["ziel": "/gibtsnicht", "event_id": id]), .veranstaltung(id: id))
        XCTAssertEqual(PushZiel.aus(["kind": "booking_cancelled"]), .nachrichten)
        XCTAssertNil(PushZiel.aus([:]))
        XCTAssertNil(PushZiel.aus(["ziel": "/gibtsnicht"]))
    }

    /// Nur Pfade der App selbst (sichererWeiterPfad).
    func testFremdeAdressen() {
        for boese in ["https://boese.example", "//boese.example", "/\\boese.example", "/\t/boese.example", "nachrichten", ""] {
            XCTAssertNil(PushZiel.ausPfad(boese), boese)
        }
        XCTAssertEqual(PushZiel.ausPfad("/verein/veranstaltung/../../x"), .tab(.verein))
        XCTAssertNil(PushZiel.aus(["event_id": "a/b"]))
        XCTAssertNil(PushZiel.aus(["event_id": "<script>"]))
    }

    func testTexteNebenAps() {
        let userInfo: [AnyHashable: Any] = [
            "aps": ["alert": ["title": "T", "body": "B"], "badge": 2],
            "ziel": "/nachrichten",
            "kind": "booking_cancelled",
            "zahl": 3,
        ]
        XCTAssertEqual(PushZiel.texte(userInfo), ["ziel": "/nachrichten", "kind": "booking_cancelled"])
    }

    func testErlaubt() {
        XCTAssertTrue(PushZentrale.erlaubt(.authorized))
        XCTAssertTrue(PushZentrale.erlaubt(.provisional))
        XCTAssertFalse(PushZentrale.erlaubt(.denied))
        XCTAssertFalse(PushZentrale.erlaubt(.notDetermined))
    }
}
