"use server";

import { revalidatePath } from "next/cache";
import { translateDbError } from "@tcm/core";
import { createServerSupabase } from "@/lib/supabase/server";

export interface AktionsErgebnis {
  ok: boolean;
  meldung: string;
}

/** Eine Anmeldung kann eine Forderung anlegen, ändern oder löschen: das Konto mit. */
function frisch(id: string) {
  revalidatePath("/verein/veranstaltungen");
  revalidatePath(`/verein/veranstaltungen/${id}`);
  revalidatePath("/konto");
  revalidatePath("/");
}

/** Die Regeln (Anmeldeschluss, Plätze, Warteliste) prüft event_anmelden. */
export async function anmelden(eventId: string, begleitpersonen: number, bemerkung: string): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("event_anmelden", {
    p_event_id: eventId,
    p_companions: begleitpersonen,
    p_note: bemerkung,
  });
  if (error) return { ok: false, meldung: translateDbError(error) };
  frisch(eventId);
  return {
    ok: true,
    meldung: data === "waitlisted"
      ? "Ausgebucht – du stehst auf der Warteliste."
      : "Du bist angemeldet.",
  };
}

export async function anmeldungAendern(
  eventId: string, begleitpersonen: number, bemerkung: string,
): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("event_anmeldung_aendern", {
    p_event_id: eventId,
    p_companions: begleitpersonen,
    p_note: bemerkung,
  });
  if (error) return { ok: false, meldung: translateDbError(error) };
  frisch(eventId);
  return {
    ok: true,
    meldung: data === "waitlisted"
      ? "Geändert – du stehst weiter auf der Warteliste."
      : "Deine Anmeldung ist geändert.",
  };
}

export async function abmelden(eventId: string): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("event_abmelden", { p_event_id: eventId });
  if (error) return { ok: false, meldung: translateDbError(error) };
  frisch(eventId);
  return { ok: true, meldung: "Du bist abgemeldet." };
}
