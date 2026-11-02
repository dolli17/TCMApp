/**
 * Mitspielersuche mit LK-Bereich und "für wen" (Vereinsentscheidung vom
 * 02.11.2026, Vertrag in docs: LK 1,0 ist die beste, 25,0 die schwaechste).
 *
 * Durchgesetzt wird alles in der Datenbank (open_matches, join_booking). Hier
 * steht nur, was die Oberflaechen gleich machen muessen: die LK lesen und
 * normalisieren, den Filter vor dem Senden pruefen und ihn kurz beschriften.
 */

export const LK_MIN = 1;
export const LK_MAX = 25;

/** Beschriftung des LK-Feldes in Onboarding, Konto und Verwaltung. */
export const LK_FELD_LABEL = "LK oder geschätzte LK";
/** Hinweis unter dem LK-Feld. */
export const LK_FELD_HINWEIS = "Keine offizielle LK? Schätz dich ein – 1 ist die beste, 25 die schwächste.";
/** Fehlertext, wenn die Eingabe keine LK ist. */
export const LK_FELD_FEHLER = "Bitte eine LK zwischen 1 und 25 angeben, höchstens eine Nachkommastelle (z. B. 14,5).";

/** Fuer wen eine Suche gilt; null heisst alle. */
export type PartnerFuer = "female" | "male";

export const PARTNER_FUER_TEXT: Record<PartnerFuer, string> = {
  female: "Damen",
  male: "Herren",
};

/** "LK 14,5", "lk14.5", "14", " 3,0 " - Zahl mit hoechstens einer Nachkommastelle. */
const LK_MUSTER = /^(?:lk\s*)?(\d{1,2})(?:[.,](\d))?$/i;

/**
 * Die LK als Zahl, wie private.lk_zahl in der Datenbank: nicht lesbar oder
 * ausserhalb 1-25 ergibt null.
 */
export function lkZahl(text: string | null | undefined): number | null {
  const t = (text ?? "").trim();
  const treffer = LK_MUSTER.exec(t);
  if (!treffer) return null;
  const zahl = Number(`${treffer[1]}.${treffer[2] ?? "0"}`);
  return zahl >= LK_MIN && zahl <= LK_MAX ? zahl : null;
}

/** 14.5 -> "14,5", 14 -> "14" */
export function lkText(zahl: number): string {
  return Number.isInteger(zahl) ? String(zahl) : zahl.toFixed(1).replace(".", ",");
}

export type LkEingabe = { ok: true; wert: string | null } | { ok: false; meldung: string };

/**
 * Eingabe aus dem LK-Feld pruefen und so normalisieren, wie sie in
 * members.tennis_lk steht: "LK14,5". Leer bleibt erlaubt (null).
 */
export function lkNormalisieren(eingabe: string | null | undefined): LkEingabe {
  const t = (eingabe ?? "").trim();
  if (t === "") return { ok: true, wert: null };
  const zahl = lkZahl(t);
  if (zahl === null) return { ok: false, meldung: LK_FELD_FEHLER };
  return { ok: true, wert: `LK${zahl.toFixed(1).replace(".", ",")}` };
}

/** Der Filter, wie ihn die RPCs erwarten: null heisst "keine Grenze". */
export interface PartnerFilter {
  lkVon: number | null;
  lkBis: number | null;
  fuer: PartnerFuer | null;
}

export const KEIN_FILTER: PartnerFilter = { lkVon: null, lkBis: null, fuer: null };

export type PartnerFilterEingabe = { ok: true; filter: PartnerFilter } | { ok: false; meldung: string };

/**
 * Die beiden LK-Felder und die Auswahl aus dem Buchungsblatt pruefen.
 *
 * Leer, 1 bzw. 25 an der jeweiligen Grenze heissen "offen" und gehen als null
 * an die Datenbank - so bleibt eine Suche ohne Einschraenkung genau das, was
 * sie vor dem Filter war.
 */
export function partnerFilterAusEingabe(
  vonText: string,
  bisText: string,
  fuer: string | null | undefined,
): PartnerFilterEingabe {
  const lies = (t: string, grenze: number): number | null | undefined => {
    if (t.trim() === "") return null;
    const z = lkZahl(t);
    if (z === null) return undefined;
    return z === grenze ? null : z;
  };
  const von = lies(vonText, LK_MIN);
  const bis = lies(bisText, LK_MAX);
  if (von === undefined || bis === undefined) {
    return { ok: false, meldung: "Der LK-Bereich geht von 1 bis 25, höchstens eine Nachkommastelle." };
  }
  if (von !== null && bis !== null && von > bis) {
    return { ok: false, meldung: "„Von“ muss die bessere LK sein, also die kleinere Zahl." };
  }
  const f = fuer === "female" || fuer === "male" ? fuer : null;
  return { ok: true, filter: { lkVon: von, lkBis: bis, fuer: f } };
}

/** Werte aus day_schedule bzw. open_matches; numeric kommt als Zahl oder Text. */
export function partnerFilterAusZeile(zeile: {
  lk_von?: number | string | null;
  lk_bis?: number | string | null;
  fuer?: string | null;
}): PartnerFilter {
  const zahl = (w: number | string | null | undefined) => {
    if (w === null || w === undefined || w === "") return null;
    const n = typeof w === "number" ? w : Number(w);
    return Number.isFinite(n) ? n : null;
  };
  const von = zahl(zeile.lk_von);
  const bis = zahl(zeile.lk_bis);
  return {
    lkVon: von === LK_MIN ? null : von,
    lkBis: bis === LK_MAX ? null : bis,
    fuer: zeile.fuer === "female" || zeile.fuer === "male" ? zeile.fuer : null,
  };
}

export function istEingeschraenkt(f: PartnerFilter): boolean {
  return f.lkVon !== null || f.lkBis !== null || f.fuer !== null;
}

/**
 * Kurzer Zusatz auf der Karte: "LK 10–16 · Herren", "bis LK 16", "ab LK 10",
 * "Damen". Ohne Einschraenkung null.
 */
export function partnerFilterText(f: PartnerFilter): string | null {
  const teile: string[] = [];
  if (f.lkVon !== null && f.lkBis !== null) {
    teile.push(f.lkVon === f.lkBis ? `LK ${lkText(f.lkVon)}` : `LK ${lkText(f.lkVon)}–${lkText(f.lkBis)}`);
  } else if (f.lkBis !== null) {
    teile.push(`bis LK ${lkText(f.lkBis)}`);
  } else if (f.lkVon !== null) {
    teile.push(`ab LK ${lkText(f.lkVon)}`);
  }
  if (f.fuer) teile.push(PARTNER_FUER_TEXT[f.fuer]);
  return teile.length > 0 ? teile.join(" · ") : null;
}

