import Link from "next/link";
import {
  adminTodos, debitFlow, formatCents, localMinutes, timeToMinutes, timelinePosition, timelineSegments,
  type DebitBatchStatus,
} from "@tcm/core";
import { createServerSupabase } from "@/lib/supabase/server";
import { Geldweg } from "@/components/Geldweg";
import { Gruppenkopf, Listenzeile } from "@/components/Listenzeile";
import { Symbol } from "@/components/Navigation";
import { MiniZeitleiste } from "@/components/MiniZeitleiste";

export const dynamic = "force-dynamic";

const BERLIN = "Europe/Berlin";
const HEUTE_LANG = new Intl.DateTimeFormat("de-DE", {
  weekday: "long", day: "numeric", month: "long", timeZone: BERLIN,
});

/** Die Bereiche als Liste - am Telefon, wo keine Seitenleiste steht. */
const BEREICHE = [
  { href: "/admin/mitglieder", label: "Mitglieder", symbol: "mitglieder" },
  { href: "/admin/arbeitsdienst", label: "Arbeitsdienst", symbol: "dienst" },
  { href: "/admin/kasse", label: "Kasse", symbol: "kasse" },
  { href: "/admin/plaetze", label: "Plätze & Serien", symbol: "serie" },
  { href: "/admin/getraenke", label: "Getränke", symbol: "getraenk" },
  { href: "/admin/system", label: "System", symbol: "system" },
] as const;

function heuteInBerlin(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: BERLIN }).format(new Date());
}

/**
 * Der Einstieg in die Verwaltung (Entwurf AdminUebersicht, docs/design/clubhaus)
 *
 * Vier Kennzahlen mit Sprungziel, der Weg des Geldes fuer den juengsten
 * offenen Lastschriftlauf, die Anlage heute und rechts, was heute zu tun ist.
 * Welcher Schritt dran ist und was auf die Liste gehoert, rechnet @tcm/core
 * (debitFlow, adminTodos) - aus dem, was die Datenbank liefert. Ob eingezogen
 * werden darf, entscheidet weiter allein die Datenbank.
 *
 * Nur Lesen. Jede Quelle wird fuer sich geladen; schlaegt eine fehl, zeigt
 * nur ihr Abschnitt den Fehler.
 */
