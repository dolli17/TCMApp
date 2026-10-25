/**
 * Datenzugriff der App
 *
 * Alle Schreibvorgaenge laufen ueber dieselben RPCs wie im Web. Die Regeln
 * stehen in der Datenbank, nicht hier - diese Schicht reicht nur durch und
 * uebersetzt Fehler in verstaendliche Saetze.
 */

import {
  berlinTime, hatPlatzRechte, hatVolleRechte, isValidIban, kontoloeschungMeldung, kontoloeschungPruefen,
  memberProfileSchema, translateDbError, zugangsGrund,
  type Database, type EventKind, type EventRegistrationStatus, type EventStatus, type MitgliedEvent,
  type OnboardingSchrittKey, type OnboardingZustand, type ZugangsGrund,
} from "@tcm/core";
import { leereKorb } from "./getraenkekorb";
import { supabase } from "./supabase";
import { deutschZuIso, heuteInBerlin } from "./verwaltung/gemeinsam";

export interface Ergebnis<T = void> {
  ok: boolean;
  meldung: string;
  daten?: T;
  /** Bei Pruefungsfehlern: welches Feld gemeint ist, damit das Formular es markiert. */
  feld?: string;
}

/** Feldnamen von memberProfileSchema (camelCase) auf die Spalten der Formulare. */
const PROFILFELD: Record<string, string> = {
  firstName: "first_name", lastName: "last_name", title: "title", phone: "phone",
  mobile: "mobile", street: "street", postcode: "postcode", city: "city",
};

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
  leereKorb();
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
 * Wer ist angemeldet, und welche Rechte hat er?
 *
 * Alles in einem Zug, weil der Plan es zusammen braucht: die Rechte fuers
 * Verwalten fremder Buchungen, die Id, um den Bucher aus der Mitspielerauswahl
 * zu streichen. admin heisst volle Rechte (App Admin oder Vorstand),
 * platzRechte haben zusaetzlich die Platzwarte (Sperren, Serien, fremde
 * Buchungen).
 */
export async function ladeIchSelbst(): Promise<{
  id: string | null;
  admin: boolean;
  platzRechte: boolean;
}> {
  const leer = { id: null, admin: false, platzRechte: false };

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

  const r = (rollen ?? []).map((x) => x.role);
  return {
    id: mitglied.id,
    admin: hatVolleRechte(r),
    platzRechte: hatPlatzRechte(r),
  };
}

/**
 * Hat das Konto noch Zugang, und ist das Onboarding offen? (mein_zugang, B22)
 *
 * Das entscheidet die Weiche (app/index.tsx) und der Schutz der Tabs: ohne
 * Zugang geht es nach /kein-zugang, mit offenem Onboarding nach /onboarding.
 * Ohne Mitglied (Kiosk) hat das Konto Zugang und kein Onboarding - die
 * Datenbank sperrt ohnehin selbst.
 */
export async function ladeZugang(): Promise<{
  zugang: boolean;
  grund: ZugangsGrund | null;
  onboardingOffen: boolean;
}> {
  const { data, error } = await supabase.rpc("mein_zugang");
  if (error) throw new Error(translateDbError(error));
  const z = data?.[0];
  if (!z) return { zugang: true, grund: null, onboardingOffen: false };
  return {
    zugang: z.zugang,
    grund: z.zugang ? null : zugangsGrund(z.grund),
    onboardingOffen: z.onboarding_offen,
  };
}

/** Die Kategorien einer Sperrung: aktive Buchungsarten mit applies_to = 'blocking'. */
export async function ladeBlockungsarten() {
  const { data, error } = await supabase
    .from("booking_types")
    .select("code, name")
    .eq("active", true)
    .eq("applies_to", "blocking")
    .order("sort_order");
  if (error) throw new Error(translateDbError(error));
  return data ?? [];
}

/** "3 Buchungen liegen in diesem Zeitraum ..." - die Zahl fuer die Rueckfrage. */
function kollisionenAus(meldung: string): number | undefined {
  const treffer = /^(\d+) Buchungen liegen/.exec(meldung);
  return treffer ? Number(treffer[1]) : undefined;
}

/**
 * Eine Stunde auf einem Platz sperren (nur mit Platzrechten).
 *
 * Dieselbe RPC und dieselben Werte wie stundeSperren im Web. Liegen dort
 * Buchungen, weist die Datenbank ab und nennt die Zahl; mit verdraengen=true
 * werden sie abgesagt. Der Grund ist freiwillig, die Kategorie nicht.
 */
