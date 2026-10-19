import { notFound } from "next/navigation";
import { centsZuPreisText, isoZuBerlinLokal, stundenText } from "@tcm/core";
import { createServerSupabase } from "@/lib/supabase/server";
import { alsEvent } from "@/lib/veranstaltungen";
import { VerwaltungsKopf } from "@/components/VerwaltungsKopf";
import { VeranstaltungsFormular } from "@/components/VeranstaltungsFormular";

export const dynamic = "force-dynamic";

export default async function VeranstaltungBearbeitenSeite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data } = await supabase.rpc("event_verwaltung");
  const zeile = (data ?? []).find((z) => z.id === id);
  if (!zeile) notFound();
  const e = alsEvent(zeile);

  return (
    <div className="verwaltung veranstaltung-bearbeiten">
      <VerwaltungsKopf
        kicker="Verwaltung · Veranstaltungen"
        titel={`${e.title} bearbeiten`}
        zurueck={{ href: `/admin/veranstaltungen/${id}`, text: e.title }}
      />
      {e.status === "cancelled" ? (
        <div className="hinweis fehler">Eine abgesagte Veranstaltung lässt sich nicht mehr bearbeiten.</div>
      ) : (
        <VeranstaltungsFormular
          id={id}
          entwurf={e.status === "draft"}
          angemeldet={e.personen}
          anfang={{
            kind: e.kind,
            title: e.title,
            description: zeile.description ?? "",
            location: e.location ?? "",
            start: isoZuBerlinLokal(e.starts_at),
            ende: isoZuBerlinLokal(e.ends_at),
            anmeldung: e.registration_enabled,
            schluss: isoZuBerlinLokal(e.registration_deadline),
            plaetze: e.max_participants != null ? String(e.max_participants) : "",
            begleitung: zeile.companions_allowed,
            gebuehr: Boolean(e.fee_cents),
            preis: centsZuPreisText(e.fee_cents),
            stunden: e.work_hours != null ? stundenText(e.work_hours) : "",
          }}
        />
      )}
    </div>
  );
}
