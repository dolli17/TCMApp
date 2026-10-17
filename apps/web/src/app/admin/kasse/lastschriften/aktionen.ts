"use server";

import { revalidatePath } from "next/cache";
import {
  buildPain008, pain008Filename, translateDbError,
  type ChargeKind, type DebtorItem, type DirectDebitBatch, type PainVersion,
} from "@tcm/core";
import { createServerSupabase } from "@/lib/supabase/server";

export interface AktionsErgebnis {
  ok: boolean;
  meldung: string;
}

function frisch(batchId?: string) {
  revalidatePath("/admin/kasse/lastschriften");
  if (batchId) revalidatePath(`/admin/kasse/lastschriften/${batchId}`);
  revalidatePath("/admin/kasse");
  revalidatePath("/konto");
}

/**
 * Die Lastschriftdatei bauen und ablegen.
 *
 * Einmal bauen, nicht bei jedem Abruf neu: die eingereichte Datei ist ein
 * Buchungsbeleg und muss byteidentisch bleiben. Ändert später jemand einen
 * Nachnamen oder die Gläubiger-ID, läge sonst eine andere Datei vor als die,
 * die die Bank bekommen hat.
 *
 * Die Posten werden nach `end_to_end_id` gebündelt: alle Forderungen eines
 * Mitglieds ergeben eine Lastschrift. Anders ginge es auch nicht — `validateBatch`
 * weist zwei Posten mit derselben Mandatsreferenz ab, weil die Bank eine
 * Rückgabe sonst nicht zuordnen könnte.
 */
export async function dateiErzeugen(batchId: string): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.rpc("debit_batch_payload", {
    p_batch_id: batchId,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  const zeilen = data ?? [];
  if (zeilen.length === 0) {
    return { ok: false, meldung: "Der Einzug enthält keine Lastschrift." };
  }

  const kopf = zeilen[0]!;

  // Nach Kennung bündeln: ein Posten je Mitglied, Beträge addiert, die
  // Einzelforderungen im Verwendungszweck.
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
          // und hält jedes Mandat für erloschen, das älter als drei Jahre ist —
          // auch eines, das letzten Monat benutzt wurde.
          lastUsedOn: z.mandate_last_used_on,
          sequenceType: z.sequence_type,
          status: "active",
        },
      });
    }
  }

  const lauf: DirectDebitBatch = {
    messageId: `TCM-${batchId.replace(/-/g, "").slice(0, 24)}`,
    paymentInfoId: `TCM-PMT-${batchId.replace(/-/g, "").slice(0, 20)}`,
    collectionDate: kopf.collection_date,
    creationDateTime: new Date().toISOString(),
    creditor: {
      name: kopf.creditor_name,
      creditorId: kopf.creditor_id,
      iban: kopf.creditor_iban,
      bic: kopf.creditor_bic ?? undefined,
    },
    painVersion: kopf.pain_version as PainVersion,
    items: [...gebuendelt.values()],
  };

  let xml: string;
  try {
    xml = buildPain008(lauf);
  } catch (e) {
    // buildPain008 wirft mit einer Liste aller Beanstandungen. Sie ist genau
    // das, was der Vorstand lesen muss, um sie abzustellen.
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

  if (markFehler) return { ok: false, meldung: translateDbError(markFehler) };

  frisch(batchId);
  return {
    ok: true,
    meldung: `Die Datei ist erzeugt: ${lauf.items.length} ${
      lauf.items.length === 1 ? "Lastschrift" : "Lastschriften"
    }. Jetzt herunterladen und im Onlinebanking einreichen.`,
  };
}

/**
 * Eine Lastschrift kam zurück.
 *
 * Trifft alle Forderungen der Kennung — für die Familienlastschrift über 270
 * Euro kam kein Geld, also für keines der drei Kinder. Danach steht jede
 * dieser Forderungen wieder offen und geht beim nächsten Lauf mit.
 */