export default async function VerwaltungSeite() {
  const supabase = await createServerSupabase();
  const heute = heuteInBerlin();

  const [
    antraegeRes, mitgliederRes, plaetzeRes, planRes, einstellungRes, forderungenRes, laeufeRes, monateRes,
  ] = await Promise.all([
    supabase
      .from("membership_applications")
      .select("id", { count: "exact", head: true })
      .eq("status", "new"),
    supabase
      .from("members")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    supabase.from("courts").select("id, name").eq("active", true).order("position"),
    supabase.rpc("day_schedule", { p_date: heute }),
    supabase.rpc("booking_settings"),
    supabase
      .from("charges")
      .select("payer_id, amount_cents, status, due_date")
      .in("status", ["open", "notified", "returned"]),
    supabase.rpc("debit_batch_overview", { p_limit: 6 }),
    supabase.from("billing_periods").select("year, month").eq("status", "open"),
  ]);

  // --- Kennzahlen ----------------------------------------------------------
  const offeneAntraege = antraegeRes.count ?? 0;
  const plaetze = plaetzeRes.data ?? [];
  const belegung = planRes.data ?? [];
  const buchungen = belegung.filter((b) => b.kind === "booking");
  const gebuchtePlaetze = new Set(buchungen.map((b) => b.court_id)).size;
  const forderungen = forderungenRes.data ?? [];
  const offenSumme = forderungen.reduce((s, f) => s + f.amount_cents, 0);

  // --- Der Weg des Geldes --------------------------------------------------
  // Der juengste Lauf, der noch nicht abgeschlossen ist. Die Liste kommt
  // neueste zuerst aus der Datenbank.
  const lauf = (laeufeRes.data ?? []).find((l) => l.status !== "completed") ?? null;
  const unterwegs = forderungen.filter((f) => f.status !== "returned");
  const angekuendigt = unterwegs.filter((f) => f.status === "notified");
  const faellig = angekuendigt.reduce<string | null>(
    (max, f) => (f.due_date && (!max || f.due_date > max) ? f.due_date : max),
    null,
  );

  // Fuer einen Entwurf fragt die Seite die Datenbank, wer einzugsfaehig ist.
  // Die Frist wird hier nicht nachgerechnet.
  const kandidatenRes = lauf?.status === "draft"
    ? await supabase.rpc("debit_batch_candidates", { p_collection_date: lauf.collection_date })
    : null;

  const weg = debitFlow({
    charges: {
      payers: new Set(unterwegs.map((f) => f.payer_id)).size,
      totalCents: unterwegs.reduce((s, f) => s + f.amount_cents, 0),
      unannounced: unterwegs.filter((f) => f.status === "open").length,
      dueDate: faellig,
    },
    batch: lauf
      ? {
          status: lauf.status as DebitBatchStatus,
          collectionDate: lauf.collection_date,
          itemCount: lauf.item_count,
          readyPayers: (kandidatenRes?.data ?? []).filter((k) => k.einzugsfaehig).length,
          returned: lauf.zurueck,
        }
      : null,
    today: heute,
  });
  const laufHref = lauf ? `/admin/kasse/lastschriften/${lauf.id}` : "/admin/kasse?abschnitt=lastschrift";

  // --- Heute zu tun --------------------------------------------------------
  const aufgaben = adminTodos({
    today: heute,
    openApplications: offeneAntraege,
    noticeDueDate: faellig,
    batchHref: laufHref,
    returnedCharges: forderungen.filter((f) => f.status === "returned").length,
    openDrinkMonths: monateRes.data ?? [],
  });
  const aufgabenFehler = antraegeRes.error ?? forderungenRes.error ?? monateRes.error;

  // --- Die Anlage heute ----------------------------------------------------
  const einstellungen = einstellungRes.data?.[0];
  const auf = timeToMinutes(String(einstellungen?.opening_time ?? "08:00"));
  const zu = timeToMinutes(String(einstellungen?.closing_time ?? "21:00"));
  const jetzt = timelinePosition(localMinutes(new Date()), auf, zu);
  const anlageFehler = plaetzeRes.error ?? planRes.error ?? einstellungRes.error;

  const kennzahlen = [
    {
      label: "Mitglieder",
      wert: mitgliederRes.error ? "–" : String(mitgliederRes.count ?? 0),
      info: "aktiv",
      href: "/admin/mitglieder",
    },
    {
      label: "Heute gebucht",
      wert: planRes.error ? "–" : String(buchungen.length),
      info: `auf ${gebuchtePlaetze} von ${plaetze.length} Plätzen`,
      href: "/plan",
    },
    {
      label: "Offen",
      wert: forderungenRes.error ? "–" : formatCents(offenSumme),
      info: "alle Forderungen",
      href: "/admin/kasse?abschnitt=forderungen",
    },
    {
      label: "Anträge",
      wert: antraegeRes.error ? "–" : String(offeneAntraege),
      info: offeneAntraege === 0 ? "nichts zu prüfen" : "warten auf Prüfung",
      href: "/admin/mitglieder/antraege",
    },
  ];

  // Die dringendste Aufgabe als grosse Karte, die uebrigen als Zeilen.
  const erste = aufgaben[0]?.urgent ? aufgaben[0] : null;
  const weitere = erste ? aufgaben.slice(1) : aufgaben;
  const nr = weg.steps.findIndex((x) => x.state === "aktuell") + 1;
  const aktuellerSchritt = weg.steps[nr - 1];

  return (
    <div className="verwaltung uebersicht">
      <header>
        <div className="kicker">{HEUTE_LANG.format(new Date())}</div>
        <h1 className="pagetitle">Verwaltung</h1>
      </header>

      <div className="uebersicht-raster">
        <div className="uebersicht-spalte">
          {/* --- Heute zu tun (Regel 7) ------------------------------------ */}
          <section className="liste-abschnitt" aria-labelledby="h-zutun">
            <Gruppenkopf
              titel="Heute zu tun"
              id="h-zutun"
              neben={aufgaben.length > 0 ? `${aufgaben.length} offen` : undefined}
            />
            {aufgabenFehler ? (
              <div className="hinweis fehler">Die offenen Punkte konnten nicht geladen werden.</div>
            ) : aufgaben.length === 0 ? (
              <div className="liste-gruppe">
                <Listenzeile punkt="info" titel="Alles erledigt" kontext="Heute liegt nichts an." />
              </div>
            ) : (
              <>
                {erste && (
                  <div className="aufgabe-gross">
                    <svg className="linien" viewBox="0 0 350 196" preserveAspectRatio="xMaxYMin slice" aria-hidden="true">
                      <path d="M170 196 L225 0 M350 55 L225 196 M200 95 H350 M218 36 H350" />
                    </svg>
                    <div className="kicker">Zuerst</div>
                    <b className="titel">{erste.title}</b>
                    <p>{erste.text}</p>
                    <Link href={erste.href} className="knopf gold">
                      {erste.action}
                    </Link>
                  </div>
                )}
                {weitere.length > 0 && (
                  <ul className="liste-gruppe aufgaben" aria-label="Weitere Aufgaben">
                    {weitere.map((x) => (
                      <li key={x.key}>
                        <Listenzeile
                          href={x.href}
                          punkt={x.urgent ? "dringend" : "info"}
                          titel={x.title}
                          kontext={x.text}
                          hinweis={x.action}
                          hinweisTon="blau"
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>

          {/* --- Lastschriftlauf -------------------------------------------- */}
          <section className="liste-abschnitt" aria-labelledby="h-geldweg">
            <Gruppenkopf
              titel={lauf ? lauf.title : "Lastschriftlauf"}
              id="h-geldweg"
              neben={<Link href={laufHref}>{lauf ? "Öffnen" : "Läufe"}</Link>}
            />
            {forderungenRes.error || laeufeRes.error ? (
              <div className="hinweis fehler">Der Stand der Lastschrift konnte nicht geladen werden.</div>
            ) : (
              <Link href={laufHref} className="karte geldweg-karte">
                <ol className="geldweg-balken" aria-hidden="true">
                  {weg.steps.map((x) => <li key={x.key} className={x.state} />)}
                </ol>
                <span className="zeile">
                  <b>{nr > 0 ? `Schritt ${nr} von 5 · ${aktuellerSchritt!.name}` : "Alle Schritte erledigt"}</b>
                  <span className={`statusmarke ${weg.current === null ? "gruen" : "gelb"}`}>{weg.label}</span>
                </span>
                <small>
                  {[aktuellerSchritt?.info, weg.steps[0]!.info].filter(Boolean).join(" · ")}
                </small>
                {/* Am Desktop steht der Weg zusätzlich ausgeschrieben */}
                <span className="nur-breit">
                  <Geldweg schritte={weg.steps} />
                </span>
              </Link>
            )}
          </section>
        </div>

        <div className="uebersicht-spalte">
          {/* --- Auf einen Blick ------------------------------------------- */}
          <section className="liste-abschnitt" aria-labelledby="h-blick">
            <Gruppenkopf titel="Auf einen Blick" id="h-blick" />
            <div className="kennzahlen zwei">
              {kennzahlen.map((k) => (
                <Link key={k.label} href={k.href} className="kennzahl">
                  <span className="label">{k.label}</span>
                  <span className="wert dpl tnum">{k.wert}</span>
                  <span className="info">{k.info}</span>
                </Link>
              ))}
            </div>
          </section>

          {/* --- Heute auf der Anlage (Desktop) ----------------------------- */}
          <section className="liste-abschnitt nur-breit" aria-labelledby="h-anlage">
            <Gruppenkopf titel="Heute auf der Anlage" id="h-anlage" neben={<Link href="/plan">Plan</Link>} />
            <div className="karte">
              {anlageFehler ? (
                <div className="hinweis fehler">Die Belegung konnte nicht geladen werden.</div>
              ) : (
                <ul className="anlage-heute">
                  {plaetze.map((p) => (
                    <li key={p.id}>
                      <span>{p.name}</span>
                      <MiniZeitleiste
                        segmente={timelineSegments(belegung.filter((b) => b.court_id === p.id), auf, zu)}
                        markierung={jetzt}
                        gross
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* --- Bereiche (nur Telefon; am Desktop führt die Seitenleiste) -- */}
          <section className="liste-abschnitt nur-schmal" aria-labelledby="h-bereiche">
            <Gruppenkopf titel="Bereiche" id="h-bereiche" />
            <nav className="liste-gruppe" aria-label="Bereiche der Verwaltung">
              {BEREICHE.map((b) => (
                <Listenzeile
                  key={b.href}
                  href={b.href}
                  symbol={<Symbol name={b.symbol} />}
                  titel={b.label}
                  hinweis={b.href === "/admin/mitglieder" && offeneAntraege > 0 ? `${offeneAntraege} Anträge` : undefined}
                  hinweisTon="gold"
                />
              ))}
            </nav>
          </section>
        </div>
      </div>
    </div>
  );
}
