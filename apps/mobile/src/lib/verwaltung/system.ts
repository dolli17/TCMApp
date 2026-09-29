/**
 * System und Merkmale in der Verwaltung - dieselben Quellen und RPCs wie
 * apps/web/src/app/admin/system (page.tsx, merkmale/page.tsx,
 * merkmale/aktionen.ts). Das Speichern der Einstellungen selbst steht in
 * gemeinsam.ts (speichereEinstellungen), weil es jeder Bereich braucht.
 */

import type { Database } from "@tcm/core";
import { supabase } from "@/lib/supabase";
import {
  ergebnis, ladeEinstellungen, oderWirf, type Einstellung, type Ergebnis,
} from "@/lib/verwaltung/gemeinsam";

// ---------------------------------------------------------------------------
// Einstellungen
// ---------------------------------------------------------------------------

/**
 * Was einmal eingerichtet und danach selten angefasst wird. Alles mit einem
 * fachlichen Ort steht dort (Buchungsregeln bei den Plaetzen, Lastschrift bei
 * den Beitraegen). Hier bleibt der Rest - und der Auffangbehaelter fuer alles,
 * was kuenftig ohne bekannten Praefix dazukommt.
 */
export const GRUPPEN = [
  { praefix: "notifications", titel: "Benachrichtigungen", text: "Welche Hinweise zusätzlich per E-Mail gehen." },
  { praefix: "work_duty", titel: "Arbeitsdienst", text: "Stundensatz für die Abrechnung." },
  { praefix: "privacy", titel: "Datenschutz", text: "Wie lange Protokolle aufbewahrt werden." },
] as const;

/** Praefixe, die anderswo einen eigenen Platz haben. */
export const ANDERSWO = ["booking", "drinks", "fees", "sepa"];

export const SONSTIGE = {
  titel: "Weitere",
  text: "Werte ohne festen Ort. Kommt hier etwas an, gehört es vermutlich in einen der Bereiche oben.",
};

export interface EinstellungsBlock {
  praefix: string;
  titel: string;
  text: string;
  eintraege: Einstellung[];
}

/** Teilt die Einstellungen auf die Gruppen auf; leere Gruppen fallen weg. */
export function gruppiereEinstellungen(alle: Einstellung[]): EinstellungsBlock[] {
  const bekannt = new Set<string>([...GRUPPEN.map((g) => g.praefix), ...ANDERSWO]);
  const bloecke: EinstellungsBlock[] = GRUPPEN.map((g) => ({
    praefix: g.praefix,
    titel: g.titel,
    text: g.text,
    eintraege: alle.filter((e) => e.key.startsWith(g.praefix + ".")),
  }));
  const sonstige = alle.filter((e) => !bekannt.has(e.key.split(".")[0] ?? ""));
  bloecke.push({ praefix: "", ...SONSTIGE, eintraege: sonstige });
  return bloecke.filter((b) => b.eintraege.length > 0);
}

export async function ladeSystem(): Promise<EinstellungsBlock[]> {
  return gruppiereEinstellungen(await ladeEinstellungen());
}

// ---------------------------------------------------------------------------
// Merkmale
// ---------------------------------------------------------------------------

export type MerkmalsArt = Database["public"]["Enums"]["attribute_kind"];

export const ARTEN: { wert: MerkmalsArt; label: string }[] = [
  { wert: "list", label: "Auswahl aus einer Liste" },
  { wert: "boolean", label: "Ja oder nein (Einwilligung)" },
  { wert: "text", label: "Freitext" },
  { wert: "date", label: "Datum" },
  { wert: "number", label: "Zahl" },
];

/** Kurzform fuer die Kontextzeile der Liste. */
export const ART_TEXT: Record<string, string> = {
  list: "Auswahl",
  boolean: "Ja/Nein",
  text: "Freitext",
  date: "Datum",
  number: "Zahl",
};

export interface MerkmalsDefinition {
  id: string;
  code: string;
  name: string;
  description: string;
  value_kind: string;
  multiple: boolean;
  self_editable: boolean;
  in_application: boolean;
  active: boolean;
  sort_order: number;
  optionen: { value: string; label: string }[];
  anzahl_werte: number;
}

