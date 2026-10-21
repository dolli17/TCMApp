import { teilnehmerCsv, type EventRegistrationStatus } from "@tcm/core";
import { createServerSupabase, getCurrentMember, isAdmin } from "@/lib/supabase/server";

/**
 * Die Teilnehmerliste als CSV. Das Recht prüft event_teilnehmer selbst:
 * ausser dem Vorstand bekommt niemand Namen.
 *
 * Das Rollenschloss steht trotzdem hier noch einmal: Route Handler laufen
 * nicht durch app/admin/layout.tsx (wie bei der Lastschriftdatei).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const angemeldet = await getCurrentMember();
  if (!angemeldet || !isAdmin(angemeldet.roles)) {
    return new Response("Diese Liste ist dem Vorstand und den App Admins vorbehalten.", { status: 403 });
  }

  const supabase = await createServerSupabase();

  const [teilnehmerRes, eventRes] = await Promise.all([
    supabase.rpc("event_teilnehmer", { p_event_id: id }),
    supabase.from("events").select("title, starts_at").eq("id", id).maybeSingle(),
  ]);
  if (teilnehmerRes.error || !eventRes.data) {
    return new Response("Nicht gefunden.", { status: 404 });
  }

  const csv = teilnehmerCsv(
    (teilnehmerRes.data ?? []).map((z) => ({ ...z, status: z.status as EventRegistrationStatus })),
  );
  const tag = eventRes.data.starts_at.slice(0, 10);
  const name = `${eventRes.data.title}-${tag}`.replace(/[^\p{L}\p{N}-]+/gu, "-");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="teilnehmer.csv"; filename*=UTF-8''${encodeURIComponent(name)}.csv`,
      "Cache-Control": "no-store",
    },
  });
}
