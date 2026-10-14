"use server";

import { revalidatePath } from "next/cache";
import { rollenLabel, translateDbError, type AppRole } from "@tcm/core";
import { memberLogin } from "@/lib/supabase/member-login";
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

  // Die E-Mail ist zugleich die Anmeldung. Sie geht über die Edge Function,
  // die Mitglied und Login gemeinsam ändert – zuerst, damit bei einem Fehler
  // gar nichts gespeichert ist und die Meldung eindeutig bleibt.
  if (typeof patch.email === "string") {
    const e = await memberLogin({ aktion: "email_aendern", memberId: id, email: patch.email });
    if (!e.ok) return { ok: false, meldung: e.meldung };
    delete patch.email;
  }

  if (Object.keys(patch).length > 0) {
    const supabase = await createServerSupabase();
    const { error } = await supabase.rpc("update_member", {
      p_member_id: id,
      p_patch: patch,
    });

    if (error) {
      neuLaden(id);
      return { ok: false, meldung: translateDbError(error) };
    }
  }

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
  rolle: AppRole,
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
  const label = rollenLabel(rolle);
  return { ok: true, meldung: erteilen ? `${label} vergeben.` : `${label} entzogen.` };
}

/** Trainer ist eine Eigenschaft am Mitglied, keine Rolle in member_roles. */
export async function trainerSetzen(id: string, trainer: boolean): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("update_member", {
    p_member_id: id,
    p_patch: { is_trainer: trainer },
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  neuLaden(id);
  return { ok: true, meldung: trainer ? "Trainer vergeben." : "Trainer entzogen." };
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
  if (z?.open_charges) teile.push(`${z.open_charges} Forderungen bleiben bestehen.`);
  return { ok: true, meldung: teile.join(" ") };
}

/**
 * Anonymisieren. Läuft über die Edge Function, damit der Login mitgeht –
 * ein anonymisiertes Mitglied soll sich nicht mehr anmelden können.
 */
export async function mitgliedAnonymisieren(id: string, grund: string): Promise<AktionsErgebnis> {
  const e = await memberLogin({ aktion: "loeschen", art: "anonymisieren", memberId: id, grund });

  neuLaden(id);
  return { ok: e.ok, meldung: e.meldung };
}

/**
 * Endgültig löschen, samt Login.
 *
 * Der Nachname ist die Bestätigung – die Prüfung passiert in der Datenbank,
 * nicht hier, damit sie auch für jeden anderen Aufrufweg gilt.
 */
export async function mitgliedLoeschen(id: string, nachname: string): Promise<AktionsErgebnis> {
  const e = await memberLogin({ aktion: "loeschen", art: "loeschen", memberId: id, nachname });

  revalidatePath("/admin/mitglieder");
  return { ok: e.ok, meldung: e.meldung };
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

/**
 * Mannschaft und Mannschaftsführer-Kennzeichen in einem Zug. Keine Mannschaft
 * heißt: den Parameter weglassen, die Datenbank trägt dann aus.
 */
export async function mannschaftSetzen(
  id: string,
  mannschaftId: string | null,
  mannschaftsfuehrer: boolean,
): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("set_member_team", {
    p_member_id: id,
    p_team_id: mannschaftId ?? undefined,
    p_is_captain: mannschaftId ? mannschaftsfuehrer : false,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  neuLaden(id);
  revalidatePath("/admin/mitglieder/mannschaften");
  revalidatePath("/konto");
  return {
    ok: true,
    meldung: !mannschaftId
      ? "Spielt in keiner Mannschaft."
      : mannschaftsfuehrer
        ? "Als Mannschaftsführer eingetragen."
        : "Mannschaft gespeichert.",
  };
}
