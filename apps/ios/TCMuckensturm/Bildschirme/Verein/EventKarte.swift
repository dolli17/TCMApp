/**
 * Eine Veranstaltung als Karte in der Liste (EventKarte.tsx) und die kleinen Marken dazu
 */

import SwiftUI

/// Eine Veranstaltung als Karte (EventKarte.tsx)
struct EventKarte: View {
    let e: MitgliedEvent
    let jetzt: Date
    var aufforderung = false
    let aktion: () -> Void

    var body: some View {
        let k = Veranstaltungen.eventDatumKachel(e.startsAt)
        let vorbei = Veranstaltungen.eventVorbei(e, now: jetzt) || e.status == "cancelled"
        let marke = Veranstaltungen.eventMeineMarke(e, now: jetzt, aufforderung: aufforderung)
        let art = e.kind ?? ""
        Button(action: aktion) {
            HStack(alignment: .center, spacing: 16) {
                VStack(spacing: 0) {
                    Text(k.tag).font(Schrift.display(.fett, 22)).foregroundStyle(vorbei ? Farbe.muted : Farbe.ink)
                    Text(k.monat).font(Schrift.display(.fett, Tokens.Schrift.kicker)).tracking(0.6).textCase(.uppercase)
                        .foregroundStyle(Farbe.muted)
                }
                .dynamicTypeSize(...DynamicTypeSize.xLarge)
                .frame(width: 56, height: 58)
                .background(Farbe.surf2, in: RoundedRectangle(cornerRadius: 18))
                .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(Farbe.line, lineWidth: 1))
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        MarkeKlein(text: Veranstaltungen.kindLabel[art] ?? art, ton: Veranstaltungen.kindTon[art] ?? .grau)
                        Spacer(minLength: 0)
                        if let marke {
                            // Gelb heisst "deins": die eigene Anmeldung.
                            if e.meinStatus == "registered" { DeinMarker(marke.text) } else { MarkeKlein(text: marke.text, ton: marke.ton) }
                        }
                    }
                    Text(e.title ?? "")
                        .font(Schrift.display(.fett, 19, relativeTo: .title3))
                        .foregroundStyle(vorbei ? Farbe.ink2 : Farbe.ink)
                        .multilineTextAlignment(.leading)
                        .padding(.top, 2)
                    Text(Veranstaltungen.eventKartenZeit(e)).font(Schrift.text(.normal, 15)).foregroundStyle(Farbe.ink2)
                    HStack(alignment: .center, spacing: 8) {
                        Text(Veranstaltungen.eventKartenZeile(e, now: jetzt))
                            .font(Schrift.text(.normal, 13.5))
                            .foregroundStyle(Farbe.muted)
                            .multilineTextAlignment(.leading)
                        Spacer(minLength: 0)
                        // Wer noch nicht angemeldet ist, sieht den Weg dorthin; die Karte selbst oeffnet die Veranstaltung.
                        if e.meinStatus == nil && Veranstaltungen.eventAnmeldbar(e, now: jetzt) {
                            KnopfFlaeche(stufe: .zweit, groesse: .klein) { Text("Anmelden") }
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .karte(radius: Tokens.Radius.karte, padding: 18)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(e.title ?? ""), \(Veranstaltungen.eventKartenZeit(e))\(marke.map { ", \($0.text)" } ?? "")")
        .accessibilityAddTraits(.isButton)
    }
}

/// .marke-klein: Status und Art sind grau oder hellblau. Gelb gibt es hier nicht - Gelb heisst
/// "deins" und steht im DeinMarker (docs/design/stitch).
struct MarkeKlein: View {
    let text: String
    let ton: EventTon

    var body: some View {
        let (grund, tinte): (Color, Color) = switch ton {
        case .blau: (Farbe.blueSoft, Farbe.blueInk)
        case .gelb: (Farbe.chip, Farbe.ink2)
        case .gruen: (Farbe.green.opacity(0.16), Farbe.greenInk)
        case .grau: (Farbe.chip, Farbe.ink2)
        case .rot: (Farbe.red.opacity(0.14), Farbe.redInk)
        }
        Text(text)
            .font(Schrift.text(.halbfett, Tokens.Schrift.klein))
            .foregroundStyle(tinte)
            .padding(.vertical, 3)
            .padding(.horizontal, 8)
            .background(grund, in: Capsule())
    }
}
