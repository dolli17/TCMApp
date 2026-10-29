/**
 * Die Benachrichtigungen (NachrichtenListe.tsx)
 *
 * Nach Tagen gruppiert (groupNotifications), je Art ein Symbol
 * (notificationSymbol), relative Zeit, ungelesene auf goldSoft. Dieselbe
 * Liste steht im Blatt hinter der Glocke und auf dem Bildschirm Neuigkeiten.
 *
 * Gelesen markiert wird beim Oeffnen. Die Hervorhebung bleibt aber stehen,
 * bis "Alle als gelesen" sie wegnimmt - sonst saehe niemand, was neu war.
 */

import SwiftUI

/// SF Symbol je Art der Nachricht
func symbolName(_ symbol: NotificationSymbol) -> String {
    switch symbol {
    case .platz: "square.grid.2x2"
    case .storno: "xmark"
    case .geld: "banknote"
    case .person: "person"
    case .glocke: "bell"
    }
}

/// "Alle als gelesen" - erscheint nur, solange etwas hervorgehoben ist.
struct AlleGelesenKnopf: View {
    let aktion: () -> Void

    var body: some View {
        Button(action: aktion) {
            Text("Alle als gelesen")
                .font(Schrift.text(.fett, 14))
                .foregroundStyle(Farbe.blueInk)
                .frame(minHeight: 44)
        }
        .buttonStyle(.plain)
    }
}

struct NachrichtenListe: View {
    let liste: [Benachrichtigung]
    let alleGesehen: Bool
    /// Nennt eine Nachricht eine Veranstaltung, fuehrt ein Tippen dorthin.
    var zuVeranstaltung: (String) -> Void

    var body: some View {
        let jetzt = Date()
        if liste.isEmpty {
            // Derselbe Satz wie auf Start und im Web (U76).
            Leerzustand(text: "Keine Neuigkeiten.")
        } else {
            VStack(alignment: .leading, spacing: 18) {
                ForEach(Startseite.groupNotifications(liste, now: jetzt), id: \.label) { gruppe in
                    VStack(alignment: .leading, spacing: 8) {
                        Text(gruppe.label).kicker().accessibilityAddTraits(.isHeader)
                        VStack(spacing: 0) {
                            ForEach(Array(gruppe.items.enumerated()), id: \.element.id) { i, n in
                                if i > 0 { Rectangle().fill(Farbe.line).frame(height: 1) }
                                NachrichtZeile(
                                    n: n, neu: n.readAt == nil && !alleGesehen, jetzt: jetzt,
                                    hervorheben: true, zuVeranstaltung: zuVeranstaltung
                                )
                            }
                        }
                        .karte(padding: 0)
                    }
                }
            }
        }
    }
}

/// Eine Nachricht: Symbol, Titel, Zeit, Text, ggf. "Zur Veranstaltung ›".
struct NachrichtZeile: View {
    let n: Benachrichtigung
    let neu: Bool
    let jetzt: Date
    /// Auf der Liste liegt Neues auf goldSoft; auf Home nur das Symbol.
    var hervorheben = true
    var zeilen: Int?
    var zuVeranstaltung: (String) -> Void

    var body: some View {
        let ziel = Startseite.notificationZiel(eventId: n.eventId)
        let inhalt = HStack(alignment: .top, spacing: 12) {
            Image(systemName: symbolName(hervorheben ? Startseite.notificationSymbol(n.kind ?? "") : .glocke))
                .font(.system(size: 17, weight: .medium))
                .foregroundStyle(neu ? Farbe.ink : Farbe.ink2)
                .frame(width: 40, height: 40)
                .background(
                    hervorheben ? (neu ? Farbe.surf : Farbe.surf2) : (neu ? Farbe.goldSoft : Farbe.surf2),
                    in: RoundedRectangle(cornerRadius: 12)
                )
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(n.title ?? "")
                        .font(Schrift.text(.fett, 15))
                        .foregroundStyle(Farbe.ink)
                        .lineLimit(zeilen.map { _ in 2 })
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Text(Startseite.relativeTimeLabel(n.createdAt, now: jetzt))
                        .font(Schrift.text(.normal, Tokens.Schrift.klein))
                        .foregroundStyle(Farbe.muted)
                }
                Text(n.body ?? "")
                    .font(Schrift.text(.normal, 13.5))
                    .foregroundStyle(Farbe.ink2)
                    .lineSpacing(2)
                    .lineLimit(zeilen)
                    .fixedSize(horizontal: false, vertical: true)
                if ziel != nil {
                    Text("Zur Veranstaltung ›")
                        .font(Schrift.text(.halbfett, 13.5))
                        .foregroundStyle(Farbe.blueInk)
                        .padding(.top, 2)
                }
            }
        }
        .padding(.vertical, 14)
        .padding(.horizontal, 16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(hervorheben && neu ? Farbe.goldSoft : Color.clear)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(HomeLogik.nachrichtLabel(n, neu: neu, jetzt: jetzt))

        if let ziel {
            Button { zuVeranstaltung(ziel.eventId) } label: { inhalt }
                .buttonStyle(.plain)
                .accessibilityAddTraits(.isLink)
                .accessibilityHint("Öffnet die Veranstaltung")
        } else {
            inhalt
        }
    }
}
