/**
 * Supabase in der App
 *
 * Die Sitzung bleibt gespeichert, damit man nicht bei jedem Start neu
 * anmelden muss: auf dem Telefon im Schluesselbund (siehe sitzungsspeicher.ts),
 * im Browser wie bisher ueber AsyncStorage, denn dort gibt es keinen
 * Schluesselbund. Auch hier ausschliesslich der oeffentliche Schluessel - was
 * ein Mitglied sehen darf, entscheidet RLS in der Datenbank.
 */

import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import type { Database } from "@tcm/core";
import { sitzungsSpeicherBauen } from "./sitzungsspeicher";

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

// Nach dem ersten Entsperren lesbar, damit die Sitzung auch erneuert werden
// kann, wenn die App bei gesperrtem Bildschirm im Hintergrund aufwacht.
const schluesselbund = {
  getItemAsync: (key: string) =>
    SecureStore.getItemAsync(key, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK }),
  setItemAsync: (key: string, value: string) =>
    SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK }),
  deleteItemAsync: (key: string) =>
    SecureStore.deleteItemAsync(key, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK }),
};

const speicher =
  Platform.OS === "web" ? AsyncStorage : sitzungsSpeicherBauen(schluesselbund, AsyncStorage);

export const supabase = createClient<Database>(url, key, {
  auth: {
    storage: speicher,
    autoRefreshToken: true,
    persistSession: true,
    // In React Native gibt es keine URL-Rueckleitung wie im Browser.
    detectSessionInUrl: false,
  },
});

export function istKonfiguriert(): boolean {
  return Boolean(url && key);
}
