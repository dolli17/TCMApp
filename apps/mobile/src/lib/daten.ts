/**
 * Datenzugriff der App
 *
 * Alle Schreibvorgaenge laufen ueber dieselben RPCs wie im Web. Die Regeln
 * stehen in der Datenbank, nicht hier - diese Schicht reicht nur durch und
 * uebersetzt Fehler in verstaendliche Saetze.
 */

import { translateDbError } from "@tcm/core";
import { supabase } from "./supabase";

export interface Ergebnis<T = void> {
  ok: boolean;
  meldung: string;
  daten?: T;
}

export async function anmelden(email: string, passwort: string): Promise<Ergebnis> {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password: passwort,
  });

  // Die Meldung nennt bewusst nicht, ob es die Adresse gibt - sonst liesse
  // sich damit herausfinden, wer im Verein ist.
  if (error) return { ok: false, meldung: "E-Mail-Adresse oder Passwort stimmt nicht." };
  return { ok: true, meldung: "" };
}

export async function abmelden(): Promise<void> {
  await supabase.auth.signOut();
}

export async function ladeTagesplan(datum: string) {
  const { data, error } = await supabase.rpc("day_schedule", { p_date: datum });
  if (error) throw new Error(translateDbError(error));
  return data ?? [];
}

export async function ladePlaetze() {
  const { data, error } = await supabase
    .from("courts")
    .select("id, name, short_name")
    .eq("active", true)
    .order("position");
  if (error) throw new Error(translateDbError(error));
  return data ?? [];
}

export async function ladeKontingent() {
  const { data, error } = await supabase.rpc("my_booking_quota");
  if (error) throw new Error(translateDbError(error));
  return data?.[0] ?? { used: 0, allowed: 0 };
}

export async function ladeGetraenkekarte() {
  const { data, error } = await supabase.rpc("drink_menu");
  if (error) throw new Error(translateDbError(error));
  return data ?? [];
}

export async function ladeEigeneGetraenke() {
  const { data, error } = await supabase.rpc("my_drink_purchases");
  if (error) throw new Error(translateDbError(error));
  return data ?? [];
}

export async function bucheGetraenk(itemId: string, menge = 1): Promise<Ergebnis> {
  const { error } = await supabase.rpc("record_drink_purchase", {
    p_item_id: itemId,
    p_quantity: menge,
  });
  if (error) return { ok: false, meldung: translateDbError(error) };
  return { ok: true, meldung: "Gebucht." };
}

export async function bucheplatz(
  courtId: string,
  startsAt: Date,
  typ: string,
  mitspieler: string[],
  gaeste: string[] = [],
): Promise<Ergebnis<string>> {
  const { data, error } = await supabase.rpc("create_booking", {
    p_court_id: courtId,
    p_starts_at: startsAt.toISOString(),
    p_booking_type_code: typ,
    p_player_member_ids: mitspieler,
    p_guest_names: gaeste,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };
  return { ok: true, meldung: "Platz gebucht.", daten: data as string };
}

/**
 * Tauscht die Mitspieler einer bestehenden Buchung komplett aus. Dieselbe RPC
 * wie im Web - die Regeln stehen in der Datenbank, nicht doppelt in zwei Apps.
 */
export async function aendereMitspieler(
  bookingId: string,
  mitgliedIds: string[],
  gaeste: string[] = [],
): Promise<Ergebnis> {
  const { error } = await supabase.rpc("update_booking_players", {
    p_booking_id: bookingId,
    p_member_ids: mitgliedIds,
    p_guest_names: gaeste.map((g) => g.trim()).filter((g) => g.length > 0),
  });
  if (error) return { ok: false, meldung: translateDbError(error) };
  return { ok: true, meldung: "Mitspieler aktualisiert." };
}

export async function ladeBuchungseinstellungen() {
  const { data, error } = await supabase.rpc("booking_settings");
  if (error) throw new Error(translateDbError(error));
  return data?.[0] ?? null;
}

export async function ladeBuchungsarten() {
  const { data, error } = await supabase
    .from("booking_types")
    .select("code, name, duration_minutes, requires_partner, min_players, max_players")
    .eq("active", true)
    .eq("applies_to", "booking")
    .order("sort_order");
  if (error) throw new Error(translateDbError(error));
  return data ?? [];
}

/** Rollen des angemeldeten Mitglieds. Es gibt nur noch Admin und Mitglied. */
export async function istAdmin(): Promise<boolean> {
  const { data: sitzung } = await supabase.auth.getUser();
  const authId = sitzung.user?.id;
  if (!authId) return false;

  const { data: mitglied } = await supabase
    .from("members")
    .select("id")
    .eq("auth_user_id", authId)
    .maybeSingle();
  if (!mitglied) return false;

  const { data: rollen } = await supabase
    .from("member_roles")
    .select("role")
    .eq("member_id", mitglied.id);

  return (rollen ?? []).some((r) => r.role === "admin");
}

export async function storniereBuchung(bookingId: string): Promise<Ergebnis> {
  const { error } = await supabase.rpc("cancel_booking", { p_booking_id: bookingId });
  if (error) return { ok: false, meldung: translateDbError(error) };
  return { ok: true, meldung: "Buchung storniert." };
}

export async function ladeVerzeichnis(suche = "") {
  const { data, error } = await supabase.rpc("member_directory", { p_query: suche });
  if (error) throw new Error(translateDbError(error));
  return data ?? [];
}

export async function ladeMeineForderungen() {
  const { data, error } = await supabase.rpc("my_charges");
  if (error) throw new Error(translateDbError(error));
  return data ?? [];
}

export async function ladeArbeitsdienst() {
  const { data, error } = await supabase.rpc("my_work_duty", {});
  if (error) throw new Error(translateDbError(error));
  return data?.[0] ?? null;
}
