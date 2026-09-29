/**
 * Getraenke der Verwaltung - dieselben RPCs und Meldungen wie
 * apps/web/src/app/admin/getraenke (page.tsx, aktionen.ts).
 *
 * Auf drink_items und drink_prices gibt es nur `grant select` - auch fuer
 * Admins. Alles Schreibende laeuft ueber SECURITY-DEFINER-RPCs.
 *
 * Betraege und Daten werden getippt; das Umwandeln steht hier und nicht im
 * Formular, damit es getestet ist.
 */

import { parseAmountToCents, translateDbError } from "@tcm/core";
import { supabase } from "@/lib/supabase";
import {
  deutschZuIso, heuteInBerlin, ladeEinstellungen, oderWirf, type Einstellung, type Ergebnis,
} from "@/lib/verwaltung/gemeinsam";
import { ladeAnkuendigungsfrist, ladeGetraenkemonate, type MonatZeile } from "@/lib/verwaltung/kasse";

export type Kategorie = "drink" | "food" | "other";

export interface GetraenkZeile {
  id: string;
  name: string;
  description: string | null;
  category: Kategorie;
  sort_order: number;
  active: boolean;
  price_cents: number | null;
  price_valid_from: string | null;
  naechster_preis_cents: number | null;
  naechster_preis_ab: string | null;
  buchungen: number;
  buchungen_offen: number;
}

export interface MonatsStand {
  year: number;
  month: number;
  status: "open" | "closed" | "charged";
  offen: number;
}

export const ART_TEXT: Record<Kategorie, string> = {
  drink: "Getränk",
  food: "Essen",
  other: "Sonstiges",
};

export interface GetraenkeDaten {
  getraenke: GetraenkZeile[];
  einstellungen: Einstellung[];
  /** Fuer die Getraenkemonat-Karte und "Naechster Schritt"; null, wenn nicht ladbar */
  monate: MonatZeile[] | null;
  /** Vorabankuendigungsfrist in Tagen; fehlt sie, laedt die Karte sie selbst */
  fristTage?: number;
}

// ---------------------------------------------------------------------------
// Lesen
// ---------------------------------------------------------------------------

export async function ladeGetraenke(): Promise<GetraenkeDaten> {
  const [karteRes, einstellungen, monate, frist] = await Promise.all([
    supabase.rpc("drink_item_overview"),
    ladeEinstellungen(["drinks."]),
    // Die Monate sind ein eigener Abschnitt: fehlen sie, bleibt die Karte stehen.
    ladeGetraenkemonate(12).catch(() => null),
    ladeAnkuendigungsfrist().catch(() => undefined),
  ]);
  if (karteRes.error) {
    throw new Error(`Die Getränkekarte konnte nicht geladen werden. (${translateDbError(karteRes.error)})`);
  }
  return {
    getraenke: (oderWirf(karteRes) ?? []) as unknown as GetraenkZeile[],
    einstellungen,
    monate,
    fristTage: frist,
  };
}

const MONAT = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" });

/**
 * Was bei der Abrechnung als Naechstes dran ist - abgelesen am Stand der
 * Monate (open -> closed -> charged -> angekuendigt), aeltester zuerst.
 * Wortgleich mit apps/web/src/app/admin/getraenke/page.tsx.
 */
export function naechsterSchritt(monate: MonatsStand[], heute: string): { titel: string; text: string } {
  const jetzt = Number(heute.slice(0, 4)) * 12 + Number(heute.slice(5, 7));
  const name = (m: MonatsStand) => MONAT.format(new Date(m.year, m.month - 1, 1));
  const aelteste = [...monate].sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month));
  for (const m of aelteste) {
    if (m.status === "open" && m.year * 12 + m.month < jetzt) {
      return { titel: `${name(m)} schließen`, text: "Der Monat ist vorbei. Schließen friert die Summe ein; danach nimmt die Theke für ihn nichts mehr an." };
    }
    if (m.status === "closed") {
      return { titel: `${name(m)} abrechnen`, text: "Die Summe steht fest. Das Abrechnen macht daraus Forderungen je Mitglied." };
    }
    if (m.status === "charged" && m.offen > 0) {
      return { titel: `${name(m)} ankündigen`, text: `${m.offen} Forderungen warten auf die Vorabankündigung. Ohne sie darf nicht eingezogen werden.` };
    }
  }
  return { titel: "Alles abgerechnet", text: "Der laufende Monat wird nach seinem Ende geschlossen und abgerechnet." };
}

// ---------------------------------------------------------------------------
// Schreiben
// ---------------------------------------------------------------------------

/**
 * Eingetippter Eurobetrag in Cent. parseAmountToCents wirft bei allem, was
 * kein Betrag ist - bei Geld wird nicht stillschweigend gerundet.
 */
