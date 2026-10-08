/**
 * Die Kasse der Verwaltung - dieselben RPCs wie apps/web/src/app/admin/kasse
 * (aktionen.ts, lastschriften/aktionen.ts, page.tsx und die Komponenten
 * KassenKennzahlen, LaufListe, LastschriftLauf).
 *
 * Auf charges, fee_types und fee_prices gibt es nur `grant select` - auch fuer
 * Admins. Alles Schreibende laeuft ueber SECURITY-DEFINER-RPCs, die selbst
 * private.is_admin() pruefen.
 *
 * Wie in daten.ts: Lesen wirft mit einem verstaendlichen Satz, Schreiben gibt
 * ein Ergebnis zurueck und wirft nie. Die Meldungen sind wortgleich mit den
 * Server Actions im Web.
 *
 * Die Getraenkemonate (ladeGetraenkemonate, monatSchliessen, monatAbrechnen)
 * braucht auch die Getraenke-Seite - ihre Signaturen bleiben stabil.
 */

import {
  buildPain008, pain008Filename, translateDbError,
  type DebitBatchStatus, type DebtorItem, type DirectDebitBatch, type PainVersion,
} from "@tcm/core";
import { supabase } from "@/lib/supabase";
import {
  heuteInBerlin, ladeEinstellungen, oderWirf, type Einstellung, type Ergebnis,
} from "@/lib/verwaltung/gemeinsam";

export type ForderungsArt = "fee" | "drinks" | "deposit" | "work_duty" | "misc" | "guest";
export type ForderungsStand = "open" | "notified" | "submitted" | "settled" | "returned" | "waived";

/** Fehler als Ergebnis - der eine Satz, den alle Schreibfunktionen teilen. */
function fehlschlag(error: { message: string; code?: string }): { ok: false; meldung: string } {
  return { ok: false, meldung: translateDbError(error) };
}

/** Einzahl oder Mehrzahl, wie in den Meldungen des Webs. */
function zahlwort(n: number, eins: string, viele: string): string {
  return `${n} ${n === 1 ? eins : viele}`;
}

// ===========================================================================
// Getraenkemonate (auch von der Getraenke-Seite benutzt)
// ===========================================================================

export interface MonatZeile {
  id: string;
  year: number;
  month: number;
  status: "open" | "closed" | "charged";
  buchungen: number;
  mitglieder: number;
  summe_cents: number;
  forderungen: number;
  offen: number;
  offen_cents: number;
  closed_at: string | null;
  charged_at: string | null;
}

/** Die juengsten Abrechnungszeitraeume, wie im Web 18 Monate. */
export async function ladeGetraenkemonate(limit = 18): Promise<MonatZeile[]> {
  const data = oderWirf(await supabase.rpc("billing_period_overview", { p_limit: limit }));
  return (data ?? []) as unknown as MonatZeile[];
}

export async function monatSchliessen(jahr: number, monat: number): Promise<Ergebnis> {
  const { data, error } = await supabase.rpc("close_billing_period", { p_year: jahr, p_month: monat });
  if (error) return fehlschlag(error);
  const z = data?.[0];
  return {
    ok: true,
    meldung: `Monat geschlossen. ${z?.buchungen ?? 0} Entnahmen von ${
      z?.mitglieder ?? 0
    } Mitgliedern stehen jetzt fest.`,
  };
}

export async function monatAbrechnen(
  jahr: number,
  monat: number,
  faelligAm: string | null,
): Promise<Ergebnis> {
  const { data, error } = await supabase.rpc("charge_billing_period", {
    p_year: jahr,
    p_month: monat,
    p_due_date: faelligAm ?? undefined,
  });
  if (error) return fehlschlag(error);
  const erzeugt = data?.[0]?.erzeugt ?? 0;
  if (erzeugt === 0) return { ok: true, meldung: "Es gab nichts Neues zu erzeugen." };
  return { ok: true, meldung: `${zahlwort(erzeugt, "Forderung", "Forderungen")} erzeugt.` };
}

