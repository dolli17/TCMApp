import Link from "next/link";
import { berlinDay, translateDbError } from "@tcm/core";
import { createServerSupabase, darfPlaetze, getCurrentMember } from "@/lib/supabase/server";
import { Belegungsplan } from "@/components/Belegungsplan";
import { PlanAbo } from "@/components/PlanAbo";
import { PlanSegmente } from "@/components/PlanSegmente";
import { Fehlerzustand } from "@/components/Fehlerzustand";

export const dynamic = "force-dynamic";

function verschiebe(datum: string, tage: number): string {
  const [j, m, t] = datum.split("-").map(Number);
  const d = new Date(Date.UTC(j!, (m ?? 1) - 1, t));
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

const KURZ = new Intl.DateTimeFormat("de-DE", { weekday: "short" });

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
  const datum = tag && /^\d{4}-\d{2}-\d{2}$/.test(tag) ? tag : berlinDay(new Date());
  const supabase = await createServerSupabase();

  const [
    angemeldet,
    [plaetzeRes, planRes, artenRes, einstellungRes, quotaRes, verzeichnisRes, meineRes, blockungsartenRes],
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
      supabase
        .from("booking_types")
        .select("code, name")
        .eq("active", true)
        .eq("applies_to", "blocking")
        .order("sort_order"),
      ]),
    ]);

  const einstellungen = einstellungRes.data?.[0];
  const quota = quotaRes.data?.[0];

  if (!einstellungen) {
    return (
      <Fehlerzustand
        titel="Die Buchungseinstellungen konnten nicht geladen werden."
        text={einstellungRes.error ? translateDbError(einstellungRes.error) : undefined}
      />
    );
  }

  // Ohne Plätze oder Belegung sähe der Plan leer und frei aus (B14) - und
  // jemand buchte auf einen Platz, der längst belegt ist.
  const ladefehler = plaetzeRes.error ?? planRes.error ?? artenRes.error;
  if (ladefehler) {
    return (
      <Fehlerzustand titel="Die Belegung ließ sich nicht laden." text={translateDbError(ladefehler)} />
    );
  }

  // 0 heisst unbegrenzt. Die Regel bleibt in der Datenbank erhalten, damit der
  // Vorstand sie in knappen Zeiten wieder einschalten kann.
  const belegt = quota?.used ?? 0;
  const erlaubt = quota?.allowed ?? einstellungen.max_open_bookings;
  const unbegrenzt = erlaubt <= 0;
  const heute = berlinDay(new Date());

  // Solange das Kontingent unbegrenzt ist, sagt die verbrauchte Menge nichts -
  // sie waere dauerhaft eine Zahl ohne Bezugsgroesse. Stattdessen steht unter
  // dem Kopf, wie viele eigene Termine noch bevorstehen.
  //
  // Bewusst nicht quota.used: das zaehlt nur Buchungsarten mit
  // counts_towards_quota. Fuer die Frage "was habe ich noch vor?" ist eine
  // Buchung eine Buchung.
  const jetzt = Date.now();
  const aktiv = (meineRes.data ?? []).filter(
    (b) => new Date(b.ends_at).getTime() > jetzt,
  ).length;

  // Die Kacheln reichen von heute bis zum letzten buchbaren Tag - dieselbe
  // Zahl, gegen die create_booking prueft. Ein Tag ausserhalb (ueber die
  // Adresse erreicht) kommt dazu, damit die Auswahl sichtbar bleibt.
  const tage = Array.from({ length: einstellungen.lead_days + 1 }, (_, i) => verschiebe(heute, i));
  if (!tage.includes(datum)) tage.unshift(datum);
  const anzahlPlaetze = plaetzeRes.data?.length ?? 0;
  const oeffnet = String(einstellungen.opening_time).slice(0, 2);
  const schliesst = String(einstellungen.closing_time).slice(0, 2);

  return (
    <>
      <header className="plan-kopf">
        <div>
          <div className="kicker">
            {anzahlPlaetze} Plätze · {oeffnet} bis {schliesst} Uhr
          </div>
          <h1 className="pagetitle">Plätze</h1>
        </div>
        <nav className="datums-kacheln" aria-label="Tag wählen">
          {tage.map((t) => {
            const [j, m, d] = t.split("-").map(Number);
            const tag = new Date(j!, (m ?? 1) - 1, d);
            return (
              <Link
                key={t}
                href={t === heute ? "/plan" : `/plan?tag=${t}`}
                aria-current={t === datum ? "date" : undefined}
              >
                {/* Vorgelesen wird das ganze Datum statt „DO 22“ - als Text und
                    nicht als aria-label, sonst weicht der Name vom Sichtbaren ab. */}
                <small aria-hidden="true">{KURZ.format(tag).replace(".", "").toUpperCase()}</small>
                <b className="dpl" aria-hidden="true">{tag.getDate()}</b>
                <span className="sr-only">{lesbaresDatum(t)}</span>
              </Link>
            );
          })}
        </nav>
      </header>

      <PlanSegmente aktiv="plan" />

      <PlanAbo datum={datum} />

      {aktiv > 0 && unbegrenzt && (
        <p className="unterzeile">
          {aktiv === 1 ? "Eine Buchung steht an." : `${aktiv} Buchungen stehen an.`}{" "}
          <Link href="/plan/spiele">Zu deinen Spielen</Link>
        </p>
      )}
      {!unbegrenzt && (
        <p className="unterzeile">
          Kontingent: {belegt} von {erlaubt} offenen Buchungen. Buchungen, bei denen du als
          Mitspieler eingetragen bist, zählen mit.
        </p>
      )}

      {!unbegrenzt && belegt >= erlaubt && (
        <div className="hinweis fehler">
          Dein Kontingent ist ausgeschöpft. Storniere eine Buchung, um neu zu buchen.
          Buchungen, bei denen du als Mitspieler eingetragen bist, zählen mit.
        </div>
      )}

      <Belegungsplan
        datum={datum}
        jetzt={new Date().toISOString()}
        plaetze={plaetzeRes.data ?? []}
        belegungen={(planRes.data ?? []) as never}
        arten={artenRes.data ?? []}
        blockungsarten={blockungsartenRes.data ?? []}
        verzeichnis={verzeichnisRes.data ?? []}
        meineId={angemeldet?.member?.id ?? null}
        oeffnung={String(einstellungen.opening_time).slice(0, 5)}
        schluss={String(einstellungen.closing_time).slice(0, 5)}
        rasterMinuten={einstellungen.slot_minutes}
        anzeigeMinuten={einstellungen.display_minutes}
        dauerMinuten={artenRes.data?.[0]?.duration_minutes ?? 60}
        vorlaufTage={einstellungen.lead_days}
        kontingentFrei={unbegrenzt ? null : Math.max(erlaubt - belegt, 0)}
        gastgebuehrCents={einstellungen.guest_fee_cents ?? 0}
        darfPlaetze={darfPlaetze(angemeldet?.roles ?? [])}
      />
    </>
  );
}
