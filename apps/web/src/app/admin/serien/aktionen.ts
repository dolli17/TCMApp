"use server";

import { revalidatePath } from "next/cache";
import { translateDbError } from "@tcm/core";
import { createServerSupabase } from "@/lib/supabase/server";

export interface Kollision {
  starts_at: string;
  ends_at: string;
  conflict_booking_id: string | null;
  conflict_member_name: string | null;
  conflict_kind: string | null;
}

/**
 * Vorschau: reine Leseoperation. Aendert nichts, auch nicht bei Konflikten.
 */
export async function serieVorschau(daten: {
  courtId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  validFrom: string;
  validTo: string;
}): Promise<{ ok: boolean; meldung?: string; termine: Kollision[] }> {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.rpc("preview_series", {
    p_court_id: daten.courtId,
    p_weekday: daten.weekday,
    p_start_time: daten.startTime,
    p_end_time: daten.endTime,
    p_valid_from: daten.validFrom,
    p_valid_to: daten.validTo,
  });

  if (error) return { ok: false, meldung: translateDbError(error), termine: [] };
  return { ok: true, termine: (data ?? []) as Kollision[] };
}

/**
 * Anlegen. Ohne verdraengen bricht der Aufruf ab, sobald ein Termin kollidiert -
 * der Admin muss das Verdraengen also ausdruecklich bestaetigen.
 */
export async function serieAnlegen(daten: {
  courtId: string;
  bookingTypeCode: string;
  weekday: number;
  startTime: string;
  endTime: string;
  validFrom: string;
  validTo: string;
  title: string;
  verdraengen: boolean;
}) {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.rpc("create_series", {
    p_court_id: daten.courtId,
    p_booking_type_code: daten.bookingTypeCode,
    p_weekday: daten.weekday,
    p_start_time: daten.startTime,
    p_end_time: daten.endTime,
    p_valid_from: daten.validFrom,
    p_valid_to: daten.validTo,
    p_title: daten.title,
    p_displace: daten.verdraengen,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  const zeile = data?.[0];
  revalidatePath("/admin/serien");
  revalidatePath("/plan");

  return {
    ok: true,
    meldung:
      `Serie angelegt: ${zeile?.created_count ?? 0} Termine` +
      (zeile?.displaced_count
        ? `, ${zeile.displaced_count} bestehende Buchungen verdrängt und die Betroffenen benachrichtigt.`
        : "."),
  };
}
