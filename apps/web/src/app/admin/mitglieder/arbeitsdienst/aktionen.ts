"use server";

import { revalidatePath } from "next/cache";
import { translateDbError } from "@tcm/core";
import { createServerSupabase } from "@/lib/supabase/server";

export interface AktionsErgebnis {
  ok: boolean;
  meldung: string;
}

function frisch() {
  revalidatePath("/admin/mitglieder/arbeitsdienst");
  revalidatePath("/admin/kasse");
  revalidatePath("/konto");
}

export async function stundenEintragen(daten: {
  mitgliedId: string;
  stunden: number;
  amTag: string;
  beschreibung: string;
}): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();

  const { error } = await supabase.rpc("record_work_duty", {
    p_member_id: daten.mitgliedId,
    p_hours: daten.stunden,
    p_worked_on: daten.amTag,
    p_description: daten.beschreibung,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  frisch();
  return { ok: true, meldung: `${daten.stunden} Stunden eingetragen.` };
}

export async function stundenEntfernen(id: string): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();

  const { error } = await supabase.rpc("delete_work_duty", { p_entry_id: id });
  if (error) return { ok: false, meldung: translateDbError(error) };

  frisch();
  return { ok: true, meldung: "Der Eintrag ist entfernt." };
}

export async function sollStundenSetzen(daten: {
  artId: string;
  jahr: number;
  stunden: number;
}): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();

  const { error } = await supabase.rpc("upsert_work_duty_rule", {
    p_fee_type_id: daten.artId,
    p_year: daten.jahr,
    p_required_hours: daten.stunden,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  frisch();
  return {
    ok: true,
    meldung:
      daten.stunden === 0
        ? "Diese Beitragsart leistet keinen Arbeitsdienst mehr."
        : `Soll auf ${daten.stunden} Stunden gesetzt.`,
  };
}

/**
 * Das Jahr abrechnen.
 *
 * Die folgenreichste Aktion des Arbeitsdienstes: sie friert Soll, Ist und
 * Stundensatz ein und macht aus fehlenden Stunden Geld. Danach lässt sich für
 * dieses Jahr nichts mehr nachtragen.
 */
export async function jahrAbrechnen(
  jahr: number,
  faelligAm: string | null,
): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.rpc("work_duty_settle_year", {
    p_year: jahr,
    p_due_date: faelligAm ?? undefined,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  frisch();

  const z = data?.[0];
  const anzahl = z?.abgerechnet ?? 0;
  if (anzahl === 0) {
    return { ok: true, meldung: "Es gab nichts abzurechnen." };
  }

  return {
    ok: true,
    meldung: `${anzahl} ${anzahl === 1 ? "Mitglied" : "Mitglieder"} abgerechnet, ${
      z?.forderungen ?? 0
    } ${(z?.forderungen ?? 0) === 1 ? "Forderung" : "Forderungen"} entstanden.`,
  };
}
