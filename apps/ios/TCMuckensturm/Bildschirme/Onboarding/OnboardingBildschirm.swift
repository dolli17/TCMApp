/**
 * Onboarding nach dem ersten Login (apps/mobile/app/onboarding.tsx)
 *
 * Derselbe Assistent wie im Web und in der Expo-App: Reihenfolge, Titel und
 * welche Schritte Pflicht sind, kommen aus Kern/Onboarding.swift
 * (onboardingSchritte), was erledigt ist, aus my_onboarding(). Gespeichert
 * wird je Schritt ueber die Onboarding-RPCs (Daten/Onboardingdaten.swift);
 * die Datenbank prueft alles noch einmal selbst.
 *
 * Mit dem SEPA-Mandat ruft der Assistent complete_onboarding() - dann ist
 * das Konto freigeschaltet. Einwilligungen, Tennis und App-Einstellungen
 * folgen danach, lassen sich ueberspringen und bleiben im Konto erreichbar.
 *
 * Erreichbar bleiben waehrenddessen nur Abmelden, Datenschutz und Impressum
 * und die Rechtstexte selbst - alles uebrige sperren Weiche und Datenbank.
 */

import SwiftUI

struct OnboardingBildschirm: View {
    @Environment(Sitzung.self) private var sitzung

    private enum Laden: Equatable {
        case laeuft
        case fehler(String)
        case da(OnboardingZustand)
    }

    @State private var laden = Laden.laeuft
    @State private var schritt: OnboardingSchrittKey?
    /// In dieser Sitzung freigeschaltet: die freiwilligen Schritte folgen noch,
    /// obwohl abgeschlossen_am schon gesetzt ist.
    @State private var freigeschaltet = false
    @State private var hinweis: Ergebnis?

    private var daten: Onboardingdaten { Onboardingdaten(client: sitzung.client) }

    var body: some View {
        Group {
            switch laden {
            case .laeuft:
                ProgressView()
                    .tint(Farbe.blue)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Farbe.bg)
            case let .fehler(text):
                OnboardingRahmen(kicker: OnboardingLogik.kicker, titel: "Das hat nicht geklappt") {
                    Section {
                        FehlerZeile(text: text, erneut: Erneut(laeuft: false) { Task { await erstesLaden() } }).gruppenZeile()
                    }
                }
            case let .da(zustand):
                assistent(zustand)
            }
        }
        .task { await erstesLaden() }
    }

    // MARK: - Der Assistent

    private func assistent(_ zustand: OnboardingZustand) -> some View {
        let schritte = zustand.schritte
        let (aktuell, index) = OnboardingLogik.aktuell(gewaehlt: schritt, zustand: zustand)
        let info = schritte[index]
        let erster = OnboardingLogik.ersterErreichbarer(schritte, freigeschaltet: freigeschaltet)
        let kontext = OnboardingKontext(
            zustand: zustand,
            daten: daten,
            weiter: { await weiter(von: aktuell) },
            zurueck: index > erster ? {
                hinweis = nil
                schritt = schritte[index - 1].key
            } : nil,
            ueberspringen: info.pflicht ? nil : { await weiter(von: aktuell) },
            letzter: index == schritte.count - 1
        )

        return OnboardingRahmen(
            kicker: OnboardingLogik.kopfKicker(index: index, anzahl: schritte.count),
            titel: info.titel,
            fortschritt: OnboardingLogik.fortschritt(schritte, index: index)
        ) {
            Section {
                Text(OnboardingLogik.einleitung(aktuell, minderjaehrig: zustand.minderjaehrig))
                    .foregroundStyle(Farbe.ink2)
                    .fixedSize(horizontal: false, vertical: true)
                    .listRowBackground(Color.clear)
            }
            if let hinweis {
                Section {
                    Label(hinweis.meldung, systemImage: hinweis.ok ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                        .foregroundStyle(hinweis.ok ? Farbe.greenInk : Farbe.redInk)
                        .gruppenZeile()
                }
            }
            Group {
                switch aktuell {
                case .passwort: SchrittPasswort(k: kontext)
                case .stammdaten: SchrittStammdaten(k: kontext)
                case .rechtliches: SchrittRechtliches(k: kontext)
                case .erziehungsberechtigte: SchrittErziehungsberechtigte(k: kontext)
                case .notfallkontakt: SchrittNotfallkontakt(k: kontext)
                case .sepa: SchrittSepa(k: kontext)
                case .einwilligungen: SchrittEinwilligungen(k: kontext)
                case .tennis: SchrittTennis(k: kontext)
                case .einstellungen: SchrittEinstellungen(k: kontext)
                }
            }
            // Je Schritt ein frisches Formular.
            .id(aktuell)
        }
    }

    // MARK: - Laden und Weiter

    private func erstesLaden() async {
        laden = .laeuft
        do {
            let zustand = try await daten.laden()
            // Kein Mitglied (etwa der Kiosk) oder schon fertig: in die Tabs.
            guard let zustand, zustand.abgeschlossenAm == nil || freigeschaltet else {
                sitzung.onboardingVerlassen()
                return
            }
            laden = .da(zustand)
            #if DEBUG
            // Fuer Bildschirmfotos per simctl (README): `-TCMOnboardingSchritt sepa` springt zu einem Schritt.
            let argumente = ProcessInfo.processInfo.arguments
            if let i = argumente.firstIndex(of: "-TCMOnboardingSchritt"), i + 1 < argumente.count {
                schritt = OnboardingSchrittKey(rawValue: argumente[i + 1])
            }
            #endif
        } catch {
            laden = .fehler(Meldung.aus(error).text)
        }
    }

    /**
     * Nach dem Speichern eines Schritts: neu laden, beim Verlassen des Mandats
     * freischalten, dann zum naechsten Schritt. Der Zustand wird neu gelesen,
     * weil sich mit dem Geburtsdatum die Schritte aendern koennen.
     */
    private func weiter(von aktuell: OnboardingSchrittKey) async -> Ergebnis {
        let neu: OnboardingZustand?
        do {
            neu = try await daten.laden()
        } catch {
            return .fehler(Meldung.aus(error).text)
        }
        guard let neu else {
            sitzung.onboardingVerlassen()
            return .erfolg("")
        }
        laden = .da(neu)
        hinweis = nil

        let liste = neu.schritte
        let hier = liste.firstIndex { $0.key == aktuell } ?? 0
        let sepaHier = liste.firstIndex { $0.key == Onboarding.letzterPflichtschritt } ?? 0

        if !freigeschaltet && hier >= sepaHier {
            let abschluss = await daten.schliesseAb()
            if !abschluss.ergebnis.ok {
                guard let ziel = abschluss.fehlt.first else { return abschluss.ergebnis }
                schritt = ziel
                hinweis = abschluss.ergebnis
                return .erfolg("")
            }
            freigeschaltet = true
            hinweis = .erfolg(OnboardingLogik.freigeschaltet)
        }

        guard hier + 1 < liste.count else {
            sitzung.onboardingVerlassen()
            return .erfolg("")
        }
        schritt = liste[hier + 1].key
        return .erfolg("")
    }
}

