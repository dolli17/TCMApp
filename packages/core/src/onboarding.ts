/**
 * Onboarding nach dem ersten Login
 *
 * Die Datenbank ist die Quelle der Wahrheit: my_onboarding() liefert, welcher
 * Schritt erledigt ist, und complete_onboarding() prueft die Pflichtschritte
 * noch einmal selbst. Hier stehen Reihenfolge, Bezeichnungen und welche
 * Schritte Pflicht sind, damit Web und App denselben Assistenten zeigen.
 */

export type OnboardingSchrittKey =
  | "passwort"
  | "stammdaten"
  | "rechtliches"
  | "erziehungsberechtigte"
  | "notfallkontakt"
  | "sepa"
  | "einwilligungen"
  | "tennis"
  | "einstellungen";

/** Was my_onboarding() zurueckgibt (jsonb). */
export interface OnboardingZustand {
  abgeschlossen_am: string | null;
  minderjaehrig: boolean;
  status: Record<OnboardingSchrittKey, boolean>;
  /** Offene Pflichtschritte in Reihenfolge, wie complete_onboarding() sie prueft. */
  pflicht_fehlt: OnboardingSchrittKey[];
  stammdaten: {
    first_name: string;
    last_name: string;
    title: string | null;
    gender: "female" | "male" | "diverse" | null;
    salutation: "female" | "male" | "none" | null;
    birthday: string | null;
    email: string | null;
    phone: string | null;
    mobile: string | null;
    street: string | null;
    postcode: string | null;
    city: string | null;
    country_code: string | null;
    nationality_code: string | null;
    bestaetigt_am: string | null;
  };
  erziehungsberechtigte: {
    name: string | null;
    email: string | null;
    phone: string | null;
    zustimmung_am: string | null;
  };
  notfallkontakt: { name: string | null; phone: string | null; relation: string | null };
  dokumente: {
    code: "satzung" | "beitragsordnung" | "datenschutz";
    version: number;
    title: string;
    valid_from: string;
    zugestimmt_am: string | null;
  }[];
  mandat: {
    vorhanden: boolean;
    online_erteilt_am: string | null;
    referenz: string;
    glaeubiger_name: string;
    glaeubiger_id: string;
    /** false, solange die Gläubigerdaten des Vereins fehlen. */
    moeglich: boolean;
    text_version: number;
    text: string | null;
    kontoinhaber_vorschlag: string | null;
  };
  beitragsarten: { code: string; name: string }[];
  merkmale: { code: string; name: string; description: string; gesetzt: boolean }[];
  tennis: { tennis_lk: string | null; nuliga_id: string | null; mannschaft_interesse: boolean };
  einstellungen: { booking_mail: string | null };
}

export interface OnboardingSchritt {
  key: OnboardingSchrittKey;
  titel: string;
  pflicht: boolean;
  erledigt: boolean;
}

const SCHRITTE: { key: OnboardingSchrittKey; titel: string }[] = [
  { key: "passwort", titel: "Passwort" },
  { key: "stammdaten", titel: "Deine Daten" },
  { key: "rechtliches", titel: "Satzung und Datenschutz" },
  { key: "erziehungsberechtigte", titel: "Erziehungsberechtigte" },
  { key: "notfallkontakt", titel: "Notfallkontakt" },
  { key: "sepa", titel: "SEPA-Lastschriftmandat" },
  { key: "einwilligungen", titel: "Einwilligungen" },
  { key: "tennis", titel: "Tennis" },
  { key: "einstellungen", titel: "App-Einstellungen" },
];

/** Mit diesem Schritt ist das Konto freigeschaltet; danach ist alles optional. */
export const LETZTER_PFLICHTSCHRITT: OnboardingSchrittKey = "sepa";

/**
 * Die Schritte in Reihenfolge. Erziehungsberechtigte gibt es nur bei
 * Minderjährigen; dort ist auch der Notfallkontakt Pflicht.
 */
export function onboardingSchritte(
  zustand: Pick<OnboardingZustand, "minderjaehrig" | "status">,
): OnboardingSchritt[] {
  const minder = zustand.minderjaehrig;
  return SCHRITTE.filter((s) => minder || s.key !== "erziehungsberechtigte").map((s) => ({
    ...s,
    pflicht:
      ["passwort", "stammdaten", "rechtliches", "sepa"].includes(s.key) ||
      (minder && (s.key === "erziehungsberechtigte" || s.key === "notfallkontakt")),
    erledigt: zustand.status[s.key] === true,
  }));
}

/** Der erste offene Pflichtschritt, oder null, wenn alles Pflichtige erledigt ist. */
export function naechsterPflichtschritt(
  zustand: Pick<OnboardingZustand, "minderjaehrig" | "status">,
): OnboardingSchrittKey | null {
  return onboardingSchritte(zustand).find((s) => s.pflicht && !s.erledigt)?.key ?? null;
}

function alsDatum(wert: string | Date): { j: number; m: number; t: number } | null {
  if (wert instanceof Date) {
    return { j: wert.getFullYear(), m: wert.getMonth() + 1, t: wert.getDate() };
  }
  const treffer = /^(\d{4})-(\d{2})-(\d{2})/.exec(wert);
  if (!treffer) return null;
  return { j: Number(treffer[1]), m: Number(treffer[2]), t: Number(treffer[3]) };
}

/**
 * Minderjährig bis zum Tag vor dem 18. Geburtstag. Wer am 29. Februar
 * geboren ist, wird in Nicht-Schaltjahren am 1. März volljährig – genauso
 * rechnet private.ist_minderjaehrig in der Datenbank. Ohne Geburtsdatum:
 * nicht minderjährig.
 */
export function istMinderjaehrig(
  birthday: string | Date | null | undefined,
  heute: string | Date = new Date(),
): boolean {
  if (!birthday) return false;
  const g = alsDatum(birthday);
  const h = alsDatum(heute);
  if (!g || !h) return false;
  const volljaehrigImJahr = g.j + 18;
  if (h.j !== volljaehrigImJahr) return h.j < volljaehrigImJahr;
  return h.m < g.m || (h.m === g.m && h.t < g.t);
}

/**
 * Der Text des SEPA-Basislastschriftmandats. Wortgleich mit
 * private.sepa_mandatstext in der Datenbank, die ihn beim Erteilen als
 * Nachweis speichert. Ändert sich der Text, ändern sich beide, und die
 * Einstellung sepa.mandate_text_version wird hochgezählt.
 */
export function mandatstext({
  glaeubigerName,
  glaeubigerId,
  referenz,
}: {
  glaeubigerName: string;
  glaeubigerId: string;
  referenz: string;
}): string {
  return [
    "SEPA-Lastschriftmandat (SEPA-Basislastschrift)",
    "",
    `Zahlungsempfänger: ${glaeubigerName}`,
    `Gläubiger-Identifikationsnummer: ${glaeubigerId}`,
    `Mandatsreferenz: ${referenz}`,
    "Zahlungsart: Wiederkehrende Zahlungen",
    "",
    `Ich ermächtige ${glaeubigerName}, Zahlungen von meinem Konto mittels Lastschrift einzuziehen. ` +
      `Zugleich weise ich mein Kreditinstitut an, die von ${glaeubigerName} auf mein Konto gezogenen Lastschriften einzulösen.`,
    "",
    "Hinweis: Ich kann innerhalb von acht Wochen, beginnend mit dem Belastungsdatum, " +
      "die Erstattung des belasteten Betrages verlangen. Es gelten dabei die mit " +
      "meinem Kreditinstitut vereinbarten Bedingungen.",
  ].join("\n");
}
