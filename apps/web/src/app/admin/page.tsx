import Link from "next/link";
import {
  adminTodos, debitFlow, formatCents, localMinutes, timeToMinutes, timelinePosition, timelineSegments,
  type DebitBatchStatus,
} from "@tcm/core";
import { createServerSupabase } from "@/lib/supabase/server";
import { Geldweg } from "@/components/Geldweg";
import { MiniZeitleiste } from "@/components/MiniZeitleiste";

export const dynamic = "force-dynamic";

const BERLIN = "Europe/Berlin";
const HEUTE_LANG = new Intl.DateTimeFormat("de-DE", {
  weekday: "long", day: "numeric", month: "long", timeZone: BERLIN,
});

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
  const laufHref = lauf ? `/admin/kasse/lastschriften/${lauf.id}` : "/admin/kasse/lastschriften";

  // --- Heute zu tun --------------------------------------------------------
  const aufgaben = adminTodos({
    today: heute,
    openApplications: offeneAntraege,
    noticeDueDate: faellig,
    batchHref: laufHref,
    returnedCharges: forderungen.filter((f) => f.status === "returned").length,
    openDrinkMonths: monateRes.data ?? [],
  });
  // Gelb nur fuer die eine Hauptaktion: den ersten Punkt, der zu handeln ist.
  const hauptaufgabe = aufgaben.find((a) => a.urgent)?.key;
  const aufgabenFehler = antraegeRes.error ?? forderungenRes.error ?? monateRes.error;

  // --- Die Anlage heute ----------------------------------------------------
  const einstellungen = einstellungRes.data?.[0];
  const auf = timeToMinutes(String(einstellungen?.opening_time ?? "08:00"));
  const zu = timeToMinutes(String(einstellungen?.closing_time ?? "21:00"));
  const jetzt = timelinePosition(localMinutes(new Date()), auf, zu);
  const anlageFehler = plaetzeRes.error ?? planRes.error ?? einstellungRes.error;

  const kennzahlen = [
    {
      label: "Aktive Mitglieder",
      wert: mitgliederRes.error ? "–" : String(mitgliederRes.count ?? 0),
      info: "zur Mitgliederliste",
      href: "/admin/mitglieder",
    },
    {
      label: "Heute gebucht",
      wert: planRes.error ? "–" : String(buchungen.length),
      info: `auf ${gebuchtePlaetze} von ${plaetze.length} Plätzen`,
      href: "/plan",
    },
    {
      label: "Offene Anträge",
      wert: antraegeRes.error ? "–" : String(offeneAntraege),
      info: offeneAntraege === 0 ? "nichts zu prüfen" : "warten auf Prüfung",
      href: "/admin/mitglieder/antraege",
    },
    {
      label: "Offene Forderungen",
      wert: forderungenRes.error ? "–" : formatCents(offenSumme),
      info: "alle Arten zusammen",
      href: "/admin/kasse?abschnitt=forderungen",
    },
  ];

  return (
    <div className="verwaltung">
      <header>
        <div className="kicker">Verwaltung · {HEUTE_LANG.format(new Date())}</div>
        <h1 className="pagetitle">Übersicht</h1>
      </header>

      <div className="kennzahlen">
        {kennzahlen.map((k) => (
          <Link key={k.label} href={k.href} className="kennzahl">
            <span className="label">{k.label}</span>
            <span className="wert dpl tnum">{k.wert}</span>
            <span className="info">{k.info}</span>
          </Link>
        ))}
      </div>

      <div className="verwaltung-raster">
        <div className="haupt">
          <section className="karte gross" aria-labelledby="h-geldweg">
            <div className="kartenkopf">
              <h2 id="h-geldweg">{lauf ? lauf.title : "Beitragslauf"} · der Weg des Geldes</h2>
              <Link href={laufHref}>{lauf ? "Lauf öffnen" : "Zu den Läufen"}</Link>
            </div>
            {forderungenRes.error || laeufeRes.error ? (
              <div className="hinweis fehler">Der Stand der Lastschrift konnte nicht geladen werden.</div>
            ) : (
              <Geldweg schritte={weg.steps} />
            )}
          </section>

          <section className="karte gross" aria-labelledby="h-anlage">
            <div className="kartenkopf">
              <h2 id="h-anlage">Heute auf der Anlage</h2>
              <Link href="/plan">Belegungsplan</Link>
            </div>
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
          </section>
        </div>

        <aside className="karte gross zu-tun" aria-labelledby="h-zutun">
          <div className="zu-tun-kopf">
            <h2 id="h-zutun">Heute zu tun</h2>
            <p>Was liegen bleibt, kostet Geld oder Nerven.</p>
          </div>
          {aufgabenFehler ? (
            <div className="hinweis fehler">Die offenen Punkte konnten nicht geladen werden.</div>
          ) : aufgaben.length === 0 ? (
            <p className="alles-erledigt">Alles erledigt.</p>
          ) : (
            <ul>
              {aufgaben.map((a) => (
                <li key={a.key}>
                  <div className="aufgabe">
                    <i className={a.urgent ? "dringend" : undefined} aria-hidden="true" />
                    <div>
                      <b>{a.title}</b>
                      <p>{a.text}</p>
                    </div>
                  </div>
                  <Link href={a.href} className={`knopf klein ${a.key === hauptaufgabe ? "gold" : "leise"}`}>
                    {a.action}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
