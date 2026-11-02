"use server";

import { revalidatePath } from "next/cache";
import { translateDbError } from "@tcm/core";
import { createServerSupabase, getCurrentMember } from "@/lib/supabase/server";
import type { AktionsErgebnis } from "../aktionen";

/**
 * Aktionen rund um die Mannschaft (Vereinsentscheidung vom 02.11.2026).
 *
 * Jede Aktion ist ein dünner Aufruf einer RPC: Wer was darf (MF nur in der
 * eigenen Mannschaft, MF tritt nicht selbst aus, Einladung verfällt nach 30
 * Tagen), entscheidet die Datenbank und meldet es mit deutschem Text.
 */

function neuLaden() {
  revalidatePath("/konto");
  revalidatePath("/konto/mannschaft");
  revalidatePath("/konto/tennis");
}

async function angemeldet(): Promise<boolean> {
  const a = await getCurrentMember();
  return Boolean(a?.member?.id);
}

const NICHT_ANGEMELDET: AktionsErgebnis = { ok: false, meldung: "Nicht angemeldet." };

export async function einladen(memberId: string): Promise<AktionsErgebnis> {
  if (!(await angemeldet())) return NICHT_ANGEMELDET;
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("mannschaft_einladen", { p_member_id: memberId });
  if (error) return { ok: false, meldung: translateDbError(error) };
  neuLaden();
  return { ok: true, meldung: "Eingeladen." };
}

export async function einladungZurueckziehen(invitationId: string): Promise<AktionsErgebnis> {
  if (!(await angemeldet())) return NICHT_ANGEMELDET;
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("mannschaft_einladung_zurueckziehen", { p_invitation_id: invitationId });
  if (error) return { ok: false, meldung: translateDbError(error) };
  neuLaden();
  return { ok: true, meldung: "Einladung zurückgezogen." };
}

export async function einladungBeantworten(
  invitationId: string,
  annehmen: boolean,
  telefonSichtbar: boolean,
): Promise<AktionsErgebnis> {
  if (!(await angemeldet())) return NICHT_ANGEMELDET;
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("mannschaft_einladung_beantworten", {
    p_invitation_id: invitationId,
    p_annehmen: annehmen,
    p_telefon_sichtbar: annehmen && telefonSichtbar,
  });
  if (error) return { ok: false, meldung: translateDbError(error) };
  neuLaden();
  return { ok: true, meldung: annehmen ? "Willkommen in der Mannschaft." : "Einladung abgelehnt." };
}

/** Der MF trägt einen Spieler aus, oder ein Spieler tritt selbst aus (eigene Id). */
export async function austragen(memberId: string): Promise<AktionsErgebnis> {
  const a = await getCurrentMember();
  const meineId = a?.member?.id;
  if (!meineId) return NICHT_ANGEMELDET;
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("mannschaft_austragen", { p_member_id: memberId });
  if (error) return { ok: false, meldung: translateDbError(error) };
  neuLaden();
  return { ok: true, meldung: memberId === meineId ? "Du bist ausgetreten." : "Ausgetragen." };
}

/**
 * Konto › Tennis: Darf der MF meine Nummer sehen? Kommt aus der
 * Stammdatenkarte; ein nicht angehaktes Kästchen schickt nichts mit.
 */
export async function telefonFreigabeSpeichern(formData: FormData): Promise<AktionsErgebnis> {
  if (!(await angemeldet())) return NICHT_ANGEMELDET;
  const neu = formData.get("wert:team_phone_visible") !== null;
  const alt = formData.get("alt:team_phone_visible") === "true";
  if (neu === alt) return { ok: false, meldung: "Nichts geändert." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("set_team_phone_visible", { p_visible: neu });
  if (error) return { ok: false, meldung: translateDbError(error) };
  neuLaden();
  return { ok: true, meldung: "Gespeichert." };
}
