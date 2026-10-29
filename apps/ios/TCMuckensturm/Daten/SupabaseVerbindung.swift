/**
 * Der Supabase-Client
 *
 * Die Sitzung liegt im Schluesselbund (Schluesselbund.swift), mit der App
 * Group als Access Group, damit spaeter Widgets sie lesen koennen.
 */

import Foundation
import Supabase

enum SupabaseVerbindung {
    /// - Parameter autoRefreshToken: im Widget aus - die Erweiterung lebt nur Sekunden (WidgetLaden).
    static func client(fuer umgebung: Umgebung, autoRefreshToken: Bool = true) -> SupabaseClient {
        SupabaseClient(
            supabaseURL: umgebung.supabaseURL,
            supabaseKey: umgebung.supabaseKey,
            options: SupabaseClientOptions(
                auth: .init(
                    storage: Schluesselbund(accessGroup: umgebung.appGroup),
                    // Wie supabase-js in der Expo-App. Mit PKCE (Vorgabe von
                    // supabase-swift) haengt "Passwort vergessen" den Link an einen
                    // Schluessel auf diesem Geraet - wer die Mail am Rechner oeffnet,
                    // kaeme nicht weiter. Der token_hash aus den Vorlagen braucht keinen.
                    flowType: .implicit,
                    autoRefreshToken: autoRefreshToken,
                    // Die gespeicherte Sitzung sofort melden, auch wenn sie
                    // abgelaufen ist - die Weiche erneuert sie selbst (Sitzung.ladeZugang).
                    emitLocalSessionAsInitialSession: true
                )
            )
        )
    }
}
