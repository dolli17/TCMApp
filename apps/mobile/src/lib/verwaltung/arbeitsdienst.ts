/**
 * Der Arbeitsdienst in der Verwaltung - dieselben Quellen und RPCs wie
 * apps/web/src/app/admin/arbeitsdienst (page.tsx, aktionen.ts).
 *
 * Nur der Vorstand traegt ein. Die Regeln (0,25 bis 24 Stunden, kein Einsatz
 * in der Zukunft, nichts nach der Abrechnung) prueft record_work_duty selbst;
 * hier steht nur, was vor dem Absenden schon sicher falsch ist - etwa ein
 * Datum, das sich nicht lesen laesst.
 *
 * Nicht portiert: stundenEntfernen (delete_work_duty) - im Web ungenutzt.
 */

import { supabase } from "@/lib/supabase";
import { deutschZuIso, ergebnis, heuteInBerlin, oderWirf, type Ergebnis } from "@/lib/verwaltung/gemeinsam";

export interface DienstZeile {
  member_id: string;
  member_name: string;
  arten: string;
  required_hours: number;
  completed_hours: number;
  missing_hours: number;
  eintraege: number;
  betrag_cents: number;
  abgerechnet: boolean;
}

export interface SollZeile {
  id: string;
  name: string;
  soll_stunden: number | null;
  mitglieder: number;
}

/** Stundensatz, wenn in settings nichts steht - wie im Web. */
export const STANDARD_STUNDENSATZ = 1500;

/** Stand, Soll-Regeln und Stundensatz eines Jahres. Wirft bei Fehlern. */
export async function ladeArbeitsdienst(jahr: number) {
  const [stand, arten, satz] = await Promise.all([
    supabase.rpc("work_duty_overview", { p_year: jahr }),
    supabase.rpc("fee_type_overview", { p_year: jahr }),
    supabase.from("settings").select("value").eq("key", "work_duty.hourly_rate_cents").maybeSingle(),
  ]);

  const zeilen = (oderWirf(stand) ?? []) as unknown as DienstZeile[];
  const sollZeilen = ((oderWirf(arten) ?? []) as unknown as SollZeile[]).filter((a) => a.id);
  const wert = oderWirf(satz) as { value: unknown } | null;

  return {
    jahr,
    zeilen,
    arten: sollZeilen,
    stundensatzCents: Number(wert?.value ?? STANDARD_STUNDENSATZ),
  };
}

export type Arbeitsdienst = Awaited<ReturnType<typeof ladeArbeitsdienst>>;

/** "2,5" oder "2.5" -> 2.5; Unlesbares -> NaN. */
export function stundenAusText(text: string): number {
  const t = text.trim().replace(",", ".");
  if (t === "") return Number.NaN;
  return Number(t);
}

/**
 * Einen Einsatz eintragen. Das Datum darf deutsch (TT.MM.JJJJ) oder ISO
 * kommen - die App hat keinen Datumswaehler.
 */
export async function stundenEintragen(daten: {
  mitgliedId: string;
  stunden: number;
  amTag: string;
  beschreibung: string;
}): Promise<Ergebnis> {
  if (!daten.mitgliedId) return { ok: false, meldung: "Bitte zuerst ein Mitglied wählen." };
  if (!Number.isFinite(daten.stunden) || daten.stunden <= 0 || daten.stunden > 24) {
    return { ok: false, meldung: "Die Stundenzahl muss zwischen 0,25 und 24 liegen." };
  }
  const iso = deutschZuIso(daten.amTag);
  if (!iso) return { ok: false, meldung: "Bitte den Einsatztag als TT.MM.JJJJ angeben." };
  // Wie max={heute} am Datumsfeld im Web; die Datenbank prueft es noch einmal.
  if (iso > heuteInBerlin()) {
    return { ok: false, meldung: "Ein Einsatz in der Zukunft lässt sich nicht eintragen." };
  }

  const { error } = await supabase.rpc("record_work_duty", {
    p_member_id: daten.mitgliedId,
    p_hours: daten.stunden,
    p_worked_on: iso,
    p_description: daten.beschreibung.trim(),
  });

  return ergebnis(error, `${daten.stunden} Stunden eingetragen.`);
}

/** Soll-Stunden einer Beitragsart fuer ein Jahr. 0 heisst: kein Arbeitsdienst. */
export async function sollStundenSetzen(daten: {
  artId: string;
  jahr: number;
  stunden: number;
}): Promise<Ergebnis> {
  if (!Number.isFinite(daten.stunden) || daten.stunden < 0 || daten.stunden > 200) {
    return { ok: false, meldung: "Bitte eine Stundenzahl zwischen 0 und 200 angeben." };
  }

  const { error } = await supabase.rpc("upsert_work_duty_rule", {
    p_fee_type_id: daten.artId,
    p_year: daten.jahr,
    p_required_hours: daten.stunden,
  });

  return ergebnis(
    error,
    daten.stunden === 0
      ? "Diese Beitragsart leistet keinen Arbeitsdienst mehr."
      : `Soll auf ${daten.stunden} Stunden gesetzt.`,
  );
}

/**
 * Das Jahr abrechnen - die folgenreichste Aktion des Arbeitsdienstes: sie
 * friert Soll, Ist und Stundensatz ein und macht aus fehlenden Stunden Geld.
 * Danach laesst sich fuer dieses Jahr nichts mehr nachtragen.
 */
export async function jahrAbrechnen(jahr: number, faelligAm: string | null = null): Promise<Ergebnis> {
  const { data, error } = await supabase.rpc("work_duty_settle_year", {
    p_year: jahr,
    p_due_date: faelligAm ?? undefined,
  });

  if (error) return ergebnis(error, "");

  const z = data?.[0];
  const anzahl = z?.abgerechnet ?? 0;
  if (anzahl === 0) return { ok: true, meldung: "Es gab nichts abzurechnen." };

  const forderungen = z?.forderungen ?? 0;
  return {
    ok: true,
    meldung: `${anzahl} ${anzahl === 1 ? "Mitglied" : "Mitglieder"} abgerechnet, ${forderungen} ${
      forderungen === 1 ? "Forderung" : "Forderungen"
    } entstanden.`,
  };
}
