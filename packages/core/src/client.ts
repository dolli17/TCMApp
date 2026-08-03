/**
 * Supabase-Client
 *
 * Es gibt bewusst nur den Weg ueber den anon key. Der service_role key umgeht
 * RLS vollstaendig und hat in keiner Anwendung etwas zu suchen - weder im
 * Browser noch in der Expo-App noch in einer Server-Komponente, die dem
 * Benutzer antwortet. Wo Backend-Rechte gebraucht werden (Seed, Import,
 * Beitragslauf), laeuft das ueber Skripte oder Edge Functions mit eigener
 * Umgebung.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export type TcmClient = SupabaseClient<Database>;

export interface ClientConfig {
  url: string;
  anonKey: string;
}

export function createTcmClient(config: ClientConfig): TcmClient {
  if (!config.url || !config.anonKey) {
    throw new Error(
      "Supabase-Zugangsdaten fehlen. NEXT_PUBLIC_SUPABASE_URL und " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY beziehungsweise die EXPO_PUBLIC_-Varianten setzen.",
    );
  }

  if (config.anonKey.includes("service_role")) {
    throw new Error(
      "Hier wurde ein service_role key uebergeben. Der umgeht RLS und darf " +
        "niemals in einer Anwendung landen.",
    );
  }

  return createClient<Database>(config.url, config.anonKey);
}

/** Typ-Kuerzel fuer Tabellenzeilen: Row<"members"> */
export type Row<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type Insert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

export type Enums<T extends keyof Database["public"]["Enums"]> =
  Database["public"]["Enums"][T];
