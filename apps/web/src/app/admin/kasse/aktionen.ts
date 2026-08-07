"use server";

import { revalidatePath } from "next/cache";
import { translateDbError } from "@tcm/core";
import { createServerSupabase } from "@/lib/supabase/server";

export interface AktionsErgebnis {
  ok: boolean;
  meldung: string;
}

/**
 * Auf charges, fee_types und fee_prices gibt es nur `grant select` - auch für
 * Admins. Alles Schreibende läuft über SECURITY-DEFINER-RPCs, genau wie bei den
 * Plätzen und den Getränken.
 */

/**
 * Nach jeder Änderung auffrischen.
 *
 * /konto gehört dazu: eine erzeugte oder erlassene Forderung muss beim
 * Mitglied sofort ankommen, sonst sieht es einen Betrag, den es nicht mehr
 * schuldet.
 */
function frisch() {
  revalidatePath("/admin/kasse");
  revalidatePath("/admin/getraenke");
  revalidatePath("/konto");
}

// ---------------------------------------------------------------------------
// Beitragsarten und Preise
// ---------------------------------------------------------------------------

export async function beitragsartSpeichern(daten: {
  id: string | null;
  code: string;
  name: string;
  beschreibung: string;
}): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();

  const { error } = await supabase.rpc("upsert_fee_type", {
    // Beim Anlegen gibt es noch keine Id; die Funktion nimmt null als
    // "neu anlegen", der generierte Typ kennt aber nur string.
    p_id: daten.id as string,
    p_code: daten.code,
    p_name: daten.name,
    p_description: daten.beschreibung,
    p_sort_order: undefined,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  frisch();
  return { ok: true, meldung: daten.id ? "Beitragsart gespeichert." : "Beitragsart angelegt." };
}

export async function beitragspreisSetzen(daten: {
  artId: string;
  jahr: number;
  betragCents: number;
}): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();

  const { error } = await supabase.rpc("set_fee_price", {
    p_fee_type_id: daten.artId,
    p_valid_from_year: daten.jahr,
    p_amount_cents: daten.betragCents,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  frisch();
  return { ok: true, meldung: `Preis ab ${daten.jahr} gesetzt.` };
}

export async function beitragsartUmschalten(
  id: string,
  aktiv: boolean,
): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.rpc("set_fee_type_active", {
    p_id: id,
    p_active: aktiv,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  frisch();

  const betroffen = typeof data === "number" ? data : 0;
  if (!aktiv && betroffen > 0) {
    return {
      ok: true,
      meldung: `Beitragsart stillgelegt. ${betroffen} ${
        betroffen === 1 ? "Mitglied hat sie" : "Mitglieder haben sie"
      } dieses Jahr noch zugewiesen.`,
    };
  }
  return {
    ok: true,
    meldung: aktiv ? "Beitragsart ist wieder verfügbar." : "Beitragsart stillgelegt.",
  };
}

// ---------------------------------------------------------------------------
// Der Beitragslauf
// ---------------------------------------------------------------------------

export async function beitragslaufStarten(daten: {
  jahr: number;
  faelligAm: string | null;
}): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.rpc("fee_run_execute", {
    p_year: daten.jahr,
    p_due_date: daten.faelligAm ?? undefined,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  frisch();

  const z = data?.[0];
  const erzeugt = z?.erzeugt ?? 0;

  // Null erzeugte Forderungen ist kein Fehler, sondern der Normalfall beim
  // zweiten Klick. Die Meldung sagt das, statt schweigend Erfolg zu melden.
  if (erzeugt === 0) {
    return { ok: true, meldung: "Es gab nichts Neues zu erzeugen." };
  }

  return {
    ok: true,
    meldung: `${erzeugt} ${erzeugt === 1 ? "Forderung" : "Forderungen"} erzeugt${
      (z?.uebersprungen ?? 0) > 0 ? `, ${z!.uebersprungen} bestanden schon` : ""
    }.`,
  };
}

// ---------------------------------------------------------------------------
// Der Getränkemonat
// ---------------------------------------------------------------------------

export async function monatSchliessen(
  jahr: number,
  monat: number,
): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.rpc("close_billing_period", {
    p_year: jahr,
    p_month: monat,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  frisch();
  revalidatePath("/getraenke");

  const z = data?.[0];
  return {
    ok: true,
    meldung: `Monat geschlossen. ${z?.buchungen ?? 0} Entnahmen von ${
      z?.mitglieder ?? 0
    } Mitgliedern stehen jetzt fest.`,
  };
}

export async function monatAbrechnen(
  jahr: number,
  monat: number,
  faelligAm: string | null,
): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.rpc("charge_billing_period", {
    p_year: jahr,
    p_month: monat,
    p_due_date: faelligAm ?? undefined,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  frisch();

  const erzeugt = data?.[0]?.erzeugt ?? 0;
  if (erzeugt === 0) {
    return { ok: true, meldung: "Es gab nichts Neues zu erzeugen." };
  }
  return {
    ok: true,
    meldung: `${erzeugt} ${erzeugt === 1 ? "Forderung" : "Forderungen"} erzeugt.`,
  };
}

// ---------------------------------------------------------------------------
// Vorabankündigung
// ---------------------------------------------------------------------------

export async function forderungenAnkuendigen(daten: {
  faelligAm: string;
  art: "fee" | "drinks" | "deposit" | "work_duty" | "misc" | "guest" | null;
  zeitraum: string | null;
}): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.rpc("announce_charges", {
    p_due_date: daten.faelligAm,
    p_kind: daten.art ?? undefined,
    p_period_label: daten.zeitraum ?? undefined,
    p_charge_ids: undefined,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  frisch();

  const z = data?.[0];
  const anzahl = z?.angekuendigt ?? 0;

  if (anzahl === 0) {
    return { ok: true, meldung: "Es gab nichts anzukündigen." };
  }

  // Die Zahl der Empfänger steht bewusst daneben: sie ist kleiner als die der
  // Forderungen, sobald Familien dabei sind, und genau das soll der Vorstand
  // sehen — je Zahler geht eine Nachricht raus, nicht je Kind.
  return {
    ok: true,
    meldung: `${anzahl} ${anzahl === 1 ? "Forderung" : "Forderungen"} angekündigt, ${
      z?.empfaenger ?? 0
    } ${(z?.empfaenger ?? 0) === 1 ? "Zahler wurde" : "Zahler wurden"} benachrichtigt.`,
  };
}

// ---------------------------------------------------------------------------
// Forderungen einzeln
// ---------------------------------------------------------------------------

export async function forderungErlassen(
  id: string,
  grund: string,
): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();

  const { error } = await supabase.rpc("waive_charge", {
    p_charge_id: id,
    p_reason: grund,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  frisch();
  return { ok: true, meldung: "Die Forderung ist erlassen." };
}

export async function forderungAbhaken(
  id: string,
  vermerk: string,
): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();

  const { error } = await supabase.rpc("settle_charge_manually", {
    p_charge_id: id,
    p_note: vermerk === "" ? undefined : vermerk,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  frisch();
  return { ok: true, meldung: "Die Forderung ist als bezahlt vermerkt." };
}

export async function forderungAnlegen(daten: {
  mitgliedId: string;
  art: "fee" | "drinks" | "deposit" | "work_duty" | "misc" | "guest";
  betragCents: number;
  beschreibung: string;
  faelligAm: string | null;
}): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();

  const { error } = await supabase.rpc("create_manual_charge", {
    p_member_id: daten.mitgliedId,
    p_kind: daten.art,
    p_amount_cents: daten.betragCents,
    p_description: daten.beschreibung,
    p_period_label: undefined,
    p_due_date: daten.faelligAm ?? undefined,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  frisch();
  return { ok: true, meldung: "Die Forderung ist angelegt." };
}
