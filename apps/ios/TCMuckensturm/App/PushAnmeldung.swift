/**
 * Push auf Geraeteseite: Erlaubnis, APNs-Marke, Anmeldung in der Datenbank
 * und das Tippen auf eine Nachricht
 *
 * Wie apps/mobile/src/lib/push.ts. Gefragt wird erst, wenn jemand den
 * Schalter "Mitteilungen aufs Handy" umlegt (Konto oder Onboarding) - ein
 * Erlaubnisdialog vor dem Login erklaert sich nicht, und ohne Sitzung weist
 * die RPC ohnehin ab. Eine eigene Einwilligung in der Datenbank gibt es
 * nicht: die Zustimmung ist der Systemdialog plus die angemeldete Marke.
 *
 * Die Funktionen geben einen sprechenden Grund zurueck, statt zu werfen:
 * ein Fehler hier darf nichts anderes aufhalten.
 *
 * Anders als die Expo-Marke kann sich die APNs-Marke aendern (etwa nach
 * einer Wiederherstellung). Die zuletzt angemeldete steht deshalb in den
 * UserDefaults; zum Abmelden und zum Pruefen nimmt die App diese, und beim
 * Start der Tabs frischt `auffrischen` sie auf.
 */

import Foundation
import Observation
import UIKit
import UserNotifications

/**
 * Was die Zentrale vom Geraet braucht: Erlaubnis, die Bitte um die Marke und
 * den Geraetenamen. Als Naht, damit die Tests ohne Systemdialog und ohne
 * APNs auskommen; die App nimmt immer `.echt`.
 */
struct PushGeraet: Sendable {
    var status: @Sendable () async -> UNAuthorizationStatus
    var erlaubnisErbitten: @Sendable () async -> Bool
    /// Stoesst die Registrierung an; die Marke kommt ueber `markeAngekommen`.
    var markeAnfordern: @MainActor @Sendable () -> Void
    var name: @MainActor @Sendable () -> String

    static let echt = PushGeraet(
        status: { await UNUserNotificationCenter.current().notificationSettings().authorizationStatus },
        erlaubnisErbitten: {
            (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound])) ?? false
        },
        markeAnfordern: { UIApplication.shared.registerForRemoteNotifications() },
        name: { UIDevice.current.name }
    )
}

@MainActor
@Observable
final class PushZentrale {
    static let shared = PushZentrale()

    /// Das Ziel der zuletzt angetippten Nachricht, bis die Tabs es oeffnen.
    var offenesZiel: PushZiel?

    /// Laenger wartet niemand auf die Marke von APNs.
    static let frist = Duration.seconds(15)
    @ObservationIgnored private let geraet: PushGeraet
    @ObservationIgnored private let speicher: UserDefaults
    @ObservationIgnored private let frist: Duration
    static let markeSchluessel = "tcm-push-marke"

    @ObservationIgnored private var wartende: [CheckedContinuation<Data?, Never>] = []

    /// Die App benutzt nur `shared`; die Parameter sind fuer Tests.
    init(geraet: PushGeraet = .echt, speicher: UserDefaults = .standard, frist: Duration = PushZentrale.frist) {
        self.geraet = geraet
        self.speicher = speicher
        self.frist = frist
    }

    private var gespeicherteMarke: String? {
        get { speicher.string(forKey: Self.markeSchluessel) }
        set { speicher.set(newValue, forKey: Self.markeSchluessel) }
    }

    // MARK: - An- und Abmelden

    /// Erlaubnis holen, Marke besorgen, in der Datenbank anmelden.
    func anmelden(_ daten: Pushdaten) async -> Ergebnis {
        guard await erlaubnisHolen() else { return .fehler("Ohne Erlaubnis des Geräts geht es nicht.") }
        guard let marke = await markeHolen() else { return .fehler("Das Gerät hat keine Kennung geliefert.") }
        let r = await daten.anmelden(marke: marke, geraet: geraet.name())
        if r.ok { gespeicherteMarke = marke }
        return r
    }

    /**
     * Vor dem Abmelden aufzurufen (Sitzung.abmelden). Bleibt die Marke stehen,
     * bekommt das Geraet weiter die Nachrichten des Vorbesitzers.
     */
    func abmelden(_ daten: Pushdaten) async -> Ergebnis {
        guard let marke = gespeicherteMarke else { return .erfolg("") }
        let r = await daten.abmelden(marke: marke)
        gespeicherteMarke = nil
        return r
    }

    /// Ist auf diesem Geraet gerade ein Empfang angemeldet - und erlaubt das Geraet ihn noch?
    func istAngemeldet(_ daten: Pushdaten) async -> Bool {
        guard let marke = gespeicherteMarke else { return false }
        guard Self.erlaubt(await geraet.status()) else { return false }
        return await daten.aktiv(marke: marke)
    }

    /// War Push an und hat APNs inzwischen eine andere Marke vergeben, wird die neue angemeldet.
    func auffrischen(_ daten: Pushdaten) async {
        guard let alt = gespeicherteMarke else { return }
        guard Self.erlaubt(await geraet.status()), let neu = await markeHolen(), neu != alt else { return }
        if await daten.anmelden(marke: neu, geraet: geraet.name()).ok {
            gespeicherteMarke = neu
            _ = await daten.abmelden(marke: alt)
        }
    }

    nonisolated static func erlaubt(_ status: UNAuthorizationStatus) -> Bool {
        status == .authorized || status == .provisional || status == .ephemeral
    }

    private func erlaubnisHolen() async -> Bool {
        let status = await geraet.status()
        if Self.erlaubt(status) { return true }
        guard status == .notDetermined else { return false }
        return await geraet.erlaubnisErbitten()
    }

    /// Bittet APNs um die Marke und wartet auf den App-Delegate - hoechstens `frist`.
    private func markeHolen() async -> String? {
        let daten: Data? = await withCheckedContinuation { fortsetzung in
            wartende.append(fortsetzung)
            geraet.markeAnfordern()
            Task { [weak self, frist] in
                try? await Task.sleep(for: frist)
                self?.markeAngekommen(nil)
            }
        }
        return daten.map(Pushmarke.hex)
    }

    /// Vom App-Delegate: die Marke oder (nil) der Fehlschlag.
    func markeAngekommen(_ daten: Data?) {
        let alle = wartende
        wartende = []
        for f in alle { f.resume(returning: daten) }
    }

    // MARK: - Tippen auf eine Nachricht

    func geoeffnet(_ daten: [String: String]) {
        guard let ziel = PushZiel.aus(daten) else { return }
        offenesZiel = ziel
    }
}

/**
 * Nimmt die Marke von APNs entgegen und meldet das Tippen auf Nachrichten.
 * Der Delegate der Mitteilungszentrale muss vor dem Ende des Starts stehen,
 * sonst geht ein Tippen beim Kaltstart verloren.
 */
final class PushAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        PushZentrale.shared.markeAngekommen(deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: any Error) {
        PushZentrale.shared.markeAngekommen(nil)
    }

    /// Kommt eine Nachricht, waehrend die App offen ist: trotzdem zeigen (setzeAnzeigeverhalten).
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .list, .sound, .badge]
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        guard response.actionIdentifier == UNNotificationDefaultActionIdentifier else { return }
        let daten = PushZiel.texte(response.notification.request.content.userInfo)
        await MainActor.run { PushZentrale.shared.geoeffnet(daten) }
    }
}
