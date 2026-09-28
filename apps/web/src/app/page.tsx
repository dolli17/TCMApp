import Link from "next/link";
import { redirect } from "next/navigation";
import {
  bookingKicker, dayTag, formatCents, freeCourtsNow, localMinutes, minutesOf, minutesToTime,
  relativeTimeLabel, sumOpenDrinks, timeToMinutes, timelinePosition, timelineSegments,
  upcomingBookings,
} from "@tcm/core";
import { createServerSupabase, getCurrentMember } from "@/lib/supabase/server";
import { MiniZeitleiste } from "@/components/MiniZeitleiste";

export const dynamic = "force-dynamic";

const BERLIN = "Europe/Berlin";
const HEUTE_LANG = new Intl.DateTimeFormat("de-DE", {
  weekday: "long", day: "numeric", month: "long", timeZone: BERLIN,
});
const MONAT = new Intl.DateTimeFormat("de-DE", { month: "long", timeZone: BERLIN });

function heuteInBerlin(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: BERLIN }).format(new Date());
}

const uhr = (iso: string) => minutesToTime(minutesOf(iso));

/**
 * Home - die Startseite (docs/design/clubhaus, Abschnitt 5)
 *
 * Dieselben Inhalte wie in der App: naechste Termine, Schnellaktionen, freie
 * Plaetze, offene Spiele, der laufende Monat und Neuigkeiten. Ab 768 px im
 * 12er-Raster (links 8, rechts 4), darunter einspaltig.
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
  const [meineRes, plaetzeRes, planRes, einstellungRes, artenRes, offenRes, getraenkeRes, dienstRes, neuesRes] =
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
      supabase.rpc("my_drink_purchases"),
      supabase.rpc("my_work_duty", {}),
      supabase.rpc("my_notifications", { p_limit: 3 }),
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
  const jetztMarke = timelinePosition(localMinutes(jetzt), auf, zu);
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
        now: jetzt,
      });

  const offen = (offenRes.data ?? []).slice(0, 3);
  const dienst = dienstRes.data?.[0] ?? null;
  const ist = Number(dienst?.completed_hours ?? 0);
  const soll = Number(dienst?.required_hours ?? 0);
  const neues = (neuesRes.data ?? []).slice(0, 3);

  return (
    <div className="home">
      <header className="home-kopf">
        <div className="kicker">{HEUTE_LANG.format(jetzt)}</div>
        <h1 className="pagetitle">Hallo, {angemeldet.member.first_name}</h1>
      </header>

      <div className="home-raster">
        <div className="home-haupt">
          {/* --- Als Naechstes --------------------------------------------- */}
          <section aria-labelledby="h-naechstes">
            <div className="sectionlabel">
              <h2 id="h-naechstes">Als Nächstes</h2>
              {termine.length > 0 && <Link href="/plan/spiele">Alle</Link>}
            </div>
            {meineRes.error ? (
              <div className="hinweis fehler">Deine Termine konnten nicht geladen werden.</div>
            ) : !erster ? (
              <div className="karte termin-leer">
                <b>Noch nichts geplant</b>
                <p className="unterzeile">Such dir einen Platz – heute ist noch einiges frei.</p>
                <Link href="/plan" className="knopf gold">Platz buchen</Link>
              </div>
            ) : (
              <div className="naechstes">
                <Link href="/plan/spiele" className="termin-karte gross">
                  <svg className="platzlinien" viewBox="0 0 318 216" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
                    <path d="M150 216 L210 0 M318 60 L190 216 M180 100 H318 M200 40 H318" />
                  </svg>
                  <span className="ball" aria-hidden="true" />
                  <span className="termin-inhalt">
                    <span className="kicker">{bookingKicker(erster.starts_at, erster.ends_at, jetzt)}</span>
                    <span className="zeit tnum">{uhr(erster.starts_at)} – {uhr(erster.ends_at)}</span>
                    <span className="ort">{erster.court_name} · {erster.type_name}</span>
                    <span className="fuss">
                      <span className="mit">{mitText(erster)}</span>
                      <span className="details">Details</span>
                    </span>
                  </span>
                  {/* Ab 768 px stehen die folgenden Termine in der grossen Karte. */}
                  {weitere.length > 0 && (
                    <span className="weitere">
                      {weitere.slice(0, 2).map((t) => (
                        <span key={t.booking_id} className="weiterer">
                          <small>{bookingKicker(t.starts_at, t.ends_at, jetzt)}</small>
                          <b>{uhr(t.starts_at)} · {t.court_name} · {t.type_name}</b>
                        </span>
                      ))}
                    </span>
                  )}
                </Link>
                {/* Am Telefon: waagerecht wischbare Karten */}
                {weitere.map((t) => (
                  <Link key={t.booking_id} href="/plan/spiele" className="termin-karte klein">
                    <span className="kicker">{bookingKicker(t.starts_at, t.ends_at, jetzt)}</span>
                    <span className="zeit tnum">{uhr(t.starts_at)} – {uhr(t.ends_at)}</span>
                    <span className="ort">{t.court_name} · {t.type_name}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* --- Schnellaktionen ------------------------------------------- */}
          <nav className="schnellaktionen" aria-label="Schnellaktionen">
            <Link href="/plan" className="gelb">
              <Pfad d="M8 2v4M16 2v4M3 9h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM12 12v6M9 15h6" />
              Platz buchen
            </Link>
            <Link href="/getraenke">
              <Pfad d="M6 3h12l-1.5 5.5a5 5 0 0 1-9 0zM12 14v7M8 21h8" />
              Getränk eintragen
            </Link>
            <Link href="/plan/spiele">
              <Pfad d="M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6" />
              Mitspielen
            </Link>
          </nav>

          {/* --- Jetzt frei ------------------------------------------------ */}
          <section aria-labelledby="h-frei">
            <div className="sectionlabel">
              <h2 id="h-frei">Jetzt frei</h2>
              <Link href="/plan">Zum Belegungsplan</Link>
            </div>
            {freiFehler ? (
              <div className="hinweis fehler">Die freien Plätze konnten nicht geladen werden.</div>
            ) : frei.length === 0 ? (
              <p className="leer-klein">Gerade ist kein Platz frei – schau in den Belegungsplan für später.</p>
            ) : (
              <div className="frei-reihe">
                {frei.map((f) => (
                  <Link key={f.courtId} href="/plan" className="frei-karte">
                    <span className="kopf">
                      <b className="dpl">{plaetze.find((p) => p.id === f.courtId)?.name}</b>
                      <i aria-hidden="true" />
                    </span>
                    <span className="bis">frei bis {minutesToTime(f.untilMinute)}</span>
                    <MiniZeitleiste
                      segmente={timelineSegments(belegung.filter((b) => b.court_id === f.courtId), auf, zu)}
                      markierung={jetztMarke}
                    />
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* --- Offene Spiele --------------------------------------------- */}
          <section aria-labelledby="h-offen">
            <div className="sectionlabel">
              <h2 id="h-offen">Offene Spiele</h2>
              <Link href="/plan/spiele">Alle</Link>
            </div>
            {offenRes.error ? (
              <div className="hinweis fehler">Die offenen Spiele konnten nicht geladen werden.</div>
            ) : offen.length === 0 ? (
              <p className="leer-klein">Gerade sucht niemand Mitspieler.</p>
            ) : (
              <ul className="offen-liste">
                {offen.map((o) => (
                  <li key={o.booking_id} className="offen-karte">
                    <span className="datum">
                      <small>{dayTag(o.starts_at, jetzt)}</small>
                      <b className="tnum">{uhr(o.starts_at)}</b>
                    </span>
                    <span className="text">
                      <b>{o.type_name} · sucht {o.frei}</b>
                      <small>{o.court_name} · {o.owner_name}</small>
                    </span>
                    {o.bin_dabei ? (
                      <span className="dabei">Dabei</span>
                    ) : (
                      <Link href="/plan/spiele" className="mitspielen">Mitspielen</Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="home-seite" aria-label="Dein Monat und Neuigkeiten">
          {/* --- Dein Monat ------------------------------------------------ */}
          <section className="karte monat" aria-labelledby="h-monat">
            <h2 id="h-monat">Dein {MONAT.format(jetzt)}</h2>
            <Link href="/getraenke" className="zeile">
              <span>Getränke</span>
              {getraenkeRes.error ? (
                <small className="fehlertext">nicht geladen</small>
              ) : (
                <b className="dpl tnum">{formatCents(sumOpenDrinks(getraenkeRes.data ?? []))}</b>
              )}
            </Link>
            <Link href="/konto" className="zeile arbeitsdienst">
              <span>Arbeitsdienst</span>
              {dienstRes.error ? (
                <small className="fehlertext">nicht geladen</small>
              ) : dienst && soll > 0 ? (
                <b className="dpl tnum">{ist} / {soll} h</b>
              ) : (
                <small>kein Soll</small>
              )}
            </Link>
            {dienst && soll > 0 && (
              <div className="balken" aria-hidden="true">
                <i style={{ width: `${Math.min(100, (ist / soll) * 100)}%` }} />
              </div>
            )}
          </section>

          {/* --- Neuigkeiten ----------------------------------------------- */}
          <section className="karte neuigkeiten" aria-labelledby="h-neues">
            <h2 id="h-neues">Neuigkeiten</h2>
            {neuesRes.error ? (
              <div className="hinweis fehler">Die Neuigkeiten konnten nicht geladen werden.</div>
            ) : neues.length === 0 ? (
              <p className="leer-klein">Keine Neuigkeiten.</p>
            ) : (
              <ul>
                {neues.map((n) => (
                  <li key={n.id} className={n.read_at ? undefined : "neu"}>
                    <span className="symbol" aria-hidden="true">
                      <Pfad d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
                    </span>
                    <span className="text">
                      <span className="titelzeile">
                        <b>{n.title}</b>
                        <small>{relativeTimeLabel(n.created_at, jetzt)}</small>
                      </span>
                      <span className="body">{n.body}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
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
