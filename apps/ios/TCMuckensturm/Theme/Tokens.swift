/**
 * Design-Tokens des TC Muckensturm - VORLAEUFIG, von Hand uebertragen
 *
 * Quelle ist packages/ui/src/tokens.ts; die Werte hier sind eine Abschrift
 * (Stand 29.10.2026). Spur N1 erzeugt spaeter packages/ui/generated/Tokens.swift
 * aus derselben Quelle. Dann diese Datei loeschen und die erzeugte einbinden -
 * die Namen sind dieselben wie in tokens.ts (farben.hell.blue,
 * abstand.rand, radius.feld, schrift.groesse.normal), damit sich ausser dem
 * Import nichts aendert. Bis dahin: Aenderungen in tokens.ts hier nachziehen.
 *
 * Farben stehen als Text wie in tokens.ts ("#1A6FB0", "rgba(...)"); die
 * Umrechnung in Color macht Theme.swift.
 */

import CoreGraphics

struct Farbpalette: Sendable {
    let blue: String
    let blueInk: String
    let blueSoft: String
    let gold: String
    let goldSoft: String
    let goldInk: String
    let goldLine: String
    let onGold: String
    let green: String
    let greenInk: String
    let greenSatt: String
    let red: String
    let redInk: String
    let brand: String
    let onBrand: String
    let bg: String
    let surf: String
    let surf2: String
    let surf3: String
    let ink: String
    let ink2: String
    let muted: String
    let line: String
    let line2: String
    let rahmen: String
    let chip: String
    let glass: String
    let glassLine: String
    let tabAktiv: String
    let tabAktivInk: String
    let navAktiv: String
    let navAktivInk: String
    let segAktiv: String
    let segAktivRand: String
}

enum Tokens {
    struct Farben: Sendable {
        let hell: Farbpalette
        let dunkel: Farbpalette
    }

    struct Abstand: Sendable {
        let xs: CGFloat
        let s: CGFloat
        let m: CGFloat
        let l: CGFloat
        let rand: CGFloat
        let abschnitt: CGFloat
    }

    struct Radius: Sendable {
        let klein: CGFloat
        let feld: CGFloat
        let knopf: CGFloat
        let karte: CGFloat
        let karteGross: CGFloat
        let blatt: CGFloat
        let chip: CGFloat
    }

    struct Schriftgroesse: Sendable {
        let kicker: CGFloat
        let klein: CGFloat
        let normal: CGFloat
        let titel: CGFloat
        let seitentitel: CGFloat
        let hero: CGFloat
    }

    struct Schrift: Sendable {
        let groesse: Schriftgroesse
        let zeilenhoehe: CGFloat
        /// in em
        let laufweiteKicker: CGFloat
        /// in pt, fuer den Seitentitel
        let laufweiteTitel: CGFloat
    }

    static let farben = Farben(
        hell: Farbpalette(
            blue: "#1A6FB0",
            blueInk: "#0F4C81",
            blueSoft: "#E2EFFA",
            gold: "#FFD21F",
            goldSoft: "#FFF6D1",
            goldInk: "#7A5C00",
            goldLine: "#E0B400",
            onGold: "#0A1624",
            green: "#1E9E6A",
            greenInk: "#126C48",
            greenSatt: "#168259",
            red: "#C4433A",
            redInk: "#A8352D",
            brand: "#1466A8",
            onBrand: "#FFFFFF",
            bg: "#F3F5F8",
            surf: "#FFFFFF",
            surf2: "#EEF2F6",
            surf3: "#E2E8EF",
            ink: "#0A1624",
            ink2: "#44566B",
            muted: "#596A7D",
            line: "#E3E8EE",
            line2: "#CBD5E0",
            rahmen: "#76869A",
            chip: "#EEF2F6",
            glass: "rgba(255,255,255,.82)",
            glassLine: "rgba(10,22,36,.08)",
            tabAktiv: "#FFD21F",
            tabAktivInk: "#0A1624",
            navAktiv: "#0A1624",
            navAktivInk: "#FFFFFF",
            segAktiv: "#FFFFFF",
            segAktivRand: "#44566B"
        ),
        dunkel: Farbpalette(
            blue: "#2478BE",
            blueInk: "#8CC6F0",
            blueSoft: "rgba(58,155,224,.18)",
            gold: "#FFD21F",
            goldSoft: "rgba(255,210,31,.14)",
            goldInk: "#FFD21F",
            goldLine: "#FFD21F",
            onGold: "#0A1624",
            green: "#3DD68C",
            greenInk: "#3DD68C",
            greenSatt: "#168259",
            red: "#CF3F35",
            redInk: "#FF6B61",
            brand: "#1466A8",
            onBrand: "#FFFFFF",
            bg: "#07111D",
            surf: "#0E1A29",
            surf2: "#152538",
            surf3: "#1E3249",
            ink: "#F3F7FB",
            ink2: "#B3C2D2",
            muted: "#879AAE",
            line: "rgba(255,255,255,.08)",
            line2: "rgba(255,255,255,.16)",
            rahmen: "#677C93",
            chip: "#152538",
            glass: "rgba(22,36,54,.78)",
            glassLine: "rgba(255,255,255,.12)",
            tabAktiv: "rgba(255,210,31,.14)",
            tabAktivInk: "#FFD21F",
            navAktiv: "rgba(255,210,31,.12)",
            navAktivInk: "#FFD21F",
            segAktiv: "#1E3249",
            segAktivRand: "#B3C2D2"
        )
    )

    /// Standardabstand am Rand ist 20 - daran haengt der Rhythmus des ganzen Designs.
    static let abstand = Abstand(xs: 4, s: 8, m: 12, l: 14, rand: 20, abschnitt: 28)

    static let radius = Radius(klein: 10, feld: 16, knopf: 16, karte: 22, karteGross: 26, blatt: 30, chip: 99)

    static let schrift = Schrift(
        groesse: Schriftgroesse(kicker: 13, klein: 13, normal: 16, titel: 22, seitentitel: 34, hero: 40),
        zeilenhoehe: 1.45,
        laufweiteKicker: 0.14,
        laufweiteTitel: -0.6
    )
}
