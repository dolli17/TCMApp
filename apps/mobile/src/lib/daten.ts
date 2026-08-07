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
  sucheMitspieler = false,
): Promise<Ergebnis<string>> {
  const { data, error } = await supabase.rpc("create_booking", {
    p_court_id: courtId,
    p_starts_at: startsAt.toISOString(),
    p_booking_type_code: typ,
    p_player_member_ids: mitspieler,
    p_guest_names: gaeste,
    p_partner_wanted: sucheMitspieler,
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

/**
 * Wer ist angemeldet, und ist er Admin?
 *
 * Beides in einem Zug, weil der Plan beides braucht: die Rolle fuers Verwalten
 * fremder Buchungen, die Id, um den Bucher aus der Mitspielerauswahl zu
 * streichen. Es gibt nur noch Admin und Mitglied.
 */
export async function ladeIchSelbst(): Promise<{ id: string | null; admin: boolean }> {
  const leer = { id: null, admin: false };

  const { data: sitzung } = await supabase.auth.getUser();
  const authId = sitzung.user?.id;
  if (!authId) return leer;

  const { data: mitglied } = await supabase
    .from("members")
    .select("id")
    .eq("auth_user_id", authId)
    .maybeSingle();
  if (!mitglied) return leer;

  const { data: rollen } = await supabase
    .from("member_roles")
    .select("role")
    .eq("member_id", mitglied.id);

  return { id: mitglied.id, admin: (rollen ?? []).some((r) => r.role === "admin") };
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

/** Kuenftige Termine: eigene Buchungen und die, in denen man Mitspieler ist. */
export async function ladeMeineBuchungen() {
  const { data, error } = await supabase.rpc("my_bookings", {});
  if (error) throw new Error(translateDbError(error));
  return data ?? [];
}

/**
 * Sich selbst aus einer fremden Buchung austragen.
 *
 * Nicht ueber update_booking_players - die gehoert dem Bucher. leave_booking
 * prueft zusaetzlich, ob danach noch genug Spieler uebrig sind.
 */
export async function verlasseBuchung(bookingId: string): Promise<Ergebnis> {
  const { error } = await supabase.rpc("leave_booking", { p_booking_id: bookingId });
  if (error) return { ok: false, meldung: translateDbError(error) };
  return { ok: true, meldung: "Du bist ausgetragen." };
}

export async function ladeBenachrichtigungen(limit = 30) {
  const { data, error } = await supabase.rpc("my_notifications", { p_limit: limit });
  if (error) throw new Error(translateDbError(error));
  return data ?? [];
}

/** Ohne Liste alles - die Ansicht markiert beim Oeffnen den ganzen Stapel. */
export async function markiereBenachrichtigungenGelesen(): Promise<number> {
  const { data, error } = await supabase.rpc("mark_notifications_read", {});
  if (error) throw new Error(translateDbError(error));
  return data ?? 0;
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

/** Alle Buchungen der naechsten Tage, die noch Mitspieler suchen. */
export async function ladeOffeneSpiele() {
  const { data, error } = await supabase.rpc("open_matches", {});
  if (error) throw new Error(translateDbError(error));
  return data ?? [];
}

/**
 * Einer offenen Buchung beitreten.
 *
 * Nicht ueber aendereMitspieler: die gehoert dem Bucher. join_booking traegt
 * nur den Aufrufer ein - und nur, wenn die Buchung ausgeschrieben ist.
 */
export async function spieleMit(bookingId: string): Promise<Ergebnis> {
  const { error } = await supabase.rpc("join_booking", { p_booking_id: bookingId });
  if (error) return { ok: false, meldung: translateDbError(error) };
  return { ok: true, meldung: "Du bist eingetragen. Viel Spaß!" };
}

/** Die eigene Buchung fuer andere oeffnen oder wieder schliessen. */
export async function sucheMitspieler(bookingId: string, gesucht: boolean): Promise<Ergebnis> {
  const { error } = await supabase.rpc("set_partner_wanted", {
    p_booking_id: bookingId,
    p_wanted: gesucht,
  });
  if (error) return { ok: false, meldung: translateDbError(error) };
  return {
    ok: true,
    meldung: gesucht
      ? "Die Buchung steht jetzt bei den offenen Spielen."
      : "Die Buchung ist nicht mehr ausgeschrieben.",
  };
}
