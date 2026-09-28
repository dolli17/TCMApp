import Link from "next/link";
import { formatCents, sumOpenDrinks } from "@tcm/core";
import { createServerSupabase, getCurrentMember, isAdmin } from "@/lib/supabase/server";
import { AbmeldeKnopf } from "@/components/AbmeldeKnopf";
import { Symbol } from "@/components/Navigation";
import { ThemeUmschalter } from "@/components/ThemeUmschalter";

export const dynamic = "force-dynamic";

const STATUS_TEXT: Record<string, string> = {
  open: "offen",
  notified: "angekündigt",
  submitted: "eingereicht",
  settled: "bezahlt",
  returned: "zurückgebucht",
  waived: "erlassen",
};

const ART_TEXT: Record<string, string> = {
  fee: "Mitgliedsbeitrag",
  drinks: "Getränke",
  deposit: "Pfand",
  work_duty: "Arbeitsdienst",
  guest: "Gastgebühr",
  misc: "Sonstiges",
};

const DATUM = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
const MONAT = new Intl.DateTimeFormat("de-DE", { month: "long", timeZone: "Europe/Berlin" });

/**
 * Konto (Entwurf AppKonto, docs/design/clubhaus)
 *
 * Oben wer man ist, darunter was offen ist und der Arbeitsdienst. Die
 * Einstellungen stehen als gruppierte Liste; Meine Daten, Notfallkontakt,
 * Einwilligungen und das Mandat haben je eine eigene Unterseite, statt als
 * lange Formulare die Seite zu fuellen.
 */