export function inCents(eingabe: string): number | null {
  try {
    return parseAmountToCents(eingabe);
  } catch {
    return null;
  }
}

export const KEIN_BETRAG = "Das ist kein gültiger Betrag, z. B. 2,50.";

/** "1.10.2026" wie Intl im Web - ohne Zeitzonenversatz der ISO-Mitternacht. */
const DATUM = new Intl.DateTimeFormat("de-DE", { timeZone: "UTC" });
export function datumKurz(iso: string): string {
  return DATUM.format(new Date(iso.slice(0, 10)));
}

export async function speichereGetraenk(daten: {
  id: string | null;
  name: string;
  beschreibung: string;
  art: Kategorie;
  /** Getippt; leer = beim Bearbeiten unveraendert */
  preis: string;
}): Promise<Ergebnis> {
  const leer = daten.preis.trim() === "";
  const preisCents = leer ? null : inCents(daten.preis);
  if (!leer && preisCents === null) return { ok: false, meldung: KEIN_BETRAG };

  const { error } = await supabase.rpc("upsert_drink_item", {
    // Beim Anlegen gibt es noch keine Id; die Funktion nimmt null als
    // "neu anlegen", der generierte Typ kennt aber nur string.
    p_id: daten.id as string,
    p_name: daten.name,
    p_description: daten.beschreibung,
    p_category: daten.art,
    p_price_cents: preisCents ?? undefined,
    p_sort_order: undefined,
  });
  if (error) return { ok: false, meldung: translateDbError(error) };
  return { ok: true, meldung: daten.id ? "Getränk gespeichert." : "Getränk angelegt." };
}

/**
 * Einen Preis setzen. "Gueltig ab" darf in der Zukunft liegen: die
 * Preishistorie kennt kein Enddatum, ein spaeterer Eintrag loest den
 * frueheren von selbst ab.
 */
export async function setzePreis(daten: {
  itemId: string;
  /** Getippt, etwa "2,80" */
  preis: string;
  /** Deutsch getippt; leer = ab heute */
  gueltigAb: string;
}): Promise<Ergebnis> {
  const cents = inCents(daten.preis);
  if (cents === null) return { ok: false, meldung: KEIN_BETRAG };
  let ab: string | null = null;
  if (daten.gueltigAb.trim() !== "") {
    ab = deutschZuIso(daten.gueltigAb);
    if (!ab) return { ok: false, meldung: "Das Datum bitte als TT.MM.JJJJ angeben." };
  }

  const { data, error } = await supabase.rpc("set_drink_price", {
    p_item_id: daten.itemId,
    p_price_cents: cents,
    p_valid_from: ab ?? undefined,
  });
  if (error) return { ok: false, meldung: translateDbError(error) };

  // Die RPC gibt zurueck, wie viele Buchungen im offenen Zeitraum den alten
  // Preis behalten - das ist die Frage, die sich der Vorstand beim Aendern stellt.
  const alt = typeof data === "number" ? data : 0;
  if (ab && ab > heuteInBerlin()) {
    return { ok: true, meldung: `Der neue Preis gilt ab dem ${datumKurz(ab)}. Bis dahin bleibt alles beim Alten.` };
  }
  return {
    ok: true,
    meldung:
      alt > 0
        ? `Preis geändert. ${alt} ${alt === 1 ? "Buchung" : "Buchungen"} aus diesem Monat ${
            alt === 1 ? "behält" : "behalten"
          } den alten Preis.`
        : "Preis geändert.",
  };
}

export async function entferneGeplantenPreis(itemId: string, gueltigAb: string): Promise<Ergebnis> {
  const { error } = await supabase.rpc("remove_drink_price", { p_item_id: itemId, p_valid_from: gueltigAb });
  if (error) return { ok: false, meldung: translateDbError(error) };
  return { ok: true, meldung: "Der geplante Preis ist zurückgenommen." };
}

export async function schalteGetraenk(id: string, aktiv: boolean): Promise<Ergebnis> {
  const { data, error } = await supabase.rpc("set_drink_item_active", { p_id: id, p_active: aktiv });
  if (error) return { ok: false, meldung: translateDbError(error) };
  const offen = typeof data === "number" ? data : 0;
  if (!aktiv && offen > 0) {
    return {
      ok: true,
      meldung: `Getränk stillgelegt. ${offen} ${
        offen === 1 ? "Buchung wird" : "Buchungen werden"
      } aus diesem Monat noch abgerechnet.`,
    };
  }
  return { ok: true, meldung: aktiv ? "Getränk ist wieder in der Karte." : "Getränk stillgelegt." };
}

export async function sortiereGetraenke(ids: string[]): Promise<Ergebnis> {
  const { error } = await supabase.rpc("reorder_drink_items", { p_ids: ids });
  if (error) return { ok: false, meldung: translateDbError(error) };
  return { ok: true, meldung: "Reihenfolge gespeichert." };
}
