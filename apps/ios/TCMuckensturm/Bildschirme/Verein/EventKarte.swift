/**
 * Eine Veranstaltung als Karte in der Liste (EventKarte.tsx) und die kleinen Marken dazu
 */

import SwiftUI

/**
 * Eine Veranstaltung als Listenzeile (statt EventKarte.tsx): links das Datum
 * wie das Kalender-Symbol, daneben Titel, Zeit und Ort, darunter Plaetze oder
 * Frist. Rechts der eigene Stand - gelb heisst "deins" - oder bei
 * Arbeitsdiensten die Stunden, die es gibt.
 */
struct EventZeile: View {
    let e: MitgliedEvent
    let jetzt: Date
    let aktion: () -> Void

    var body: some View {
        let vorbei = Veranstaltungen.eventVorbei(e, now: jetzt) || e.status == "cancelled"
        let marke = Veranstaltungen.eventMeineMarke(e, now: jetzt)
        let zeile = Veranstaltungen.eventKartenZeile(e, now: jetzt)
        Button(action: aktion) {
            HStack(spacing: 14) {
                DatumsKachel(startsAt: e.startsAt, leise: vorbei)
                VStack(alignment: .leading, spacing: 2) {
                    Text(e.title ?? "")
                        .font(.headline)
                        .foregroundStyle(vorbei ? Farbe.ink2 : Farbe.ink)
                        .multilineTextAlignment(.leading)
                    Text(Veranstaltungen.eventKartenZeit(e))
                        .font(.subheadline)
                        .foregroundStyle(Farbe.ink2)
                    if !zeile.isEmpty {
                        Text(zeile).font(.footnote).foregroundStyle(Farbe.muted)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if e.meinStatus == "registered", let marke {
                    DeinMarker(marke.text)
                } else if let marke {
                    Text(marke.text).font(.footnote.weight(.semibold)).foregroundStyle(Farbe.muted)
                } else if e.kind == "arbeitsdienst", let h = e.workHours, h > 0, !vorbei {
                    Text("+\(Veranstaltungen.stundenText(h)) h")
                        .font(.footnote.weight(.bold))
                        .monospacedDigit()
                        .foregroundStyle(Farbe.blueInk)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Farbe.blueSoft, in: Capsule())
                }
                ZeilenPfeil()
            }
            .padding(.vertical, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .gruppenZeile()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            "\(e.title ?? ""), \(Veranstaltungen.eventKartenZeit(e))\(marke.map { ", \($0.text)" } ?? "")"
        )
        .accessibilityAddTraits(.isButton)
    }
}

/// Das Datum wie das Kalender-Symbol: oben der Monat auf Blau, darunter gross der Tag.
struct DatumsKachel: View {
    let startsAt: String
    var leise = false

    var body: some View {
        let k = Veranstaltungen.eventDatumKachel(startsAt)
        VStack(spacing: 0) {
            Text(k.monat)
                .font(.caption2.weight(.bold))
                .textCase(.uppercase)
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, minHeight: 16)
                .background(leise ? Farbe.muted : Farbe.blue)
            Text(k.tag)
                .font(.title3.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(leise ? Farbe.muted : Farbe.ink)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .dynamicTypeSize(...DynamicTypeSize.xLarge)
        .frame(width: 46, height: 50)
        .background(Farbe.surf)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Farbe.line2, lineWidth: 1))
        .accessibilityHidden(true)
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
