/**
 * Auswahllisten und Texte, die mehrere Bereiche eines Mitglieds brauchen -
 * wortgleich mit apps/web/src/app/admin/mitglieder/[id]/page.tsx.
 */

import type { MarkenTon } from "@/components/verwaltung/Liste";

export const ANREDE = [
  { wert: "", label: "—" },
  { wert: "female", label: "Frau" },
  { wert: "male", label: "Herr" },
  { wert: "none", label: "keine" },
];

export const GESCHLECHT = [
  { wert: "", label: "—" },
  { wert: "female", label: "weiblich" },
  { wert: "male", label: "männlich" },
  { wert: "diverse", label: "divers" },
];

export const SPIELRECHT = [
  { wert: "none", label: "keine Teilnahme" },
  { wert: "own_club", label: "für unseren Verein" },
  { wert: "second_club", label: "Zweitverein" },
];

export const STATUS_TEXT: Record<string, string> = {
  active: "aktiv",
  inactive: "inaktiv",
  archived: "archiviert",
};

export const FORDERUNG_STAND: Record<string, { text: string; ton: MarkenTon }> = {
  open: { text: "offen", ton: "gelb" },
  notified: { text: "angekündigt", ton: "gelb" },
  submitted: { text: "eingereicht", ton: "grau" },
  settled: { text: "bezahlt", ton: "gruen" },
  returned: { text: "zurückgebucht", ton: "rot" },
  waived: { text: "erlassen", ton: "grau" },
};

/** Die Unterseiten eines Mitglieds (?bereich=…, im Web ?teil=…) */
export const BEREICHE = {
  stammdaten: "Stammdaten",
  mitgliedschaft: "Mitgliedschaft",
  beitraege: "Beitragsarten",
  forderungen: "Forderungen",
  bank: "Bank & Mandat",
  merkmale: "Merkmale & Einwilligungen",
  zugang: "Zugang",
  protokoll: "Änderungsprotokoll",
  austritt: "Austritt & Datensatz",
} as const;
export type Bereich = keyof typeof BEREICHE;

/** Die Reiter von frueher (?abschnitt=…) fuehren auf die neuen Bereiche. */
export const ALT: Record<string, Bereich> = {
  finanzen: "bank",
};

export function istBereich(w: string | undefined): w is Bereich {
  return Boolean(w && w in BEREICHE);
}

/** 29.09.2026 aus einem ISO-Datum oder Zeitstempel; leer wird —. */
export function datum(wert: string | null | undefined): string {
  return wert ? new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(wert)) : "—";
}
