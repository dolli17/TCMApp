/**
 * Der Einzug: was die Kasse ueber einen Lastschriftlauf anzeigt
 * (Entwurf "Kasse neu", vier Staende statt fuenf Schritte)
 *
 * Ein Einzug entsteht mit der Ankuendigung (einzug_vorbereiten) und laeuft
 * durch vier Staende: angekuendigt -> Datei erzeugt -> eingereicht ->
 * abgeschlossen. Die 14 Tage der Vorabankuendigung sind kein Stand, sondern
 * eine Bedingung an den Abbuchungstag; die Datei darf sofort entstehen.
 *
 * Reine Darstellung. Ob eingezogen werden darf, entscheidet die Datenbank.
 */

import { CHARGE_KIND_LABEL } from "./forderungen";
import type { ChargeKind } from "./sepa/types";
import type { DebitBatchStatus } from "./admin";
import { isoDateLabel } from "./admin";
import { formatCents } from "./money";

/** Rueckbuchungen einer SEPA-Basislastschrift sind acht Wochen lang moeglich. */
export const RUECKLAUF_TAGE = 56;

const MONATE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

/** ISO-Tag plus n Tage, ohne Zeitzonenfalle. */
export function isoPlusTage(iso: string, tage: number): string {
  const [j, m, t] = iso.slice(0, 10).split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(j, m - 1, t + tage)).toISOString().slice(0, 10);
}

/** "2026-09" -> "September 2026", "2027" bleibt "2027". */
export function zeitraumText(period: string | null | undefined): string | null {
  if (!period) return null;
  const monat = /^(\d{4})-(\d{2})$/.exec(period);
  if (monat) {
    const name = MONATE[Number(monat[2]) - 1];
    return name ? `${name} ${monat[1]}` : period;
  }
  return period;
}

export interface EinzugGruppe {
  kind: ChargeKind;
  period_label: string | null;
  ruecklaeufer: boolean;
}

const MEHRZAHL: Partial<Record<ChargeKind, string>> = {
  fee: "Jahresbeiträge",
  guest: "Gastgebühren",
};

/**
 * Wie eine Gruppe in der Auswahl heisst: "Jahresbeiträge 2027",
 * "Getränke September 2026", "Gastgebühren", "Rückläufer · Beitrag 2026".
 */
export function einzugGruppeTitel(g: EinzugGruppe): string {
  const zeitraum = zeitraumText(g.period_label);
  if (g.ruecklaeufer) {
    return `Rückläufer · ${CHARGE_KIND_LABEL[g.kind]}${zeitraum ? ` ${zeitraum}` : ""}`;
  }
  const art = MEHRZAHL[g.kind] ?? CHARGE_KIND_LABEL[g.kind];
  return zeitraum ? `${art} ${zeitraum}` : art;
}

/** Der Name eines Einzugs: die Gruppe, wenn es eine ist, sonst der Tag. */
export function einzugTitel(gruppen: readonly EinzugGruppe[], abbuchung: string): string {
  return gruppen.length === 1 ? einzugGruppeTitel(gruppen[0]!) : `Einzug ${isoDateLabel(abbuchung)}`;
}

/** Schluessel einer Gruppe fuer Formulare und Listen. */
export function einzugGruppeSchluessel(g: EinzugGruppe): string {
  return `${g.kind}|${g.period_label ?? ""}|${g.ruecklaeufer ? "r" : ""}`;
}

export type EinzugStandKey = "angekuendigt" | "datei" | "eingereicht" | "abgeschlossen";
export type EinzugSchrittState = "erledigt" | "aktuell" | "offen";

export interface EinzugSchritt {
  key: EinzugStandKey;
  name: string;
  info: string;
  state: EinzugSchrittState;
}

export interface EinzugStand {
  /** Text der Statusmarke */
  label: string;
  ton: "gelb" | "blau" | "gruen" | "grau";
  schritte: EinzugSchritt[];
  /** Was als Naechstes zu tun ist, oder null */
  naechster: { titel: string; text: string } | null;
  /** Bis wann Rueckbuchungen kommen koennen, ISO */
  ruecklaeuferBis: string;
}

export interface EinzugStandInput {
  status: DebitBatchStatus;
  collectionDate: string;
  itemCount: number;
  returned: number;
  /** Wann angekuendigt wurde (ISO), falls bekannt */
  announcedOn?: string | null;
  today: string;
}

const NAMEN: Record<EinzugStandKey, string> = {
  angekuendigt: "Angekündigt",
  datei: "Datei erzeugt",
  eingereicht: "Eingereicht",
  abgeschlossen: "Abgeschlossen",
};
const REIHE: EinzugStandKey[] = ["angekuendigt", "datei", "eingereicht", "abgeschlossen"];

