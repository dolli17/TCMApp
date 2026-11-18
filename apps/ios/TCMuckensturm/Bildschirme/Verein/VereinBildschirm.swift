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
        case .arbeitsdienst:
            wechsle(zu: .arbeitsdienst)
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
                case .arbeitsdienst: ArbeitsdienstAnsicht()
                }
            }
            // Grosser Titel in der Leiste, die Glocke daneben - wie auf Home.
            .navigationTitle("Verein")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { Glocke(schlicht: true) }
            }
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
                let ziel: VereinZiel = switch VereinReiter(rawValue: wert) {
                case .getraenke: .getraenke
                case .veranstaltungen: .veranstaltungen
                case .arbeitsdienst: .arbeitsdienst
                case nil: .veranstaltung(wert)
                }
                zustand.oeffne(ziel)
            }
        }
        #endif
    }
}

/// Der Umschalter der drei Reiter, oben in jeder Liste (der Titel steht in der Leiste).
struct VereinKopf: View {
    @Environment(VereinZustand.self) private var zustand

    var body: some View {
        Section {
            Picker("Bereich", selection: Binding(get: { zustand.reiter }, set: { zustand.wechsle(zu: $0) })) {
                ForEach(VereinReiter.allCases, id: \.self) { Text($0.label).tag($0) }
            }
            .pickerStyle(.segmented)
        }
        .listRowInsets(EdgeInsets())
        .listRowBackground(Color.clear)
    }
}

