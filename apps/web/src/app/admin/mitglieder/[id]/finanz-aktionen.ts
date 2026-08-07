"use server";

import { revalidatePath } from "next/cache";
import { translateDbError } from "@tcm/core";
import { createServerSupabase } from "@/lib/supabase/server";
import type { AktionsErgebnis } from "./aktionen";

/**
 * Bankverbindungen, SEPA-Mandate und Beitragsarten.
 *
 * Eigene Datei, weil das ein eigener Zuständigkeitsbereich ist: hier arbeitet
 * der Kassenwart, nicht die Mitgliederverwaltung. Und weil die IBAN das
 * sensibelste Datum im System ist – sie geht durch genau diese eine Funktion.
 */

function neuLaden(id: string) {
  revalidatePath(`/admin/mitglieder/${id}`);
  revalidatePath("/admin/kasse");
}

export async function bankverbindungAnlegen(formData: FormData): Promise<AktionsErgebnis> {
  const id = String(formData.get("mitglied") ?? "");
  const iban = String(formData.get("iban") ?? "");
  const inhaber = String(formData.get("holder") ?? "");
  const bank = String(formData.get("bank_name") ?? "");

  if (!iban.trim()) return { ok: false, meldung: "Bitte eine IBAN eingeben." };

  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("add_bank_account", {
    p_member_id: id,
    p_iban: iban,
    p_holder: inhaber || undefined,
    p_bank_name: bank || undefined,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  neuLaden(id);
  return { ok: true, meldung: "Bankverbindung gespeichert." };
}

export async function bankverbindungStilllegen(
  id: string,
  kontoId: string,
): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("deactivate_bank_account", {
    p_bank_account_id: kontoId,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  neuLaden(id);
  return { ok: true, meldung: "Bankverbindung stillgelegt." };
}

export async function mandatErteilen(formData: FormData): Promise<AktionsErgebnis> {
  const id = String(formData.get("mitglied") ?? "");
  const kontoId = String(formData.get("konto") ?? "");
  const referenz = String(formData.get("reference") ?? "");
  const unterschrieben = String(formData.get("signed_on") ?? "");
  const umfang = String(formData.get("scope") ?? "fees_only") as "fees_only" | "all_payments";

  if (!kontoId) return { ok: false, meldung: "Bitte eine Bankverbindung wählen." };

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("create_sepa_mandate", {
    p_member_id: id,
    p_bank_account_id: kontoId,
    p_reference: referenz || undefined,
    p_signed_on: unterschrieben || undefined,
    p_scope: umfang,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  neuLaden(id);
  return { ok: true, meldung: `Mandat ${data} erteilt.` };
}

export async function mandatWiderrufen(id: string, mandatId: string): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("revoke_sepa_mandate", { p_mandate_id: mandatId });

  if (error) return { ok: false, meldung: translateDbError(error) };

  neuLaden(id);
  return { ok: true, meldung: "Mandat widerrufen." };
}

export async function beitragsartZuordnen(formData: FormData): Promise<AktionsErgebnis> {
  const id = String(formData.get("mitglied") ?? "");
  const feeTypeId = String(formData.get("fee_type") ?? "");
  const jahr = Number(formData.get("jahr")) || new Date().getFullYear();
  const betrag = String(formData.get("override") ?? "").trim();
  const notiz = String(formData.get("note") ?? "").trim();

  if (!feeTypeId) return { ok: false, meldung: "Bitte eine Beitragsart wählen." };

  // Der Sonderbetrag kommt als "19,00" oder "19.00" aus dem Formular und muss
  // als Cent in die Datenbank – gerechnet wird überall in ganzen Cent.
  let cents: number | undefined;
  if (betrag) {
    const zahl = Number(betrag.replace(",", "."));
    if (!Number.isFinite(zahl) || zahl < 0) {
      return { ok: false, meldung: "Der Sonderbetrag ist keine gültige Zahl." };
    }
    cents = Math.round(zahl * 100);
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("set_member_fee", {
    p_member_id: id,
    p_fee_type_id: feeTypeId,
    p_year: jahr,
    p_override_amount_cents: cents,
    p_note: notiz || undefined,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  neuLaden(id);
  return {
    ok: true,
    meldung: data?.[0]?.already_charged
      ? `Zugeordnet. Für ${jahr} wurde der Beitrag bereits berechnet – die bestehende Forderung ändert sich dadurch nicht.`
      : "Beitragsart zugeordnet.",
  };
}

export async function beitragsartLoesen(
  id: string,
  feeTypeId: string,
  jahr: number,
): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("remove_member_fee", {
    p_member_id: id,
    p_fee_type_id: feeTypeId,
    p_year: jahr,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  neuLaden(id);
  return { ok: true, meldung: "Beitragsart entfernt." };
}