export async function ruecklaeuferErfassen(daten: {
  kennung: string;
  grund: string;
  am: string | null;
  batchId: string;
}): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.rpc("record_debit_return", {
    p_end_to_end_id: daten.kennung,
    p_reason: daten.grund,
    p_returned_on: daten.am ?? undefined,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  frisch(daten.batchId);

  const z = data?.[0];
  const anzahl = z?.forderungen ?? 0;
  return {
    ok: true,
    meldung: `Zurückgebucht: ${anzahl} ${
      anzahl === 1 ? "Forderung steht" : "Forderungen stehen"
    } wieder offen. ${z?.payer_name ?? "Das Mitglied"} wurde benachrichtigt.`,
  };
}

export async function laufAbschliessen(batchId: string): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.rpc("complete_debit_batch", {
    p_batch_id: batchId,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  frisch(batchId);

  const z = data?.[0];
  return {
    ok: true,
    meldung: `Einzug abgeschlossen: ${z?.eingezogen ?? 0} eingezogen${
      (z?.zurueck ?? 0) > 0 ? `, ${z!.zurueck} zurückgebucht` : ""
    }.`,
  };
}

export async function laufEingereicht(
  batchId: string,
  am: string | null,
): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();

  const { error } = await supabase.rpc("mark_debit_batch_submitted", {
    p_batch_id: batchId,
    p_submitted_on: am ?? undefined,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  frisch(batchId);
  return { ok: true, meldung: "Der Einzug ist als eingereicht vermerkt." };
}

// ---------------------------------------------------------------------------
// Der Einzug: ankündigen und Lauf anlegen in einem Schritt
// ---------------------------------------------------------------------------

export interface EinzugAuswahl {
  kind: ChargeKind;
  period: string | null;
  returned: boolean;
}

export interface VorschauZeile {
  member_id: string;
  member_name: string;
  positionen: number;
  arten: string;
  kinds: string[];
  amount_cents: number;
  mandate_reference: string | null;
  einzugsfaehig: boolean;
  grund: string | null;
}

/** Wer mitginge - dieselbe Prüfung, die der Einzug selbst nimmt. */
export async function einzugVorschau(
  abbuchung: string,
  gruppen: EinzugAuswahl[],
): Promise<{ ok: true; zeilen: VorschauZeile[] } | { ok: false; meldung: string }> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("einzug_vorschau", {
    p_collection_date: abbuchung,
    p_gruppen: gruppen as never,
  });
  if (error) return { ok: false, meldung: translateDbError(error) };
  return { ok: true, zeilen: (data ?? []) as unknown as VorschauZeile[] };
}

export async function einzugVorbereiten(daten: {
  abbuchung: string;
  gruppen: EinzugAuswahl[];
  titel: string;
}): Promise<AktionsErgebnis & { id?: string }> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("einzug_vorbereiten", {
    p_collection_date: daten.abbuchung,
    p_gruppen: daten.gruppen as never,
    p_title: daten.titel,
  });
  if (error) return { ok: false, meldung: translateDbError(error) };

  const z = data?.[0];
  frisch(z?.batch_id);
  const n = z?.lastschriften ?? 0;
  return {
    ok: true,
    id: z?.batch_id,
    meldung: `${n} ${n === 1 ? "Ankündigung ist" : "Ankündigungen sind"} verschickt, der Einzug ist angelegt.`,
  };
}

/** Ein Mitglied aus dem Einzug nehmen, solange die Datei fehlt. */
export async function einzugMitgliedEntfernen(
  batchId: string,
  kennung: string,
): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("einzug_mitglied_entfernen", {
    p_batch_id: batchId,
    p_end_to_end_id: kennung,
  });
  if (error) return { ok: false, meldung: translateDbError(error) };
  frisch(batchId);
  return { ok: true, meldung: "Das Mitglied ist aus dem Einzug genommen. Seine Forderungen sind wieder offen." };
}

/** Einen leeren Einzug löschen - nur ohne Lastschrift und ohne Datei. */
export async function einzugLoeschen(batchId: string): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("einzug_loeschen", { p_batch_id: batchId });
  if (error) return { ok: false, meldung: translateDbError(error) };
  frisch(batchId);
  return { ok: true, meldung: "Der leere Einzug ist gelöscht." };
}