/// Was jeder Schritt braucht (SchrittEigenschaften in onboarding.tsx).
struct OnboardingKontext {
    let zustand: OnboardingZustand
    let daten: Onboardingdaten
    let weiter: () async -> Ergebnis
    let zurueck: (() -> Void)?
    let ueberspringen: (() async -> Ergebnis)?
    let letzter: Bool
}

// MARK: - Rahmen

/**
 * Wie ein Einrichtungs-Assistent von iOS: in der Leiste der Schritt
 * ("Schritt 2 von 7"), rechts "Abmelden"; im Inhalt die Fortschrittslinie
 * und der Titel gross und umbrechend (lange Titel wie "SEPA-Lastschrift-
 * mandat" passen nicht in den grossen Navigationstitel). Der Inhalt ist eine gruppierte Liste; die Aktionen des
 * Schritts stehen unten fest auf der Leiste.
 */
struct OnboardingRahmen<Inhalt: View>: View {
    @Environment(Sitzung.self) private var sitzung
    let kicker: String
    let titel: String
    var fortschritt: [OnboardingLogik.Fortschritt]?
    @ViewBuilder let inhalt: Inhalt
    @State private var fussHoehe: CGFloat = 0

    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 14) {
                        if let fortschritt {
                            HStack(spacing: 4) {
                                ForEach(Array(fortschritt.enumerated()), id: \.offset) { _, f in
                                    Capsule()
                                        .fill(f == .offen ? Farbe.line2 : Farbe.blue)
                                        .opacity(f == .erledigt ? 0.45 : 1)
                                        .frame(height: 4)
                                }
                            }
                            .accessibilityHidden(true)
                        }
                        Text(titel)
                            .font(.largeTitle.weight(.bold))
                            .foregroundStyle(Farbe.ink)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityAddTraits(.isHeader)
                    }
                    .listRowBackground(Color.clear)
                }
                inhalt
                OnboardingFusszeile()
            }
            .gruppenListe()
            .listSectionSpacing(16)
            .scrollDismissesKeyboard(.interactively)
            .safeAreaPadding(.bottom, fussHoehe)
            .navigationTitle(kicker.components(separatedBy: " · ").last ?? kicker)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    // Sitzung.abmelden meldet vorher das Geraet fuer Push ab - wie im Konto.
                    Button("Abmelden") { Task { await sitzung.abmelden() } }
                        .tint(Farbe.ink2)
                }
            }
            // Die Aktionen meldet der Schritt selbst (.fuss); hier stehen sie unten fest.
            .overlayPreferenceValue(OnboardingFussKey.self, alignment: .bottom) { fuss in
                if let fuss {
                    fuss.ansicht
                        .id(titel)
                        .padding(.horizontal, Tokens.Abstand.rand)
                        .padding(.top, 12)
                        .padding(.bottom, 8)
                        .frame(maxWidth: .infinity)
                        .background(.bar)
                        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { fussHoehe = $0 }
                }
            }
        }
    }
}

