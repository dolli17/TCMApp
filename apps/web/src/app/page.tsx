import Link from "next/link";
import { redirect } from "next/navigation";
import {
  bookingKicker, dayTag, eventDemnaechst, freeCourtsNow, minutesOf, minutesToTime,
  partnerFilterAusZeile, partnerFilterText, timeToMinutes, upcomingBookings,
} from "@tcm/core";
import { createServerSupabase, getCurrentMember } from "@/lib/supabase/server";
import { alsMitgliedEvent } from "@/lib/veranstaltungen";
import { Leerzustand } from "@/components/Leerzustand";

export const dynamic = "force-dynamic";

const BERLIN = "Europe/Berlin";
const HEUTE_LANG = new Intl.DateTimeFormat("de-DE", {
  weekday: "long", day: "numeric", month: "long", timeZone: BERLIN,
});

function heuteInBerlin(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: BERLIN }).format(new Date());
}

const uhr = (iso: string) => minutesToTime(minutesOf(iso));

/**
 * Home - die Startseite (docs/design/stitch, Entwurf "TC Muckensturm - Home")
 *
 * Bewusst ausgeduennt: der naechste eigene Termin, zwei Aktionen, freie
 * Plaetze, offene Spiele und ein Streifen zur naechsten Veranstaltung. Der
 * laufende Monat steht im Konto, Neuigkeiten hinter der Glocke.
 *
 * Nur Lesen. Jede Quelle wird fuer sich geladen; schlaegt eine fehl, zeigt
 * nur ihr Abschnitt den Fehler.
 */
