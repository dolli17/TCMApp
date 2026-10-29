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

/// Kopf mit Kicker, Titel und Fortschritt, darunter der Inhalt und die Fusszeile.
struct OnboardingRahmen<Inhalt: View>: View {
    let kicker: String
    let titel: String
    var fortschritt: [OnboardingLogik.Fortschritt]?
    @ViewBuilder let inhalt: Inhalt

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Tokens.Abstand.m) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(kicker).kicker()
                    Text(titel)
                        .font(Schrift.text(.extrafett, 30, relativeTo: .largeTitle))
                        .tracking(Tokens.Schrift.laufweiteTitel)
                        .foregroundStyle(Farbe.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityAddTraits(.isHeader)
                    if let fortschritt {
                        HStack(spacing: 4) {
                            ForEach(Array(fortschritt.enumerated()), id: \.offset) { _, f in
                                Capsule()
                                    .fill(f == .jetzt ? Farbe.blue : f == .erledigt ? Farbe.green : Farbe.surf3)
                                    .frame(height: 5)
                            }
                        }
                        .padding(.top, 6)
                        .accessibilityHidden(true)
                    }
                }
                .padding(.top, 16)
                inhalt
                OnboardingFusszeile()
            }
            .padding(.horizontal, Tokens.Abstand.rand)
            .padding(.bottom, Tokens.Abstand.abschnitt)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Farbe.bg)
    }
}

/// Datenschutz und Impressum, und vor allem: Abmelden.
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
            // Sitzung.abmelden meldet vorher das Geraet fuer Push ab - wie im Konto.
            Button { Task { await sitzung.abmelden() } } label: { verweis("Abmelden", rot: true) }
                .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, Tokens.Abstand.l)
    }

    private func verweis(_ text: String, rot: Bool = false) -> some View {
        Text(text)
            .font(Schrift.text(.halbfett, 14))
            .foregroundStyle(rot ? Farbe.redInk : Farbe.ink2)
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
        VStack(spacing: Tokens.Abstand.s) {
            if let meldung {
                KontoHinweis(text: meldung)
            }
            GelberKnopf(text: laeuft ? "Wird gespeichert…" : weiterText, gesperrt: laeuft || gesperrt) {
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
        .padding(.top, Tokens.Abstand.s)
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
        .tint(Farbe.green)
        .disabled(gesperrt)
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(minHeight: 56)
    }
}
