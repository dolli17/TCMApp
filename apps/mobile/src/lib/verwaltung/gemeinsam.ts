/**
 * Was die Verwaltung der App braucht
 *
 * Die Verwaltung der App spricht dieselben RPCs wie apps/web/src/app/admin.
 * Jede davon prueft private.is_admin() selbst - der Tab ist nur die
 * Oberflaeche, die Absicherung liegt wie im Web in der Datenbank.
 *
 * Aufteilung wie in daten.ts: Lesen wirft mit einem verstaendlichen Satz,
 * Schreiben gibt ein Ergebnis zurueck und wirft nie. Die Meldungen sind
 * wortgleich mit den Server Actions im Web.
 */

import { translateDbError } from "@tcm/core";
import type { Ergebnis } from "@/lib/daten";
import { supabase } from "@/lib/supabase";

export type { Ergebnis };

/** Wirft den Fehler als Satz, sonst die Daten. Fuer alle Lesefunktionen. */
export function oderWirf<T>(r: { data: T; error: { message: string; code?: string } | null }): T {
  if (r.error) throw new Error(translateDbError(r.error));
  return r.data;
}

// ---------------------------------------------------------------------------
// Datum
// ---------------------------------------------------------------------------

const BERLIN = "Europe/Berlin";

/** Heute als JJJJ-MM-TT in Berlin - nicht in der Zeitzone des Geraets. */
export function heuteInBerlin(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: BERLIN }).format(new Date());
}

/** 2026-09-29 -> 29.09.2026. Leer bleibt leer. */
export function isoZuDeutsch(iso: string | null | undefined): string {
  if (!iso) return "";
  const [j, m, t] = iso.slice(0, 10).split("-");
  return j && m && t ? `${t}.${m}.${j}` : iso;
}

/**
 * 29.09.2026 (auch 29.9.26) -> 2026-09-29. Getippt wird deutsch, gespeichert
 * ISO. Ungueltiges gibt null. (Das Geburtsdatum hat einen Datumswaehler, der
 * ebenfalls TT.MM.JJJJ liefert - siehe datumZuDeutsch.)
 */
export function deutschZuIso(text: string): string | null {
  const t = text.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(t);
  if (!m) return null;
  const jahr = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const monat = Number(m[2]);
  const tag = Number(m[1]);
  const d = new Date(Date.UTC(jahr, monat - 1, tag));
  if (d.getUTCMonth() !== monat - 1 || d.getUTCDate() !== tag) return null;
  return `${jahr}-${String(monat).padStart(2, "0")}-${String(tag).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Einstellungen
// ---------------------------------------------------------------------------

export interface Einstellung {
  key: string;
  value: unknown;
  value_type: string;
  label: string | null;
  description: string | null;
  updated_at: string | null;
}

/** Alle Einstellungen, deren Schluessel mit einem der Praefixe beginnt. */
export async function ladeEinstellungen(praefixe?: string[]): Promise<Einstellung[]> {
  const { data, error } = await supabase
    .from("settings")
    .select("key, value, value_type, label, description, updated_at")
    .order("key");
  if (error) throw new Error(translateDbError(error));
  const alle = data ?? [];
  if (!praefixe) return alle;
  return alle.filter((e) => praefixe.some((p) => e.key.startsWith(p)));
}

/**
 * Der Tag eines Datumswaehlers als TT.MM.JJJJ. Der Waehler liefert Mitternacht
 * in der Zeitzone des Geraets - deshalb die lokalen Teile, nicht UTC.
 */
export function datumZuDeutsch(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

/** TT.MM.JJJJ als lokales Datum fuer den Waehler, sonst null. */
export function deutschZuDatum(text: string): Date | null {
  const iso = deutschZuIso(text);
  if (!iso) return null;
  const [j, m, t] = iso.split("-").map(Number);
  return new Date(j!, m! - 1, t!);
}
