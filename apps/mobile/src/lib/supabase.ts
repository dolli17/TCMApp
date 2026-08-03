/**
 * Supabase in der App
 *
 * Die Sitzung liegt in AsyncStorage, damit man nicht bei jedem Start neu
 * anmelden muss. Auch hier ausschliesslich der oeffentliche Schluessel - was
 * ein Mitglied sehen darf, entscheidet RLS in der Datenbank.
 */

import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@tcm/core";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

if (!url || !key) {
  // Kein throw beim Import: sonst stuerzt die App beim Start ab, statt eine
  // verstaendliche Meldung zu zeigen.
  console.warn(
    "EXPO_PUBLIC_SUPABASE_URL oder EXPO_PUBLIC_SUPABASE_ANON_KEY fehlen. " +
      ".env aus .env.example anlegen.",
  );
}

export const supabase = createClient<Database>(url, key, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // In React Native gibt es keine URL-Rueckleitung wie im Browser.
    detectSessionInUrl: false,
  },
});

export function istKonfiguriert(): boolean {
  return Boolean(url && key);
}
