import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  LastschriftLauf, type ArtSumme, type LaufKopf, type PostenZeile,
} from "@/components/LastschriftLauf";

export const dynamic = "force-dynamic";

const BERLIN = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" });

export default async function LaufSeite({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabase();

  const { data: lauf } = await supabase
    .from("debit_batches")
    .select("id, title, collection_date, kinds, status, total_cents, item_count, storage_path")
    .eq("id", id)
    .maybeSingle();

  if (!lauf) notFound();

  const [postenRes, jeArtRes, ankuendigungRes, fristRes] = await Promise.all([
    supabase.rpc("debit_batch_items", { p_batch_id: id }),
    supabase.rpc("debit_batch_kinds", { p_batch_id: id }),
    // Wann die Mitglieder informiert wurden. Ein Einzug kündigt alles in
    // einem Zug an; bei alten Läufen zählt die früheste Ankündigung.
    supabase
      .from("debit_items")
      .select("charges(notified_at)")
      .eq("batch_id", id),
    supabase.from("settings").select("value").eq("key", "sepa.prenotification_days").maybeSingle(),
  ]);

  const angekuendigt = (ankuendigungRes.data ?? [])
    .map((z) => (z.charges as { notified_at: string | null } | null)?.notified_at)
    .filter((t): t is string => Boolean(t))
    .sort()[0];

  return (
    <>
      <Link href="/admin/kasse?abschnitt=lastschriften" className="zurueck">
        ‹ Lastschriften
      </Link>

      <LastschriftLauf
        lauf={lauf as unknown as LaufKopf}
        posten={(postenRes.data ?? []) as unknown as PostenZeile[]}
        jeArt={(jeArtRes.data ?? []) as unknown as ArtSumme[]}
        angekuendigtAm={angekuendigt ? BERLIN.format(new Date(angekuendigt)) : null}
        fristTage={Number(fristRes.data?.value ?? 14)}
        heute={BERLIN.format(new Date())}
      />
    </>
  );
}
