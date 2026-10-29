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

@MainActor
@Observable
final class PushZentrale {
    static let shared = PushZentrale()

    /// Das Ziel der zuletzt angetippten Nachricht, bis die Tabs es oeffnen.
    var offenesZiel: PushZiel?

    /// Laenger wartet niemand auf die Marke von APNs.
    static let frist = Duration.seconds(15)
    static let markeSchluessel = "tcm-push-marke"

    @ObservationIgnored private var wartende: [CheckedContinuation<Data?, Never>] = []

    private init() {}

    private var gespeicherteMarke: String? {
        get { UserDefaults.standard.string(forKey: Self.markeSchluessel) }
        set { UserDefaults.standard.set(newValue, forKey: Self.markeSchluessel) }
    }

    // MARK: - An- und Abmelden

    /// Erlaubnis holen, Marke besorgen, in der Datenbank anmelden.
    func anmelden(_ daten: Pushdaten) async -> Ergebnis {
        guard await erlaubnisHolen() else { return .fehler("Ohne Erlaubnis des Geräts geht es nicht.") }
        guard let marke = await markeHolen() else { return .fehler("Das Gerät hat keine Kennung geliefert.") }
        let r = await daten.anmelden(marke: marke, geraet: UIDevice.current.name)
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
        let einstellungen = await UNUserNotificationCenter.current().notificationSettings()
        guard Self.erlaubt(einstellungen.authorizationStatus) else { return false }
        return await daten.aktiv(marke: marke)
    }

    /// War Push an und hat APNs inzwischen eine andere Marke vergeben, wird die neue angemeldet.
    func auffrischen(_ daten: Pushdaten) async {
        guard let alt = gespeicherteMarke else { return }
        let einstellungen = await UNUserNotificationCenter.current().notificationSettings()
        guard Self.erlaubt(einstellungen.authorizationStatus), let neu = await markeHolen(), neu != alt else { return }
        if await daten.anmelden(marke: neu, geraet: UIDevice.current.name).ok {
            gespeicherteMarke = neu
            _ = await daten.abmelden(marke: alt)
        }
    }

    nonisolated static func erlaubt(_ status: UNAuthorizationStatus) -> Bool {
        status == .authorized || status == .provisional || status == .ephemeral
    }

    private func erlaubnisHolen() async -> Bool {
        let zentrale = UNUserNotificationCenter.current()
        let status = await zentrale.notificationSettings().authorizationStatus
        if Self.erlaubt(status) { return true }
        guard status == .notDetermined else { return false }
        return (try? await zentrale.requestAuthorization(options: [.alert, .badge, .sound])) ?? false
    }

    /// Bittet APNs um die Marke und wartet auf den App-Delegate - hoechstens `frist`.
    private func markeHolen() async -> String? {
        let daten: Data? = await withCheckedContinuation { fortsetzung in
            wartende.append(fortsetzung)
            UIApplication.shared.registerForRemoteNotifications()
            Task { [weak self] in
                try? await Task.sleep(for: Self.frist)
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
