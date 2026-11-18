/**
 * Die Benachrichtigungen (NachrichtenListe.tsx)
 *
 * Nach Tagen gruppiert (groupNotifications), je Art ein Symbol
 * (notificationSymbol) als Kachel, relative Zeit, ungelesene mit blauem Punkt. Dieselbe
 * Liste steht im Blatt hinter der Glocke und auf dem Bildschirm Neuigkeiten.
 *
 * Nennt eine Nachricht eine Veranstaltung, fuehrt ein Tippen dorthin;
 * Mannschafts-Nachrichten (team_*) fuehren ueber zuMannschaft ins Konto.
 *
 * Gelesen markiert wird beim Oeffnen. Die Hervorhebung bleibt aber stehen,
 * bis "Alle als gelesen" sie wegnimmt - sonst saehe niemand, was neu war.
 */

import SwiftUI

/// SF Symbol je Art der Nachricht
func symbolName(_ symbol: NotificationSymbol) -> String {
    switch symbol {
    case .platz: "tennis.racket"
    case .storno: "xmark.circle.fill"
    case .geld: "eurosign"
    case .person: "person.fill"
    case .glocke: "bell.fill"
    }
}

/// Die Nachrichten als Abschnitte einer gruppierten Liste, je Tag einer - wie die Mitteilungen in Mail.
struct NachrichtenListe: View {
    let liste: [Benachrichtigung]
    let alleGesehen: Bool
    /// Nennt eine Nachricht eine Veranstaltung, fuehrt ein Tippen dorthin.
    var zuVeranstaltung: (String) -> Void

    var body: some View {
        let jetzt = Date()
        if liste.isEmpty {
            // Derselbe Satz wie auf Start und im Web (U76).
            Section {
                VStack(spacing: 8) {
                    Image(systemName: "bell.slash").font(.largeTitle).foregroundStyle(Farbe.muted)
                    Text("Keine Neuigkeiten.").foregroundStyle(Farbe.muted)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 32)
            }
            .listRowBackground(Color.clear)
        } else {
            ForEach(Startseite.groupNotifications(liste, now: jetzt), id: \.label) { gruppe in
                Section {
                    ForEach(gruppe.items) { n in
                        NachrichtZeile(n: n, neu: n.readAt == nil && !alleGesehen, jetzt: jetzt, zuVeranstaltung: zuVeranstaltung)
                    }
                } header: {
                    GruppenKopf(titel: gruppe.label)
                }
            }
        }
    }
}

/// Eine Nachricht: blauer Punkt fuer ungelesen, Symbol-Kachel, Titel und Zeit, darunter der Text.
struct NachrichtZeile: View {
    @Environment(\.zuMannschaft) private var zuMannschaft
    let n: Benachrichtigung
    let neu: Bool
    let jetzt: Date
    var zuVeranstaltung: (String) -> Void

    var body: some View {
        let ziel = Startseite.notificationZiel(eventId: n.eventId)
        // Einladungen, Antworten und Austritte fuehren zur Mannschaft im Konto.
        let mannschaft = ziel == nil && MannschaftLogik.istMannschaftsNachricht(n.kind)
        let symbol = Startseite.notificationSymbol(n.kind ?? "")
        let inhalt = HStack(alignment: .top, spacing: 10) {
            Circle()
                .fill(neu ? Farbe.blue : Color.clear)
                .frame(width: 9, height: 9)
                .padding(.top, 11)
                .accessibilityHidden(true)
            IconKachel(symbol: symbolName(symbol), farbe: farbe(symbol))
                .padding(.top, 2)
            VStack(alignment: .leading, spacing: 3) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(n.title ?? "")
                        .font(.headline.weight(neu ? .semibold : .regular))
                        .foregroundStyle(Farbe.ink)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Text(Startseite.relativeTimeLabel(n.createdAt, now: jetzt))
                        .font(.footnote)
                        .foregroundStyle(Farbe.muted)
                    if ziel != nil || mannschaft { ZeilenPfeil() }
                }
                Text(n.body ?? "")
                    .font(.subheadline)
                    .foregroundStyle(Farbe.ink2)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(HomeLogik.nachrichtLabel(n, neu: neu, jetzt: jetzt))

        Group {
            if let ziel {
                Button { zuVeranstaltung(ziel.eventId) } label: { inhalt }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(.isLink)
                    .accessibilityHint("Öffnet die Veranstaltung")
            } else if mannschaft {
                Button { zuMannschaft() } label: { inhalt }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(.isLink)
                    .accessibilityHint("Öffnet die Mannschaft")
            } else {
                inhalt
            }
        }
        .gruppenZeile()
    }

    /// Je Art eine Farbe wie in Einstellungen: Plaetze blau, Storno rot, Geld gelb, Personen und Allgemeines grau-blau.
    private func farbe(_ s: NotificationSymbol) -> Color {
        switch s {
        case .platz: Farbe.blue
        case .storno: Farbe.red
        case .geld: Farbe.gold
        case .person: Farbe.blueInk
        case .glocke: Farbe.muted
        }
    }
}