/** Alle Merkmalstypen mit aktiven Optionen und der Zahl vergebener Werte. */
export async function ladeMerkmale(): Promise<MerkmalsDefinition[]> {
  const [typenRes, optionenRes, werteRes] = await Promise.all([
    supabase
      .from("member_attribute_types")
      .select("id, code, name, description, value_kind, multiple, self_editable, in_application, active, sort_order")
      .order("sort_order")
      .order("name"),
    supabase
      .from("member_attribute_options")
      .select("attribute_type_id, value, label, sort_order, active")
      .eq("active", true)
      .order("sort_order"),
    supabase.from("member_attribute_values").select("attribute_type_id"),
  ]);

  const typen = oderWirf(typenRes) ?? [];
  const optionen = oderWirf(optionenRes) ?? [];
  const werte = oderWirf(werteRes) ?? [];

  const zaehler = new Map<string, number>();
  for (const w of werte) zaehler.set(w.attribute_type_id, (zaehler.get(w.attribute_type_id) ?? 0) + 1);

  return typen.map((t) => ({
    ...t,
    optionen: optionen
      .filter((o) => o.attribute_type_id === t.id)
      .map((o) => ({ value: o.value, label: o.label })),
    anzahl_werte: zaehler.get(t.id) ?? 0,
  }));
}

/** Die Werteliste als Text, eine Zeile je Wert: `wert = Anzeige` oder nur `wert`. */
export function optionenAlsText(optionen: { value: string; label: string }[]): string {
  return optionen.map((o) => (o.label && o.label !== o.value ? `${o.value} = ${o.label}` : o.value)).join("\n");
}

/** Umkehrung von optionenAlsText; leere Zeilen und leere Werte fallen weg. */
export function leseOptionen(text: string): { value: string; label: string }[] {
  return text
    .split("\n")
    .map((zeile) => zeile.trim())
    .filter(Boolean)
    .map((zeile) => {
      const [wert, ...rest] = zeile.split("=");
      const value = (wert ?? "").trim();
      const label = rest.join("=").trim();
      return { value, label: label || value };
    })
    .filter((o) => o.value.length > 0);
}

export interface MerkmalsEingabe {
  code: string;
  name: string;
  description: string;
  value_kind: MerkmalsArt;
  multiple: boolean;
  self_editable: boolean;
  in_application: boolean;
  stillgelegt: boolean;
  sort_order: string;
  /** Nur bei Auswahl-Merkmalen: eine Zeile je Wert */
  optionen: string;
}

/**
 * Ein Merkmal anlegen oder aendern - samt Werteliste in einem Zug, wie
 * merkmalSpeichern im Web.
 */
export async function merkmalSpeichern(e: MerkmalsEingabe): Promise<Ergebnis> {
  const code = e.code.trim();
  const name = e.name.trim();
  const art = e.value_kind || "list";

  if (!code) return { ok: false, meldung: "Der Schlüssel fehlt." };
  if (!name) return { ok: false, meldung: "Der Name fehlt." };

  const { data: id, error } = await supabase.rpc("upsert_member_attribute_type", {
    p_code: code,
    p_name: name,
    p_description: e.description.trim(),
    p_value_kind: art,
    p_multiple: e.multiple,
    p_self_editable: e.self_editable,
    p_in_application: e.in_application,
    p_active: !e.stillgelegt,
    p_sort_order: Number(e.sort_order.trim()) || 0,
  });

  if (error) return ergebnis(error, "");

  // Werteliste nur bei Auswahl-Merkmalen.
  if (art === "list" && id) {
    const { error: fehler } = await supabase.rpc("set_member_attribute_options", {
      p_type_id: id,
      p_options: leseOptionen(e.optionen),
    });
    if (fehler) return ergebnis(fehler, "");
  }

  return { ok: true, meldung: `„${name}" gespeichert.` };
}

/**
 * Ein Merkmal loeschen. Geht nur, solange niemand einen Wert dazu hat - die
 * Datenbank weist es sonst ab und nennt die Zahl.
 */
export async function merkmalLoeschen(code: string): Promise<Ergebnis> {
  const { error } = await supabase.rpc("delete_member_attribute_type", { p_code: code });
  return ergebnis(error, "Merkmal gelöscht.");
}
