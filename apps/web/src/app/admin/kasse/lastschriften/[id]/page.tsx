import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  LastschriftLauf, type KandidatZeile, type LaufKopf, type PostenZeile,
} from "@/components/LastschriftLauf";

export const dynamic = "force-dynamic";

export default async function LaufSeite({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabase();

  const { data: lauf } = await supabase
    .from("debit_batches")
    .select("id, title, collection_date, status, total_cents, item_count, storage_path")
    .eq("id", id)
    .maybeSingle();

  if (!lauf) notFound();

  // Die Kandidaten nur solange der Lauf ein Entwurf ist: danach ist die
  // Auswahl entschieden, und eine Liste, die sich noch bewegt, wäre irreführend.
  const [kandidatenRes, postenRes] = await Promise.all([
    lauf.status === "draft"
      ? supabase.rpc("debit_batch_candidates", {
          p_collection_date: lauf.collection_date,
          p_kinds: undefined,
        })
      : Promise.resolve({ data: null }),
    supabase.rpc("debit_batch_items", { p_batch_id: id }),
  ]);

  return (
    <>
      <p className="zurueck">
        <Link href="/admin/kasse/lastschriften">← Lastschriftläufe</Link>
      </p>

      <LastschriftLauf
        lauf={lauf as unknown as LaufKopf}
        kandidaten={(kandidatenRes.data ?? []) as unknown as KandidatZeile[]}
        posten={(postenRes.data ?? []) as unknown as PostenZeile[]}
      />
    </>
  );
}