export default async function KontoSeite() {
  const supabase = await createServerSupabase();
  const angemeldet = await getCurrentMember();
  const meineId = angemeldet?.member?.id;

  const [forderungenRes, arbeitsdienstRes, einsaetzeRes, ichRes, mitgliedschaftRes, getraenkeRes] =
    await Promise.all([
      supabase.rpc("my_charges"),
      supabase.rpc("my_work_duty", {}),
      supabase.rpc("my_work_duty_entries", { p_year: new Date().getFullYear() }),
      meineId
        ? supabase.from("members").select("first_name, last_name, is_team_captain, teams(name)").eq("id", meineId).maybeSingle()
        : Promise.resolve({ data: null }),
      meineId
        ? supabase
            .from("memberships")
            .select("started_on")
            .eq("member_id", meineId)
            .eq("status", "active")
            .order("started_on", { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.rpc("my_drink_purchases"),
    ]);

  const forderungen = forderungenRes.data ?? [];
  // Offen ist, was noch eingezogen oder bezahlt werden muss. "returned" zaehlt
  // mit: eine zurueckgebuchte Lastschrift ist Geld, das der Verein nicht
  // bekommen hat - die Forderung steht wieder offen.
  const offen = forderungen.filter((f) => f.status === "open" || f.status === "notified" || f.status === "returned");
  const frueher = forderungen.filter((f) => !offen.includes(f));
  const zurueck = offen.filter((f) => f.status === "returned");
  // Die Getraenke des laufenden Monats sind noch keine Forderung - sie stehen
  // trotzdem da, damit "Zusammen" die ehrliche Zahl ist.
  const getraenkeLaufend = sumOpenDrinks(getraenkeRes.data ?? []);
  const summe = offen.reduce((s, f) => s + f.amount_cents, 0) + getraenkeLaufend;

  const dienst = arbeitsdienstRes.data?.[0];
  const ist = Number(dienst?.completed_hours ?? 0);
  const soll = Number(dienst?.required_hours ?? 0);
  const einsaetze = einsaetzeRes.data ?? [];

  const ich = ichRes.data;
  const vorname = ich?.first_name ?? angemeldet?.member?.first_name ?? "";
  const nachname = ich?.last_name ?? angemeldet?.member?.last_name ?? "";
  const initialen = `${vorname.charAt(0)}${nachname.charAt(0)}`.toUpperCase();
  const seit = mitgliedschaftRes.data?.started_on?.slice(0, 4);

  return (
    <>
      {/* --- Profilkopf ---------------------------------------------------- */}
      <header className="profilkopf">
        <span className="avatar gross" aria-hidden="true">{initialen}</span>
        <h1>{vorname} {nachname}</h1>
        <p className="profil-marken">
          {seit && <span>Mitglied seit {seit}</span>}
          {ich?.teams && <span>{ich.teams.name}</span>}
          {ich?.teams && ich.is_team_captain && <span className="gelb">Mannschaftsführer</span>}
        </p>
      </header>

      {/* Am Telefon hat die schwebende Leiste nur vier Plaetze; Admins kommen
          von hier in die Verwaltung. Ab 768 px steht sie in der Seitenleiste. */}
      {isAdmin(angemeldet?.roles ?? []) && (
        <Link href="/admin" className="karte verwaltung-einstieg">
          <Symbol name="einstellung" />
          <span>Verwaltung</span>
          <span aria-hidden="true">›</span>
        </Link>
      )}

      <div className="konto-raster">
        <div>
          {/* --- Offene Forderungen ---------------------------------------- */}
          <section aria-labelledby="h-offen">
            <div className="sectionlabel"><h2 id="h-offen">Offene Forderungen</h2></div>
            {zurueck.length > 0 && (
              <div className="hinweis fehler">
                {zurueck.length === 1 ? "Eine Lastschrift kam zurück" : `${zurueck.length} Lastschriften kamen zurück`}{" "}
                – die Beträge sind wieder offen. Bitte melde dich beim Verein, damit wir das klären können.
              </div>
            )}
            <ul className="gruppe forderungen">
              {offen.map((f) => (
                <li key={f.id} className="forderung">
                  <span className="was">
                    <b>
                      {ART_TEXT[f.kind] ?? f.kind}
                      {f.period_label ? ` ${f.period_label}` : ""}
                      {f.is_for_other ? ` · für ${f.member_name}` : ""}
                    </b>
                    {f.description && <small>{f.description}</small>}
                    <Statusmarke status={f.status} faellig={f.due_date} />
                  </span>
                  <span className="betrag dpl tnum">{formatCents(f.amount_cents)}</span>
                </li>
              ))}
              {getraenkeLaufend > 0 && (
                <li className="forderung">
                  <span className="was">
                    <b>Getränke {MONAT.format(new Date())}</b>
                    <Statusmarke status="laufend" />
                  </span>
                  <span className="betrag dpl tnum">{formatCents(getraenkeLaufend)}</span>
                </li>
              )}
              {offen.length === 0 && getraenkeLaufend === 0 ? (
                <li className="leer-zeile">Nichts offen.</li>
              ) : (
                <li className="summe">
                  <span>Zusammen</span>
                  <span className="betrag dpl tnum">{formatCents(summe)}</span>
                </li>
              )}
            </ul>

            {frueher.length > 0 && (
              <details className="frueher">
                <summary>Frühere Forderungen ({frueher.length})</summary>
                <ul className="gruppe forderungen">
                  {frueher.map((f) => (
                    <li key={f.id} className="forderung">
                      <span className="was">
                        <b>
                          {ART_TEXT[f.kind] ?? f.kind}
                          {f.period_label ? ` ${f.period_label}` : ""}
                        </b>
                        <small>
                          {f.description}
                          {f.is_for_other ? ` · für ${f.member_name}` : ""}
                        </small>
                        <span className="marke-klein grau">{STATUS_TEXT[f.status] ?? f.status}</span>
                      </span>
                      <span className="betrag dpl tnum">{formatCents(f.amount_cents)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>

          {/* --- Arbeitsdienst ---------------------------------------------- */}
          {dienst && (
            <section className="karte arbeitsdienst-karte" aria-label="Arbeitsdienst">
              <div className="kopfzeile">
                <b>Arbeitsdienst {dienst.year}</b>
                <span className="dpl tnum">{soll > 0 ? `${ist} / ${soll} h` : `${ist} h`}</span>
              </div>
              {soll > 0 && (
                <div className="balken" role="img" aria-label={`${ist} von ${soll} Stunden geleistet`}>
                  <i style={{ width: `${Math.min(100, (ist / soll) * 100)}%` }} />
                </div>
              )}
              <p>
                {soll === 0
                  ? "Für dieses Jahr ist kein Arbeitsdienst vorgesehen."
                  : ist >= soll
                    ? "Erledigt – danke für deinen Einsatz."
                    : "Fehlende Stunden werden zum Jahresende als Ausgleich berechnet."}
              </p>
              {/* Die Einsaetze stehen einzeln da, nicht nur als Zahl: "5 von 8
                  Stunden" beantwortet nicht, welche Samstage angerechnet wurden -
                  und genau das fragt man, wenn die Zahl nicht zur Erinnerung passt. */}
              {einsaetze.length > 0 && (
                <details>
                  <summary>Meine Einsätze ({einsaetze.length})</summary>
                  <ul className="einsaetze">
                    {einsaetze.map((e) => (
                      <li key={e.id}>
                        <span>
                          {DATUM.format(new Date(e.worked_on))} · {e.description ?? "—"}
                          <small> · eingetragen von {e.erfasst_von}</small>
                        </span>
                        <b className="dpl tnum">{Number(e.hours)} h</b>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
          )}
        </div>

        <div>
          {/* --- Einstellungen ---------------------------------------------- */}
          <section aria-labelledby="h-einstellungen">
            <div className="sectionlabel"><h2 id="h-einstellungen">Einstellungen</h2></div>
            <nav className="gruppe einstellungen-liste" aria-label="Einstellungen">
              <Eintrag href="/konto/daten" symbol="konto" titel="Meine Daten" />
              <Eintrag href="/konto/notfall" symbol="telefon" titel="Notfallkontakt" />
              <Eintrag href="/konto/einwilligungen" symbol="haken" titel="Einwilligungen" />
              <Eintrag href="/konto/bank" symbol="kasse" titel="Bankverbindung & Mandat" />
            </nav>
            <div className="gruppe erscheinungsbild">
              <p>Erscheinungsbild</p>
              <ThemeUmschalter />
            </div>
          </section>

          <div className="gruppe">
            <Link href="/datenschutz" className="gruppen-zeile">Datenschutz</Link>
            <Link href="/impressum" className="gruppen-zeile">Impressum</Link>
            <AbmeldeKnopf alsZeile />
          </div>
        </div>
      </div>
    </>
  );
}

const PFADE: Record<string, string> = {
  konto: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  telefon: "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z",
  haken: "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  kasse: "M2 7h20v12H2zM2 11h20M6 15h4",
};

function Eintrag({ href, symbol, titel }: { href: string; symbol: string; titel: string }) {
  return (
    <Link href={href} className="gruppen-zeile eintrag">
      <span className="symbolkachel" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d={PFADE[symbol]} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="titel">{titel}</span>
      <span className="pfeil" aria-hidden="true">›</span>
    </Link>
  );
}

/** Der Stand einer Forderung - zurueckgebucht in rot, denn da muss das Mitglied etwas tun. */
function Statusmarke({ status, faellig }: { status: string; faellig?: string | null }) {
  if (status === "notified") {
    return <span className="statusmarke gelb">{faellig ? `Einzug am ${DATUM.format(new Date(faellig))}` : "angekündigt"}</span>;
  }
  if (status === "returned") return <span className="statusmarke rot">zurückgebucht</span>;
  if (status === "laufend") return <span className="statusmarke">läuft noch</span>;
  return <span className="statusmarke">offen</span>;
}
