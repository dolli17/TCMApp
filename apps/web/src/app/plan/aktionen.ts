"use server";

import { revalidatePath } from "next/cache";
import { partnerFilterAusEingabe, translateDbError, type PartnerFilter } from "@tcm/core";
import { createServerSupabase } from "@/lib/supabase/server";

export interface AktionsErgebnis {
  ok: boolean;
  meldung: string;
}

export async function buchen(formData: FormData): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();

  const courtId = String(formData.get("courtId") ?? "");
  const startsAt = String(formData.get("startsAt") ?? "");
  const typ = String(formData.get("bookingType") ?? "einzel");
  const mitspieler = formData
    .getAll("mitspieler")
    .map(String)
    .filter((v) => v.length > 0);
  const gaeste = formData
    .getAll("gast")
    .map((v) => String(v).trim())
    .filter((v) => v.length > 0);
  const sucheMitspieler = formData.get("partnerWanted") === "1";

  if (!courtId || !startsAt) {
    return { ok: false, meldung: "Platz oder Zeitpunkt fehlt." };
  }

  // "Nur für …" zaehlt nur, wenn wirklich gesucht wird.
  let filter: PartnerFilter | null = null;
  if (sucheMitspieler) {
    const e = partnerFilterAusEingabe(
      String(formData.get("lkVon") ?? ""),
      String(formData.get("lkBis") ?? ""),
      String(formData.get("partnerFuer") ?? ""),
    );
    if (!e.ok) return { ok: false, meldung: e.meldung };
    filter = e.filter;
  }

  const { error } = await supabase.rpc("create_booking", {
    p_court_id: courtId,
    p_starts_at: startsAt,
    p_booking_type_code: typ,
    p_player_member_ids: mitspieler,
    p_guest_names: gaeste,
    p_partner_wanted: sucheMitspieler,
    ...filterParameter(filter, "p_partner_lk_von", "p_partner_lk_bis", "p_partner_fuer"),
  });

  if (error) {
    return { ok: false, meldung: translateDbError(error) };
  }

  revalidatePath("/plan");
  revalidatePath("/plan/spiele");
  return { ok: true, meldung: "Platz gebucht." };
}

/**
 * Tauscht die Mitspieler einer bestehenden Buchung komplett aus.
 *
 * Die Oberflaeche schickt den Zustand, den der Benutzer sieht - nicht einzelne
 * Zu- und Abgaenge. So sieht die Regelpruefung in der Datenbank immer die
 * fertige Besetzung, und ein halb angewendeter Tausch kann nicht entstehen.
 */
export async function mitspielerAendern(
  bookingId: string,
  mitgliedIds: string[],
  gaeste: string[],
): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();

  const { error } = await supabase.rpc("update_booking_players", {
    p_booking_id: bookingId,
    p_member_ids: mitgliedIds,
    p_guest_names: gaeste.map((g) => g.trim()).filter((g) => g.length > 0),
  });

  if (error) {
    return { ok: false, meldung: translateDbError(error) };
  }

  revalidatePath("/plan");
  revalidatePath("/plan/spiele");
  return { ok: true, meldung: "Mitspieler aktualisiert." };
}

/**
 * Eine Buchung stornieren, wahlweise mit Grund.
 *
 * Der Grund landet in der Benachrichtigung an die Betroffenen. Storniert
 * jemand mit Platzrechten eine fremde Buchung, ist er praktisch Pflicht:
 * "Die Buchung wurde storniert." ohne jede Erklaerung ist genau die
 * Nachricht, die einen Anruf beim Vorstand ausloest.
 */
export async function stornieren(
  bookingId: string,
  grund?: string,
): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();

  const { error } = await supabase.rpc("cancel_booking", {
    p_booking_id: bookingId,
    p_reason: grund?.trim() || undefined,
  });

  if (error) {
    return { ok: false, meldung: translateDbError(error) };
  }

  revalidatePath("/plan");
  revalidatePath("/plan/spiele");
  return { ok: true, meldung: "Buchung storniert." };
}

/**
 * Ein einzelner Serientermin faellt aus.
 *
 * Nicht ueber stornieren(): cancel_series_occurrence verlangt, dass der Termin
 * wirklich zu einer Serie gehoert, und traegt einen sprechenden Grund ein. Wer
 * "Faellt diese Woche aus" drueckt, soll nicht versehentlich eine fremde
 * Platzbuchung abraeumen, weil er eine Zeile daneben getroffen hat.
 */
