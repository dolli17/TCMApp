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
                    Fehlerzeile(text: text) { Task { await erstesLaden() } }
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
            Text(OnboardingLogik.einleitung(aktuell, minderjaehrig: zustand.minderjaehrig))
                .font(Schrift.text(.normal, Tokens.Schrift.normal))
                .foregroundStyle(Farbe.ink)
                .lineSpacing(4)
                .fixedSize(horizontal: false, vertical: true)
            if let hinweis {
                KontoHinweis(text: hinweis.meldung, ok: hinweis.ok)
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
 * Aufbau nach docs/design/stitch ("Onboarding"): oben fest der Kicker mit dem
 * Schritt und rechts "Abmelden", darunter die Fortschrittslinie; der Inhalt
 * rollt; die Aktionen des Schritts stehen unten fest.
 */
struct OnboardingRahmen<Inhalt: View>: View {
    @Environment(Sitzung.self) private var sitzung
    let kicker: String
    let titel: String
    var fortschritt: [OnboardingLogik.Fortschritt]?
    @ViewBuilder let inhalt: Inhalt
    @State private var fussHoehe: CGFloat = 0

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .center, spacing: 12) {
                Text(kicker).kicker().frame(maxWidth: .infinity, alignment: .leading)
                // Sitzung.abmelden meldet vorher das Geraet fuer Push ab - wie im Konto.
                Button { Task { await sitzung.abmelden() } } label: {
                    Text("Abmelden")
                        .font(Schrift.text(.normal, 15))
                        .foregroundStyle(Farbe.ink2)
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, Tokens.Abstand.rand)
            .padding(.top, 4)
            if let fortschritt {
                HStack(spacing: 3) {
                    ForEach(Array(fortschritt.enumerated()), id: \.offset) { _, f in
                        Rectangle()
                            .fill(f == .offen ? Farbe.line : Farbe.blue)
                            .opacity(f == .erledigt ? 0.45 : 1)
                            .frame(height: 3)
                    }
                }
                .accessibilityHidden(true)
            } else {
                Farbe.line.frame(height: 1)
            }
            ScrollView {
                VStack(alignment: .leading, spacing: Tokens.Abstand.m) {
                    Text(titel)
                        .font(Schrift.display(.fett, 30, relativeTo: .largeTitle))
                        .tracking(Tokens.Schrift.laufweiteTitel)
                        .foregroundStyle(Farbe.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityAddTraits(.isHeader)
                        .padding(.top, 24)
                        .padding(.bottom, 4)
                    inhalt
                    OnboardingFusszeile()
                }
                .padding(.horizontal, Tokens.Abstand.rand)
                .padding(.bottom, Tokens.Abstand.abschnitt)
            }
            .scrollDismissesKeyboard(.interactively)
            .safeAreaPadding(.bottom, fussHoehe)
        }
        .background(Farbe.bg)
        // Die Aktionen meldet der Schritt selbst (OnboardingAktionen); hier stehen sie unten fest.
        .overlayPreferenceValue(OnboardingFussKey.self, alignment: .bottom) { fuss in
            if let fuss {
                VStack(spacing: 0) {
                    Farbe.line.frame(height: 1)
                    fuss.ansicht
                        .padding(.horizontal, Tokens.Abstand.rand)
                        .padding(.top, 12)
                        .padding(.bottom, 8)
                }
                .background(Farbe.bg)
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { fussHoehe = $0 }
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

/// Datenschutz und Impressum, leise unter dem Inhalt.
private struct OnboardingFusszeile: View {
    @Environment(Sitzung.self) private var sitzung

    var body: some View {
        HStack(spacing: 20) {
            if let datenschutz = sitzung.umgebung.webLink("/datenschutz") {
                Link(destination: datenschutz) { verweis("Datenschutz") }
            }
            if let impressum = sitzung.umgebung.webLink("/impressum") {
                Link(destination: impressum) { verweis("Impressum") }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, Tokens.Abstand.l)
    }

    private func verweis(_ text: String) -> some View {
        Text(text)
            .font(Schrift.text(.normal, 14))
            .foregroundStyle(Farbe.muted)
            .frame(minHeight: 44)
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
        // Im Inhalt bleibt nichts stehen: die Knoepfe wandern in den festen Fuss des Rahmens.
        Color.clear.frame(height: 0)
            .preference(key: OnboardingFussKey.self, value: OnboardingFuss(ansicht: AnyView(knoepfe)))
    }

    private var knoepfe: some View {
        VStack(spacing: Tokens.Abstand.s) {
            if let meldung {
                KontoHinweis(text: meldung)
            }
            Hauptknopf(text: laeuft ? "Wird gespeichert…" : weiterText, gesperrt: laeuft || gesperrt) {
                los(speichern)
            }
            if k.zurueck != nil || k.ueberspringen != nil {
                HStack(spacing: Tokens.Abstand.s) {
                    if let zurueck = k.zurueck {
                        LeiserKnopf(text: "Zurück", gesperrt: laeuft, aktion: zurueck)
                    }
                    if let ueberspringen = k.ueberspringen {
                        LeiserKnopf(text: "Überspringen", gesperrt: laeuft) { los(ueberspringen) }
                    }
                }
            }
        }
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

/// Ein Schalter mit Beschriftung und Erklaerung darunter (FormSchalter).
struct OnboardingSchalter: View {
    let label: String
    var beschreibung: String?
    @Binding var an: Bool
    var gesperrt = false

    var body: some View {
        Toggle(isOn: $an) {
            VStack(alignment: .leading, spacing: 3) {
                Text(label)
                    .font(Schrift.text(.halbfett, 15.5))
                    .foregroundStyle(Farbe.ink)
                    .fixedSize(horizontal: false, vertical: true)
                if let beschreibung, !beschreibung.isEmpty {
                    Text(beschreibung).leise().fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .tint(Farbe.blue)
        .disabled(gesperrt)
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(minHeight: 56)
    }
}
