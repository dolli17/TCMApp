"use server";

import { revalidatePath } from "next/cache";
import { translateDbError } from "@tcm/core";
import { createServerSupabase } from "@/lib/supabase/server";

export interface AktionsErgebnis {
  ok: boolean;
  meldung: string;
}

/**
 * Alles Schreibende an Plaetzen und Buchungsarten laeuft ueber RPCs.
 *
 * Auf courts und booking_types gibt es nur "grant select" - auch fuer Admins.
 * Die *_admin_all-Policies erlauben zwar jede Zeile, aber ohne Tabellenrecht
 * kommt die Anweisung gar nicht erst bis zur Policy. Ein direktes
 * supabase.from("courts").update(...) scheitert deshalb still an der
 * Berechtigung, nicht an der Regel.
 */

function frisch() {
  revalidatePath("/admin/plaetze");
  revalidatePath("/plan");
}

export async function platzSpeichern(daten: {
  id: string | null;
  name: string;
  kurzname: string;
  zusatz: string;
}): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();

  const { error } = await supabase.rpc("upsert_court", {
    // Beim Anlegen gibt es noch keine Id. Der generierte Typ kennt nur string,
    // die Funktion selbst nimmt null als "neu anlegen" - deshalb hier explizit.
    p_id: daten.id as string,
    p_name: daten.name,
    p_short_name: daten.kurzname,
    p_subline: daten.zusatz,
    p_position: undefined,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  frisch();
  return { ok: true, meldung: daten.id ? "Platz gespeichert." : "Platz angelegt." };
}

export async function platzUmschalten(id: string, aktiv: boolean): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.rpc("set_court_active", {
    p_id: id,
    p_active: aktiv,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  frisch();

  // Die RPC gibt zurueck, wie viele kuenftige Buchungen auf dem Platz haengen.
  // Sie werden bewusst nicht mitstorniert - der Vorstand soll sie sehen und
  // selbst entscheiden, statt zwanzig Leuten wortlos den Platz zu nehmen.
  const offen = typeof data === "number" ? data : 0;
  if (!aktiv && offen > 0) {
    return {
      ok: true,
      meldung: `Platz stillgelegt. Achtung: ${offen} künftige ${
        offen === 1 ? "Buchung liegt" : "Buchungen liegen"
      } noch darauf – bitte sperren und die Betroffenen informieren.`,
    };
  }
  return { ok: true, meldung: aktiv ? "Platz ist wieder im Plan." : "Platz stillgelegt." };
}

export async function plaetzeSortieren(ids: string[]): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();

  const { error } = await supabase.rpc("reorder_courts", { p_ids: ids });
  if (error) return { ok: false, meldung: translateDbError(error) };

  frisch();
  return { ok: true, meldung: "Reihenfolge gespeichert." };
}

export async function buchungsartSpeichern(daten: {
  code: string;
  name: string;
  art: "booking" | "blocking";
  dauer: number;
  minSpieler: number;
  maxSpieler: number;
  brauchtPartner: boolean;
  zaehltAufKontingent: boolean;
  aktiv: boolean;
}): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();

  const { error } = await supabase.rpc("upsert_booking_type", {
    p_code: daten.code,
    p_name: daten.name,
    p_applies_to: daten.art,
    p_duration_minutes: daten.dauer,
    p_min_players: daten.minSpieler,
    p_max_players: daten.maxSpieler,
    p_requires_partner: daten.brauchtPartner,
    p_counts_towards_quota: daten.zaehltAufKontingent,
    p_active: daten.aktiv,
    p_sort_order: undefined,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  frisch();
  return { ok: true, meldung: "Buchungsart gespeichert." };
}

/**
 * Einen Zeitraum auf mehreren Plaetzen sperren.
 *
 * Zweistufig: der erste Aufruf ohne `verdraengen` bricht ab, sobald Buchungen
 * im Weg sind, und nennt ihre Zahl. Erst der zweite raeumt sie weg und
 * benachrichtigt die Betroffenen.
 */
export async function sperren(daten: {
  platzIds: string[];
  von: string;
  bis: string;
  artCode: string;
  grund: string;
  verdraengen: boolean;
}): Promise<AktionsErgebnis & { kollisionen?: number }> {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.rpc("create_blocking", {
    p_court_ids: daten.platzIds,
    p_von: daten.von,
    p_bis: daten.bis,
    p_type_code: daten.artCode,
    p_title: daten.grund,
    p_force: daten.verdraengen,
  });

  if (error) {
    const treffer = /^(\d+) Buchungen liegen/.exec(error.message);
    if (treffer) {
      return {
        ok: false,
        meldung: translateDbError(error),
        kollisionen: Number(treffer[1]),
      };
    }
    return { ok: false, meldung: translateDbError(error) };
  }

  frisch();
  const zeile = (data ?? [])[0];
  const angelegt = zeile?.created_count ?? 0;
  const verdraengt = zeile?.displaced_count ?? 0;

  return {
    ok: true,
    meldung:
      verdraengt > 0
        ? `${angelegt} Plätze gesperrt, ${verdraengt} Buchungen verdrängt. Die Betroffenen wurden benachrichtigt.`
        : `${angelegt} ${angelegt === 1 ? "Platz" : "Plätze"} gesperrt.`,
  };
}

export async function serieBeenden(seriesId: string): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.rpc("end_series", {
    p_series_id: seriesId,
    p_ab: undefined,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  revalidatePath("/admin/serien");
  revalidatePath("/plan");

  const weg = typeof data === "number" ? data : 0;
  return {
    ok: true,
    meldung:
      weg > 0
        ? `Serie beendet. ${weg} künftige ${weg === 1 ? "Termin wurde" : "Termine wurden"} abgesagt.`
        : "Serie beendet. Es standen keine Termine mehr aus.",
  };
}
