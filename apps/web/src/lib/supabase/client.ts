/**
 * Supabase im Browser.
 *
 * Bewusst getrennt von server.ts: dort wird next/headers benutzt, und das
 * laesst sich nicht in eine Client-Komponente buendeln. Wer beides in einer
 * Datei hat, zieht den Server-Code ungewollt ins Browser-Bundle.
 */
"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@tcm/core";

/**
 * linkSelbstEinloesen: der Client tauscht ?code=… aus der Adresse nicht von
 * selbst ein. Nur fuer /passwort-setzen - dort muss vorher die bisherige
 * Anmeldung beendet werden (nie zwei Konten zugleich).
 */
export function createClient({ linkSelbstEinloesen = false } = {}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL und NEXT_PUBLIC_SUPABASE_ANON_KEY fehlen. " +
        ".env aus .env.example anlegen.",
    );
  }

  if (linkSelbstEinloesen) {
    // Eigene Instanz: der geteilte Client wuerde die Option ignorieren.
    return createBrowserClient<Database>(url, key, {
      isSingleton: false,
      auth: { detectSessionInUrl: false },
    });
  }
  return createBrowserClient<Database>(url, key);
}
