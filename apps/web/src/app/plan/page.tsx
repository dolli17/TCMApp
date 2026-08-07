import Link from "next/link";
import { createServerSupabase, getCurrentMember, isAdmin } from "@/lib/supabase/server";
import { Belegungsplan } from "@/components/Belegungsplan";
import { PlanAbo } from "@/components/PlanAbo";
import { PlanReiter } from "@/components/PlanReiter";

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

  const [
    angemeldet,
    [plaetzeRes, planRes, artenRes, einstellungRes, quotaRes, verzeichnisRes, meineRes],
  ] =
    await Promise.all([
      getCurrentMember(),
      Promise.all([
      supabase.from("courts").select("id, name, short_name").eq("active", true).order("position"),
      supabase.rpc("day_schedule", { p_date: datum }),
      supabase
        .from("booking_types")
        .select("code, name, duration_minutes, requires_partner, min_players, max_players")
        .eq("active", true)
        .eq("applies_to", "booking")
        .order("sort_order"),
      supabase.rpc("booking_settings"),
      supabase.rpc("my_booking_quota"),
      supabase.rpc("member_directory", { p_query: "" }),
      supabase.rpc("my_bookings", {}),
      ]),
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

  // 0 heisst unbegrenzt. Die Regel bleibt in der Datenbank erhalten, damit der
  // Vorstand sie in knappen Zeiten wieder einschalten kann.
  const belegt = quota?.used ?? 0;
  const erlaubt = quota?.allowed ?? einstellungen.max_open_bookings;
  const unbegrenzt = erlaubt <= 0;
  const heute = heuteInBerlin();

  // Solange das Kontingent unbegrenzt ist, sagt die Kachel nichts, wenn dort
  // die verbrauchte Menge steht - sie zeigt dann dauerhaft eine Zahl ohne
  // Bezugsgroesse. Stattdessen die eigenen Termine, die noch bevorstehen.
  //
  // Bewusst nicht quota.used: das zaehlt nur Buchungsarten mit
  // counts_towards_quota. Fuer die Frage "was habe ich noch vor?" ist eine
  // Buchung eine Buchung.
  const jetzt = Date.now();
  const aktiv = (meineRes.data ?? []).filter(
    (b) => new Date(b.ends_at).getTime() > jetzt,
  ).length;

  return (
    <>
      <section className="hero">
        <div className="kicker">Freiplätze</div>
        <h1>{lesbaresDatum(datum)}</h1>
        <div className="meta">
          <div className="pill">
            <b className="tnum">{unbegrenzt ? aktiv : `${belegt} / ${erlaubt}`}</b>
            <span>
              {unbegrenzt
                ? aktiv === 1
                  ? "Buchung steht an"
                  : "Buchungen stehen an"
                : "von deinem Kontingent"}
            </span>
          </div>
          <div className="pill">
            <b className="tnum">{plaetzeRes.data?.length ?? 0}</b>
            <span>Plätze</span>
          </div>
          <div className="pill">
            <b>{einstellungen.lead_days} Tage</b>
            <span>Vorlauf</span>
          </div>
        </div>
      </section>

      <PlanAbo datum={datum} />

      <PlanReiter aktiv="plan" />

      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "1rem" }}>
        <Link className="knopf leise klein" href={`/plan?tag=${verschiebe(datum, -1)}`}>
          ‹ Vortag
        </Link>
        <strong style={{ minWidth: 200, textAlign: "center" }} className="dpl">{lesbaresDatum(datum)}</strong>
        <Link className="knopf leise klein" href={`/plan?tag=${verschiebe(datum, 1)}`}>
          Folgetag ›
        </Link>
        {datum !== heute && (
          <Link className="knopf leise klein" href="/plan">
            Heute
          </Link>
        )}
      </div>

      {!unbegrenzt && belegt >= erlaubt && (
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
        meineId={angemeldet?.member?.id ?? null}
        oeffnung={String(einstellungen.opening_time).slice(0, 5)}
        schluss={String(einstellungen.closing_time).slice(0, 5)}
        rasterMinuten={einstellungen.slot_minutes}
        anzeigeMinuten={einstellungen.display_minutes}
        dauerMinuten={artenRes.data?.[0]?.duration_minutes ?? 60}
        kontingentFrei={unbegrenzt ? null : Math.max(erlaubt - belegt, 0)}
        gastgebuehrCents={einstellungen.guest_fee_cents ?? 0}
        istAdmin={isAdmin(angemeldet?.roles ?? [])}
      />
    </>
  );
}
