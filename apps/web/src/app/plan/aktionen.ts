"use server";

import { revalidatePath } from "next/cache";
import { translateDbError } from "@tcm/core";
import { createServerSupabase } from "@/lib/supabase/server";

export interface AktionsErgebnis {
  ok: boolean;
  meldung: string;
}

export async function buchen(formData: FormData): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();

  const courtId = String(formData.get("courtId") ?? "");
  const startsAt = String(formData.get("startsAt") ?? "");
  const typ = String(formData.get("bookingType") ?? "einzel");
  const mitspieler = formData
    .getAll("mitspieler")
    .map(String)
    .filter((v) => v.length > 0);
  const gaeste = formData
    .getAll("gast")
    .map((v) => String(v).trim())
    .filter((v) => v.length > 0);

  if (!courtId || !startsAt) {
    return { ok: false, meldung: "Platz oder Zeitpunkt fehlt." };
  }

  const { error } = await supabase.rpc("create_booking", {
    p_court_id: courtId,
    p_starts_at: startsAt,
    p_booking_type_code: typ,
    p_player_member_ids: mitspieler,
    p_guest_names: gaeste,
  });

  if (error) {
    return { ok: false, meldung: translateDbError(error) };
  }

  revalidatePath("/plan");
  return { ok: true, meldung: "Platz gebucht." };
}

/**
 * Tauscht die Mitspieler einer bestehenden Buchung komplett aus.
 *
 * Die Oberflaeche schickt den Zustand, den der Benutzer sieht - nicht einzelne
 * Zu- und Abgaenge. So sieht die Regelpruefung in der Datenbank immer die
 * fertige Besetzung, und ein halb angewendeter Tausch kann nicht entstehen.
 */
export async function mitspielerAendern(
  bookingId: string,
  mitgliedIds: string[],
  gaeste: string[],
): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();

  const { error } = await supabase.rpc("update_booking_players", {
    p_booking_id: bookingId,
    p_member_ids: mitgliedIds,
    p_guest_names: gaeste.map((g) => g.trim()).filter((g) => g.length > 0),
  });

  if (error) {
    return { ok: false, meldung: translateDbError(error) };
  }

  revalidatePath("/plan");
  return { ok: true, meldung: "Mitspieler aktualisiert." };
}

export async function stornieren(bookingId: string): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();

  const { error } = await supabase.rpc("cancel_booking", {
    p_booking_id: bookingId,
  });

  if (error) {
    return { ok: false, meldung: translateDbError(error) };
  }

  revalidatePath("/plan");
  return { ok: true, meldung: "Buchung storniert." };
}
