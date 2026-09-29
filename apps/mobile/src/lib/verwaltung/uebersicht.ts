/**
 * Die Uebersicht der Verwaltung - dieselben Quellen wie
 * apps/web/src/app/admin/page.tsx, jede fuer sich geladen.
 */

import { translateDbError } from "@tcm/core";
import { abschnitt, type Abschnitt } from "@/lib/laden";
import { supabase } from "@/lib/supabase";
import { heuteInBerlin } from "@/lib/verwaltung/gemeinsam";

function zahl(r: { count: number | null; error: { message: string } | null }): number {
  if (r.error) throw new Error(translateDbError(r.error));
  return r.count ?? 0;
}

function daten<T>(r: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (r.error) throw new Error(translateDbError(r.error));
  return r.data as T;
}

export async function ladeUebersicht() {
  const heute = heuteInBerlin();

  const [antraege, mitglieder, plaetze, plan, einstellungen, forderungen, laeufe, monate] =
    await Promise.allSettled([
      supabase
        .from("membership_applications")
        .select("id", { count: "exact", head: true })
        .eq("status", "new")
        .then(zahl),
      supabase
        .from("members")
        .select("id", { count: "exact", head: true })
        .eq("status", "active")
        .then(zahl),
      supabase.from("courts").select("id, name").eq("active", true).order("position").then(daten),
      supabase.rpc("day_schedule", { p_date: heute }).then(daten),
      supabase.rpc("booking_settings").then(daten),
      supabase
        .from("charges")
        .select("payer_id, amount_cents, status, due_date")
        .in("status", ["open", "notified", "returned"])
        .then(daten),
      supabase.rpc("debit_batch_overview", { p_limit: 6 }).then(daten),
      supabase.from("billing_periods").select("year, month").eq("status", "open").then(daten),
    ]);

  // Fuer einen Entwurf fragt die Seite die Datenbank, wer einzugsfaehig ist.
  const lauf =
    laeufe.status === "fulfilled"
      ? ((laeufe.value ?? []).find((l) => l.status !== "completed") ?? null)
      : null;
  let einzugsfaehig = 0;
  if (lauf?.status === "draft") {
    const { data } = await supabase.rpc("debit_batch_candidates", { p_collection_date: lauf.collection_date });
    einzugsfaehig = (data ?? []).filter((k) => k.einzugsfaehig).length;
  }

  return {
    heute,
    antraege: abschnitt(antraege),
    mitglieder: abschnitt(mitglieder),
    plaetze: abschnitt(plaetze) as Abschnitt<{ id: string; name: string }[]>,
    plan: abschnitt(plan),
    einstellungen: abschnitt(einstellungen),
    forderungen: abschnitt(forderungen),
    laeufe: abschnitt(laeufe),
    monate: abschnitt(monate),
    lauf,
    einzugsfaehig,
  };
}

export type Uebersicht = Awaited<ReturnType<typeof ladeUebersicht>>;
