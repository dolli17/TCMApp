/**
 * Plaetze & Serien der Verwaltung - dieselben RPCs und Meldungen wie
 * apps/web/src/app/admin/plaetze (page.tsx, aktionen.ts).
 *
 * Auf courts und booking_types gibt es nur "grant select" - auch fuer
 * Admins. Alles Schreibende laeuft deshalb ueber SECURITY-DEFINER-RPCs.
 *
 * Anders als im Web wird hier getippt statt gewaehlt: Uhrzeiten als HH:MM,
 * Daten deutsch (TT.MM.JJJJ). Das Pruefen und Umwandeln steht deshalb in
 * dieser Datei, nicht in den Formularen - so ist es getestet.
 */

import {
  berlinTime, minutesOf, minutesToTime, occupancyKind, seriesSchema, timeToMinutes, translateDbError,
  type OccupancyFlags,
} from "@tcm/core";
import { supabase } from "@/lib/supabase";
import {
  deutschZuIso, heuteInBerlin, ladeEinstellungen, oderWirf, type Einstellung, type Ergebnis,
} from "@/lib/verwaltung/gemeinsam";

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

export interface PlatzZeile {
  id: string;
  name: string;
  short_name: string;
  subline: string | null;
  sort_position: number;
  active: boolean;
  offene_buchungen: number;
}

export interface ArtZeile {
  code: string;
  name: string;
  applies_to: "booking" | "blocking";
  duration_minutes: number;
  min_players: number;
  max_players: number;
  requires_partner: boolean;
  counts_towards_quota: boolean;
  active: boolean;
}

export interface SerienZeile {
  id: string;
  court_name: string;
  type_name: string;
  title: string;
  weekday: number;
  start_time: string;
  end_time: string;
  valid_from: string;
  valid_to: string;
  kuenftige: number;
}

export interface Kollision {
  starts_at: string;
  ends_at: string;
  conflict_booking_id: string | null;
  conflict_member_name: string | null;
  conflict_kind: string | null;
}

/** Was heute gerade auf dem Platz liegt, etwa "gesperrt bis 14:00". */
export type PlatzZustand = Record<string, { text: string; art: "gesperrt" | "serie" }>;

export interface PlaetzeDaten {
  plaetze: PlatzZeile[];
  arten: ArtZeile[];
  /** Aktive Blockungsarten fuer Sperren und Serien, nach sort_order */
  blockungsarten: { code: string; name: string }[];
  serien: SerienZeile[];
  zustand: PlatzZustand;
  einstellungen: Einstellung[];
  /** Oeffnungs- und Schliesszeit aus den Einstellungen, als "HH:MM" */
  oeffnung: string;
  schluss: string;
}

// ---------------------------------------------------------------------------
// Eingaben
// ---------------------------------------------------------------------------

