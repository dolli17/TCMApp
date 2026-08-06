"use server";

import { revalidatePath } from "next/cache";
import { translateDbError } from "@tcm/core";
import { createServerSupabase } from "@/lib/supabase/server";

export interface AktionsErgebnis {
  ok: boolean;
  meldung: string;
}

/** Alle Seiten, die ein geändertes Mitglied betreffen. */
function neuLaden(id: string) {
  revalidatePath(`/admin/mitglieder/${id}`);
  revalidatePath("/admin/mitglieder");
}

/**
 * Geänderte Stammdatenfelder speichern.
 *
 * Wie in EinstellungsGruppe: die Felder tragen die Präfixe `wert:` und `alt:`,
 * verglichen wird im Server Action, geschickt wird nur das Geänderte. Das hält
 * das Änderungsprotokoll frei von Einträgen, in denen nichts steht.
 */
export async function stammdatenSpeichern(formData: FormData): Promise<AktionsErgebnis> {
  const id = String(formData.get("mitglied") ?? "");
  if (!id) return { ok: false, meldung: "Kein Mitglied angegeben." };

  const patch: Record<string, string | boolean | null> = {};

  for (const [name, wert] of formData.entries()) {
    if (!name.startsWith("wert:")) continue;
    const feld = name.slice("wert:".length);
    const neu = String(wert);
    const alt = String(formData.get(`alt:${feld}`) ?? "");
    if (neu === alt) continue;
    patch[feld] = neu;
  }

  // Kontrollkästchen schicken nichts, wenn sie leer sind - der Vergleich oben
  // würde ein abgewähltes Trainer-Flag deshalb gar nicht bemerken.
  for (const [name] of formData.entries()) {
    if (!name.startsWith("schalter:")) continue;
    const feld = name.slice("schalter:".length);
    const neu = formData.get(`wert:${feld}`) === "on";
    const alt = formData.get(`alt:${feld}`) === "true";
    if (neu === alt) delete patch[feld];
    else patch[feld] = neu;
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, meldung: "Nichts geändert." };
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("update_member", {
    p_member_id: id,
    p_patch: patch,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  neuLaden(id);
  return { ok: true, meldung: "Gespeichert." };
}

/** Mitgliedschaftsdaten ändern (Nummer, Eintritt, Notiz). */
export async function mitgliedschaftSpeichern(formData: FormData): Promise<AktionsErgebnis> {
  const id = String(formData.get("mitglied") ?? "");
  const mitgliedschaft = String(formData.get("mitgliedschaft") ?? "");
  if (!mitgliedschaft) return { ok: false, meldung: "Keine Mitgliedschaft angegeben." };

  const patch: Record<string, string> = {};
  for (const [name, wert] of formData.entries()) {
    if (!name.startsWith("wert:")) continue;
    const feld = name.slice("wert:".length);
    const neu = String(wert);
    if (neu === String(formData.get(`alt:${feld}`) ?? "")) continue;
    patch[feld] = neu;
  }

  if (Object.keys(patch).length === 0) return { ok: false, meldung: "Nichts geändert." };

  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("update_membership", {
    p_membership_id: mitgliedschaft,
    p_patch: patch,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  neuLaden(id);
  return { ok: true, meldung: "Gespeichert." };
}

export async function rolleSetzen(
  id: string,
  rolle: "admin",
  erteilen: boolean,
): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("set_member_role", {
    p_member_id: id,
    p_role: rolle,
    p_granted: erteilen,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  neuLaden(id);
  return {
    ok: true,
    meldung: erteilen ? "Verwaltungsrechte erteilt." : "Verwaltungsrechte entzogen.",
  };
}

export async function zahlerSetzen(id: string, zahlerId: string | null): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();
  // Kein Zahler heißt: den Parameter weglassen. Die Datenbank setzt dann ihren
  // Standardwert null, was genau "zahlt selbst" bedeutet.
  const { error } = await supabase.rpc("set_billing_payer", {
    p_member_id: id,
    p_payer_id: zahlerId ?? undefined,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  neuLaden(id);
  return { ok: true, meldung: zahlerId ? "Zahler zugewiesen." : "Zahlt jetzt selbst." };
}

/**
 * Mitgliedschaft beenden.
 *
 * Die RPC liefert Kennzahlen zurück; daraus wird die Rückmeldung gebaut, statt
 * einen festen Satz zu zeigen. Der Vorstand soll sehen, was offen bleibt.
 */
export async function mitgliedschaftBeenden(formData: FormData): Promise<AktionsErgebnis> {
  const id = String(formData.get("mitglied") ?? "");
  const ende = String(formData.get("ende") ?? "");
  const grund = String(formData.get("grund") ?? "");

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("end_membership", {
    p_member_id: id,
    p_ended_on: ende || undefined,
    p_reason: grund || undefined,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  neuLaden(id);

  const z = data?.[0];
  const teile = ["Mitgliedschaft beendet."];
  if (z?.open_charges) {
    teile.push(
      `${z.open_charges} Forderungen über ${(z.open_amount_cents / 100).toLocaleString("de-DE", {
        style: "currency",
        currency: "EUR",
      })} bleiben offen.`,
    );
  }
  if (z?.future_bookings) {
    teile.push(`${z.future_bookings} künftige Buchungen bestehen weiter.`);
  }
  return { ok: true, meldung: teile.join(" ") };
}

export async function mitgliedschaftWiederaufnehmen(id: string): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("reactivate_membership", { p_member_id: id });

  if (error) return { ok: false, meldung: translateDbError(error) };

  neuLaden(id);
  return { ok: true, meldung: `Wieder aufgenommen unter der Nummer ${data}.` };
}

export async function mitgliedArchivieren(
  id: string,
  bestaetigt: boolean,
  grund: string,
): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("archive_member", {
    p_member_id: id,
    p_force: bestaetigt,
    p_reason: grund || undefined,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  neuLaden(id);

  const z = data?.[0];
  const teile = ["Mitglied archiviert."];
  if (z?.cancelled_bookings) teile.push(`${z.cancelled_bookings} künftige Buchungen abgesagt.`);
  if (z?.released_payees) teile.push(`${z.released_payees} Personen zahlen jetzt selbst.`);
  if (z?.open_charges) teile.push(`${z.open_charges} Forderungen bleiben bestehen.`);
  return { ok: true, meldung: teile.join(" ") };
}

export async function mitgliedAnonymisieren(id: string, grund: string): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("anonymize_member", {
    p_member_id: id,
    p_reason: grund || undefined,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  neuLaden(id);
  return { ok: true, meldung: "Mitglied anonymisiert. Die Buchhaltung bleibt vollständig." };
}

/**
 * Endgültig löschen.
 *
 * Der Nachname ist die Bestätigung – die Prüfung passiert in der Datenbank,
 * nicht hier, damit sie auch für jeden anderen Aufrufweg gilt.
 */
export async function mitgliedLoeschen(id: string, nachname: string): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("delete_member", {
    p_member_id: id,
    p_confirm_name: nachname,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  revalidatePath("/admin/mitglieder");
  return { ok: true, meldung: "Mitglied gelöscht." };
}

export async function beitragsartSetzen(
  id: string,
  feeTypeId: string,
  jahr: number,
  betragCent: number | null,
): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("set_member_fee", {
    p_member_id: id,
    p_fee_type_id: feeTypeId,
    p_year: jahr,
    p_override_amount_cents: betragCent ?? undefined,
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

export async function beitragsartEntfernen(
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
