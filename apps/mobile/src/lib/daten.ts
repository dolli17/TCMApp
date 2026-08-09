/**
 * Datenzugriff der App
 *
 * Alle Schreibvorgaenge laufen ueber dieselben RPCs wie im Web. Die Regeln
 * stehen in der Datenbank, nicht hier - diese Schicht reicht nur durch und
 * uebersetzt Fehler in verstaendliche Saetze.
 */

import { memberProfileSchema, translateDbError } from "@tcm/core";
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

/**
 * Die Antwort ist immer dieselbe - auch im Fehlerfall. Wer hier erfaehrt, dass
 * es zu einer Adresse kein Konto gibt, kann die Mitgliederliste abfragen.
 * Dieselbe Entscheidung wie in apps/web/src/app/passwort-vergessen/page.tsx.
 */
export async function passwortLinkAnfordern(
  email: string,
  rueckleitung: string,
): Promise<Ergebnis> {
  await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: rueckleitung });
  return {
    ok: true,
    meldung: "Wenn es zu dieser Adresse ein Konto gibt, ist die E-Mail unterwegs.",
  };
}

export async function passwortSetzen(passwort: string): Promise<Ergebnis> {
  const { error } = await supabase.auth.updateUser({ password: passwort });
  if (error) return { ok: false, meldung: translateDbError(error) };
  return { ok: true, meldung: "Passwort gespeichert." };
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

/** Genau die Felder, die der Spalten-Grant auf members hergibt. */
export const STAMMDATENFELDER = [
  "first_name", "last_name", "title", "phone", "mobile", "street", "postcode", "city",
] as const;

export type Stammdaten = Record<(typeof STAMMDATENFELDER)[number], string>;

// Bewusst ein type und kein interface: nur Typaliase bekommen von TypeScript
// eine stillschweigende Index-Signatur, und das Formular nimmt seine Werte als
// Record<string, string> entgegen.
export type Notfallkontakt = {
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relation: string;
};

export async function ladeMeineStammdaten(): Promise<
  (Stammdaten & Notfallkontakt) | null
> {
  const { id } = await ladeIchSelbst();
  if (!id) return null;

  const { data, error } = await supabase
    .from("members")
    // Als ein Stueck: aus einer zusammengesetzten Zeichenkette kann der
    // Supabase-Client den Rueckgabetyp nicht mehr ableiten.
    .select("first_name, last_name, title, phone, mobile, street, postcode, city, emergency_contact_name, emergency_contact_phone, emergency_contact_relation")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(translateDbError(error));
  if (!data) return null;

  // Aus null wird der leere Text: das Formular arbeitet mit Zeichenketten,
  // und ein null im TextInput waere ein Absturz.
  const alsText = (w: unknown) => (w == null ? "" : String(w));
  return {
    first_name: alsText(data.first_name),
    last_name: alsText(data.last_name),
    title: alsText(data.title),
    phone: alsText(data.phone),
    mobile: alsText(data.mobile),
    street: alsText(data.street),
    postcode: alsText(data.postcode),
    city: alsText(data.city),
    emergency_contact_name: alsText(data.emergency_contact_name),
    emergency_contact_phone: alsText(data.emergency_contact_phone),
    emergency_contact_relation: alsText(data.emergency_contact_relation),
  };
}

/**
 * Eigene Stammdaten speichern.
 *
 * Ohne RPC, genau wie in apps/web/src/app/konto/aktionen.ts: die Policy
 * members_update_own, der Spalten-Grant und der Trigger guard_member_self_update
 * lassen genau diese Felder zu. Die Regel steht also weiter in der Datenbank,
 * nur als Rechteentscheid statt als Funktion.
 *
 * Es gehen ausschliesslich geaenderte Spalten hinaus. Der Trigger weist den
 * ganzen Vorgang ab, sobald eine Spalte dabei ist, die nicht auf seiner Liste
 * steht - ein vollstaendiger Datensatz wuerde also nie durchkommen.
 */
export async function speichereStammdaten(neu: Stammdaten, alt: Stammdaten): Promise<Ergebnis> {
  const { id } = await ladeIchSelbst();
  if (!id) return { ok: false, meldung: "Nicht angemeldet." };

  const geaendert = STAMMDATENFELDER.filter((f) => neu[f].trim() !== alt[f].trim());
  if (geaendert.length === 0) return { ok: false, meldung: "Nichts geändert." };

  // Erst pruefen, dann schicken: eine vierstellige Postleitzahl soll nicht als
  // Datenbankfehler zurueckkommen, sondern als Satz, der das Feld nennt.
  const geprueft = memberProfileSchema.safeParse({
    firstName: neu.first_name,
    lastName: neu.last_name,
    title: neu.title,
    phone: neu.phone,
    mobile: neu.mobile,
    street: neu.street,
    postcode: neu.postcode,
    city: neu.city,
  });

  if (!geprueft.success) {
    return { ok: false, meldung: geprueft.error.issues[0]?.message ?? "Bitte die Eingaben prüfen." };
  }

  const d = geprueft.data;

  // Vor- und Nachname sind NOT NULL und duerfen nie als null im Patch landen.
  const patch: {
    first_name?: string; last_name?: string;
    title?: string | null; phone?: string | null; mobile?: string | null;
    street?: string | null; postcode?: string | null; city?: string | null;
  } = {};

  const dabei = (f: (typeof STAMMDATENFELDER)[number]) => geaendert.includes(f);

  if (dabei("first_name")) patch.first_name = d.firstName;
  if (dabei("last_name")) patch.last_name = d.lastName;
  if (dabei("title")) patch.title = d.title || null;
  if (dabei("phone")) patch.phone = d.phone || null;
  if (dabei("mobile")) patch.mobile = d.mobile || null;
  if (dabei("street")) patch.street = d.street || null;
  if (dabei("postcode")) patch.postcode = d.postcode || null;
  if (dabei("city")) patch.city = d.city || null;

  const { error } = await supabase.from("members").update(patch).eq("id", id);
  if (error) return { ok: false, meldung: translateDbError(error) };
  return { ok: true, meldung: "Gespeichert." };
}

/**
 * Eigener Vorgang, weil die Felder nicht zu memberProfileSchema gehoeren - und
 * weil es ein eigener Gedanke ist: wen rufen wir an, wenn etwas passiert.
 */
export async function speichereNotfallkontakt(k: Notfallkontakt): Promise<Ergebnis> {
  const { id } = await ladeIchSelbst();
  if (!id) return { ok: false, meldung: "Nicht angemeldet." };

  const name = k.emergency_contact_name.trim();
  const telefon = k.emergency_contact_phone.trim();

  // Der Constraint in der Datenbank verlangt dasselbe; hier steht es nur
  // frueher und in einem Satz, der erklaert warum.
  if (telefon && !name) {
    return { ok: false, meldung: "Zur Notfallnummer gehört auch ein Name." };
  }

  const { error } = await supabase
    .from("members")
    .update({
      emergency_contact_name: name || null,
      emergency_contact_phone: telefon || null,
      emergency_contact_relation: k.emergency_contact_relation.trim() || null,
    })
    .eq("id", id);

  if (error) return { ok: false, meldung: translateDbError(error) };
  return { ok: true, meldung: "Notfallkontakt gespeichert." };
}

export async function ladeMeineMerkmale() {
  const { id } = await ladeIchSelbst();
  if (!id) return [];

  const { data, error } = await supabase.rpc("member_attributes", { p_member_id: id });
  if (error) throw new Error(translateDbError(error));
  return data ?? [];
}

export async function setzeMerkmal(
  code: string,
  optionWert?: string,
  textWert?: string,
): Promise<Ergebnis> {
  const { id } = await ladeIchSelbst();
  if (!id) return { ok: false, meldung: "Nicht angemeldet." };

  const { error } = await supabase.rpc("set_member_attribute", {
    p_member_id: id,
    p_type_code: code,
    p_option_value: optionWert ?? undefined,
    p_text_value: textWert ?? undefined,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };
  return { ok: true, meldung: "Gespeichert." };
}

export async function entferneMerkmal(code: string, optionWert?: string): Promise<Ergebnis> {
  const { id } = await ladeIchSelbst();
  if (!id) return { ok: false, meldung: "Nicht angemeldet." };

  const { error } = await supabase.rpc("remove_member_attribute", {
    p_member_id: id,
    p_type_code: code,
    p_option_value: optionWert ?? undefined,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };
  return { ok: true, meldung: "Entfernt." };
}

export async function storniereGetraenk(purchaseId: string): Promise<Ergebnis> {
  const { error } = await supabase.rpc("void_drink_purchase", {
    p_purchase_id: purchaseId,
    p_reason: "Fehlbuchung",
  });
  if (error) return { ok: false, meldung: translateDbError(error) };
  return { ok: true, meldung: "Zurückgenommen." };
}

/** Wie lange man eine Entnahme selbst zuruecknehmen darf, in Minuten. */
export async function ladeStornoFenster(): Promise<number> {
  const { data, error } = await supabase
    .from("settings")
    .select("key, value")
    .eq("key", "drinks.void_window_minutes")
    .maybeSingle();

  if (error || !data) return 15;
  return Number(data.value) || 15;
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

/**
 * Wie viele Benachrichtigungen sind ungelesen?
 *
 * Eigene Abfrage statt "Liste laden und zaehlen": der Zaehler steht auf der
 * Startseite, die Liste liegt einen Bildschirm weiter. Ueber den Teilindex
 * notifications_unread_idx kostet das praktisch nichts.
 */
export async function zaehleUngelesen(): Promise<number> {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  if (error) return 0;
  return count ?? 0;
}
