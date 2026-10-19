"use server";

import { revalidatePath } from "next/cache";
import { translateDbError, type EventSpeichernDaten } from "@tcm/core";
import { createServerSupabase } from "@/lib/supabase/server";

export interface AktionsErgebnis {
  ok: boolean;
  meldung: string;
}

/** Jede Korrektur kann eine Forderung oder Stunden aendern: Kasse und Konto mit. */
function frisch(id?: string) {
  revalidatePath("/admin/veranstaltungen");
  if (id) revalidatePath(`/admin/veranstaltungen/${id}`);
  revalidatePath("/admin/kasse");
  revalidatePath("/admin/arbeitsdienst");
  revalidatePath("/admin");
  revalidatePath("/konto");
}

/**
 * Anlegen oder speichern. Die Regeln prüft die Datenbank (event_speichern):
 * etwa keine Gebühr ändern nach dem Anmeldeschluss, keine Plätze unter die
 * Belegung.
 */
export async function veranstaltungSpeichern(
  id: string | null,
  daten: EventSpeichernDaten,
  veroeffentlichen: boolean,
): Promise<AktionsErgebnis & { id?: string }> {
  const supabase = await createServerSupabase();
  // Leere Felder gehen als null: die Funktion nimmt null als "ohne", der
  // generierte Typ kennt nur string bzw. number (wie bei upsert_fee_type).
  const { data, error } = await supabase.rpc("event_speichern", {
    p_id: id as string,
    p_kind: daten.kind,
    p_title: daten.title,
    p_description: daten.description as string,
    p_location: daten.location as string,
    p_starts_at: daten.startsAt,
    p_ends_at: daten.endsAt as string,
    p_registration_enabled: daten.registrationEnabled,
    p_registration_deadline: daten.registrationDeadline as string,
    p_max_participants: daten.maxParticipants as number,
    p_companions_allowed: daten.companionsAllowed,
    p_fee_cents: daten.feeCents as number,
    p_work_hours: daten.workHours as number,
    p_veroeffentlichen: veroeffentlichen,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  frisch(data ?? undefined);
  return {
    ok: true,
    id: data ?? undefined,
    meldung: veroeffentlichen ? "Die Veranstaltung ist veröffentlicht." : "Gespeichert.",
  };
}

export async function veranstaltungVeroeffentlichen(id: string): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("event_veroeffentlichen", { p_id: id });
  if (error) return { ok: false, meldung: translateDbError(error) };
  frisch(id);
  return { ok: true, meldung: "Die Veranstaltung ist veröffentlicht." };
}

export async function veranstaltungAbsagen(id: string): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("event_absagen", { p_id: id });
  if (error) return { ok: false, meldung: translateDbError(error) };
  frisch(id);

  const z = data?.[0];
  const weg = z?.geloescht ?? 0;
  const rest = z?.verbleibend ?? 0;
  return {
    ok: true,
    meldung: `Abgesagt. ${weg === 1 ? "Eine Forderung ist" : `${weg} Forderungen sind`} gelöscht.${
      rest > 0
        ? ` ${rest === 1 ? "Eine steckt" : `${rest} stecken`} schon in einem Einzug – bitte in der Kasse erstatten oder erlassen.`
        : ""
    }`,
  };
}

export async function veranstaltungLoeschen(id: string): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("event_loeschen", { p_id: id });
  if (error) return { ok: false, meldung: translateDbError(error) };
  frisch();
  return { ok: true, meldung: "Der Entwurf ist gelöscht." };
}

export async function teilnehmerHinzufuegen(daten: {
  eventId: string;
  mitgliedId: string;
  begleitpersonen: number;
  bemerkung: string;
}): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("event_admin_anmelden", {
    p_event_id: daten.eventId,
    p_member_id: daten.mitgliedId,
    p_companions: daten.begleitpersonen,
    p_note: daten.bemerkung,
  });
  if (error) return { ok: false, meldung: translateDbError(error) };
  frisch(daten.eventId);
  return { ok: true, meldung: "Angemeldet." };
}

export async function teilnahmeAendern(daten: {
  eventId: string;
  anmeldungId: string;
  begleitpersonen: number;
  bemerkung: string;
}): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("event_admin_aendern", {
    p_registration_id: daten.anmeldungId,
    p_companions: daten.begleitpersonen,
    p_note: daten.bemerkung,
  });
  if (error) return { ok: false, meldung: translateDbError(error) };
  frisch(daten.eventId);
  return { ok: true, meldung: "Geändert." };
}

export async function teilnahmeAbmelden(eventId: string, anmeldungId: string): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("event_admin_abmelden", { p_registration_id: anmeldungId });
  if (error) return { ok: false, meldung: translateDbError(error) };
  frisch(eventId);
  return { ok: true, meldung: "Abgemeldet." };
}

export async function anwesenheitSetzen(
  eventId: string, anmeldungId: string, anwesend: boolean,
): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("event_anwesenheit_setzen", {
    p_registration_id: anmeldungId,
    p_attended: anwesend,
  });
  if (error) return { ok: false, meldung: translateDbError(error) };
  frisch(eventId);
  return { ok: true, meldung: anwesend ? "Als anwesend vermerkt." : "Nicht mehr als anwesend vermerkt." };
}

export async function stundenGutschreiben(eventId: string): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("event_stunden_gutschreiben", { p_event_id: eventId });
  if (error) return { ok: false, meldung: translateDbError(error) };
  frisch(eventId);

  const z = data?.[0];
  const neu = z?.gutgeschrieben ?? 0;
  const ueber = z?.uebersprungen ?? 0;
  return {
    ok: true,
    meldung: `${neu === 1 ? "Einem Mitglied" : `${neu} Mitgliedern`} sind die Stunden gutgeschrieben.${
      ueber > 0 ? ` ${ueber} hatten sie schon oder ihr Jahr ist abgerechnet.` : ""
    }`,
  };
}
