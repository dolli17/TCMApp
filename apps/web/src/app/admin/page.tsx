import Link from "next/link";
import {
  adminTodos, einzugGruppeTitel, einzugStand, formatCents, localMinutes, timeToMinutes, timelinePosition,
  timelineSegments, type ChargeKind, type DebitBatchStatus,
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
 * Vier Kennzahlen mit Sprungziel, der Stand des laufenden Einzugs, die
 * Anlage heute und rechts, was heute zu tun ist. Welcher Stand erreicht ist
 * und was auf die Liste gehoert, rechnet @tcm/core (einzugStand, adminTodos) -
 * aus dem, was die Datenbank liefert. Ob eingezogen werden darf, entscheidet
 * weiter allein die Datenbank.
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
      .select("kind, period_label, amount_cents, status, due_date, debit_items(result)")
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

  // --- Der laufende Einzug -----------------------------------------------
  // Der juengste, der noch nicht abgeschlossen ist und etwas enthaelt; ein
  // leerer Entwurf laeuft nicht. Die Liste kommt neueste zuerst.
  const offeneLaeufe = (laeufeRes.data ?? []).filter((l) => l.status !== "completed" && l.item_count > 0);
  const lauf = offeneLaeufe[0] ?? null;
  const stand = lauf
    ? einzugStand({
        status: lauf.status as DebitBatchStatus,
        collectionDate: lauf.collection_date,
        itemCount: lauf.item_count,
        returned: lauf.zurueck,
        today: heute,
      })
    : null;
  const laufHref = lauf ? `/admin/kasse/lastschriften/${lauf.id}` : "/admin/kasse?abschnitt=einzuege";

  // Was in keinem Einzug steckt und noch eingezogen werden kann.
  const imEinzug = (f: (typeof forderungen)[number]) =>
    (f.debit_items ?? []).some((i) => i.result === "pending" || i.result === "settled");
  const ohneEinzug = forderungen.filter((f) => f.status !== "returned" && !imEinzug(f));
  const ohneEinzugSumme = ohneEinzug.reduce((s, f) => s + f.amount_cents, 0);

  // Fuer "Heute zu tun" zaehlt der Einzug, bei dem etwas zu tun ist - nicht
  // der juengste.
  const dran =
    offeneLaeufe.find((l) => l.status === "draft") ??
    offeneLaeufe.find((l) => l.status === "generated") ??
    null;

  // Angekuendigt, aber in keinem Einzug: das gibt es nur noch aus der alten
  // Kasse, in der Ankuendigung und Lauf getrennt waren.
  const angekuendigtOhne = ohneEinzug.filter((f) => f.status === "notified");
  const notice = angekuendigtOhne.length === 0 ? null : {
    count: angekuendigtOhne.length,
    totalCents: angekuendigtOhne.reduce((s, f) => s + f.amount_cents, 0),
    dueDate: angekuendigtOhne.reduce((max, f) => (f.due_date && f.due_date > max ? f.due_date : max), ""),
    groups: [...new Set(angekuendigtOhne.map((f) =>
      einzugGruppeTitel({ kind: f.kind as ChargeKind, period_label: f.period_label, ruecklaeufer: false })))].sort(),
  };

  // --- Heute zu tun --------------------------------------------------------
  const aufgaben = adminTodos({
    today: heute,
    openApplications: offeneAntraege,
    notice: notice?.dueDate ? notice : null,
    batchStatus: (dran?.status as DebitBatchStatus | undefined) ?? null,
    batchHref: dran ? `/admin/kasse/lastschriften/${dran.id}` : laufHref,
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
  const nr = stand ? stand.schritte.findIndex((x) => x.state === "aktuell") + 1 : 0;

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

          {/* --- Einzug ----------------------------------------------------- */}
          <section className="liste-abschnitt" aria-labelledby="h-geldweg">
            <Gruppenkopf
              titel={lauf ? `Einzug · ${lauf.title}` : "Einzug"}
              id="h-geldweg"
              neben={<Link href={laufHref}>{lauf ? "Öffnen" : "Einzüge"}</Link>}
            />
            {forderungenRes.error || laeufeRes.error ? (
              <div className="hinweis fehler">Der Stand der Einzüge konnte nicht geladen werden.</div>
            ) : lauf && stand ? (
              <Link href={laufHref} className="karte geldweg-karte">
                <ol className="geldweg-balken" aria-hidden="true">
                  {stand.schritte.map((x) => <li key={x.key} className={x.state} />)}
                </ol>
                <span className="zeile">
                  <b>{nr > 0 ? `Stand ${nr} von 4 · ${stand.schritte[nr - 1]!.name}` : "Abgeschlossen"}</b>
                  <span className={`statusmarke ${stand.ton}`}>{stand.label}</span>
                </span>
                <small>
                  {formatCents(lauf.total_cents)} · {lauf.item_count} {lauf.item_count === 1 ? "Mitglied" : "Mitglieder"}
                  {stand.naechster ? ` · Als Nächstes: ${stand.naechster.titel}` : ""}
                </small>
                {/* Am Desktop steht der Weg zusätzlich ausgeschrieben */}
                <span className="nur-breit">
                  <Geldweg schritte={stand.schritte} />
                </span>
              </Link>
            ) : (
              <div className="liste-gruppe">
                <Listenzeile
                  href={ohneEinzug.length > 0 ? "/admin/kasse/einzug" : "/admin/kasse?abschnitt=einzuege"}
                  punkt="info"
                  titel="Gerade läuft kein Einzug"
                  kontext={
                    ohneEinzug.length > 0
                      ? `${ohneEinzug.length} ${ohneEinzug.length === 1 ? "Forderung" : "Forderungen"} über ${formatCents(ohneEinzugSumme)} noch nicht eingezogen.`
                      : "Alles ist eingezogen."
                  }
                  hinweis={ohneEinzug.length > 0 ? "Einzug vorbereiten" : undefined}
                  hinweisTon="blau"
                />
              </div>
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