export async function serienterminAbsagen(
  bookingId: string,
  grund?: string,
): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();

  const { error } = await supabase.rpc("cancel_series_occurrence", {
    p_booking_id: bookingId,
    p_reason: grund?.trim() || undefined,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  revalidatePath("/plan");
  revalidatePath("/admin/serien");
  return { ok: true, meldung: "Der Termin ist abgesagt." };
}

/** "3 Buchungen liegen in diesem Zeitraum ..." - die Zahl fuer die Rueckfrage. */
function kollisionenAus(meldung: string): number | undefined {
  const treffer = /^(\d+) Buchungen liegen/.exec(meldung);
  return treffer ? Number(treffer[1]) : undefined;
}

/**
 * Eine einzelne Stunde direkt aus dem Belegungsplan sperren.
 *
 * Dieselbe RPC wie in der Platzverwaltung, nur mit genau einem Platz und einer
 * Stunde. Wer bei Regen am Platz steht, tippt auf die Stunde statt sich durch
 * das Verwaltungsmenue zu suchen. Die Kategorie ist Pflicht, der Grund nicht.
 */
export async function stundeSperren(daten: {
  platzId: string;
  von: string;
  bis: string;
  typCode: string;
  grund: string;
  verdraengen: boolean;
}): Promise<AktionsErgebnis & { kollisionen?: number }> {
  const supabase = await createServerSupabase();

  const { error } = await supabase.rpc("create_blocking", {
    p_court_ids: [daten.platzId],
    p_von: daten.von,
    p_bis: daten.bis,
    p_type_code: daten.typCode,
    p_title: daten.grund.trim(),
    p_force: daten.verdraengen,
  });

  if (error) {
    return { ok: false, meldung: translateDbError(error), kollisionen: kollisionenAus(error.message) };
  }

  revalidatePath("/plan");
  revalidatePath("/admin/plaetze");
  return { ok: true, meldung: "Die Stunde ist gesperrt." };
}

/**
 * Eine Sperrung aendern: Zeit, Plaetze, Kategorie und Grund (update_blocking).
 *
 * Zweistufig wie das Sperren: liegen am neuen Ort Buchungen, kommt ihre Zahl
 * zurueck, und erst mit verdraengen werden sie abgesagt.
 */
export async function sperreAendern(daten: {
  bookingId: string;
  platzIds: string[];
  von: string;
  bis: string;
  typCode: string;
  grund: string;
  verdraengen: boolean;
}): Promise<AktionsErgebnis & { kollisionen?: number }> {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.rpc("update_blocking", {
    p_booking_id: daten.bookingId,
    p_court_ids: daten.platzIds,
    p_von: daten.von,
    p_bis: daten.bis,
    p_type_code: daten.typCode,
    p_title: daten.grund.trim(),
    p_force: daten.verdraengen,
  });

  if (error) {
    return { ok: false, meldung: translateDbError(error), kollisionen: kollisionenAus(error.message) };
  }

  revalidatePath("/plan");
  revalidatePath("/admin/plaetze");
  const verdraengt = data?.[0]?.displaced_count ?? 0;
  return {
    ok: true,
    meldung: verdraengt > 0
      ? `Sperrung geändert, ${verdraengt} ${verdraengt === 1 ? "Buchung" : "Buchungen"} verdrängt.`
      : "Sperrung geändert.",
  };
}

/** Eine Sperrung aufheben - dieselbe RPC wie das Stornieren, eigene Meldung. */
export async function sperreAufheben(bookingId: string): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();

  const { error } = await supabase.rpc("cancel_booking", { p_booking_id: bookingId });
  if (error) return { ok: false, meldung: translateDbError(error) };

  revalidatePath("/plan");
  revalidatePath("/admin/plaetze");
  return { ok: true, meldung: "Die Sperrung ist aufgehoben." };
}

/**
 * Sich selbst aus einer fremden Buchung austragen.
 *
 * Nicht ueber update_booking_players: die gehoert dem Bucher und wuerde einem
 * Mitspieler erlauben, die ganze Besetzung umzuwerfen. leave_booking kennt nur
 * den eigenen Platz. Wer sich austraegt, storniert damit die ganze Buchung;
 * Bucher und uebrige Mitspieler werden benachrichtigt (Vereinsentscheidung
 * vom 02.11.2026).
 */
export async function austragen(bookingId: string): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();

  const { error } = await supabase.rpc("leave_booking", { p_booking_id: bookingId });

  if (error) {
    return { ok: false, meldung: translateDbError(error) };
  }

  revalidatePath("/plan");
  revalidatePath("/plan/spiele");
  return { ok: true, meldung: "Du bist ausgetragen. Die Buchung ist storniert." };
}

/**
 * Nur die gesetzten Grenzen als Parameter. Was fehlt, ist in der Datenbank
 * null - und ohne Filter sieht der Aufruf genau aus wie vor dem Filter.
 */
