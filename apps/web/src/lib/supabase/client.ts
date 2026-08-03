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

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL und NEXT_PUBLIC_SUPABASE_ANON_KEY fehlen. " +
        ".env aus .env.example anlegen.",
    );
  }

  return createBrowserClient<Database>(url, key);
}