/**
 * Die Vorabankuendigungsfrist in Tagen (sepa.prenotification_days, sonst 14).
 * Die Getraenkemonat-Karte braucht sie fuer den Faelligkeitstag der Ankuendigung.
 */
export async function ladeAnkuendigungsfrist(): Promise<number> {
  const { data, error } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "sepa.prenotification_days")
    .maybeSingle();
  if (error) throw new Error(translateDbError(error));
  return fristAus(data?.value);
}

function fristAus(wert: unknown): number {
  const n = Number(wert ?? 14);
  return Number.isFinite(n) ? n : 14;
}

// ===========================================================================
// Vorabankuendigung
// ===========================================================================

export async function forderungenAnkuendigen(daten: {
  faelligAm: string;
  art: ForderungsArt | null;
  zeitraum: string | null;
}): Promise<Ergebnis> {
  const { data, error } = await supabase.rpc("announce_charges", {
    p_due_date: daten.faelligAm,
    p_kind: daten.art ?? undefined,
    p_period_label: daten.zeitraum ?? undefined,
    p_charge_ids: undefined,
  });
  if (error) return fehlschlag(error);

  const z = data?.[0];
  const anzahl = z?.angekuendigt ?? 0;
  if (anzahl === 0) return { ok: true, meldung: "Es gab nichts anzukündigen." };

  // Je Zahler geht eine Nachricht raus, nicht je Kind - die Zahl der
  // Empfaenger steht deshalb daneben.
  const empfaenger = z?.empfaenger ?? 0;
  return {
    ok: true,
    meldung: `${zahlwort(anzahl, "Forderung", "Forderungen")} angekündigt, ${empfaenger} ${
      empfaenger === 1 ? "Zahler wurde" : "Zahler wurden"
    } benachrichtigt.`,
  };
}

/**
 * Datum plus Tage als ISO, gerechnet auf dem Kalendertag (UTC), damit die
 * Zeitzone des Geraets nichts verschiebt.
 */
export function plusTage(iso: string, tage: number): string {
  const [j, m, t] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(j!, m! - 1, t! + tage));
  return d.toISOString().slice(0, 10);
}

// ===========================================================================
// Kennzahlen der Kasse
// ===========================================================================

export interface KassenKennzahlen {
  offenCents: number | null;
  posten: number;
  laufend: number | null;
  zurueck: number | null;
}

/** Wie KassenKennzahlen im Web: jede Quelle darf fuer sich fehlschlagen. */
export async function ladeKassenKennzahlen(): Promise<KassenKennzahlen> {
  const [forderungenRes, laeufeRes] = await Promise.all([
    supabase.from("charges").select("amount_cents, status").in("status", ["open", "notified", "returned"]),
    supabase.from("debit_batches").select("id", { count: "exact", head: true }).neq("status", "completed"),
  ]);
  const forderungen = forderungenRes.data ?? [];
  return {
    offenCents: forderungenRes.error ? null : forderungen.reduce((s, f) => s + f.amount_cents, 0),
    posten: forderungen.length,
    laufend: laeufeRes.error ? null : (laeufeRes.count ?? 0),
    zurueck: forderungenRes.error ? null : forderungen.filter((f) => f.status === "returned").length,
  };
}

/** Die Einstellungen der Kasse: fees.* und sepa.* */
export function ladeKassenEinstellungen(): Promise<Einstellung[]> {
  return ladeEinstellungen(["fees.", "sepa."]);
}