function filterParameter<V extends string, B extends string, F extends string>(
  filter: PartnerFilter | null,
  von: V,
  bis: B,
  fuer: F,
): Partial<Record<V | B, number> & Record<F, string>> {
  if (!filter) return {};
  return {
    ...(filter.lkVon !== null ? { [von]: filter.lkVon } : {}),
    ...(filter.lkBis !== null ? { [bis]: filter.lkBis } : {}),
    ...(filter.fuer !== null ? { [fuer]: filter.fuer } : {}),
  } as Partial<Record<V | B, number> & Record<F, string>>;
}

/**
 * Die Buchung fuer andere oeffnen, wieder schliessen oder den Filter "Nur
 * für …" aendern. Nur der Bucher. set_partner_wanted setzt bei gesucht=true
 * den Filter jedes Mal neu; fehlende Grenzen heissen offen.
 */
export async function mitspielerSuchen(
  bookingId: string,
  gesucht: boolean,
  filter?: PartnerFilter,
  /** Die Suche war schon an, nur der Filter aendert sich. */
  nurFilter = false,
): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();

  const { error } = await supabase.rpc("set_partner_wanted", {
    p_booking_id: bookingId,
    p_wanted: gesucht,
    ...filterParameter(gesucht ? (filter ?? null) : null, "p_lk_von", "p_lk_bis", "p_fuer"),
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  revalidatePath("/plan");
  revalidatePath("/plan/spiele");
  return {
    ok: true,
    meldung: !gesucht
      ? "Die Buchung ist nicht mehr ausgeschrieben."
      : nurFilter
        ? "Die Suche ist angepasst."
        : "Die Buchung steht jetzt bei den offenen Spielen.",
  };
}

/**
 * Einer offenen Buchung beitreten.
 *
 * Nicht ueber update_booking_players: die gehoert dem Bucher und wuerde einem
 * Fremden erlauben, dessen Besetzung umzuwerfen. join_booking traegt nur den
 * Aufrufer ein - und nur, wenn die Buchung wirklich ausgeschrieben ist.
 */
export async function mitspielen(bookingId: string): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();

  const { error } = await supabase.rpc("join_booking", { p_booking_id: bookingId });

  if (error) return { ok: false, meldung: translateDbError(error) };

  revalidatePath("/plan");
  revalidatePath("/plan/spiele");
  return { ok: true, meldung: "Du bist eingetragen. Viel Spaß!" };
}

/**
 * Eine Buchung auf einen anderen Platz oder eine andere Zeit legen.
 *
 * Nur mit Platzrechten; welche Ziele das Blatt anbietet, rechnet umsetzZiele
 * (@tcm/core), durchgesetzt wird alles in move_booking. Der Grund steht in der
 * Nachricht an Bucher und Mitspieler - bei einer fremden Buchung verlangt ihn
 * die Oberflaeche, wie beim Storno.
 */
export async function umsetzen(
  bookingId: string,
  courtId: string,
  startsAt: string,
  grund?: string,
): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();

  const { error } = await supabase.rpc("move_booking", {
    p_booking_id: bookingId,
    p_court_id: courtId,
    p_starts_at: startsAt,
    p_reason: grund?.trim() || undefined,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  // Die Buchung taucht womoeglich an einem anderen Tag wieder auf - und bei
  // Bucher und Mitspielern in deren Listen.
  revalidatePath("/plan");
  revalidatePath("/plan/spiele");
  revalidatePath("/plan/meine");
  revalidatePath("/plan/offen");
  return { ok: true, meldung: "Die Buchung ist umgesetzt." };
}

/** Was an einem Tag belegt ist - fuer das Umsetzen auf einen anderen Tag. */
export interface TagesBelegung {
  booking_id: string;
  court_id: string;
  starts_at: string;
  ends_at: string;
}

/**
 * Die Belegung eines anderen Tages nachladen.
 *
 * Der Plan kennt nur den Tag, der gerade zu sehen ist. Wer eine Buchung auf
 * Donnerstag legen will, braucht dessen Belegung, sonst boete das Blatt Zeiten
 * an, die die Datenbank abweist.
 */
export async function belegungAm(
  tag: string,
): Promise<AktionsErgebnis & { belegung?: TagesBelegung[] }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tag)) return { ok: false, meldung: "Ungültiger Tag." };

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("day_schedule", { p_date: tag });
  if (error) return { ok: false, meldung: translateDbError(error) };

  return {
    ok: true,
    meldung: "",
    belegung: (data ?? []).map((b) => ({
      booking_id: b.booking_id,
      court_id: b.court_id,
      starts_at: b.starts_at,
      ends_at: b.ends_at,
    })),
  };
}