/// Die Aktionen eines Schritts auf dem Weg nach unten in den festen Fuss.
struct OnboardingFuss {
    let ansicht: AnyView
}

struct OnboardingFussKey: PreferenceKey {
    static var defaultValue: OnboardingFuss? { nil }
    static func reduce(value: inout OnboardingFuss?, nextValue: () -> OnboardingFuss?) {
        value = nextValue() ?? value
    }
}

extension View {
    /// Legt die Aktionen des Schritts in den festen Fuss des Rahmens.
    func fuss(_ aktionen: OnboardingAktionen) -> some View {
        preference(key: OnboardingFussKey.self, value: OnboardingFuss(ansicht: AnyView(aktionen)))
    }
}

/// Datenschutz und Impressum, leise unter dem Inhalt.
private struct OnboardingFusszeile: View {
    @Environment(Sitzung.self) private var sitzung

    var body: some View {
        Section {
            HStack(spacing: 20) {
                if let datenschutz = sitzung.umgebung.webLink("/datenschutz") {
                    Link("Datenschutz", destination: datenschutz)
                }
                if let impressum = sitzung.umgebung.webLink("/impressum") {
                    Link("Impressum", destination: impressum)
                }
            }
            .font(.footnote)
            .tint(Farbe.muted)
            .frame(maxWidth: .infinity, minHeight: 44)
            .listRowBackground(Color.clear)
        }
    }
}

// MARK: - Bausteine

/**
 * Weiter, Ueberspringen, Zurueck. Ein Fehler beim Speichern bleibt hier
 * stehen; geht es weiter, verschwindet der Schritt ohnehin.
 */
struct OnboardingAktionen: View {
    let k: OnboardingKontext
    var weiterText = "Weiter"
    var gesperrt = false
    let speichern: () async -> Ergebnis

    @State private var laeuft = false
    @State private var meldung: String?

    var body: some View {
        VStack(spacing: 6) {
            if let meldung {
                Label(meldung, systemImage: "exclamationmark.triangle.fill")
                    .font(.subheadline)
                    .foregroundStyle(Farbe.redInk)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .onAppear { UIAccessibility.post(notification: .announcement, argument: meldung) }
            }
            BreiterKnopf(text: weiterText, laeuft: laeuft, gesperrt: gesperrt) { los(speichern) }
            if k.zurueck != nil || k.ueberspringen != nil {
                HStack {
                    if let zurueck = k.zurueck {
                        Button("Zurück", action: zurueck).disabled(laeuft)
                    }
                    Spacer()
                    if let ueberspringen = k.ueberspringen {
                        Button("Überspringen") { los(ueberspringen) }.disabled(laeuft)
                    }
                }
                .font(.body.weight(.medium))
                .tint(Farbe.blueInk)
                .frame(minHeight: 44)
                .padding(.horizontal, 8)
            }
        }
        .sensoryFeedback(.error, trigger: meldung) { _, neu in neu != nil }
    }

    private func los(_ tun: @escaping () async -> Ergebnis) {
        guard !laeuft else { return }
        laeuft = true
        meldung = nil
        Task {
            let r = await tun()
            laeuft = false
            if !r.ok { meldung = r.meldung }
        }
    }
}

/// Ein Schalter mit Beschriftung und Erklaerung darunter als Listenzeile.
struct OnboardingSchalter: View {
    let label: String
    var beschreibung: String?
    @Binding var an: Bool
    var gesperrt = false

    var body: some View {
        Toggle(isOn: $an) {
            VStack(alignment: .leading, spacing: 2) {
                Text(label).foregroundStyle(Farbe.ink).fixedSize(horizontal: false, vertical: true)
                if let beschreibung, !beschreibung.isEmpty {
                    Text(beschreibung).font(.footnote).foregroundStyle(Farbe.muted).fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .tint(Farbe.blue)
        .disabled(gesperrt)
        .gruppenZeile()
    }
}
