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
  const sucheMitspieler = formData.get("partnerWanted") === "1";

  if (!courtId || !startsAt) {
    return { ok: false, meldung: "Platz oder Zeitpunkt fehlt." };
  }

  const { error } = await supabase.rpc("create_booking", {
    p_court_id: courtId,
    p_starts_at: startsAt,
    p_booking_type_code: typ,
    p_player_member_ids: mitspieler,
    p_guest_names: gaeste,
    p_partner_wanted: sucheMitspieler,
  });

  if (error) {
    return { ok: false, meldung: translateDbError(error) };
  }

  revalidatePath("/plan");
  revalidatePath("/plan/meine");
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
  revalidatePath("/plan/meine");
  return { ok: true, meldung: "Mitspieler aktualisiert." };
}

/**
 * Eine Buchung stornieren, wahlweise mit Grund.
 *
 * Der Grund landet in der Benachrichtigung an die Betroffenen. Storniert ein
 * Admin eine fremde Buchung, ist er praktisch Pflicht: "Die Buchung wurde
 * storniert." ohne jede Erklaerung ist genau die Nachricht, die einen Anruf
 * beim Vorstand ausloest.
 */
export async function stornieren(
  bookingId: string,
  grund?: string,
): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();

  const { error } = await supabase.rpc("cancel_booking", {
    p_booking_id: bookingId,
    p_reason: grund?.trim() || undefined,
  });

  if (error) {
    return { ok: false, meldung: translateDbError(error) };
  }

  revalidatePath("/plan");
  revalidatePath("/plan/meine");
  revalidatePath("/plan/offen");
  return { ok: true, meldung: "Buchung storniert." };
}

/**
 * Ein einzelner Serientermin faellt aus.
 *
 * Nicht ueber stornieren(): cancel_series_occurrence verlangt, dass der Termin
 * wirklich zu einer Serie gehoert, und traegt einen sprechenden Grund ein. Wer
 * "Faellt diese Woche aus" drueckt, soll nicht versehentlich eine fremde
 * Platzbuchung abraeumen, weil er eine Zeile daneben getroffen hat.
 */
export async function serienterminAbsagen(
  bookingId: string,
  grund?: string,
): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();

  const { error } = await supabase.rpc("cancel_series_occurrence", {
    p_booking_id: bookingId,
    p_reason: grund?.trim() || undefined,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  revalidatePath("/plan");
  revalidatePath("/admin/serien");
  return { ok: true, meldung: "Der Termin ist abgesagt." };
}

/**
 * Eine einzelne Stunde direkt aus dem Belegungsplan sperren.
 *
 * Dieselbe RPC wie in der Platzverwaltung, nur mit genau einem Platz und einer
 * Stunde. Wer bei Regen am Platz steht, tippt auf die Stunde statt sich durch
 * das Verwaltungsmenue zu suchen.
 */
export async function stundeSperren(daten: {
  platzId: string;
  von: string;
  bis: string;
  grund: string;
  verdraengen: boolean;
}): Promise<AktionsErgebnis & { kollisionen?: number }> {
  const supabase = await createServerSupabase();

  const { error } = await supabase.rpc("create_blocking", {
    p_court_ids: [daten.platzId],
    p_von: daten.von,
    p_bis: daten.bis,
    p_type_code: "platzpflege",
    p_title: daten.grund,
    p_force: daten.verdraengen,
  });

  if (error) {
    const treffer = /^(\d+) Buchungen liegen/.exec(error.message);
    if (treffer) {
      return { ok: false, meldung: translateDbError(error), kollisionen: Number(treffer[1]) };
    }
    return { ok: false, meldung: translateDbError(error) };
  }

  revalidatePath("/plan");
  revalidatePath("/admin/plaetze");
  return { ok: true, meldung: "Die Stunde ist gesperrt." };
}

/**
 * Sich selbst aus einer fremden Buchung austragen.
 *
 * Nicht ueber update_booking_players: die gehoert dem Bucher und wuerde einem
 * Mitspieler erlauben, die ganze Besetzung umzuwerfen. leave_booking kennt nur
 * den eigenen Platz - und prueft, ob danach noch genug Leute da sind.
 */
export async function austragen(bookingId: string): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();

  const { error } = await supabase.rpc("leave_booking", { p_booking_id: bookingId });

  if (error) {
    return { ok: false, meldung: translateDbError(error) };
  }

  revalidatePath("/plan");
  revalidatePath("/plan/meine");
  return { ok: true, meldung: "Du bist ausgetragen." };
}

/** Die Buchung fuer andere oeffnen oder wieder schliessen. Nur der Bucher. */
export async function mitspielerSuchen(
  bookingId: string,
  gesucht: boolean,
): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();

  const { error } = await supabase.rpc("set_partner_wanted", {
    p_booking_id: bookingId,
    p_wanted: gesucht,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  revalidatePath("/plan");
  revalidatePath("/plan/meine");
  revalidatePath("/plan/offen");
  return {
    ok: true,
    meldung: gesucht
      ? "Die Buchung steht jetzt bei den offenen Spielen."
      : "Die Buchung ist nicht mehr ausgeschrieben.",
  };
}

/**
 * Einer offenen Buchung beitreten.
 *
 * Nicht ueber update_booking_players: die gehoert dem Bucher und wuerde einem
 * Fremden erlauben, dessen Besetzung umzuwerfen. join_booking traegt nur den
 * Aufrufer ein - und nur, wenn die Buchung wirklich ausgeschrieben ist.
 */
export async function mitspielen(bookingId: string): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();

  const { error } = await supabase.rpc("join_booking", { p_booking_id: bookingId });

  if (error) return { ok: false, meldung: translateDbError(error) };

  revalidatePath("/plan");
  revalidatePath("/plan/meine");
  revalidatePath("/plan/offen");
  return { ok: true, meldung: "Du bist eingetragen. Viel Spaß!" };
}