export async function sperreStunde(daten: {
  platzId: string;
  von: Date;
  bis: Date;
  typCode: string;
  grund: string;
  verdraengen: boolean;
}): Promise<Ergebnis & { kollisionen?: number }> {
  const { error } = await supabase.rpc("create_blocking", {
    p_court_ids: [daten.platzId],
    p_von: daten.von.toISOString(),
    p_bis: daten.bis.toISOString(),
    p_type_code: daten.typCode,
    p_title: daten.grund.trim(),
    p_force: daten.verdraengen,
  });

  if (error) return { ok: false, meldung: translateDbError(error), kollisionen: kollisionenAus(error.message) };
  return { ok: true, meldung: "Gesperrt." };
}

/**
 * Eine Sperrung aendern: Zeit, Plaetze, Kategorie und Grund (update_blocking).
 *
 * Wie beim Sperren zweistufig: liegen am neuen Ort Buchungen, kommt die Zahl
 * zurueck, und erst mit verdraengen=true werden sie abgesagt. Fuer jeden
 * weiteren Platz legt die Datenbank eine eigene Sperrung an.
 */
export async function aendereSperre(daten: {
  bookingId: string;
  platzIds: string[];
  von: Date;
  bis: Date;
  typCode: string;
  grund: string;
  verdraengen: boolean;
}): Promise<Ergebnis & { kollisionen?: number }> {
  const { data, error } = await supabase.rpc("update_blocking", {
    p_booking_id: daten.bookingId,
    p_court_ids: daten.platzIds,
    p_von: daten.von.toISOString(),
    p_bis: daten.bis.toISOString(),
    p_type_code: daten.typCode,
    p_title: daten.grund.trim(),
    p_force: daten.verdraengen,
  });

  if (error) return { ok: false, meldung: translateDbError(error), kollisionen: kollisionenAus(error.message) };
  const verdraengt = data?.[0]?.displaced_count ?? 0;
  return {
    ok: true,
    meldung: verdraengt > 0
      ? `Sperrung geändert, ${verdraengt} ${verdraengt === 1 ? "Buchung" : "Buchungen"} verdrängt.`
      : "Sperrung geändert.",
  };
}

/** Eine Sperrung aufheben - dieselbe RPC wie das Stornieren, eigene Meldung. */
export async function hebeSperreAuf(bookingId: string): Promise<Ergebnis> {
  const { error } = await supabase.rpc("cancel_booking", { p_booking_id: bookingId });
  if (error) return { ok: false, meldung: translateDbError(error) };
  return { ok: true, meldung: "Die Sperrung ist aufgehoben." };
}

/**
 * Eine Buchung stornieren, wahlweise mit Grund - wie stornieren im Web.
 *
 * Der Grund landet in der Nachricht an die Betroffenen. Bei einer fremden
 * Buchung verlangt ihn die Oberflaeche, die Datenbank nicht.
 */
export async function storniereBuchung(bookingId: string, grund?: string): Promise<Ergebnis> {
  const { error } = await supabase.rpc("cancel_booking", {
    p_booking_id: bookingId,
    p_reason: grund?.trim() || undefined,
  });
  if (error) return { ok: false, meldung: translateDbError(error) };
  return { ok: true, meldung: "Buchung storniert." };
}

/**
 * Ein einzelner Serientermin faellt aus - wie serienterminAbsagen im Web.
 *
 * Nicht ueber storniereBuchung: cancel_series_occurrence verlangt, dass der
 * Termin wirklich zu einer Serie gehoert. Die Serie selbst bleibt stehen.
 */
export async function sageSerienterminAb(bookingId: string, grund?: string): Promise<Ergebnis> {
  const { error } = await supabase.rpc("cancel_series_occurrence", {
    p_booking_id: bookingId,
    p_reason: grund?.trim() || undefined,
  });
  if (error) return { ok: false, meldung: translateDbError(error) };
  return { ok: true, meldung: "Der Termin ist abgesagt." };
}

/**
 * Eine Buchung auf einen anderen Platz oder eine andere Zeit legen - wie
 * umsetzen im Web, nur mit Platzrechten.
 *
 * Die Startzeit wird hier aus Tag und Minute in Europe/Berlin gebildet, nicht
 * in der Zeitzone des Telefons - aus demselben Grund wie bei sperreStunde.
 * Welche Ziele es gibt, rechnet umsetzZiele; durchgesetzt wird alles in
 * move_booking. Der Grund geht an Bucher und Mitspieler.
 */