/** Ein Einstellungswert als Text ohne JSON-Anfuehrungszeichen - wie im Web. */
export function einstellungsWert(einstellungen: Einstellung[], schluessel: string): string {
  return String(einstellungen.find((e) => e.key === schluessel)?.value ?? "").replace(/"/g, "");
}

export function ankuendigungsfrist(einstellungen: Einstellung[]): number {
  return fristAus(einstellungen.find((e) => e.key === "sepa.prenotification_days")?.value);
}

// ===========================================================================
// Forderungen
// ===========================================================================

export interface ForderungZeile {
  id: string;
  member_id: string;
  member_name: string;
  payer_id: string;
  payer_name: string;
  kind: ForderungsArt;
  period_label: string | null;
  amount_cents: number;
  description: string;
  status: ForderungsStand;
  due_date: string | null;
  notified_at: string | null;
  created_at: string;
  hat_mandat: boolean;
}

export async function ladeForderungen(stand: string | null): Promise<ForderungZeile[]> {
  const data = oderWirf(
    await supabase.rpc("charge_overview", {
      p_status: (stand || undefined) as never,
      p_kind: undefined,
      p_limit: 500,
    }),
  );
  return (data ?? []) as unknown as ForderungZeile[];
}

export async function forderungErlassen(id: string, grund: string): Promise<Ergebnis> {
  const { error } = await supabase.rpc("waive_charge", { p_charge_id: id, p_reason: grund });
  if (error) return fehlschlag(error);
  return { ok: true, meldung: "Die Forderung ist erlassen." };
}

export async function forderungAbhaken(id: string, vermerk: string): Promise<Ergebnis> {
  const { error } = await supabase.rpc("settle_charge_manually", {
    p_charge_id: id,
    p_note: vermerk === "" ? undefined : vermerk,
  });
  if (error) return fehlschlag(error);
  return { ok: true, meldung: "Die Forderung ist als bezahlt vermerkt." };
}

// ===========================================================================
// Beitragsarten und Preise
// ===========================================================================

export interface BeitragsartZeile {
  id: string;
  code: string;
  name: string;
  description: string | null;
  active: boolean;
  sort_order: number;
  preis_cents: number | null;
  preis_ab_jahr: number | null;
  naechster_preis_cents: number | null;
  naechster_preis_ab_jahr: number | null;
  mitglieder: number;
  soll_stunden: number | null;
}

export async function ladeBeitragsarten(jahr: number): Promise<BeitragsartZeile[]> {
  const data = oderWirf(await supabase.rpc("fee_type_overview", { p_year: jahr }));
  return (data ?? []) as unknown as BeitragsartZeile[];
}

export async function beitragsartSpeichern(daten: {
  id: string | null;
  code: string;
  name: string;
  beschreibung: string;
}): Promise<Ergebnis> {
  const { error } = await supabase.rpc("upsert_fee_type", {
    // Beim Anlegen gibt es noch keine Id; die Funktion nimmt null als
    // "neu anlegen", der generierte Typ kennt aber nur string.
    p_id: daten.id as string,
    p_code: daten.code,
    p_name: daten.name,
    p_description: daten.beschreibung,
    p_sort_order: undefined,
  });
  if (error) return fehlschlag(error);
  return { ok: true, meldung: daten.id ? "Beitragsart gespeichert." : "Beitragsart angelegt." };
}

export async function beitragspreisSetzen(daten: {
  artId: string;
  jahr: number;
  betragCents: number;
}): Promise<Ergebnis> {
  const { error } = await supabase.rpc("set_fee_price", {
    p_fee_type_id: daten.artId,
    p_valid_from_year: daten.jahr,
    p_amount_cents: daten.betragCents,
  });
  if (error) return fehlschlag(error);
  return { ok: true, meldung: `Preis ab ${daten.jahr} gesetzt.` };
}

export async function beitragsartUmschalten(id: string, aktiv: boolean): Promise<Ergebnis> {
  const { data, error } = await supabase.rpc("set_fee_type_active", { p_id: id, p_active: aktiv });
  if (error) return fehlschlag(error);

  const betroffen = typeof data === "number" ? data : 0;
  if (!aktiv && betroffen > 0) {
    return {
      ok: true,
      meldung: `Beitragsart stillgelegt. ${betroffen} ${
        betroffen === 1 ? "Mitglied hat sie" : "Mitglieder haben sie"
      } dieses Jahr noch zugewiesen.`,
    };
  }
  return { ok: true, meldung: aktiv ? "Beitragsart ist wieder verfügbar." : "Beitragsart stillgelegt." };
}

// ===========================================================================
// Der Beitragslauf
// ===========================================================================

export interface VorschauZeile {
  member_id: string;
  member_name: string;
  payer_name: string;
  fee_types: string;
  amount_cents: number;
  has_mandate: boolean;
  already_charged: boolean;
}

export interface Beitragslauf {
  zeilen: VorschauZeile[];
  anzukuendigen: { anzahl: number; summe_cents: number; zahler: number };
}

export async function ladeBeitragslauf(jahr: number): Promise<Beitragslauf> {
  const [vorschau, offen] = await Promise.all([
    supabase.rpc("fee_run_preview", { p_year: jahr }),
    supabase.rpc("announceable_charges", { p_kind: "fee", p_period_label: String(jahr) }),
  ]);
  const zeilen = (oderWirf(vorschau) ?? []) as unknown as VorschauZeile[];
  const anzukuendigen = (oderWirf(offen) ?? [])[0] ?? { anzahl: 0, summe_cents: 0, zahler: 0 };
  return { zeilen, anzukuendigen };
}

export async function beitragslaufStarten(daten: {
  jahr: number;
  faelligAm: string | null;
}): Promise<Ergebnis> {
  const { data, error } = await supabase.rpc("fee_run_execute", {
    p_year: daten.jahr,
    p_due_date: daten.faelligAm ?? undefined,
  });
  if (error) return fehlschlag(error);

  const z = data?.[0];
  const erzeugt = z?.erzeugt ?? 0;
  // Null erzeugte Forderungen ist kein Fehler, sondern der Normalfall beim
  // zweiten Tippen.
  if (erzeugt === 0) return { ok: true, meldung: "Es gab nichts Neues zu erzeugen." };

  return {
    ok: true,
    meldung: `${zahlwort(erzeugt, "Forderung", "Forderungen")} erzeugt${
      (z?.uebersprungen ?? 0) > 0 ? `, ${z!.uebersprungen} bestanden schon` : ""
    }.`,
  };
}

// ===========================================================================
// Lastschriftlaeufe
// ===========================================================================

export interface LaufZeile {
  id: string;
  title: string;
  collection_date: string;
  status: DebitBatchStatus;
  total_cents: number;
  item_count: number;
  zurueck: number;
  /** Nur fuer leere Entwuerfe: wer kaeme in Frage, wer ist einzugsfaehig */
  kandidaten: { alle: number; bereit: number } | null;
}

export interface Laeufe {
  laeufe: LaufZeile[];
  /** Der spaeteste angekuendigte Faelligkeitstag, gelesen wie auf der Laufseite */
  faelligAb: string | null;
}

/** Der spaeteste Faelligkeitstag einer angekuendigten Forderung. */
async function spaetesteFaelligkeit(): Promise<string | null> {
  const { data } = await supabase
    .from("charges")
    .select("due_date")
    .eq("status", "notified")
    .not("due_date", "is", null)
    .order("due_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.due_date ?? null;
}

/**
 * Die Laeufe wie LaufListe im Web: fuer leere Entwuerfe fragt die Liste die
 * Datenbank, wer einzugsfaehig ist. Das sind in der Praxis ein, zwei Laeufe.
 */
export async function ladeLaeufe(limit = 24): Promise<Laeufe> {
  const roh = oderWirf(await supabase.rpc("debit_batch_overview", { p_limit: limit })) ?? [];
  const entwuerfe = roh.filter((l) => l.status === "draft" && l.item_count === 0);

  const kandidaten = new Map<string, { alle: number; bereit: number }>();
  const [faelligAb] = await Promise.all([
    entwuerfe.length ? spaetesteFaelligkeit() : Promise.resolve(null),
    ...entwuerfe.map(async (l) => {
      const { data } = await supabase.rpc("debit_batch_candidates", { p_collection_date: l.collection_date });
      kandidaten.set(l.id, {
        alle: (data ?? []).length,
        bereit: (data ?? []).filter((k) => k.einzugsfaehig).length,
      });
    }),
  ]);

  return {
    faelligAb,
    laeufe: roh.map((l) => ({
      id: l.id,
      title: l.title,
      collection_date: l.collection_date,
      status: l.status,
      total_cents: l.total_cents,
      item_count: l.item_count,
      zurueck: l.zurueck,
      kandidaten: kandidaten.get(l.id) ?? null,
    })),
  };
}

export async function laufAnlegen(daten: { titel: string; faelligAm: string }): Promise<Ergebnis<string>> {
  const { data, error } = await supabase.rpc("create_debit_batch", {
    p_title: daten.titel,
    p_collection_date: daten.faelligAm,
  });
  if (error) return fehlschlag(error);
  return { ok: true, meldung: "Der Lauf ist angelegt.", daten: data as string };
}

// --- Ein Lauf ---------------------------------------------------------------

export interface KandidatZeile {
  payer_id: string;
  payer_name: string;
  charge_ids: string[];
  positionen: number;
  arten: string;
  amount_cents: number;
  mandate_id: string | null;
  mandate_reference: string | null;
  einzugsfaehig: boolean;
  grund: string | null;
}

export interface PostenZeile {
  end_to_end_id: string;
  payer_name: string;
  mitglieder: string;
  positionen: number;
  amount_cents: number;
  mandate_reference: string;
  result: "pending" | "settled" | "returned";
  return_reason: string | null;
  returned_on: string | null;
}

export interface LaufKopf {
  id: string;
  title: string;
  collection_date: string;
  status: DebitBatchStatus;
  total_cents: number;
  item_count: number;
  storage_path: string | null;
}

export interface LaufDaten {
  lauf: LaufKopf | null;
  kandidaten: KandidatZeile[];
  posten: PostenZeile[];
  faelligAb: string | null;
  heute: string;
}

/** Wie lastschriften/[id]/page.tsx im Web. Ein unbekannter Lauf gibt lauf: null. */
export async function ladeLauf(id: string): Promise<LaufDaten> {
  const heute = heuteInBerlin();
  const lauf = oderWirf(
    await supabase
      .from("debit_batches")
      .select("id, title, collection_date, status, total_cents, item_count, storage_path")
      .eq("id", id)
      .maybeSingle(),
  ) as LaufKopf | null;
  if (!lauf) return { lauf: null, kandidaten: [], posten: [], faelligAb: null, heute };

  // Die Kandidaten nur solange der Lauf ein Entwurf ist: danach ist die
  // Auswahl entschieden.
  const [kandidatenRes, postenRes] = await Promise.all([
    lauf.status === "draft"
      ? supabase.rpc("debit_batch_candidates", { p_collection_date: lauf.collection_date, p_kinds: undefined })
      : Promise.resolve({ data: [], error: null }),
    supabase.rpc("debit_batch_items", { p_batch_id: id }),
  ]);
  const kandidaten = (oderWirf(kandidatenRes) ?? []) as unknown as KandidatZeile[];
  const posten = (oderWirf(postenRes) ?? []) as unknown as PostenZeile[];

  // Gelesen, nicht gerechnet: ab wann eingezogen werden darf, prueft die Datenbank.
  const faelligAb = kandidaten.length ? await spaetesteFaelligkeit() : null;

  return { lauf, kandidaten, posten, faelligAb, heute };
}

export async function postenAufnehmen(batchId: string, zahlerIds: string[] | null): Promise<Ergebnis> {
  const { data, error } = await supabase.rpc("add_charges_to_debit_batch", {
    p_batch_id: batchId,
    p_payer_ids: zahlerIds ?? undefined,
  });
  if (error) return fehlschlag(error);

  const z = data?.[0];
  const auf = z?.aufgenommen ?? 0;
  if (auf === 0) return { ok: true, meldung: "Es war nichts Einzugsfähiges dabei." };
  const weg = z?.uebersprungen ?? 0;
  return {
    ok: true,
    meldung: `${zahlwort(auf, "Forderung", "Forderungen")} aufgenommen${
      weg > 0 ? `, ${weg} ${weg === 1 ? "Zahler bleibt" : "Zahler bleiben"} außen vor` : ""
    }.`,
  };
}

// --- Die Datei --------------------------------------------------------------

export type PayloadZeile = {
  amount_cents: number;
  collection_date: string;
  creditor_bic: string | null;
  creditor_iban: string;
  creditor_id: string;
  creditor_name: string;
  debtor_iban: string;
  debtor_name: string;
  end_to_end_id: string;
  kind: DebtorItem["kind"];
  mandate_last_used_on: string | null;
  mandate_reference: string;
  mandate_signed_on: string;
  pain_version: string;
  remittance_info: string;
  sequence_type: DebtorItem["mandate"]["sequenceType"];
};

/**
 * Aus den Zeilen von debit_batch_payload den Lauf fuer buildPain008 - genau
 * wie dateiErzeugen im Web.
 *
 * Die Posten werden nach `end_to_end_id` gebuendelt: alle Forderungen eines
 * Zahlers ergeben eine Lastschrift. Anders ginge es auch nicht -
 * `validateBatch` weist zwei Posten mit derselben Mandatsreferenz ab.
 */
export function baueLastschriftLauf(
  batchId: string,
  zeilen: PayloadZeile[],
  jetzt: Date = new Date(),
): DirectDebitBatch {
  const kopf = zeilen[0]!;
  const gebuendelt = new Map<string, DebtorItem>();
  for (const z of zeilen) {
    const vorhanden = gebuendelt.get(z.end_to_end_id);
    if (vorhanden) {
      vorhanden.amountCents += z.amount_cents;
      vorhanden.remittanceInfo += `, ${z.remittance_info}`;
    } else {
      gebuendelt.set(z.end_to_end_id, {
        endToEndId: z.end_to_end_id,
        debtorName: z.debtor_name,
        debtorIban: z.debtor_iban,
        amountCents: z.amount_cents,
        remittanceInfo: z.remittance_info,
        kind: z.kind,
        mandate: {
          reference: z.mandate_reference,
          signedOn: z.mandate_signed_on,
          // Ohne diesen Wert rechnet isMandateExpired ab dem Unterschriftsdatum
          // und haelt jedes Mandat fuer erloschen, das aelter als drei Jahre ist.
          lastUsedOn: z.mandate_last_used_on,
          sequenceType: z.sequence_type,
          status: "active",
        },
      });
    }
  }

  return {
    messageId: `TCM-${batchId.replace(/-/g, "").slice(0, 24)}`,
    paymentInfoId: `TCM-PMT-${batchId.replace(/-/g, "").slice(0, 20)}`,
    collectionDate: kopf.collection_date,
    creationDateTime: jetzt.toISOString(),
    creditor: {
      name: kopf.creditor_name,
      creditorId: kopf.creditor_id,
      iban: kopf.creditor_iban,
      bic: kopf.creditor_bic ?? undefined,
    },
    painVersion: kopf.pain_version as PainVersion,
    items: [...gebuendelt.values()],
  };
}

/**
 * Die Lastschriftdatei bauen und ablegen.
 *
 * Einmal bauen, nicht bei jedem Abruf neu: die eingereichte Datei ist ein
 * Buchungsbeleg und muss byteidentisch bleiben.
 */
export async function dateiErzeugen(batchId: string): Promise<Ergebnis> {
  const { data, error } = await supabase.rpc("debit_batch_payload", { p_batch_id: batchId });
  if (error) return fehlschlag(error);

  const zeilen = (data ?? []) as unknown as PayloadZeile[];
  if (zeilen.length === 0) return { ok: false, meldung: "Der Lauf enthält keine Posten." };

  const lauf = baueLastschriftLauf(batchId, zeilen);

  let xml: string;
  try {
    xml = buildPain008(lauf);
  } catch (e) {
    // buildPain008 wirft mit einer Liste aller Beanstandungen - genau das,
    // was der Vorstand lesen muss, um sie abzustellen.
    return { ok: false, meldung: e instanceof Error ? e.message : "Die Datei ließ sich nicht bauen." };
  }

  const pfad = `${batchId}/${pain008Filename(lauf)}`;
  const { error: ablageFehler } = await supabase.storage
    .from("sepa")
    .upload(pfad, xml, { contentType: "application/xml", upsert: true });
  if (ablageFehler) {
    return { ok: false, meldung: `Die Datei ließ sich nicht ablegen. (${ablageFehler.message})` };
  }

  const summe = lauf.items.reduce((s, i) => s + i.amountCents, 0);
  const { error: markFehler } = await supabase.rpc("mark_debit_batch_generated", {
    p_batch_id: batchId,
    p_storage_path: pfad,
    p_total_cents: summe,
    p_item_count: lauf.items.length,
  });
  if (markFehler) return fehlschlag(markFehler);

  return {
    ok: true,
    meldung: `Die Datei ist erzeugt: ${zahlwort(lauf.items.length, "Lastschrift", "Lastschriften")}. Jetzt herunterladen und im Onlinebanking einreichen.`,
  };
}

/** Blob -> Text; React Native kennt Blob.text() nicht ueberall. */
function blobZuText(blob: Blob): Promise<string> {
  if (typeof (blob as { text?: unknown }).text === "function") return blob.text();
  return new Promise((aufloesen, ablehnen) => {
    const leser = new FileReader();
    leser.onload = () => aufloesen(String(leser.result ?? ""));
    leser.onerror = () => ablehnen(leser.error ?? new Error("Lesefehler"));
    leser.readAsText(blob);
  });
}

/**
 * Die abgelegte Datei laden (wie datei/route.ts im Web): nie eine signierte
 * URL, sondern der Download mit der Sitzung des Admins.
 */
export async function ladeLastschriftdatei(
  storagePfad: string | null,
): Promise<Ergebnis<{ name: string; xml: string }>> {
  if (!storagePfad) return { ok: false, meldung: "Zu diesem Lauf gibt es noch keine Datei." };
  const { data, error } = await supabase.storage.from("sepa").download(storagePfad);
  if (error || !data) return { ok: false, meldung: "Die Datei ließ sich nicht laden." };
  try {
    const xml = await blobZuText(data);
    const name = storagePfad.split("/").pop() ?? "lastschrift.xml";
    return { ok: true, meldung: "Die Datei ist geladen.", daten: { name, xml } };
  } catch {
    return { ok: false, meldung: "Die Datei ließ sich nicht laden." };
  }
}

// --- Nach dem Erzeugen ------------------------------------------------------

export async function laufEingereicht(batchId: string, am: string | null): Promise<Ergebnis> {
  const { error } = await supabase.rpc("mark_debit_batch_submitted", {
    p_batch_id: batchId,
    p_submitted_on: am ?? undefined,
  });
  if (error) return fehlschlag(error);
  return { ok: true, meldung: "Der Lauf ist als eingereicht vermerkt." };
}

/**
 * Eine Lastschrift kam zurueck. Trifft alle Forderungen der Kennung - danach
 * steht jede davon wieder offen und geht beim naechsten Lauf mit.
 */
export async function ruecklaeuferErfassen(daten: {
  kennung: string;
  grund: string;
  am: string | null;
}): Promise<Ergebnis> {
  const { data, error } = await supabase.rpc("record_debit_return", {
    p_end_to_end_id: daten.kennung,
    p_reason: daten.grund,
    p_returned_on: daten.am ?? undefined,
  });
  if (error) return fehlschlag(error);

  const z = data?.[0];
  const anzahl = z?.forderungen ?? 0;
  return {
    ok: true,
    meldung: `Zurückgebucht: ${anzahl} ${
      anzahl === 1 ? "Forderung steht" : "Forderungen stehen"
    } wieder offen. ${z?.payer_name ?? "Der Zahler"} wurde benachrichtigt.`,
  };
}

export async function laufAbschliessen(batchId: string): Promise<Ergebnis> {
  const { data, error } = await supabase.rpc("complete_debit_batch", { p_batch_id: batchId });
  if (error) return fehlschlag(error);
  const z = data?.[0];
  return {
    ok: true,
    meldung: `Lauf abgeschlossen: ${z?.eingezogen ?? 0} eingezogen${
      (z?.zurueck ?? 0) > 0 ? `, ${z!.zurueck} zurückgebucht` : ""
    }.`,
  };
}

// ===========================================================================
// Die Seite /verwaltung/kasse
// ===========================================================================

export const ABSCHNITTE = [
  { wert: "forderungen", label: "Forderungen" },
  { wert: "lastschrift", label: "Lastschriften" },
  { wert: "getraenke", label: "Getränkemonate" },
  { wert: "lauf", label: "Beitragslauf" },
  { wert: "arten", label: "Beitragsarten" },
  { wert: "regeln", label: "Regeln" },
] as const;

export type KassenAbschnitt = (typeof ABSCHNITTE)[number]["wert"];

/** Die drei Teile des Segment-Schalters; der Rest sind Unterseiten. */
export const SEGMENTE: KassenAbschnitt[] = ["forderungen", "lastschrift", "getraenke"];

export interface KassenDaten {
  /** Welche Ansicht geladen wurde - die Seite zeigt nur passende Daten. */
  schluessel: string;
  heute: string;
  einstellungen: Einstellung[];
  kennzahlen: KassenKennzahlen | null;
  forderungen: ForderungZeile[] | null;
  laeufe: Laeufe | null;
  monate: MonatZeile[] | null;
  arten: BeitragsartZeile[] | null;
  beitragslauf: Beitragslauf | null;
}

/**
 * Was eine Ansicht der Kasse braucht - wie page.tsx im Web nur die Quellen
 * des gewaehlten Abschnitts, die Einstellungen immer (Frist, Glaeubiger-ID).
 */
export async function ladeKasse(ansicht: {
  abschnitt: KassenAbschnitt;
  jahr: number;
  stand: string | null;
}): Promise<KassenDaten> {
  const { abschnitt, jahr, stand } = ansicht;
  const unterseite = !SEGMENTE.includes(abschnitt);
  const [einstellungen, kennzahlen, forderungen, laeufe, monate, arten, beitragslauf] = await Promise.all([
    ladeKassenEinstellungen(),
    unterseite ? null : ladeKassenKennzahlen(),
    abschnitt === "forderungen" ? ladeForderungen(stand) : null,
    abschnitt === "lastschrift" ? ladeLaeufe() : null,
    abschnitt === "getraenke" ? ladeGetraenkemonate() : null,
    abschnitt === "arten" ? ladeBeitragsarten(jahr) : null,
    abschnitt === "lauf" ? ladeBeitragslauf(jahr) : null,
  ]);
  return {
    schluessel: kassenSchluessel(ansicht),
    heute: heuteInBerlin(),
    einstellungen, kennzahlen, forderungen, laeufe, monate, arten, beitragslauf,
  };
}

export function kassenSchluessel(a: { abschnitt: string; jahr: number; stand: string | null }): string {
  return `${a.abschnitt}|${a.jahr}|${a.stand ?? ""}`;
}
