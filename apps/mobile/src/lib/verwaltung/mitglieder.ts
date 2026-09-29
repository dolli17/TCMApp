/**
 * Mitglieder in der Verwaltung (Etappe 3)
 *
 * Gegenstueck zu apps/web/src/app/admin/mitglieder/** und
 * apps/web/src/app/merkmale-aktionen.ts. Dieselben RPCs, dieselben
 * Meldungen. Lesen wirft mit einem verstaendlichen Satz, Schreiben gibt ein
 * Ergebnis zurueck und wirft nie (wie daten.ts).
 *
 * Daten tippt man in der App deutsch (TT.MM.JJJJ); gewandelt wird hier, bevor
 * etwas an die Datenbank geht. Ein ungueltiges Datum kommt als Meldung
 * zurueck, ohne Datenbankrunde.
 */

import {
  formatCents, isValidIban, memberCategory, normalizeIban, translateDbError,
  type Database, type MemberCategory,
} from "@tcm/core";
import { supabase } from "@/lib/supabase";
import { deutschZuIso, ergebnis, oderWirf, type Ergebnis } from "@/lib/verwaltung/gemeinsam";

type Rpc = Database["public"]["Functions"];
type Zeilen<N extends keyof Rpc> = Rpc[N]["Returns"] extends (infer Z)[] ? Z : never;