/** "8:00", "08.00" oder "08:00" -> "08:00". Ungueltiges gibt null. */
export function normZeit(text: string): string | null {
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(text.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

const KEINE_ZEIT = "Uhrzeit als HH:MM angeben.";
const KEIN_DATUM = "Das Datum bitte als TT.MM.JJJJ angeben.";

// ---------------------------------------------------------------------------
// Lesen
// ---------------------------------------------------------------------------

/**
 * Was jetzt gerade auf dem Platz liegt: Sperrung oder Serie aus dem
 * Tagesplan, eingeordnet wie im Belegungsplan (occupancyKind).
 */
export function zustandJetzt(
  plan: (OccupancyFlags & { court_id: string; starts_at: string; ends_at: string })[],
  jetzt: number = Date.now(),
): PlatzZustand {
  const zustand: PlatzZustand = {};
  for (const b of plan) {
    const art = occupancyKind(b);
    if ((art !== "gesperrt" && art !== "serie") || zustand[b.court_id]) continue;
    if (new Date(b.starts_at).getTime() <= jetzt && jetzt < new Date(b.ends_at).getTime()) {
      const bis = minutesToTime(minutesOf(b.ends_at));
      zustand[b.court_id] = { art, text: art === "gesperrt" ? `gesperrt bis ${bis}` : `Serie bis ${bis}` };
    }
  }
  return zustand;
}

export async function ladePlaetze(): Promise<PlaetzeDaten> {
  const [plaetzeRes, artenRes, serienRes, planRes, einstellungen] = await Promise.all([
    supabase.rpc("court_overview"),
    supabase
      .from("booking_types")
      .select(
        "code, name, applies_to, duration_minutes, min_players, max_players, " +
          "requires_partner, counts_towards_quota, active",
      )
      .order("sort_order"),
    supabase.rpc("series_overview"),
    supabase.rpc("day_schedule", { p_date: heuteInBerlin() }),
    ladeEinstellungen(["booking."]),
  ]);

  // Die Plaetze tragen die Seite; ohne sie gibt es nichts zu zeigen.
  if (plaetzeRes.error) {
    throw new Error(`Die Plätze konnten nicht geladen werden. (${translateDbError(plaetzeRes.error)})`);
  }
  const plaetze = (plaetzeRes.data ?? []) as PlatzZeile[];
  const arten = (oderWirf(artenRes) ?? []) as unknown as ArtZeile[];
  const serien = (oderWirf(serienRes) ?? []) as SerienZeile[];

  const zeit = (schluessel: string, ersatz: string) =>
    String(einstellungen.find((e) => e.key === schluessel)?.value ?? `"${ersatz}"`)
      .replace(/"/g, "")
      .slice(0, 5);

  return {
    plaetze,
    arten,
    blockungsarten: arten
      .filter((a) => a.applies_to === "blocking" && a.active)
      .map((a) => ({ code: a.code, name: a.name })),
    serien,
    // Faellt nur der Tagesplan aus, fehlt bloss der Zustand "gesperrt bis ..."
    zustand: planRes.error ? {} : zustandJetzt(planRes.data ?? []),
    einstellungen,
    oeffnung: zeit("booking.opening_time", "08:00"),
    schluss: zeit("booking.closing_time", "21:00"),
  };
}

// ---------------------------------------------------------------------------
// Plaetze
// ---------------------------------------------------------------------------

export async function speicherePlatz(daten: {
  id: string | null;
  name: string;
  kurzname: string;
  zusatz: string;
}): Promise<Ergebnis> {
  const { error } = await supabase.rpc("upsert_court", {
    // Beim Anlegen gibt es noch keine Id; die Funktion nimmt null als
    // "neu anlegen", der generierte Typ kennt aber nur string.
    p_id: daten.id as string,
    p_name: daten.name,
    p_short_name: daten.kurzname,
    p_subline: daten.zusatz,
    p_position: undefined,
  });
  if (error) return { ok: false, meldung: translateDbError(error) };
  return { ok: true, meldung: daten.id ? "Platz gespeichert." : "Platz angelegt." };
}

export async function schaltePlatz(id: string, aktiv: boolean): Promise<Ergebnis> {
  const { data, error } = await supabase.rpc("set_court_active", { p_id: id, p_active: aktiv });
  if (error) return { ok: false, meldung: translateDbError(error) };

  // Die RPC gibt zurueck, wie viele kuenftige Buchungen auf dem Platz haengen.
  // Sie werden bewusst nicht mitstorniert - der Vorstand soll sie sehen.
  const offen = typeof data === "number" ? data : 0;
  if (!aktiv && offen > 0) {
    return {
      ok: true,
      meldung: `Platz stillgelegt. Achtung: ${offen} künftige ${
        offen === 1 ? "Buchung liegt" : "Buchungen liegen"
      } noch darauf – bitte sperren und die Betroffenen informieren.`,
    };
  }
  return { ok: true, meldung: aktiv ? "Platz ist wieder im Plan." : "Platz stillgelegt." };
}

/** Tauscht einen Eintrag mit seinem Nachbarn; null, wenn es nicht weitergeht. */
export function verschoben<T>(liste: T[], index: number, richtung: -1 | 1): T[] | null {
  const ziel = index + richtung;
  if (index < 0 || ziel < 0 || ziel >= liste.length) return null;
  const neu = [...liste];
  [neu[index], neu[ziel]] = [neu[ziel]!, neu[index]!];
  return neu;
}

export async function sortierePlaetze(ids: string[]): Promise<Ergebnis> {
  const { error } = await supabase.rpc("reorder_courts", { p_ids: ids });
  if (error) return { ok: false, meldung: translateDbError(error) };
  return { ok: true, meldung: "Reihenfolge gespeichert." };
}

// ---------------------------------------------------------------------------
// Buchungsarten
// ---------------------------------------------------------------------------

export interface ArtFormular {
  code: string;
  name: string;
  art: "booking" | "blocking";
  /** Getippt, deshalb Text */
  dauer: string;
  minSpieler: string;
  maxSpieler: string;
  brauchtPartner: boolean;
  zaehltAufKontingent: boolean;
  aktiv: boolean;
}

function ganzzahl(text: string): number | null {
  return /^\d+$/.test(text.trim()) ? Number(text.trim()) : null;
}

export async function speichereBuchungsart(daten: ArtFormular): Promise<Ergebnis> {
  const dauer = ganzzahl(daten.dauer);
  const min = ganzzahl(daten.minSpieler);
  const max = ganzzahl(daten.maxSpieler);
  if (dauer === null || dauer < 15 || dauer > 1440) {
    return { ok: false, meldung: "Die Dauer bitte in Minuten angeben (15 bis 1440)." };
  }
  if (min === null || max === null) {
    return { ok: false, meldung: "Die Spielerzahl bitte als ganze Zahl angeben." };
  }

  const { error } = await supabase.rpc("upsert_booking_type", {
    p_code: daten.code.trim(),
    p_name: daten.name,
    p_applies_to: daten.art,
    p_duration_minutes: dauer,
    p_min_players: min,
    p_max_players: max,
    p_requires_partner: daten.brauchtPartner,
    p_counts_towards_quota: daten.zaehltAufKontingent,
    p_active: daten.aktiv,
    p_sort_order: undefined,
  });
  if (error) return { ok: false, meldung: translateDbError(error) };
  return { ok: true, meldung: "Buchungsart gespeichert." };
}

// ---------------------------------------------------------------------------
// Sperren
// ---------------------------------------------------------------------------

/**
 * Einen Zeitraum auf mehreren Plaetzen sperren.
 *
 * Zweistufig: der erste Aufruf ohne `verdraengen` bricht ab, sobald Buchungen
 * im Weg sind, und nennt ihre Zahl. Erst der zweite raeumt sie weg und
 * benachrichtigt die Betroffenen.
 */
export async function sperre(daten: {
  platzIds: string[];
  /** Deutsch getippt (TT.MM.JJJJ) oder ISO */
  tag: string;
  von: string;
  bis: string;
  artCode: string;
  grund: string;
  verdraengen: boolean;
}): Promise<Ergebnis & { kollisionen?: number }> {
  const tag = deutschZuIso(daten.tag);
  if (!tag) return { ok: false, meldung: KEIN_DATUM };
  const von = normZeit(daten.von);
  const bis = normZeit(daten.bis);
  if (!von || !bis) return { ok: false, meldung: KEINE_ZEIT };

  // Ueber berlinTime, nicht als "2026-08-11T08:00:00": ein Zeitstempel ohne
  // Zonenangabe wird von Postgres in der Zeitzone der Verbindung gelesen -
  // und die steht auf UTC. Die Sperrung landete sonst zwei Stunden spaeter.
  const { data, error } = await supabase.rpc("create_blocking", {
    p_court_ids: daten.platzIds,
    p_von: berlinTime(tag, timeToMinutes(von)).toISOString(),
    p_bis: berlinTime(tag, timeToMinutes(bis)).toISOString(),
    p_type_code: daten.artCode,
    p_title: daten.grund,
    p_force: daten.verdraengen,
  });

  if (error) {
    const treffer = /^(\d+) Buchungen liegen/.exec(error.message);
    if (treffer) return { ok: false, meldung: translateDbError(error), kollisionen: Number(treffer[1]) };
    return { ok: false, meldung: translateDbError(error) };
  }

  const zeile = (data ?? [])[0];
  const angelegt = zeile?.created_count ?? 0;
  const verdraengt = zeile?.displaced_count ?? 0;
  return {
    ok: true,
    meldung:
      verdraengt > 0
        ? `${angelegt} Plätze gesperrt, ${verdraengt} Buchungen verdrängt. Die Betroffenen wurden benachrichtigt.`
        : `${angelegt} ${angelegt === 1 ? "Platz" : "Plätze"} gesperrt.`,
  };
}

// ---------------------------------------------------------------------------
// Serien
// ---------------------------------------------------------------------------

export interface SerienFormular {
  courtId: string;
  bookingTypeCode: string;
  weekday: number;
  startTime: string;
  endTime: string;
  /** Deutsch getippt */
  validFrom: string;
  validTo: string;
  title: string;
}

/**
 * Prueft ein Serienformular mit demselben Schema wie das Web (seriesSchema)
 * und gibt die Werte so zurueck, wie die RPCs sie brauchen.
 */
export function pruefeSerie(
  f: SerienFormular,
): { ok: true; werte: Omit<SerienFormular, "startTime" | "endTime"> & { startTime: string; endTime: string } } | { ok: false; meldung: string } {
  const von = deutschZuIso(f.validFrom);
  const bis = deutschZuIso(f.validTo);
  if (!von || !bis) return { ok: false, meldung: KEIN_DATUM };
  const start = normZeit(f.startTime);
  const ende = normZeit(f.endTime);
  if (!start || !ende) return { ok: false, meldung: KEINE_ZEIT };

  const r = seriesSchema.safeParse({
    ...f,
    startTime: start,
    endTime: ende,
    validFrom: new Date(von),
    validTo: new Date(bis),
  });
  if (!r.success) return { ok: false, meldung: r.error.issues[0]?.message ?? "Die Angaben stimmen nicht." };
  return { ok: true, werte: { ...f, startTime: start, endTime: ende, validFrom: von, validTo: bis } };
}

/** Vorschau: reine Leseoperation. Aendert nichts, auch nicht bei Konflikten. */
export async function vorschauSerie(
  f: SerienFormular,
): Promise<{ ok: boolean; meldung?: string; termine: Kollision[] }> {
  const p = pruefeSerie(f);
  if (!p.ok) return { ok: false, meldung: p.meldung, termine: [] };
  const { data, error } = await supabase.rpc("preview_series", {
    p_court_id: p.werte.courtId,
    p_weekday: p.werte.weekday,
    p_start_time: p.werte.startTime,
    p_end_time: p.werte.endTime,
    p_valid_from: p.werte.validFrom,
    p_valid_to: p.werte.validTo,
  });
  if (error) return { ok: false, meldung: translateDbError(error), termine: [] };
  return { ok: true, termine: (data ?? []) as Kollision[] };
}

/**
 * Anlegen. Ohne verdraengen bricht der Aufruf ab, sobald ein Termin kollidiert -
 * der Admin muss das Verdraengen also ausdruecklich bestaetigen.
 */
export async function legeSerieAn(f: SerienFormular & { verdraengen: boolean }): Promise<Ergebnis> {
  const p = pruefeSerie(f);
  if (!p.ok) return { ok: false, meldung: p.meldung };
  const { data, error } = await supabase.rpc("create_series", {
    p_court_id: p.werte.courtId,
    p_booking_type_code: p.werte.bookingTypeCode,
    p_weekday: p.werte.weekday,
    p_start_time: p.werte.startTime,
    p_end_time: p.werte.endTime,
    p_valid_from: p.werte.validFrom,
    p_valid_to: p.werte.validTo,
    p_title: p.werte.title,
    p_displace: f.verdraengen,
  });
  if (error) return { ok: false, meldung: translateDbError(error) };

  const zeile = data?.[0];
  return {
    ok: true,
    meldung:
      `Serie angelegt: ${zeile?.created_count ?? 0} Termine` +
      (zeile?.displaced_count
        ? `, ${zeile.displaced_count} bestehende Buchungen verdrängt und die Betroffenen benachrichtigt.`
        : "."),
  };
}

/**
 * Uhrzeit, Titel oder Enddatum einer Serie aendern. Zweistufig wie das
 * Anlegen: ohne `verdraengen` bricht der Aufruf bei Kollisionen ab und nennt
 * ihre Zahl.
 */
export async function aendereSerie(daten: {
  seriesId: string;
  startTime: string;
  endTime: string;
  titel: string;
  /** Deutsch getippt; leer = unveraendert */
  validTo: string;
  verdraengen: boolean;
}): Promise<Ergebnis & { kollisionen?: number }> {
  const von = normZeit(daten.startTime);
  const bis = normZeit(daten.endTime);
  if (!von || !bis) return { ok: false, meldung: KEINE_ZEIT };
  let ende: string | undefined;
  if (daten.validTo.trim() !== "") {
    const iso = deutschZuIso(daten.validTo);
    if (!iso) return { ok: false, meldung: KEIN_DATUM };
    ende = iso;
  }

  const { data, error } = await supabase.rpc("update_series", {
    p_series_id: daten.seriesId,
    p_start_time: von,
    p_end_time: bis,
    p_title: daten.titel,
    p_valid_to: ende,
    p_displace: daten.verdraengen,
  });

  if (error) {
    const treffer = /^(\d+) Termine kollidieren/.exec(error.message);
    if (treffer) return { ok: false, meldung: translateDbError(error), kollisionen: Number(treffer[1]) };
    return { ok: false, meldung: translateDbError(error) };
  }

  const zeile = (data ?? [])[0];
  const neu = zeile?.created_count ?? 0;
  const verdraengt = zeile?.displaced_count ?? 0;
  return {
    ok: true,
    meldung:
      verdraengt > 0
        ? `Serie geändert: ${neu} Termine neu angelegt, ${verdraengt} Buchungen verdrängt. Die Betroffenen wurden benachrichtigt.`
        : `Serie geändert: ${neu} künftige ${neu === 1 ? "Termin steht" : "Termine stehen"} in der neuen Lage.`,
  };
}

/**
 * Beenden statt Loeschen: die vergangenen Termine bleiben stehen - sie sind
 * der Beleg, wer wann auf dem Platz stand.
 */
export async function beendeSerie(seriesId: string): Promise<Ergebnis> {
  const { data, error } = await supabase.rpc("end_series", { p_series_id: seriesId, p_ab: undefined });
  if (error) return { ok: false, meldung: translateDbError(error) };
  const weg = typeof data === "number" ? data : 0;
  return {
    ok: true,
    meldung:
      weg > 0
        ? `Serie beendet. ${weg} künftige ${weg === 1 ? "Termin wurde" : "Termine wurden"} abgesagt.`
        : "Serie beendet. Es standen keine Termine mehr aus.",
  };
}