/**
 * Die vier Staende eines Einzugs und der naechste Schritt.
 *
 * Ein Entwurf ohne Posten ist ein alter, leerer Lauf oder einer, aus dem alle
 * herausgenommen wurden: dann ist nichts angekuendigt, was er einzieht.
 */
export function einzugStand(input: EinzugStandInput): EinzugStand {
  const { status, collectionDate, itemCount, returned, announcedOn, today } = input;
  const ruecklaeuferBis = isoPlusTage(collectionDate, RUECKLAUF_TAGE);
  const abbuchung = isoDateLabel(collectionDate);
  const leer = status === "draft" && itemCount === 0;

  const fertig: Record<EinzugStandKey, boolean> = {
    angekuendigt: !leer,
    datei: status !== "draft",
    eingereicht: status === "submitted" || status === "completed",
    abgeschlossen: status === "completed",
  };
  const aktuell = REIHE.find((k) => !fertig[k]) ?? null;
  const state = (k: EinzugStandKey): EinzugSchrittState =>
    fertig[k] ? "erledigt" : k === aktuell ? "aktuell" : "offen";

  const info: Record<EinzugStandKey, string> = {
    angekuendigt: leer
      ? "niemand im Einzug"
      : announcedOn ? `${isoDateLabel(announcedOn)} · Abbuchung ${abbuchung}` : `Abbuchung ${abbuchung}`,
    datei: fertig.datei ? "pain.008 liegt am Einzug" : leer ? "–" : "jetzt möglich",
    eingereicht: fertig.eingereicht ? "bei der Bank" : "nach dem Hochladen vermerken",
    abgeschlossen: fertig.abgeschlossen
      ? returned > 0 ? `${returned} Rückläufer` : "keine Rückläufer"
      : `Rückläufer bis ${isoDateLabel(ruecklaeuferBis)} möglich`,
  };

  const schritte = REIHE.map((key) => ({ key, name: NAMEN[key], info: info[key], state: state(key) }));

  let naechster: EinzugStand["naechster"] = null;
  if (leer) {
    naechster = {
      titel: "Niemand im Einzug",
      text: "Dieser Einzug enthält keine Lastschrift und kann gelöscht werden. Neue Forderungen kommen über „Einzug vorbereiten“ in einen eigenen Einzug.",
    };
  } else if (status === "draft") {
    naechster = {
      titel: "Datei erzeugen und bei der Bank einreichen",
      text: `Du musst nicht warten: Die Datei enthält den ${abbuchung} als Abbuchungstag, die Bank bucht erst dann ab.`,
    };
  } else if (status === "generated") {
    naechster = {
      titel: "Im Onlinebanking einreichen",
      text: "Die Datei im Onlinebanking hochladen. Die App bekommt von dort keine Rückmeldung – danach hier vermerken.",
    };
  } else if (status === "submitted") {
    naechster = today > ruecklaeuferBis
      ? {
          titel: "Einzug abschließen",
          text: "Die acht Wochen für Rückbuchungen sind vorbei. Alles, was nicht als zurückgebucht vermerkt ist, gilt dann als bezahlt.",
        }
      : {
          titel: "Rückläufer eintragen, wenn welche kommen",
          text: `Bis zum ${isoDateLabel(ruecklaeuferBis)} kann eine Lastschrift zurückkommen. Danach den Einzug abschließen.`,
        };
  }

  // Die Marke nennt den erreichten Stand, nicht den naechsten Schritt.
  const erreicht = [...REIHE].reverse().find((k) => fertig[k]);
  const label = leer || !erreicht ? "Leer" : NAMEN[erreicht];
  const ton: EinzugStand["ton"] = leer
    ? "grau"
    : status === "completed" ? "gruen" : status === "submitted" ? "blau" : "gelb";

  return { label, ton, schritte, naechster, ruecklaeuferBis };
}

// ---------------------------------------------------------------------------
// Zu tun in der Kasse
// ---------------------------------------------------------------------------

export interface KasseTodo {
  key: string;
  /** Marke vor dem Titel: eine Art oder ein Vorgang */
  marke: { text: string; ton: "blau" | "gold" | "grau" | "rot" | "gelb" };
  title: string;
  text: string;
  action: string;
  href: string;
  /** true = gelber Knopf, hier wird gehandelt */
  urgent: boolean;
}

export interface KasseTodoInput {
  today: string;
  /** einzug_gruppen(): was eingezogen werden kann */
  gruppen: readonly (EinzugGruppe & { anzahl: number; mitglieder: number; summe_cents: number })[];
  /** Noch nicht abgeschlossene Einzuege */
  einzuege: readonly { id: string; title: string; status: DebitBatchStatus; item_count: number; collection_date: string }[];
  /** Getraenkemonate, die noch nicht abgerechnet sind */
  getraenkemonate: readonly { year: number; month: number; status: "open" | "closed" }[];
}

