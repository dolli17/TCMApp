import { createServerSupabase, getCurrentMember, isAdmin } from "@/lib/supabase/server";

/**
 * Die Lastschriftdatei herunterladen.
 *
 * Ein Route Handler und keine signierte URL: die landete in der
 * Browserhistorie und wäre für ihre Laufzeit für jeden nutzbar, der sie hat.
 * Bei einer Datei mit dreihundert IBANs im Klartext ist das kein hinnehmbarer
 * Nebeneffekt.
 *
 * Das Rollenschloss steht hier noch einmal: Route Handler laufen nicht durch
 * app/admin/layout.tsx. Wer das vergisst, hat die Datei ungeschützt im Netz.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const angemeldet = await getCurrentMember();
  if (!angemeldet || !isAdmin(angemeldet.roles)) {
    return new Response("Diese Datei ist Administratoren vorbehalten.", { status: 403 });
  }

  const supabase = await createServerSupabase();

  const { data: lauf } = await supabase
    .from("debit_batches")
    .select("storage_path, title, collection_date")
    .eq("id", id)
    .maybeSingle();

  if (!lauf?.storage_path) {
    return new Response("Zu diesem Lauf gibt es noch keine Datei.", { status: 404 });
  }

  const { data, error } = await supabase.storage.from("sepa").download(lauf.storage_path);

  if (error || !data) {
    return new Response("Die Datei ließ sich nicht laden.", { status: 500 });
  }

  const name = lauf.storage_path.split("/").pop() ?? "lastschrift.xml";

  return new Response(await data.arrayBuffer(), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      // Eine Datei mit Bankverbindungen gehört in keinen Zwischenspeicher.
      "Cache-Control": "no-store",
    },
  });
}
