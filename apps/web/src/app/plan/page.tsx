import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { Belegungsplan } from "@/components/Belegungsplan";

export const dynamic = "force-dynamic";

function heuteInBerlin(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
}

function verschiebe(datum: string, tage: number): string {
  const [j, m, t] = datum.split("-").map(Number);
  const d = new Date(Date.UTC(j!, (m ?? 1) - 1, t));
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

function lesbaresDatum(datum: string): string {
  const [j, m, t] = datum.split("-").map(Number);
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(new Date(j!, (m ?? 1) - 1, t));
}

export default async function PlanSeite({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string }>;
}) {
  const { tag } = await searchParams;
  const datum = tag && /^\d{4}-\d{2}-\d{2}$/.test(tag) ? tag : heuteInBerlin();
  const supabase = await createServerSupabase();

  const [plaetzeRes, planRes, artenRes, einstellungRes, quotaRes, verzeichnisRes] =
    await Promise.all([
      supabase.from("courts").select("id, name, short_name").eq("active", true).order("position"),
      supabase.rpc("day_schedule", { p_date: datum }),
      supabase
        .from("booking_types")
        .select("code, name, duration_minutes, requires_partner, max_players")
        .eq("active", true)
        .eq("applies_to", "booking")
        .order("sort_order"),
      supabase.rpc("booking_settings"),
      supabase.rpc("my_booking_quota"),
      supabase.rpc("member_directory", { p_query: "" }),
    ]);

  const einstellungen = einstellungRes.data?.[0];
  const quota = quotaRes.data?.[0];

  if (!einstellungen) {
    return (
      <div className="hinweis fehler">
        Die Buchungseinstellungen konnten nicht geladen werden.
        {einstellungRes.error ? ` (${einstellungRes.error.message})` : ""}
      </div>
    );
  }

  const belegt = quota?.used ?? 0;
  const erlaubt = quota?.allowed ?? einstellungen.max_open_bookings;
  const heute = heuteInBerlin();
  const maxTag = verschiebe(heute, einstellungen.lead_days);

  return (
    <>
      <h1>Plätze</h1>
      <p className="unterzeile">
        {belegt} von {erlaubt} Buchungen offen · buchbar bis {lesbaresDatum(maxTag)}
      </p>

      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "1rem" }}>
        <Link className="knopf leise" href={`/plan?tag=${verschiebe(datum, -1)}`}>
          ‹ Vortag
        </Link>
        <strong style={{ minWidth: 220, textAlign: "center" }}>{lesbaresDatum(datum)}</strong>
        <Link className="knopf leise" href={`/plan?tag=${verschiebe(datum, 1)}`}>
          Folgetag ›
        </Link>
        {datum !== heute && (
          <Link className="knopf leise" href="/plan">
            Heute
          </Link>
        )}
      </div>

      {belegt >= erlaubt && (
        <div className="hinweis fehler">
          Dein Kontingent ist ausgeschöpft. Storniere eine Buchung, um neu zu buchen.
          Buchungen, bei denen du als Mitspieler eingetragen bist, zählen mit.
        </div>
      )}

      <Belegungsplan
        datum={datum}
        plaetze={plaetzeRes.data ?? []}
        belegungen={(planRes.data ?? []) as never}
        arten={artenRes.data ?? []}
        verzeichnis={verzeichnisRes.data ?? []}
        oeffnung={String(einstellungen.opening_time).slice(0, 5)}
        schluss={String(einstellungen.closing_time).slice(0, 5)}
        rasterMinuten={einstellungen.slot_minutes}
        kontingentFrei={Math.max(erlaubt - belegt, 0)}
        vorlaufTage={einstellungen.lead_days}
      />
    </>
  );
}