const ART_TON: Record<ChargeKind, "blau" | "gold" | "grau"> = {
  fee: "blau", drinks: "gold", work_duty: "grau", guest: "grau", deposit: "grau", misc: "grau",
};

/**
 * Was in der Kasse gerade wartet, in der Reihenfolge, in der es zu tun ist:
 * laufende Einzuege zuerst (dort ist schon angekuendigt), dann Rückläufer,
 * dann was noch eingezogen werden kann, zuletzt die Getraenkemonate.
 */
export function kasseTodos(input: KasseTodoInput): KasseTodo[] {
  const liste: KasseTodo[] = [];
  const [jahr, monat] = input.today.split("-").map(Number) as [number, number];

  for (const e of input.einzuege) {
    const href = `/admin/kasse/lastschriften/${e.id}`;
    const abbuchung = isoDateLabel(e.collection_date);
    if (e.status === "draft" && e.item_count > 0) {
      liste.push({
        key: `einzug-${e.id}`, marke: { text: "Einzug", ton: "gelb" },
        title: `${e.title} · Datei erzeugen`,
        text: `Abbuchung am ${abbuchung}. Die Datei kannst du schon jetzt erzeugen und einreichen.`,
        action: "Datei erzeugen", href, urgent: true,
      });
    } else if (e.status === "generated") {
      liste.push({
        key: `einzug-${e.id}`, marke: { text: "Einzug", ton: "gelb" },
        title: `${e.title} · im Onlinebanking einreichen`,
        text: `Die Datei liegt bereit. Abbuchung am ${abbuchung}.`,
        action: "Zum Einzug", href, urgent: true,
      });
    } else if (e.status === "submitted" && input.today > isoPlusTage(e.collection_date, RUECKLAUF_TAGE)) {
      liste.push({
        key: `einzug-${e.id}`, marke: { text: "Einzug", ton: "blau" },
        title: `${e.title} · abschließen`,
        text: "Die acht Wochen für Rückbuchungen sind vorbei.",
        action: "Zum Einzug", href, urgent: false,
      });
    }
  }

  const sortiert = [...input.gruppen].sort((a, b) => Number(b.ruecklaeufer) - Number(a.ruecklaeufer));
  for (const g of sortiert) {
    const n = g.anzahl;
    liste.push({
      key: `gruppe-${einzugGruppeSchluessel(g)}`,
      marke: g.ruecklaeufer
        ? { text: "Rückläufer", ton: "rot" }
        : { text: CHARGE_KIND_LABEL[g.kind], ton: ART_TON[g.kind] },
      title: g.ruecklaeufer
        ? `${einzugGruppeTitel(g)} · ${n === 1 ? "1 Lastschrift" : `${n} Lastschriften`} zurückgebucht`
        : `${einzugGruppeTitel(g)} · noch nicht eingezogen`,
      text: `${n} ${n === 1 ? "Forderung" : "Forderungen"} über ${formatCents(g.summe_cents)}. ${
        g.ruecklaeufer ? "Klären und neu einziehen." : "Als Nächstes: Einzug vorbereiten."
      }`,
      action: "Einzug vorbereiten",
      href: `/admin/kasse/einzug?gruppe=${encodeURIComponent(einzugGruppeSchluessel(g))}`,
      urgent: false,
    });
  }

  const reihe = (p: { year: number; month: number }) => p.year * 12 + p.month;
  for (const p of [...input.getraenkemonate].sort((a, b) => reihe(a) - reihe(b))) {
    const name = `${MONATE[p.month - 1]}`;
    if (p.status === "closed") {
      liste.push({
        key: `getraenke-${p.year}-${p.month}`, marke: { text: "Getränke", ton: "gold" },
        title: `Getränke ${name} abrechnen`,
        text: "Der Monat ist geschlossen. Abrechnen macht daraus die Forderungen.",
        action: "Zur Abrechnung", href: "/admin/kasse?abschnitt=abrechnen", urgent: false,
      });
    } else if (reihe(p) < jahr * 12 + monat) {
      liste.push({
        key: `getraenke-${p.year}-${p.month}`, marke: { text: "Getränke", ton: "gold" },
        title: `Getränkemonat ${name} abschließen`,
        text: "Der Monat ist vorbei. Danach entstehen die Forderungen.",
        action: "Zur Abrechnung", href: "/admin/kasse?abschnitt=abrechnen", urgent: false,
      });
    }
  }

  return liste;
}