/** Das aktuelle Jahr in Berlin - wie im Web. */
export function jahrInBerlin(): number {
  return Number(new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin", year: "numeric" }).format(new Date()));
}

/** Leerer Text wird zu undefined - so laesst die RPC den Parameter weg. */
function oderNichts(wert: string | null | undefined): string | undefined {
  const w = (wert ?? "").trim();
  return w.length > 0 ? w : undefined;
}

/**
 * Ein getipptes Datum nach ISO. Leer bleibt undefined; ungueltig gibt
 * einen Satz zurueck, der das Feld nennt.
 */
export function datumFeld(text: string | null | undefined, feld: string): { iso?: string; fehler?: string } {
  const t = (text ?? "").trim();
  if (!t) return {};
  const iso = deutschZuIso(t);
  if (!iso) return { fehler: `${feld}: Bitte das Datum als TT.MM.JJJJ eingeben.` };
  return { iso };
}

// ===========================================================================
// Liste
// ===========================================================================

/** Welche Datensaetze die Datenbank liefert (member_overview) */
export const BESTAND = [
  { wert: "aktiv", label: "Aktuelle Mitglieder" },
  { wert: "ohne-login", label: "Ohne Zugang" },
  { wert: "trainer", label: "Trainer" },
  { wert: "admins", label: "Admins" },
  { wert: "archiviert", label: "Archiviert" },
  { wert: "alle", label: "Alle Datensätze" },
] as const;
export type Bestand = (typeof BESTAND)[number]["wert"];

/** Die Chips des Entwurfs: nach Mitgliedschaft und Mandat */
export const ARTEN = [
  { wert: "", label: "Alle" },
  { wert: "aktiv", label: "Aktiv" },
  { wert: "jugend", label: "Jugend" },
  { wert: "passiv", label: "Passiv" },
  { wert: "ohne-mandat", label: "Ohne Mandat" },
] as const;
export type Art = (typeof ARTEN)[number]["wert"];

export type MitgliedZeile = Zeilen<"member_overview"> & {
  beitragsart: string | null;
  kategorie: MemberCategory | null;
  mannschaft: string | null;
  mandat: boolean;
  offenCents: number;
};

/**
 * Die Mitgliederliste wie in apps/web/src/app/admin/mitglieder/page.tsx:
 * member_overview filtert und sucht in der Datenbank, Beitragsart,
 * Mannschaft, Mandat und offener Betrag werden daneben gelesen. Scheitert
 * eine der Nebenquellen, bleibt die Liste stehen und nebenFehler ist gesetzt.
 */
export async function ladeMitgliederliste(bestand: Bestand, suche: string) {
  const jahr = jahrInBerlin();
  const q = suche.trim().slice(0, 60);
  const [liste, beitraegeRes, zuordnungRes, mannschaftenRes, mandateRes, offenRes, antraegeRes] = await Promise.all([
    supabase.rpc("member_overview", { p_filter: bestand, p_query: q || undefined, p_limit: 1000 }),
    supabase.from("member_fees").select("member_id, fee_types(code, name, sort_order)").eq("year", jahr),
    supabase.from("members").select("id, team_id, billing_payer_id"),
    supabase.from("teams").select("id, name"),
    supabase.from("sepa_mandates").select("member_id").eq("status", "active"),
    supabase.from("charges").select("member_id, amount_cents").in("status", ["open", "notified", "returned"]),
    supabase.from("membership_applications").select("id", { count: "exact", head: true }).eq("status", "new"),
  ]);

  const daten = oderWirf(liste) ?? [];

  // Mehrere Beitragsarten je Jahr sind moeglich, etwa Beitrag und Pfand.
  const beitrag = new Map<string, { code: string; name: string; sort_order: number }[]>();
  for (const b of beitraegeRes.data ?? []) {
    if (b.fee_types) beitrag.set(b.member_id, [...(beitrag.get(b.member_id) ?? []), b.fee_types]);
  }
  const zuordnung = new Map((zuordnungRes.data ?? []).map((m) => [m.id, m]));
  const mannschaft = new Map((mannschaftenRes.data ?? []).map((t) => [t.id, t.name]));
  const mitMandat = new Set((mandateRes.data ?? []).map((m) => m.member_id));
  const offen = new Map<string, number>();
  for (const c of offenRes.data ?? []) offen.set(c.member_id, (offen.get(c.member_id) ?? 0) + c.amount_cents);
  const nebenFehler = Boolean(
    beitraegeRes.error ?? zuordnungRes.error ?? mannschaftenRes.error ?? mandateRes.error ?? offenRes.error,
  );

  const zeilen: MitgliedZeile[] = daten.map((m) => {
    const fees = (beitrag.get(m.id) ?? []).sort((a, b) => a.sort_order - b.sort_order);
    const z = zuordnung.get(m.id);
    // Das Mandat haengt am Zahler: ein Kind, das die Eltern bezahlen, hat
    // eines, wenn die Eltern eines haben.
    const zahler = z?.billing_payer_id ?? m.id;
    return {
      ...m,
      beitragsart: fees.map((f) => f.name).join(" + ") || null,
      kategorie: memberCategory(fees),
      mannschaft: z?.team_id ? (mannschaft.get(z.team_id) ?? null) : null,
      mandat: mitMandat.has(zahler),
      offenCents: offen.get(m.id) ?? 0,
    };
  });

  return { zeilen, nebenFehler, offeneAntraege: antraegeRes.count ?? 0 };
}

/** Die Art-Chips wirken auf die fertig geladene Liste - wie im Web. */
export function nachArt(zeilen: MitgliedZeile[], art: Art): MitgliedZeile[] {
  return zeilen.filter((z) =>
    art === "" ? true : art === "ohne-mandat" ? !z.mandat : z.kategorie === art,
  );
}

export type HinweisTon = "gold" | "rot" | "gruen" | "leise" | "blau";

/**
 * Genau ein Hinweis je Zeile (Regel 3): was die gewaehlte Ansicht sucht,
 * sonst das Dringendste - fehlendes Mandat vor offenem Betrag vor fehlendem
 * Zugang.
 */
export function zeilenHinweis(m: MitgliedZeile, bestand: Bestand): { text: string; ton: HinweisTon } | null {
  if (bestand === "ohne-login" && !m.has_login) return { text: "kein Zugang", ton: "leise" };
  if (!m.mandat) return { text: "kein Mandat", ton: "rot" };
  if (m.offenCents > 0) return { text: formatCents(m.offenCents), ton: "gold" };
  if (!m.has_login) return { text: "kein Zugang", ton: "leise" };
  return null;
}

/** Zahl der offenen Antraege fuer das Segment. */
export async function zaehleOffeneAntraege(): Promise<number> {
  const { count, error } = await supabase
    .from("membership_applications")
    .select("id", { count: "exact", head: true })
    .eq("status", "new");
  if (error) throw new Error(translateDbError(error));
  return count ?? 0;
}

export interface NeuesMitglied {
  first_name: string;
  last_name: string;
  email?: string;
  /** TT.MM.JJJJ */
  birthday?: string;
  gender?: string;
  salutation?: string;
  phone?: string;
  mobile?: string;
  street?: string;
  postcode?: string;
  city?: string;
  number?: string;
  /** TT.MM.JJJJ */
  started_on?: string;
}

/**
 * Neues Mitglied anlegen (create_member). Person, Mitgliedschaft und
 * Grundrolle entstehen in einer Transaktion.
 */
export async function mitgliedAnlegen(f: NeuesMitglied): Promise<Ergebnis<string>> {
  const vorname = oderNichts(f.first_name);
  const nachname = oderNichts(f.last_name);
  // Billige Vorpruefung ohne Datenbankrunde - die Regel steht in create_member.
  if (!vorname || !nachname) return { ok: false, meldung: "Vor- und Nachname sind Pflicht." };

  const geburt = datumFeld(f.birthday, "Geburtstag");
  if (geburt.fehler) return { ok: false, meldung: geburt.fehler };
  const eintritt = datumFeld(f.started_on, "Eintritt");
  if (eintritt.fehler) return { ok: false, meldung: eintritt.fehler };

  const { data, error } = await supabase.rpc("create_member", {
    p_first_name: vorname,
    p_last_name: nachname,
    p_email: oderNichts(f.email),
    p_birthday: geburt.iso,
    p_gender: oderNichts(f.gender) as "female" | "male" | "diverse" | undefined,
    p_salutation: oderNichts(f.salutation) as "female" | "male" | "none" | undefined,
    p_phone: oderNichts(f.phone),
    p_mobile: oderNichts(f.mobile),
    p_street: oderNichts(f.street),
    p_postcode: oderNichts(f.postcode),
    p_city: oderNichts(f.city),
    p_number: oderNichts(f.number),
    p_started_on: eintritt.iso,
  });
  if (error) return { ok: false, meldung: translateDbError(error) };
  return { ok: true, meldung: `${vorname} ${nachname} wurde angelegt.`, daten: (data as string | null) ?? undefined };
}

// ===========================================================================
// Ein Mitglied: Uebersicht
// ===========================================================================

const OFFEN = ["open", "notified", "returned"] as const;

/** Alles fuer MitgliedUebersicht - dieselben Quellen wie im Web. */
export async function ladeMitgliedUebersicht(id: string) {
  const jahr = jahrInBerlin();
  const [mitgliedRes, mitgliedschaftRes, beitraegeRes, forderungenRes, finanzenRes, merkmaleRes, dienstRes, letzterRes] =
    await Promise.all([
      supabase
        .from("members")
        .select("id, first_name, last_name, email, phone, mobile, status, auth_user_id, login_disabled_at, emergency_contact_name, billing_payer_id, teams(name)")
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("memberships")
        .select("number, started_on, ended_on")
        .eq("member_id", id)
        .order("started_on", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("member_fees").select("fee_types(name)").eq("member_id", id).eq("year", jahr),
      supabase
        .from("charges")
        .select("amount_cents, status")
        .or(`member_id.eq.${id},payer_id.eq.${id}`)
        .in("status", [...OFFEN]),
      supabase.rpc("member_finances", { p_member_id: id }),
      supabase.rpc("member_attributes", { p_member_id: id }),
      supabase.rpc("work_duty_overview", { p_year: jahr }),
      supabase
        .from("work_duty_entries")
        .select("worked_on")
        .eq("member_id", id)
        .order("worked_on", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const m = oderWirf(mitgliedRes);
  if (!m) throw new Error("Dieses Mitglied gibt es nicht.");

  // Das Mandat haengt am Zahler; wer fremdgezahlt wird, sieht das des Zahlers.
  const { data: zahlerMandate } = m.billing_payer_id
    ? await supabase.from("sepa_mandates").select("id").eq("member_id", m.billing_payer_id).eq("status", "active")
    : { data: null };

  const arten = (beitraegeRes.data ?? []).map((b) => b.fee_types?.name).filter(Boolean) as string[];
  const offen = forderungenRes.data ?? [];
  const finanzen = finanzenRes.data ?? [];
  const merkmale = merkmaleRes.data ?? [];
  const einwilligungen = merkmale.filter((x) => x.value_kind === "boolean");
  const dienst = (dienstRes.data ?? []).find((d) => d.member_id === id) ?? null;

  return {
    jahr,
    m,
    mitgliedschaft: mitgliedschaftRes.data,
    arten,
    offenZahl: offen.length,
    offenSumme: offen.reduce((x, f) => x + f.amount_cents, 0),
    konto: finanzen.find((f) => f.konto_aktiv) ?? null,
    mandatDa: m.billing_payer_id
      ? (zahlerMandate ?? []).length > 0
      : finanzen.some((f) => f.mandat_status === "active"),
    einwilligungen: einwilligungen.length,
    erteilt: einwilligungen.filter((x) => x.set_at && x.option_value !== "false").length,
    sonstigeMerkmale: merkmale.filter((x) => x.value_kind !== "boolean" && x.set_at).length,
    dienst: dienst
      ? { ist: Number(dienst.completed_hours), soll: Number(dienst.required_hours) }
      : null,
    letzterDienst: letzterRes.data?.worked_on ?? null,
    zugang: Boolean(m.auth_user_id) && !m.login_disabled_at,
  };
}
export type MitgliedUebersichtDaten = Awaited<ReturnType<typeof ladeMitgliedUebersicht>>;

// ===========================================================================
// Ein Mitglied: Kopf und Bereiche
// ===========================================================================

/**
 * Der Datensatz fuer die Unterseiten - wie der Kopf von
 * apps/web/src/app/admin/mitglieder/[id]/page.tsx. Wer angemeldet ist, wird
 * gebraucht: ein Admin darf sich selbst nicht die Rechte entziehen.
 */
export async function ladeMitglied(id: string) {
  const { data: sitzung } = await supabase.auth.getUser();
  const authId = sitzung.user?.id ?? null;

  const [mitgliedRes, mitgliedschaftenRes, rollenRes, adminRes] = await Promise.all([
    supabase
      .from("members")
      .select(
        "id, first_name, last_name, title, gender, salutation, birthday, email, phone, mobile, street, postcode, city, country_code, notes, status, is_trainer, nationality_code, tennis_lk, nuliga_id, playing_right, playing_right_since, emergency_contact_name, emergency_contact_phone, emergency_contact_relation, billing_payer_id, auth_user_id, invited_at, login_disabled_at, source, team_id, is_team_captain, teams(name)",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("memberships")
      .select("id, number, started_on, ended_on, cancellation_reason, notes, status")
      .eq("member_id", id)
      .order("started_on", { ascending: false }),
    supabase.from("member_roles").select("role").eq("member_id", id),
    supabase.from("member_roles").select("member_id").eq("role", "admin"),
  ]);

  const m = oderWirf(mitgliedRes);
  if (!m) throw new Error("Dieses Mitglied gibt es nicht.");
  const mitgliedschaften = oderWirf(mitgliedschaftenRes) ?? [];
  const rollen = (oderWirf(rollenRes) ?? []).map((r) => r.role as string);
  const admins = (adminRes.data ?? []).map((r) => r.member_id);

  return {
    m,
    mitgliedschaften,
    laufend: mitgliedschaften.find((s) => !s.ended_on) ?? null,
    istAdmin: rollen.includes("admin"),
    einzigerAdmin: admins.length <= 1,
    selbst: Boolean(authId && m.auth_user_id === authId),
  };
}
export type MitgliedDaten = Awaited<ReturnType<typeof ladeMitglied>>;

/** Fuer den Bereich Mitgliedschaft: wer zahlt fuer wen, Verzeichnis, Mannschaften. */
export async function ladeZugehoerigkeit(id: string) {
  const [zahltFuerRes, verzeichnisRes, mannschaftenRes] = await Promise.all([
    supabase.from("members").select("id, first_name, last_name").eq("billing_payer_id", id),
    supabase.rpc("member_directory", { p_query: "" }),
    supabase.from("teams").select("id, name, active").order("sort_order").order("name"),
  ]);
  return {
    zahltFuer: (oderWirf(zahltFuerRes) ?? []).map((z) => ({ id: z.id, name: `${z.first_name} ${z.last_name}` })),
    verzeichnis: oderWirf(verzeichnisRes) ?? [],
    mannschaften: oderWirf(mannschaftenRes) ?? [],
  };
}

export interface Person {
  id: string;
  first_name: string;
  last_name: string;
}

export async function ladeVerzeichnis(): Promise<Person[]> {
  return oderWirf(await supabase.rpc("member_directory", { p_query: "" })) ?? [];
}

export type BeitragsZeile = Zeilen<"member_fee_overview">;
export async function ladeBeitraege(id: string, jahr: number): Promise<BeitragsZeile[]> {
  return oderWirf(await supabase.rpc("member_fee_overview", { p_member_id: id, p_year: jahr })) ?? [];
}

/** Forderungen des Mitglieds - auch die, die es als Zahler fuer andere traegt. */
export async function ladeForderungen(id: string) {
  const r = await supabase
    .from("charges")
    .select("id, description, amount_cents, status, due_date, created_at, member_id, members!charges_member_id_fkey(first_name, last_name)")
    .or(`member_id.eq.${id},payer_id.eq.${id}`)
    .order("created_at", { ascending: false })
    .limit(100);
  return oderWirf(r) ?? [];
}

export type FinanzZeile = Zeilen<"member_finances">;
export async function ladeFinanzen(id: string): Promise<FinanzZeile[]> {
  return oderWirf(await supabase.rpc("member_finances", { p_member_id: id })) ?? [];
}

export async function ladeMerkmale(id: string) {
  return oderWirf(await supabase.rpc("member_attributes", { p_member_id: id })) ?? [];
}

export type LoginZustand = Zeilen<"member_login_state">;
export async function ladeLoginZustand(id: string): Promise<LoginZustand | null> {
  return (oderWirf(await supabase.rpc("member_login_state", { p_member_id: id })) ?? [])[0] ?? null;
}

export type Loeschfolgen = Zeilen<"member_delete_impact">;
const KEINE_FOLGEN: Loeschfolgen = {
  charges: 0, drink_purchases: 0, bookings: 0, booking_players: 0, work_duty_entries: 0,
  mandates: 0, bank_accounts: 0, payees: 0, can_delete: true, reason: "",
};
/** Die Loeschvorschau; wie im Web ohne Fehler zur Not "nichts haengt dran". */
export async function ladeLoeschfolgen(id: string): Promise<Loeschfolgen> {
  const { data } = await supabase.rpc("member_delete_impact", { p_member_id: id });
  return data?.[0] ?? KEINE_FOLGEN;
}

/** Deutsche Bezeichnung fuer die Feldnamen im Aenderungsprotokoll. */
export const FELD_LABEL: Record<string, string> = {
  first_name: "Vorname", last_name: "Nachname", title: "Titel", gender: "Geschlecht",
  salutation: "Anrede", birthday: "Geburtstag", email: "E-Mail", phone: "Telefon",
  mobile: "Mobil", street: "Straße", postcode: "PLZ", city: "Ort", country_code: "Land",
  notes: "Notizen", status: "Status", is_trainer: "Trainer", nationality_code: "Nationalität",
  tennis_lk: "Leistungsklasse", nuliga_id: "nuLiga-Id", playing_right: "Spielberechtigung",
  playing_right_since: "Spielberechtigt seit", emergency_contact_name: "Notfallkontakt",
  emergency_contact_phone: "Notfallnummer", emergency_contact_relation: "Verhältnis",
  billing_payer_id: "Zahler", team_id: "Mannschaft", is_team_captain: "Mannschaftsführer",
  auth_user_id: "Login", role: "Rolle", number: "Mitgliedsnummer", started_on: "Eintritt",
  ended_on: "Austritt", cancellation_reason: "Kündigungsgrund", iban_last4: "IBAN (letzte vier)",
  reference: "Mandatsreferenz", _aktion: "Vorgang",
};

/** Woran wurde etwas geaendert? Der Tabellenname allein sagt es niemandem. */
export const TABELLE_LABEL: Record<string, string> = {
  members: "Stammdaten", memberships: "Mitgliedschaft", member_roles: "Rolle",
  member_fees: "Beitragsart", bank_accounts: "Bankverbindung", sepa_mandates: "SEPA-Mandat",
  member_attribute_values: "Merkmal",
};

export function zeigeWert(wert: unknown): string {
  if (wert === null || wert === undefined) return "leer";
  if (typeof wert === "boolean") return wert ? "ja" : "nein";
  const text = String(wert);
  return text.length > 60 ? text.slice(0, 60) + "…" : text;
}

export interface ProtokollEintrag {
  id: string;
  wo: string;
  wer: string;
  wann: string;
  aktion: string;
  aenderungen: { feld: string; alt: string; neu: string }[];
}

/** Das Aenderungsprotokoll mit Namen statt Kennungen - wie im Web. */
export async function ladeProtokoll(id: string): Promise<ProtokollEintrag[]> {
  const eintraege =
    oderWirf(
      await supabase
        .from("change_log")
        .select("id, table_name, action, diff, changed_at, changed_by")
        .eq("member_id", id)
        .order("changed_at", { ascending: false })
        .limit(200),
    ) ?? [];
  if (eintraege.length === 0) return [];

  // Die Namen der Aendernden in einem Rutsch nachladen statt je Zeile.
  const urheber = [...new Set(eintraege.map((e) => e.changed_by).filter(Boolean))] as string[];
  const [personenRes, mannschaftenRes] = await Promise.all([
    urheber.length
      ? supabase.from("members").select("id, first_name, last_name").in("id", urheber)
      : Promise.resolve({ data: [] as { id: string; first_name: string; last_name: string }[] }),
    supabase.from("teams").select("id, name"),
  ]);
  const namen = new Map((personenRes.data ?? []).map((p) => [p.id, `${p.first_name} ${p.last_name}`]));
  // Auch geloeschte Mannschaften sollen lesbar bleiben: was es nicht mehr
  // gibt, zeigt die Kennung.
  const mannschaftsnamen = new Map((mannschaftenRes.data ?? []).map((t) => [t.id, t.name]));
  const zeige = (feld: string, wert: unknown) =>
    feld === "team_id" && typeof wert === "string" ? (mannschaftsnamen.get(wert) ?? zeigeWert(wert)) : zeigeWert(wert);

  return eintraege.map((e) => {
    const diff = (e.diff ?? {}) as Record<string, { alt?: unknown; neu?: unknown }>;
    return {
      id: String(e.id),
      wo: TABELLE_LABEL[e.table_name] ?? e.table_name,
      wer: e.changed_by ? (namen.get(e.changed_by) ?? "—") : "System",
      wann: e.changed_at,
      aktion: e.action,
      aenderungen:
        e.action === "update"
          ? Object.entries(diff).map(([feld, w]) => ({
              feld: FELD_LABEL[feld] ?? feld,
              alt: zeige(feld, w?.alt),
              neu: zeige(feld, w?.neu),
            }))
          : [],
    };
  });
}

// ===========================================================================
// Schreiben: Stammdaten, Rolle, Zahler, Mannschaft
// ===========================================================================

/**
 * Nur das Geaenderte - das haelt das Aenderungsprotokoll frei von
 * Eintraegen, in denen nichts steht (wie stammdatenSpeichern im Web).
 * Datumsfelder kommen deutsch und werden hier nach ISO gewandelt.
 */
export function stammdatenPatch(
  neu: Record<string, string | boolean>,
  alt: Record<string, string | boolean>,
  datumsfelder: Record<string, string> = {},
): { patch: Record<string, string | boolean>; fehler?: string } {
  const patch: Record<string, string | boolean> = {};
  for (const [feld, wert] of Object.entries(neu)) {
    if (typeof wert === "boolean") {
      if (wert !== Boolean(alt[feld])) patch[feld] = wert;
      continue;
    }
    let text = wert;
    if (feld in datumsfelder && text.trim()) {
      const d = datumFeld(text, datumsfelder[feld]!);
      if (d.fehler) return { patch: {}, fehler: d.fehler };
      text = d.iso!;
    }
    if (text !== String(alt[feld] ?? "")) patch[feld] = text;
  }
  return { patch };
}

export async function stammdatenSpeichern(
  id: string,
  neu: Record<string, string | boolean>,
  alt: Record<string, string | boolean>,
  datumsfelder: Record<string, string> = {},
): Promise<Ergebnis> {
  if (!id) return { ok: false, meldung: "Kein Mitglied angegeben." };
  const { patch, fehler } = stammdatenPatch(neu, alt, datumsfelder);
  if (fehler) return { ok: false, meldung: fehler };
  if (Object.keys(patch).length === 0) return { ok: false, meldung: "Nichts geändert." };
  const { error } = await supabase.rpc("update_member", { p_member_id: id, p_patch: patch });
  return ergebnis(error, "Gespeichert.");
}

export async function rolleSetzen(id: string, erteilen: boolean): Promise<Ergebnis> {
  const { error } = await supabase.rpc("set_member_role", { p_member_id: id, p_role: "admin", p_granted: erteilen });
  return ergebnis(error, erteilen ? "Verwaltungsrechte erteilt." : "Verwaltungsrechte entzogen.");
}

export async function zahlerSetzen(id: string, zahlerId: string | null): Promise<Ergebnis> {
  // Kein Zahler heisst: den Parameter weglassen - die Datenbank setzt null.
  const { error } = await supabase.rpc("set_billing_payer", { p_member_id: id, p_payer_id: zahlerId ?? undefined });
  return ergebnis(error, zahlerId ? "Zahler zugewiesen." : "Zahlt jetzt selbst.");
}

/** Mannschaft und Mannschaftsfuehrer in einem Zug. Keine Mannschaft: austragen. */
export async function mannschaftSetzen(id: string, mannschaftId: string | null, fuehrer: boolean): Promise<Ergebnis> {
  const { error } = await supabase.rpc("set_member_team", {
    p_member_id: id,
    p_team_id: mannschaftId ?? undefined,
    p_is_captain: mannschaftId ? fuehrer : false,
  });
  return ergebnis(
    error,
    !mannschaftId ? "Spielt in keiner Mannschaft." : fuehrer ? "Als Mannschaftsführer eingetragen." : "Mannschaft gespeichert.",
  );
}

// ===========================================================================
// Schreiben: Austritt und Datensatz
// ===========================================================================

const EURO = (cents: number) =>
  (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });

export async function mitgliedschaftBeenden(id: string, ende: string, grund: string): Promise<Ergebnis> {
  const d = datumFeld(ende, "Austritt zum");
  if (d.fehler) return { ok: false, meldung: d.fehler };
  const { data, error } = await supabase.rpc("end_membership", {
    p_member_id: id,
    p_ended_on: d.iso,
    p_reason: oderNichts(grund),
  });
  if (error) return { ok: false, meldung: translateDbError(error) };

  // Der Vorstand soll sehen, was offen bleibt.
  const z = data?.[0];
  const teile = ["Mitgliedschaft beendet."];
  if (z?.open_charges) teile.push(`${z.open_charges} Forderungen über ${EURO(z.open_amount_cents)} bleiben offen.`);
  if (z?.future_bookings) teile.push(`${z.future_bookings} künftige Buchungen bestehen weiter.`);
  return { ok: true, meldung: teile.join(" ") };
}

export async function mitgliedschaftWiederaufnehmen(id: string): Promise<Ergebnis> {
  const { data, error } = await supabase.rpc("reactivate_membership", { p_member_id: id });
  if (error) return { ok: false, meldung: translateDbError(error) };
  return { ok: true, meldung: `Wieder aufgenommen unter der Nummer ${data}.` };
}

export async function mitgliedArchivieren(id: string, bestaetigt: boolean, grund: string): Promise<Ergebnis> {
  const { data, error } = await supabase.rpc("archive_member", {
    p_member_id: id,
    p_force: bestaetigt,
    p_reason: oderNichts(grund),
  });
  if (error) return { ok: false, meldung: translateDbError(error) };
  const z = data?.[0];
  const teile = ["Mitglied archiviert."];
  if (z?.cancelled_bookings) teile.push(`${z.cancelled_bookings} künftige Buchungen abgesagt.`);
  if (z?.released_payees) teile.push(`${z.released_payees} Personen zahlen jetzt selbst.`);
  if (z?.open_charges) teile.push(`${z.open_charges} Forderungen bleiben bestehen.`);
  return { ok: true, meldung: teile.join(" ") };
}

export async function mitgliedAnonymisieren(id: string, grund: string): Promise<Ergebnis> {
  const { error } = await supabase.rpc("anonymize_member", { p_member_id: id, p_reason: oderNichts(grund) });
  return ergebnis(error, "Mitglied anonymisiert. Die Buchhaltung bleibt vollständig.");
}

/** Der Nachname ist die Bestaetigung - geprueft wird in der Datenbank. */
export async function mitgliedLoeschen(id: string, nachname: string): Promise<Ergebnis> {
  const { error } = await supabase.rpc("delete_member", { p_member_id: id, p_confirm_name: nachname });
  return ergebnis(error, "Mitglied gelöscht.");
}

// ===========================================================================
// Schreiben: Bank, Mandat, Beitragsarten
// ===========================================================================

/**
 * Die IBAN geht nur durch, wenn die Pruefziffer stimmt - dieselbe Rechnung
 * wie in der Datenbank, hier nur fuer die schnelle Rueckmeldung.
 */
export async function bankverbindungAnlegen(
  id: string,
  f: { iban: string; holder?: string; bank_name?: string },
): Promise<Ergebnis> {
  if (!f.iban.trim()) return { ok: false, meldung: "Bitte eine IBAN eingeben." };
  const iban = normalizeIban(f.iban);
  if (!isValidIban(iban)) return { ok: false, meldung: "Diese IBAN ist nicht gültig – bitte die Ziffern prüfen." };
  const { error } = await supabase.rpc("add_bank_account", {
    p_member_id: id,
    p_iban: iban,
    p_holder: oderNichts(f.holder),
    p_bank_name: oderNichts(f.bank_name),
  });
  return ergebnis(error, "Bankverbindung gespeichert.");
}

export async function bankverbindungStilllegen(kontoId: string): Promise<Ergebnis> {
  const { error } = await supabase.rpc("deactivate_bank_account", { p_bank_account_id: kontoId });
  return ergebnis(error, "Bankverbindung stillgelegt.");
}

export async function mandatErteilen(
  id: string,
  f: { konto: string; reference?: string; signed_on?: string; scope: "fees_only" | "all_payments" },
): Promise<Ergebnis> {
  if (!f.konto) return { ok: false, meldung: "Bitte eine Bankverbindung wählen." };
  const d = datumFeld(f.signed_on, "Unterschrieben am");
  if (d.fehler) return { ok: false, meldung: d.fehler };
  const { data, error } = await supabase.rpc("create_sepa_mandate", {
    p_member_id: id,
    p_bank_account_id: f.konto,
    p_reference: oderNichts(f.reference),
    p_signed_on: d.iso,
    p_scope: f.scope,
  });
  if (error) return { ok: false, meldung: translateDbError(error) };
  return { ok: true, meldung: `Mandat ${data} erteilt.` };
}

export async function mandatWiderrufen(mandatId: string): Promise<Ergebnis> {
  const { error } = await supabase.rpc("revoke_sepa_mandate", { p_mandate_id: mandatId });
  return ergebnis(error, "Mandat widerrufen.");
}

export async function beitragsartZuordnen(
  id: string,
  jahr: number,
  f: { fee_type: string; override?: string; note?: string },
): Promise<Ergebnis> {
  if (!f.fee_type) return { ok: false, meldung: "Bitte eine Beitragsart wählen." };
  // "19,00" oder "19.00" - gerechnet wird ueberall in ganzen Cent.
  const betrag = (f.override ?? "").trim();
  let cents: number | undefined;
  if (betrag) {
    const zahl = Number(betrag.replace(",", "."));
    if (!Number.isFinite(zahl) || zahl < 0) return { ok: false, meldung: "Der Sonderbetrag ist keine gültige Zahl." };
    cents = Math.round(zahl * 100);
  }
  const { data, error } = await supabase.rpc("set_member_fee", {
    p_member_id: id,
    p_fee_type_id: f.fee_type,
    p_year: jahr,
    p_override_amount_cents: cents,
    p_note: oderNichts(f.note),
  });
  if (error) return { ok: false, meldung: translateDbError(error) };
  return {
    ok: true,
    meldung: data?.[0]?.already_charged
      ? `Zugeordnet. Für ${jahr} wurde der Beitrag bereits berechnet – die bestehende Forderung ändert sich dadurch nicht.`
      : "Beitragsart zugeordnet.",
  };
}

export async function beitragsartLoesen(id: string, feeTypeId: string, jahr: number): Promise<Ergebnis> {
  const { error } = await supabase.rpc("remove_member_fee", { p_member_id: id, p_fee_type_id: feeTypeId, p_year: jahr });
  return ergebnis(error, "Beitragsart entfernt.");
}

// ===========================================================================
// Schreiben: Merkmale (apps/web/src/app/merkmale-aktionen.ts)
// ===========================================================================

export async function merkmalSetzen(id: string, code: string, optionWert?: string, textWert?: string): Promise<Ergebnis> {
  const { error } = await supabase.rpc("set_member_attribute", {
    p_member_id: id,
    p_type_code: code,
    p_option_value: optionWert || undefined,
    p_text_value: textWert || undefined,
  });
  return ergebnis(error, "Gespeichert.");
}

export async function merkmalEntfernen(id: string, code: string, optionWert?: string): Promise<Ergebnis> {
  const { error } = await supabase.rpc("remove_member_attribute", {
    p_member_id: id,
    p_type_code: code,
    p_option_value: optionWert || undefined,
  });
  return ergebnis(error, "Entfernt.");
}

// ===========================================================================
// Zugang (Edge Function member-login)
// ===========================================================================

export type LoginAktion =
  | "einladen"
  | "passwort_zuruecksetzen"
  | "login_deaktivieren"
  | "login_aktivieren"
  | "login_verknuepfen"
  | "login_entfernen";

/**
 * Die eigentliche Arbeit macht die Edge Function member-login - nur sie hat
 * den Service-Schluessel. Derselbe Body wie im Web (login-aktionen.ts);
 * das Token des Admins schickt der Client selbst mit.
 */
export async function loginVerwalten(mitgliedId: string, aktion: LoginAktion): Promise<Ergebnis> {
  let antwort: { data: unknown; error: unknown };
  try {
    antwort = await supabase.functions.invoke("member-login", { body: { aktion, memberId: mitgliedId } });
  } catch (f) {
    const text = f instanceof Error ? f.message : String(f);
    return { ok: false, meldung: `Die Zugangsverwaltung ist nicht erreichbar: ${text}` };
  }

  if (antwort.error) {
    // Bei einem Status ausserhalb 2xx liegt die Antwort im Kontext - die
    // Funktion schreibt ihre Meldung auch dann hinein.
    const kontext = (antwort.error as { context?: { status?: number; json?: () => Promise<unknown> } }).context;
    if (kontext && typeof kontext.json === "function") {
      try {
        // Das Gateway antwortet ohne laufende Funktion mit {message}, nicht {meldung}.
        const e = (await kontext.json()) as { ok?: boolean; meldung?: string; message?: string };
        if (e.meldung) return { ok: false, meldung: e.meldung };
        return {
          ok: false,
          meldung: `Die Zugangsverwaltung ist nicht erreichbar (${kontext.status ?? "?"})${e.message ? `: ${e.message}` : "."}`,
        };
      } catch {
        return { ok: false, meldung: `Unerwartete Antwort (${kontext.status ?? "?"}).` };
      }
    }
    const text = antwort.error instanceof Error ? antwort.error.message : String(antwort.error);
    return { ok: false, meldung: `Die Zugangsverwaltung ist nicht erreichbar: ${text}` };
  }

  const e = (antwort.data ?? {}) as { ok?: boolean; meldung?: string };
  return { ok: Boolean(e.ok), meldung: e.meldung ?? (e.ok ? "Erledigt." : "Das hat nicht geklappt.") };
}

// ===========================================================================
// Antraege
// ===========================================================================

export const ANTRAGS_FILTER = [
  { wert: "offen", label: "Offen" },
  { wert: "alle", label: "Alle" },
  { wert: "erledigt", label: "Erledigt" },
] as const;
export type AntragsFilter = (typeof ANTRAGS_FILTER)[number]["wert"];

export interface Antrag {
  id: string;
  first_name: string;
  last_name: string;
  salutation: string | null;
  birthday: string;
  email: string;
  phone: string | null;
  mobile: string | null;
  street: string | null;
  postcode: string | null;
  city: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  guardian_name: string | null;
  guardian_email: string | null;
  desired_fee_type_id: string | null;
  attribute_choices: Record<string, boolean> | null;
  message: string | null;
  status: string;
  possible_duplicate: boolean;
  submitted_at: string;
}

export interface Beitragsart {
  id: string;
  name: string;
  preis_cents: number | null;
}

export async function ladeAntraege(filter: AntragsFilter) {
  let abfrage = supabase
    .from("membership_applications")
    .select(
      "id, first_name, last_name, salutation, birthday, email, phone, mobile, street, postcode, city, emergency_contact_name, emergency_contact_phone, guardian_name, guardian_email, desired_fee_type_id, attribute_choices, message, status, possible_duplicate, submitted_at",
    )
    .order("submitted_at", { ascending: false })
    .limit(200);
  if (filter === "offen") abfrage = abfrage.eq("status", "new");
  if (filter === "erledigt") abfrage = abfrage.neq("status", "new");

  const [antraegeRes, artenRes, offenRes] = await Promise.all([
    abfrage,
    supabase.from("fee_types").select("id, name, fee_prices(amount_cents)").eq("active", true).order("sort_order"),
    supabase.from("membership_applications").select("id", { count: "exact", head: true }).eq("status", "new"),
  ]);
  const antraege = (oderWirf(antraegeRes) ?? []) as unknown as Antrag[];

  const beitragsarten: Beitragsart[] = (artenRes.data ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    // Der juengste hinterlegte Preis genuegt fuer die Anzeige.
    preis_cents:
      (Array.isArray(a.fee_prices) ? a.fee_prices : [])
        .map((p) => p.amount_cents)
        .sort((x, y) => y - x)[0] ?? null,
  }));

  return { antraege, beitragsarten, offene: offenRes.count ?? 0 };
}

/**
 * Einen Antrag annehmen. Auf Wunsch geht direkt die Einladung hinterher;
 * scheitert sie, gilt die Aufnahme trotzdem, und die Meldung sagt beides.
 */
export async function antragAnnehmen(
  antragId: string,
  f: { number?: string; started_on?: string; fee_type?: string; einladen: boolean },
): Promise<Ergebnis<string>> {
  const d = datumFeld(f.started_on, "Eintritt");
  if (d.fehler) return { ok: false, meldung: d.fehler };
  const beitragsart = oderNichts(f.fee_type);
  const { data, error } = await supabase.rpc("accept_membership_application", {
    p_application_id: antragId,
    p_number: oderNichts(f.number),
    p_fee_type_ids: beitragsart ? [beitragsart] : undefined,
    p_started_on: d.iso,
  });
  if (error) return { ok: false, meldung: translateDbError(error) };

  const e = data?.[0];
  const teile = [`Aufgenommen unter der Nummer ${e?.membership_number ?? "—"}.`];
  if (f.einladen && e?.needs_invite && e.member_id) {
    const l = await loginVerwalten(e.member_id, "einladen");
    teile.push(l.ok ? l.meldung : `Die Einladung ging nicht raus: ${l.meldung}`);
  }
  return { ok: true, meldung: teile.join(" "), daten: e?.member_id ?? undefined };
}

export async function antragAblehnen(antragId: string, grund: string): Promise<Ergebnis> {
  const { error } = await supabase.rpc("decline_membership_application", {
    p_application_id: antragId,
    p_note: oderNichts(grund),
  });
  return ergebnis(error, "Antrag abgelehnt. Eine Absage schreibt der Vorstand persönlich.");
}

export async function antragAlsSpam(antragId: string): Promise<Ergebnis> {
  const { error } = await supabase.rpc("mark_application_spam", { p_application_id: antragId });
  return ergebnis(error, "Als Spam gekennzeichnet.");
}

// ===========================================================================
// Mannschaften
// ===========================================================================

export type Mannschaft = Zeilen<"team_overview">;
export type Aufstellungszeile = Zeilen<"team_roster">;

export async function ladeMannschaften(): Promise<Mannschaft[]> {
  return oderWirf(await supabase.rpc("team_overview")) ?? [];
}

export async function ladeAufstellung(mannschaftId: string): Promise<Aufstellungszeile[]> {
  return oderWirf(await supabase.rpc("team_roster", { p_team_id: mannschaftId })) ?? [];
}

export async function mannschaftSpeichern(f: {
  id?: string;
  name: string;
  sort_order: string;
  stillgelegt: boolean;
}): Promise<Ergebnis<string>> {
  const name = f.name.trim();
  if (!name) return { ok: false, meldung: "Der Name fehlt." };
  const { data, error } = await supabase.rpc("upsert_team", {
    p_name: name,
    p_id: f.id || undefined,
    p_active: !f.stillgelegt,
    p_sort_order: Number(f.sort_order.trim()) || 0,
  });
  if (error) return { ok: false, meldung: translateDbError(error) };
  return { ok: true, meldung: `„${name}" gespeichert.`, daten: (data as string | null) ?? f.id };
}

export async function mannschaftLoeschen(id: string): Promise<Ergebnis> {
  const { error } = await supabase.rpc("delete_team", { p_id: id });
  return ergebnis(error, "Mannschaft gelöscht.");
}

/** Wer schon woanders spielt, wird umgehaengt - ein Spieler hat genau eine. */
export async function spielerSetzen(mannschaftId: string, mitgliedId: string, fuehrer: boolean): Promise<Ergebnis> {
  const { error } = await supabase.rpc("set_member_team", {
    p_member_id: mitgliedId,
    p_team_id: mannschaftId,
    p_is_captain: fuehrer,
  });
  return ergebnis(error, fuehrer ? "Als Mannschaftsführer eingetragen." : "Eingetragen.");
}

export async function spielerEntfernen(mitgliedId: string): Promise<Ergebnis> {
  const { error } = await supabase.rpc("set_member_team", { p_member_id: mitgliedId, p_team_id: undefined });
  return ergebnis(error, "Aus der Mannschaft genommen.");
}
