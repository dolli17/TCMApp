/**
 * Was alle Bereiche der Verwaltung brauchen
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

/** Aus einem Supabase-Fehler das Ergebnis, ohne Fehler die Erfolgsmeldung. */
export function ergebnis<T = void>(
  error: { message: string; code?: string } | null,
  meldung: string,
  daten?: T,
): Ergebnis<T> {
  if (error) return { ok: false, meldung: translateDbError(error) };
  return { ok: true, meldung, daten };
}

/** Wirft den Fehler als Satz, sonst die Daten. Fuer alle Lesefunktionen. */
export function oderWirf<T>(r: { data: T; error: { message: string; code?: string } | null }): T {
  if (r.error) throw new Error(translateDbError(r.error));
  return r.data;
}

// ---------------------------------------------------------------------------
// Adressen
// ---------------------------------------------------------------------------

/**
 * Die Sprungziele aus @tcm/core (adminTodos) sind Web-Adressen. Die App
 * bildet denselben Baum unter /verwaltung nach, also genuegt es, das
 * Praefix zu tauschen. /plan ist in der App der Plaetze-Tab.
 */
export function appPfad(webHref: string): string {
  if (webHref === "/plan" || webHref.startsWith("/plan?")) return webHref.replace("/plan", "/plaetze");
  if (webHref.startsWith("/admin")) return webHref.replace("/admin", "/verwaltung");
  return webHref;
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
 * 29.09.2026 (auch 29.9.26) -> 2026-09-29. Die App hat keinen Datumswaehler;
 * getippt wird deutsch, gespeichert ISO. Ungueltiges gibt null.
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

const DATUM_ZEIT = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: BERLIN,
});

/** Zeitstempel wie im Protokoll: 29.09.2026, 14:05 */
export function zeitstempel(iso: string | null | undefined): string {
  return iso ? DATUM_ZEIT.format(new Date(iso)) : "";
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

/** Ein Einstellungswert als Text, wie ihn das Formular braucht. */
export function einstellungsText(wert: unknown): string {
  if (wert === null || wert === undefined) return "";
  if (typeof wert === "string") return wert;
  return String(wert);
}

/**
 * Speichert die geaenderten Werte einer Gruppe - nacheinander, wie im Web
 * (apps/web/src/app/admin/einstellungs-aktionen.ts): die Pruefung sitzt in
 * set_setting, und die Meldung soll sagen, welcher Wert nicht passt.
 */
export async function speichereEinstellungen(
  werte: Record<string, string>,
  alt: Record<string, string>,
): Promise<Ergebnis> {
  const geaendert = Object.entries(werte).filter(([k, w]) => w !== (alt[k] ?? ""));
  if (Object.keys(werte).length === 0) return { ok: false, meldung: "Nichts zu speichern." };

  for (const [schluessel, wert] of geaendert) {
    const { error } = await supabase.rpc("set_setting", { p_key: schluessel, p_value: wert });
    if (error) return { ok: false, meldung: `${schluessel}: ${translateDbError(error)}` };
  }
  return { ok: true, meldung: "Einstellungen gespeichert." };
}
