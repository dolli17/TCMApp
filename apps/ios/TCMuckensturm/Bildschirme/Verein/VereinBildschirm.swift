/**
 * Verein (apps/mobile/app/(tabs)/verein/)
 *
 * Zwei Reiter, Getraenke und Veranstaltungen, unter dem grossen Kopf mit
 * Segment-Schalter; darueber gestapelt eine Veranstaltung im Detail, mit
 * Zurueck-Geste zur Liste. Der Tab oeffnet auf dem zuletzt gewaehlten
 * Reiter (gemerkt unter tcm-verein-reiter), beim ersten Mal auf den Getraenken.
 *
 * Der Getraenkekorb liegt im VereinZustand, nicht im Bildschirm (U17): er
 * uebersteht Reiter- und Tab-Wechsel. Wer mit vollem Korb geht, bekommt eine
 * Erinnerung mit dem Weg zurueck. Bewusst nur im Speicher - HauptTabs haelt
 * den Zustand, mit dem Abmelden ist er weg, und der Naechste auf dem Geraet
 * erbt keinen Korb.
 */

import SwiftUI

@MainActor @Observable
final class VereinZustand {
    static let reiterSchluessel = "tcm-verein-reiter"

    var reiter: VereinReiter = VereinReiter(rawValue: UserDefaults.standard.string(forKey: reiterSchluessel) ?? "") ?? .getraenke {
        didSet { UserDefaults.standard.set(reiter.rawValue, forKey: Self.reiterSchluessel) }
    }

    /// Veranstaltungen im Detail, die oberste zuletzt.
    var pfad: [String] = []
    var korb: Getraenkekorb = [:]
    /// Die zuletzt geladene Karte - fuer die Erinnerung, auch wenn der Bildschirm weg ist.
    var karte: [Getraenk] = []
    /// Text der Rueckfrage "Noch nicht eingetragen", solange sie offen ist.
    var erinnerung: String?
    /// Fuer den Avatar im Kopf; laedt der Reiter, der gerade offen ist.
    var name: MeinName?

    var korbSumme: (stueck: Int, betrag: Int) {
        let s = Getraenke.basketSummary(karte, korb)
        return (s.count, s.totalCents)
    }

    /// Fuehrt ueber zuVerein dorthin (Home, Neuigkeiten, Glocke).
    func oeffne(_ ziel: VereinZiel) {
        switch ziel {
        case .getraenke:
            wechsle(zu: .getraenke)
            pfad = []
        case .veranstaltungen:
            wechsle(zu: .veranstaltungen)
            pfad = []
        case let .veranstaltung(id):
            wechsle(zu: .veranstaltungen)
            pfad = [id]
        }
    }

    /// Reiter wechseln; wer die Getraenke mit vollem Korb verlaesst, wird erinnert.
    func wechsle(zu neu: VereinReiter) {
        if reiter == .getraenke && neu != .getraenke { erinnereAnKorb() }
        reiter = neu
    }

    /// Der Korb bleibt; die Rueckfrage bietet nur den Weg zurueck an.
    func erinnereAnKorb() {
        let s = korbSumme
        guard s.stueck > 0 else { return }
        erinnerung = VereinLogik.erinnerung(stueck: s.stueck, betrag: s.betrag)
    }
}

extension View {
    /**
     * Haengt den Verein an die Tabs (HauptTabs): stellt den Zustand und
     * `zuVerein` bereit und erinnert beim Tab-Wechsel an einen vollen Korb.
     */
    func vereinTab(_ zustand: VereinZustand, tab: Binding<HauptTab>) -> some View {
        modifier(VereinTab(zustand: zustand, tab: tab))
    }
}

private struct VereinTab: ViewModifier {
    let zustand: VereinZustand
    @Binding var tab: HauptTab

    func body(content: Content) -> some View {
        content
            .environment(zustand)
            .environment(\.zuVerein) { ziel in
                zustand.oeffne(ziel)
                tab = .verein
            }
            .onChange(of: tab) { alt, neu in
                if alt == .verein && neu != .verein && zustand.reiter == .getraenke { zustand.erinnereAnKorb() }
            }
            .alert(
                "Noch nicht eingetragen",
                isPresented: Binding(get: { zustand.erinnerung != nil }, set: { if !$0 { zustand.erinnerung = nil } })
            ) {
                Button("Später", role: .cancel) {}
                Button("Zu den Getränken") {
                    zustand.oeffne(.getraenke)
                    tab = .verein
                }
            } message: {
                Text(zustand.erinnerung ?? "")
            }
    }
}