export default async function Start() {
  const angemeldet = await getCurrentMember();

  if (!angemeldet) redirect("/login");
  // Kiosk-Geraete haben keinen Mitgliedsdatensatz und landen direkt an der Theke.
  if (!angemeldet.member) redirect("/kiosk");

  const heute = heuteInBerlin();
  const supabase = await createServerSupabase();
  const [meineRes, plaetzeRes, planRes, einstellungRes, artenRes, offenRes, eventsRes] =
    await Promise.all([
      supabase.rpc("my_bookings", {}),
      supabase.from("courts").select("id, name, short_name").eq("active", true).order("position"),
      supabase.rpc("day_schedule", { p_date: heute }),
      supabase.rpc("booking_settings"),
      supabase
        .from("booking_types")
        .select("duration_minutes")
        .eq("active", true)
        .eq("applies_to", "booking")
        .order("sort_order")
        .limit(1),
      supabase.rpc("open_matches", {}),
      supabase.rpc("events_fuer_mitglied"),
    ]);

  const jetzt = new Date();
  const termine = upcomingBookings(meineRes.data ?? [], jetzt);
  const [erster, ...weitere] = termine;

  // Jetzt frei: dieselbe Regel wie im Belegungsplan (@tcm/core)
  const einstellungen = einstellungRes.data?.[0];
  const freiFehler = plaetzeRes.error ?? planRes.error ?? einstellungRes.error ?? artenRes.error;
  const auf = timeToMinutes(String(einstellungen?.opening_time ?? "08:00"));
  const zu = timeToMinutes(String(einstellungen?.closing_time ?? "21:00"));
  const belegung = planRes.data ?? [];
  const plaetze = plaetzeRes.data ?? [];
  const frei = freiFehler
    ? []
    : freeCourtsNow({
        day: heute,
        courtIds: plaetze.map((p) => p.id),
        openingMinutes: auf,
        closingMinutes: zu,
        slotMinutes: einstellungen?.slot_minutes ?? 30,
        durationMinutes: artenRes.data?.[0]?.duration_minutes ?? 60,
        occupied: belegung,
        leadDays: einstellungen?.lead_days,
        now: jetzt,
      });

  const offen = (offenRes.data ?? []).slice(0, 3);
  const eigene = new Set((meineRes.data ?? []).filter((b) => b.bin_bucher).map((b) => b.booking_id));
  const demnaechst = eventDemnaechst((eventsRes.data ?? []).map(alsMitgliedEvent), jetzt, 1);

  const [kickerTag, kickerWann] = erster ? bookingKicker(erster.starts_at, erster.ends_at, jetzt).split(" · ") : [];
  const naechstesEvent = demnaechst[0];

  return (
    <div className="home">
      <header className="home-kopf">
        <div className="kicker">TC Muckensturm</div>
        <h1 className="pagetitle">Hallo, {angemeldet.member.first_name}</h1>
      </header>

      {/* --- Als Naechstes ------------------------------------------------- */}
      <section aria-labelledby="h-naechstes">
        <h2 id="h-naechstes" className="sr-only">Als Nächstes</h2>
        {meineRes.error ? (
          <div className="hinweis fehler">Deine Termine konnten nicht geladen werden.</div>
        ) : !erster ? (
          <div className="karte heute-karte ohne">
            <span className="kicker">Heute</span>
            <b>Noch nichts geplant</b>
            <span className="ort">Such dir einen Platz – heute ist noch einiges frei.</span>
          </div>
        ) : (
          <Link href="/plan/spiele" className="karte heute-karte">
            <span className="kopf">
              <span className="kicker">{kickerTag}</span>
              {/* Gelb heisst "deins": der eigene Termin. */}
              {kickerWann && <span className="dein-marker">{kickerWann}</span>}
            </span>
            <span className="zeit tnum">
              {uhr(erster.starts_at)} <small>Uhr</small>
            </span>
            <span className="ort">{erster.court_name} · {mitText(erster)}</span>
            {weitere.length > 0 && (
              <span className="weitere">
                und {weitere.length} {weitere.length === 1 ? "weiterer Termin" : "weitere Termine"}
              </span>
            )}
          </Link>
        )}
      </section>

      {/* --- Die zwei Aktionen ---------------------------------------------- */}
      <nav className="home-aktionen" aria-label="Schnellaktionen">
        {/* Das Blatt geht zur nächsten freien Zeit auf, wie in der App (U68) */}
        <Link href="/plan?buchen=jetzt" className="knopf haupt">
          <Pfad d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8v8M8 12h8" />
          Platz buchen
        </Link>
        <Link href="/verein/getraenke" className="knopf">
          <Pfad d="M6 3h12l-1.5 5.5a5 5 0 0 1-9 0zM12 14v7M8 21h8" />
          Getränk eintragen
        </Link>
      </nav>

      {/* --- Jetzt frei ----------------------------------------------------- */}
      <section aria-labelledby="h-frei">
        <div className="sectionlabel">
          <h2 id="h-frei">Jetzt frei</h2>
          {frei.length > 0 && <span className="kicker">{frei.length} {frei.length === 1 ? "Platz" : "Plätze"}</span>}
        </div>
        {freiFehler ? (
          <div className="hinweis fehler">Die freien Plätze konnten nicht geladen werden.</div>
        ) : frei.length === 0 ? (
          <Leerzustand text="Gerade ist kein Platz frei." aktion={{ href: "/plan", label: "Belegung für später" }} />
        ) : (
          <div className="karte frei-reihe">
            {frei.map((f) => (
              <Link key={f.courtId} href={`/plan?buchen=jetzt&platz=${f.courtId}`}>
                <i aria-hidden="true" />
                <b>{plaetze.find((p) => p.id === f.courtId)?.name}</b>
                <span className="bis tnum">frei bis {minutesToTime(f.untilMinute)}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* --- Offene Spiele -------------------------------------------------- */}
      <section aria-labelledby="h-offen">
        <div className="sectionlabel">
          <h2 id="h-offen">Offene Spiele</h2>
          <span className="kicker">Mitspieler gesucht</span>
        </div>
        {offenRes.error ? (
          <div className="hinweis fehler">Die offenen Spiele konnten nicht geladen werden.</div>
        ) : offen.length === 0 ? (
          <Leerzustand text="Gerade sucht niemand Mitspieler." />
        ) : (
          <ul className="offen-liste">
            {offen.map((o) => {
              const zusatz = partnerFilterText(partnerFilterAusZeile(o));
              const wer = eigene.has(o.booking_id) ? "dein Spiel" : (o.owner_name?.trim() || "Jemand");
              return (
                <li key={o.booking_id} className="karte offen-karte">
                  <span className="text">
                    <span className="wann">
                      <b className="tnum">{tagLesbar(dayTag(o.starts_at, jetzt))}, {uhr(o.starts_at)}</b>
                      <span className="marke-klein">{o.type_name}</span>
                    </span>
                    <small>{o.court_name} · {wer}</small>
                    {zusatz && <small className="offen-filter">{zusatz}</small>}
                  </span>
                  {o.bin_dabei ? (
                    <span className="dein-marker">Du bist dabei</span>
                  ) : (
                    <Link href="/plan/spiele" className="knopf klein">Mitspielen</Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* --- Demnaechst im Verein: ein Streifen, der Rest steht unter Verein -- */}
      {eventsRes.error ? (
        <div className="hinweis fehler">Die Veranstaltungen konnten nicht geladen werden.</div>
      ) : naechstesEvent ? (
        <section aria-labelledby="h-verein">
          <h2 id="h-verein" className="sr-only">Demnächst im Verein</h2>
          <Link href={`/verein/veranstaltungen/${naechstesEvent.id}`} className="event-streifen">
            <Pfad d="M8 2v4M16 2v4M3 9h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
            <span>
              {HEUTE_LANG.format(new Date(naechstesEvent.starts_at))} · <b>{naechstesEvent.title}</b>
            </span>
          </Link>
        </section>
      ) : null}
    </div>
  );
}

/** "HEUTE" -> "Heute", "MI" -> "Mi" */
function tagLesbar(tag: string): string {
  return tag.charAt(0) + tag.slice(1).toLowerCase();
}

function mitText(t: { players: string[]; owner_name: string; bin_bucher: boolean }): string {
  const mit = t.players.filter((p) => p && p !== t.owner_name);
  if (mit.length > 0) return `mit ${mit.join(", ")}`;
  return t.bin_bucher ? "Du hast gebucht" : `von ${t.owner_name}`;
}

function Pfad({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true" focusable="false">
      <path d={d} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
