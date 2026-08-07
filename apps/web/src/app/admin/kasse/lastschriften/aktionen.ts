"use server";

import { revalidatePath } from "next/cache";
import {
  buildPain008, pain008Filename, translateDbError,
  type DebtorItem, type DirectDebitBatch, type PainVersion,
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

export async function laufAnlegen(daten: {
  titel: string;
  faelligAm: string;
}): Promise<AktionsErgebnis & { id?: string }> {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.rpc("create_debit_batch", {
    p_title: daten.titel,
    p_collection_date: daten.faelligAm,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  frisch();
  return { ok: true, meldung: "Der Lauf ist angelegt.", id: data as string };
}

export async function postenAufnehmen(
  batchId: string,
  zahlerIds: string[] | null,
): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.rpc("add_charges_to_debit_batch", {
    p_batch_id: batchId,
    p_payer_ids: zahlerIds ?? undefined,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  frisch(batchId);

  const z = data?.[0];
  const auf = z?.aufgenommen ?? 0;
  if (auf === 0) {
    return { ok: true, meldung: "Es war nichts Einzugsfähiges dabei." };
  }
  return {
    ok: true,
    meldung: `${auf} ${auf === 1 ? "Forderung" : "Forderungen"} aufgenommen${
      (z?.uebersprungen ?? 0) > 0
        ? `, ${z!.uebersprungen} ${
            z!.uebersprungen === 1 ? "Zahler bleibt" : "Zahler bleiben"
          } außen vor`
        : ""
    }.`,
  };
}

export async function postenEntfernen(
  itemId: string,
  batchId: string,
): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();

  const { error } = await supabase.rpc("remove_charge_from_debit_batch", {
    p_item_id: itemId,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  frisch(batchId);
  return { ok: true, meldung: "Der Posten ist aus dem Lauf genommen." };
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
 * Zahlers ergeben eine Lastschrift. Anders ginge es auch nicht — `validateBatch`
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
    return { ok: false, meldung: "Der Lauf enthält keine Posten." };
  }

  const kopf = zeilen[0]!;

  // Nach Kennung bündeln: ein Posten je Zahler, Beträge addiert, die
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
          scope: z.mandate_scope,
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
  return { ok: true, meldung: "Der Lauf ist als eingereicht vermerkt." };
}