struct VereinBildschirm: View {
    @Environment(VereinZustand.self) private var zustand

    var body: some View {
        @Bindable var z = zustand
        NavigationStack(path: $z.pfad) {
            Group {
                switch zustand.reiter {
                case .getraenke: GetraenkeAnsicht()
                case .veranstaltungen: VeranstaltungenAnsicht()
                }
            }
            .toolbar(.hidden, for: .navigationBar)
            // Beschriftet den Zurueck-Knopf im Detail.
            .navigationTitle(zustand.reiter.label)
            .navigationDestination(for: String.self) { id in
                VeranstaltungBildschirm(id: id)
            }
        }
        #if DEBUG
        // Fuer Bildschirmfotos per simctl (README): `-TCMVerein getraenke|veranstaltungen|<event-id>`.
        .task {
            let argumente = ProcessInfo.processInfo.arguments
            if let i = argumente.firstIndex(of: "-TCMVerein"), i + 1 < argumente.count {
                let wert = argumente[i + 1]
                zustand.oeffne(VereinReiter(rawValue: wert).map { $0 == .getraenke ? .getraenke : .veranstaltungen }
                    ?? .veranstaltung(wert))
            }
        }
        #endif
    }
}

/// Kopf und Segment-Schalter, die jeder Reiter oben in seinen Bildschirm setzt.
struct VereinKopf: View {
    @Environment(VereinZustand.self) private var zustand

    var body: some View {
        GrosserKopf(titel: "Verein", name: zustand.name)
        KontoSegmente(
            beschriftung: "Bereich",
            optionen: VereinReiter.allCases.map { ($0, $0.label) },
            gewaehlt: zustand.reiter
        ) { zustand.wechsle(zu: $0) }
        .padding(.bottom, Tokens.Abstand.xs)
    }
}

/// Runder Plus-/Minus-Knopf mit 44 Punkten (Rundknopf.tsx) - Getraenke und Begleitpersonen.
struct Zaehlknopf: View {
    enum Zeichen { case plus, minus }

    let zeichen: Zeichen
    var gelb = false
    let beschriftung: String
    var aus = false
    let aktion: () -> Void

    var body: some View {
        Button(action: aktion) {
            Image(systemName: zeichen == .plus ? "plus" : "minus")
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(gelb ? Farbe.onGold : Farbe.ink)
                .frame(width: 44, height: 44)
                .background(gelb ? Farbe.gold : Farbe.surf2, in: Circle())
        }
        .buttonStyle(.plain)
        .disabled(aus)
        .opacity(aus ? 0.4 : 1)
        .accessibilityLabel(beschriftung)
    }
}

/// Die Zahl zwischen Minus und Plus.
struct Zaehlerstand: View {
    let wert: Int
    let label: String

    var body: some View {
        Text("\(wert)")
            .font(Schrift.display(.fett, 22))
            .monospacedDigit()
            .foregroundStyle(Farbe.ink)
            .frame(minWidth: 28)
            .accessibilityLabel(label)
    }
}

/// Platzlinien in Perspektive, dezent - auf brand (Monatskarte, Kopf im Detail).
struct Platzlinien: View {
    var body: some View {
        Canvas { ctx, groesse in
            // Wie das SVG der Expo-App: 350 x 150 rechts oben
            let x0 = groesse.width - 350
            var p = Path()
            p.move(to: CGPoint(x: x0 + 200, y: 150)); p.addLine(to: CGPoint(x: x0 + 250, y: 0))
            p.move(to: CGPoint(x: x0 + 350, y: 40)); p.addLine(to: CGPoint(x: x0 + 260, y: 150))
            p.move(to: CGPoint(x: x0 + 230, y: 80)); p.addLine(to: CGPoint(x: x0 + 350, y: 80))
            ctx.stroke(p, with: .color(Farbe.onBrand.opacity(0.12)), lineWidth: 2)
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}
