"use server";

import { translateDbError } from "@tcm/core";
import { createServerSupabase } from "@/lib/supabase/server";

export interface Benachrichtigung {
  id: string;
  kind: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

/**
 * Die eigenen Benachrichtigungen holen.
 *
 * Bewusst als Server Action und nicht beim Rendern des Layouts: die Glocke
 * steht auf jeder Seite, und ein zusaetzlicher Datenbankaufruf je Seitenaufruf
 * kostet mehr, als er einbringt. Der Zaehler kommt beim Anmelden einmal mit,
 * die Liste erst beim Oeffnen.
 */
export async function ladeBenachrichtigungen(): Promise<Benachrichtigung[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.rpc("my_notifications", { p_limit: 30 });
  return (data ?? []) as Benachrichtigung[];
}

export async function alsGelesenMarkieren(): Promise<{ ok: boolean; meldung: string }> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("mark_notifications_read", { p_ids: undefined });
  if (error) return { ok: false, meldung: translateDbError(error) };
  return { ok: true, meldung: "" };
}