export async function setzeUm(daten: {
  bookingId: string;
  platzId: string;
  /** JJJJ-MM-TT */
  tag: string;
  /** Minuten seit Mitternacht, Berliner Zeit */
  minute: number;
  grund?: string;
}): Promise<Ergebnis> {
  const { error } = await supabase.rpc("move_booking", {
    p_booking_id: daten.bookingId,
    p_court_id: daten.platzId,
    p_starts_at: berlinTime(daten.tag, daten.minute).toISOString(),
    p_reason: daten.grund?.trim() || undefined,
  });
  if (error) return { ok: false, meldung: translateDbError(error) };
  return { ok: true, meldung: "Die Buchung ist umgesetzt." };
}

/** Vor- und Nachname fuer den Avatar im Kopf - nicht mehr als das. */
export async function ladeMeinenNamen(): Promise<{ vorname: string; nachname: string } | null> {
  const { id } = await ladeIchSelbst();
  if (!id) return null;

  const { data } = await supabase
    .from("members")
    .select("first_name, last_name")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  return { vorname: data.first_name ?? "", nachname: data.last_name ?? "" };
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

export type Mannschaft = { name: string; mannschaftsfuehrer: boolean };

/**
 * In welcher Mannschaft spiele ich? Null fuer die meisten - das ist der
 * Normalfall, und der Konto-Tab zeigt dann nichts. Gelesen ueber RLS wie die
 * Stammdaten; der Mannschaftsname kommt ueber den Fremdschluessel mit.
 */
export async function ladeMeineMannschaft(): Promise<Mannschaft | null> {
  const { id } = await ladeIchSelbst();
  if (!id) return null;

  const { data, error } = await supabase
    .from("members")
    .select("is_team_captain, teams(name)")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(translateDbError(error));
  if (!data?.teams) return null;
  return { name: data.teams.name, mannschaftsfuehrer: data.is_team_captain };
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
    const erster = geprueft.error.issues[0];
    return {
      ok: false,
      meldung: erster?.message ?? "Bitte die Eingaben prüfen.",
      feld: PROFILFELD[String(erster?.path[0] ?? "")],
    };
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
/**
 * Konto loeschen beantragen (O9). Geloescht wird nicht hier: die RPC meldet
 * den Antrag an Vorstand und Admins. Ein zweiter Antrag binnen 24 Stunden ist
 * kein Fehler - der erste liegt ja vor.
 */
export async function beantrageKontoloeschung(nachricht: string): Promise<Ergebnis> {
  const eingabe = kontoloeschungPruefen(nachricht);
  if (!eingabe.ok) return { ok: false, meldung: eingabe.meldung };

  const { data, error } = await supabase.rpc(
    "konto_loeschung_beantragen",
    eingabe.nachricht ? { p_nachricht: eingabe.nachricht } : {},
  );
  if (error) return { ok: false, meldung: translateDbError(error) };
  return { ok: true, meldung: kontoloeschungMeldung(data === true) };
}

export async function speichereNotfallkontakt(k: Notfallkontakt): Promise<Ergebnis> {
  const { id } = await ladeIchSelbst();
  if (!id) return { ok: false, meldung: "Nicht angemeldet." };

  const name = k.emergency_contact_name.trim();
  const telefon = k.emergency_contact_phone.trim();

  // Der Constraint in der Datenbank verlangt dasselbe; hier steht es nur
  // frueher und in einem Satz, der erklaert warum.
  if (telefon && !name) {
    return { ok: false, meldung: "Zur Notfallnummer gehört auch ein Name.", feld: "emergency_contact_name" };
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

/** Die laufende eigene Mitgliedschaft - fuer "Mitglied seit" im Profilkopf. */
export async function ladeMeineMitgliedschaft(): Promise<{ nummer: string; seit: string } | null> {
  const { id } = await ladeIchSelbst();
  if (!id) return null;
  const { data, error } = await supabase
    .from("memberships")
    .select("number, started_on")
    .eq("member_id", id)
    .eq("status", "active")
    .order("started_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(translateDbError(error));
  return data ? { nummer: data.number, seit: data.started_on } : null;
}

/**
 * Das eigene SEPA-Mandat mit der Bankverbindung dahinter - nur lesen.
 * Die IBAN kommt ausschliesslich mit ihren letzten vier Stellen; geaendert
 * wird die Bankverbindung ueber den Vorstand.
 */
export async function ladeMeinMandat() {
  const { id } = await ladeIchSelbst();
  if (!id) return null;
  const { data, error } = await supabase
    .from("sepa_mandates")
    .select("reference, signed_on, status, bank_accounts(holder, bank_name, iban_last4)")
    .eq("member_id", id)
    .eq("status", "active")
    .order("signed_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(translateDbError(error));
  return data;
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
 *
 * Als RPC und nicht direkt auf der Tabelle: RLS laesst Admins alle
 * Benachrichtigungen sehen, die Glocke soll aber nur die eigenen zaehlen -
 * genau die, die my_notifications auch liefert.
 */
export async function zaehleUngelesen(): Promise<number> {
  const { data, error } = await supabase.rpc("my_unread_notification_count");
  if (error) return 0;
  return data ?? 0;
}

/* --- Onboarding ------------------------------------------------------------
 *
 * Dieselben RPCs wie im Web. Welche Schritte es gibt und welche Pflicht sind,
 * steht in @tcm/core (onboardingSchritte), ob sie erledigt sind, sagt
 * my_onboarding(). Geprueft wird in der Datenbank; hier steht nur, was sich
 * vor dem Absenden in einem Satz sagen laesst, der das Feld nennt.
 */

/** Alles fuer den Assistenten in einem Zug; null, wenn kein Mitglied angemeldet ist. */
export async function ladeOnboarding(): Promise<OnboardingZustand | null> {
  const { data, error } = await supabase.rpc("my_onboarding");
  if (error) throw new Error(translateDbError(error));
  return (data as unknown as OnboardingZustand | null) ?? null;
}

export type Geschlecht = "female" | "male" | "diverse";

export type OnboardingStammdaten = {
  first_name: string;
  last_name: string;
  title: string;
  /** Wie getippt: TT.MM.JJJJ */
  birthday: string;
  gender: Geschlecht | "";
  street: string;
  postcode: string;
  city: string;
  phone: string;
  mobile: string;
};

/**
 * Prueft die Stammdaten des Onboardings vor dem Absenden - dieselben Pflichten
 * wie onboarding_save_stammdaten, aber mit dem Feld, das fehlt. Die Datenbank
 * meldet nur "Pflichtangaben fehlen: …", ohne dass das Formular weiss, wo.
 */
export function pruefeOnboardingStammdaten(d: OnboardingStammdaten): Ergebnis<string> {
  const fehlt = (feld: keyof OnboardingStammdaten, meldung: string): Ergebnis<string> => ({ ok: false, meldung, feld });
  if (!d.first_name.trim()) return fehlt("first_name", "Vorname fehlt.");
  if (!d.last_name.trim()) return fehlt("last_name", "Nachname fehlt.");

  const geburtstag = deutschZuIso(d.birthday);
  if (!geburtstag) return fehlt("birthday", "Bitte das Geburtsdatum als TT.MM.JJJJ angeben.");
  // deutschZuIso liest "85" als 2085 - bei einem Geburtsdatum nie gemeint.
  if (geburtstag > heuteInBerlin()) {
    return fehlt("birthday", "Das Geburtsdatum liegt in der Zukunft. Bitte das Jahr vierstellig angeben.");
  }
  if (geburtstag < "1900-01-01") return fehlt("birthday", "Bitte ein gültiges Geburtsdatum angeben.");
  if (!d.gender) return fehlt("gender", "Bitte das Geschlecht wählen.");

  if (!d.street.trim()) return fehlt("street", "Straße fehlt.");
  if (!d.postcode.trim()) return fehlt("postcode", "Postleitzahl fehlt.");
  if (!d.city.trim()) return fehlt("city", "Ort fehlt.");
  if (!d.phone.trim() && !d.mobile.trim()) return fehlt("phone", "Bitte Telefon oder Mobil angeben.");
  return { ok: true, meldung: "", daten: geburtstag };
}

export async function speichereOnboardingStammdaten(d: OnboardingStammdaten): Promise<Ergebnis> {
  const geprueft = pruefeOnboardingStammdaten(d);
  // Das Geschlecht prueft pruefeOnboardingStammdaten mit; hier nur fuer den Typ.
  if (!geprueft.ok || !geprueft.daten || !d.gender) {
    return { ok: false, meldung: geprueft.meldung, feld: geprueft.feld };
  }
  const geburtstag = geprueft.daten;

  const leerZuNull = (w: string) => w.trim() || undefined;
  const { error } = await supabase.rpc("onboarding_save_stammdaten", {
    p_first_name: d.first_name.trim(),
    p_last_name: d.last_name.trim(),
    p_birthday: geburtstag,
    p_gender: d.gender,
    p_street: d.street.trim(),
    p_postcode: d.postcode.trim(),
    p_city: d.city.trim(),
    p_phone: leerZuNull(d.phone),
    p_mobile: leerZuNull(d.mobile),
    p_title: leerZuNull(d.title),
  });
  if (error) return { ok: false, meldung: translateDbError(error) };
  return { ok: true, meldung: "Deine Daten sind gespeichert." };
}

/** Stimmt der jeweils gueltigen Version der genannten Texte zu. */
export async function akzeptiereDokumente(codes: string[]): Promise<Ergebnis> {
  if (codes.length === 0) return { ok: true, meldung: "" };
  const { error } = await supabase.rpc("onboarding_accept_documents", { p_codes: codes });
  if (error) return { ok: false, meldung: translateDbError(error) };
  return { ok: true, meldung: "Zustimmung gespeichert." };
}

export type Erziehungsberechtigte = {
  name: string;
  email: string;
  phone: string;
  zustimmung: boolean;
};

export async function speichereErziehungsberechtigte(e: Erziehungsberechtigte): Promise<Ergebnis> {
  if (!e.name.trim()) return { ok: false, meldung: "Bitte den Namen angeben.", feld: "name" };
  if (!e.email.trim() && !e.phone.trim()) {
    return { ok: false, meldung: "Bitte E-Mail oder Telefon angeben.", feld: "email" };
  }
  const { error } = await supabase.rpc("onboarding_save_guardian", {
    p_name: e.name.trim(),
    p_email: e.email.trim() || undefined,
    p_phone: e.phone.trim() || undefined,
    p_consent: e.zustimmung,
  });
  if (error) return { ok: false, meldung: translateDbError(error) };
  return { ok: true, meldung: "Erziehungsberechtigte gespeichert." };
}

/**
 * Notfallkontakt im Onboarding. Ueber die RPC und nicht wie im Konto direkt
 * auf members: nur sie weiss, dass er bei Minderjaehrigen Pflicht ist.
 */
export async function speichereOnboardingNotfallkontakt(k: {
  name: string;
  phone: string;
  relation: string;
}): Promise<Ergebnis> {
  if (k.phone.trim() && !k.name.trim()) {
    return { ok: false, meldung: "Zur Notfallnummer gehört auch ein Name.", feld: "name" };
  }
  const { error } = await supabase.rpc("onboarding_save_notfallkontakt", {
    p_name: k.name.trim(),
    p_phone: k.phone.trim(),
    p_relation: k.relation.trim() || undefined,
  });
  if (error) return { ok: false, meldung: translateDbError(error) };
  return { ok: true, meldung: "Notfallkontakt gespeichert." };
}

/** Erteilt das SEPA-Mandat online und gibt die Mandatsreferenz zurueck. */
export async function erteileMandat(m: {
  iban: string;
  kontoinhaber: string;
  bestaetigt: boolean;
}): Promise<Ergebnis<string>> {
  if (!m.bestaetigt) return { ok: false, meldung: "Bitte bestätige das Mandat ausdrücklich." };
  if (!isValidIban(m.iban)) {
    return { ok: false, meldung: "Diese IBAN ist nicht gültig. Bitte die Ziffern prüfen." };
  }

  const { data, error } = await supabase.rpc("create_my_sepa_mandate", {
    p_iban: m.iban,
    p_holder: m.kontoinhaber.trim() || undefined,
    p_accept: true,
  });
  if (error) return { ok: false, meldung: translateDbError(error) };
  return { ok: true, meldung: "Das Mandat ist erteilt.", daten: data };
}

export async function speichereTennis(t: {
  lk: string;
  nuligaId: string;
  mannschaftInteresse: boolean;
}): Promise<Ergebnis> {
  const { error } = await supabase.rpc("save_my_tennis", {
    p_tennis_lk: t.lk.trim() || undefined,
    p_nuliga_id: t.nuligaId.trim() || undefined,
    p_mannschaft_interesse: t.mannschaftInteresse,
  });
  if (error) return { ok: false, meldung: translateDbError(error) };
  return { ok: true, meldung: "Gespeichert." };
}

const PFLICHT_KEYS: OnboardingSchrittKey[] = [
  "passwort", "stammdaten", "rechtliches", "erziehungsberechtigte", "notfallkontakt", "sepa",
];

/**
 * Schaltet das Konto frei. Fehlt noch etwas, nennt die Meldung es, und fehlt
 * enthaelt die Schritte aus dem DETAIL der Datenbankmeldung - damit springt
 * der Assistent zum ersten davon.
 */
export async function schliesseOnboardingAb(): Promise<
  Ergebnis & { fehlt?: OnboardingSchrittKey[] }
> {
  const { error } = await supabase.rpc("complete_onboarding");
  if (!error) return { ok: true, meldung: "Dein Konto ist freigeschaltet." };

  const fehlt = (error.details ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter((k): k is OnboardingSchrittKey => PFLICHT_KEYS.includes(k as OnboardingSchrittKey));
  return {
    ok: false,
    meldung: translateDbError(error),
    ...(fehlt.length > 0 ? { fehlt } : {}),
  };
}

// ---------------------------------------------------------------------------
// Veranstaltungen (Verein > Veranstaltungen)
// ---------------------------------------------------------------------------

type EventZeile = Database["public"]["Functions"]["events_fuer_mitglied"]["Returns"][number];

function alsMitgliedEvent(z: EventZeile): MitgliedEvent {
  return {
    ...z,
    kind: z.kind as EventKind,
    status: z.status as EventStatus,
    work_hours: z.work_hours == null ? null : Number(z.work_hours),
    mein_status: (z.mein_status as EventRegistrationStatus | null) ?? null,
  };
}

/** Alle veroeffentlichten und abgesagten Veranstaltungen mit dem eigenen Stand. */
export async function ladeVeranstaltungen(): Promise<MitgliedEvent[]> {
  const { data, error } = await supabase.rpc("events_fuer_mitglied");
  if (error) throw new Error(translateDbError(error));
  return (data ?? []).map(alsMitgliedEvent);
}

export interface VeranstaltungDetail {
  event: MitgliedEvent;
  /** Eigener Platz auf der Warteliste, sonst null */
  wartePlatz: number | null;
  /** Die eigene Forderung zur Anmeldung, falls es eine gibt */
  forderung: { amount_cents: number; status: string } | null;
}

export async function ladeVeranstaltung(id: string): Promise<VeranstaltungDetail | null> {
  const { data: sitzung } = await supabase.auth.getUser();
  const { data: ich } = await supabase
    .from("members").select("id").eq("auth_user_id", sitzung.user?.id ?? "").maybeSingle();

  const [eventRes, platzRes, forderungRes] = await Promise.all([
    supabase.rpc("events_fuer_mitglied").eq("id", id).maybeSingle(),
    supabase.rpc("event_mein_wartelistenplatz", { p_event_id: id }),
    // Ausdruecklich die eigene: ein Admin saehe ueber RLS auch alle anderen.
    supabase
      .from("charges")
      .select("amount_cents, status")
      .eq("event_id", id)
      .eq("member_id", ich?.id ?? "")
      .neq("status", "waived")
      .maybeSingle(),
  ]);
  if (eventRes.error) throw new Error(translateDbError(eventRes.error));
  if (!eventRes.data) return null;
  return {
    event: alsMitgliedEvent(eventRes.data),
    wartePlatz: platzRes.data ?? null,
    forderung: forderungRes.data ?? null,
  };
}

export async function meldeZuVeranstaltungAn(id: string, begleitpersonen: number, bemerkung: string): Promise<Ergebnis> {
  const { data, error } = await supabase.rpc("event_anmelden", {
    p_event_id: id, p_companions: begleitpersonen, p_note: bemerkung,
  });
  if (error) return { ok: false, meldung: translateDbError(error) };
  return {
    ok: true,
    meldung: data === "waitlisted" ? "Ausgebucht – du stehst auf der Warteliste." : "Du bist angemeldet.",
  };
}

export async function aendereVeranstaltungsAnmeldung(
  id: string, begleitpersonen: number, bemerkung: string,
): Promise<Ergebnis> {
  const { data, error } = await supabase.rpc("event_anmeldung_aendern", {
    p_event_id: id, p_companions: begleitpersonen, p_note: bemerkung,
  });
  if (error) return { ok: false, meldung: translateDbError(error) };
  return {
    ok: true,
    meldung: data === "waitlisted" ? "Geändert – du stehst weiter auf der Warteliste." : "Deine Anmeldung ist geändert.",
  };
}

export async function meldeVonVeranstaltungAb(id: string): Promise<Ergebnis> {
  const { error } = await supabase.rpc("event_abmelden", { p_event_id: id });
  if (error) return { ok: false, meldung: translateDbError(error) };
  return { ok: true, meldung: "Du bist abgemeldet." };
}
