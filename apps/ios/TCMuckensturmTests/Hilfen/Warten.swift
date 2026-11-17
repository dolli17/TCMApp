import Foundation

/// Wartet auf dem Hauptthread, bis die Bedingung gilt - hoechstens `sekunden`.
@MainActor
@discardableResult
func warte(hoechstens sekunden: Double = 5, bis bedingung: () -> Bool) async -> Bool {
    let ende = Date().addingTimeInterval(sekunden)
    while !bedingung() {
        if Date() > ende { return false }
        try? await Task.sleep(for: .milliseconds(20))
    }
    return true
}
