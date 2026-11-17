import Link from "next/link";
import {
  berlinDay,
  formatCents,
  mannschaftEintragSichtbar,
  mannschaftKurzfassung,
  meineMannschaftLesen,
  sumOpenDrinks,
  tennisKurzfassung,
  translateDbError,
  CHARGE_KIND_LABEL,
  KONTOLOESCHUNG_TEXT,
  type ChargeKind,
  type OnboardingZustand,
} from "@tcm/core";
import { createServerSupabase, getCurrentMember } from "@/lib/supabase/server";
import { AbmeldeKnopf } from "@/components/AbmeldeKnopf";
import { Fehlerzustand } from "@/components/Fehlerzustand";
import { ThemeUmschalter } from "@/components/ThemeUmschalter";

export const dynamic = "force-dynamic";

const STATUS_TEXT: Record<string, string> = {
  open: "offen",
  notified: "angekündigt",
  submitted: "im Einzug",
  settled: "bezahlt",
  returned: "zurückgebucht",
  waived: "erlassen",
};

const DATUM = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
const MONAT = new Intl.DateTimeFormat("de-DE", { month: "long", timeZone: "Europe/Berlin" });

/**
 * Konto (Entwurf AppKonto, docs/design/clubhaus)
 *
 * Oben wer man ist, darunter was offen ist und der Arbeitsdienst. Die
 * Einstellungen stehen als gruppierte Liste; Meine Daten, Notfallkontakt,
 * Tennis, Einwilligungen und das Mandat haben je eine eigene Unterseite, statt als
 * lange Formulare die Seite zu fuellen.
 */
export default async function KontoSeite() {
  const supabase = await createServerSupabase();
  const angemeldet = await getCurrentMember();
  const meineId = angemeldet?.member?.id;

  const [
    forderungenRes,
    arbeitsdienstRes,
    einsaetzeRes,
    ichRes,
    mitgliedschaftRes,
    getraenkeRes,
    onboardingRes,
    mannschaftRes,
    einladungenRes,
  ] =
    await Promise.all([
      supabase.rpc("my_charges"),
      supabase.rpc("my_work_duty", {}),
      supabase.rpc("my_work_duty_entries", { p_year: Number(berlinDay(new Date()).slice(0, 4)) }),
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
      // Für die Kurzfassung unter "Tennis"; liefert die Angaben auch nach dem Onboarding.
      supabase.rpc("my_onboarding"),
      // Für den Eintrag "Mannschaft": sichtbar mit Mannschaft oder Einladung.
      supabase.rpc("meine_mannschaft"),
      supabase.rpc("meine_mannschaft_einladungen"),
    ]);

  // Eine gescheiterte Abfrage ist nicht "Nichts offen" (B14).
  const forderungenFehler = forderungenRes.error ?? getraenkeRes.error;
  const dienstFehler = arbeitsdienstRes.error ?? einsaetzeRes.error;

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
  // Ließ sich der Stand nicht laden, steht die Zeile ohne Kurzfassung da -
  // "Noch keine Angaben" wäre dann falsch (B14).
  const tennisStand = onboardingRes.error
    ? undefined
    : tennisKurzfassung((onboardingRes.data as unknown as OnboardingZustand | null)?.tennis);
  // Ohne Antwort der Datenbank fehlt der Eintrag lieber, als falsch zu stehen.
  const mannschaft = mannschaftRes.error ? null : meineMannschaftLesen(mannschaftRes.data);
  const offeneEinladungen = einladungenRes.error ? 0 : (einladungenRes.data ?? []).length;
  const mannschaftSichtbar = mannschaftEintragSichtbar(mannschaft, offeneEinladungen);

  return (
    <>
      {/* --- Profilkopf ---------------------------------------------------- */}
      {/* Entwurf "Konto": Kicker und Seitenname, darunter mittig Avatar, Name und Marken */}
      <div className="plan-kopf konto-kopf">
        <div>
          <div className="kicker">TC Muckensturm</div>
          <p className="pagetitle">Konto</p>
        </div>
      </div>
      <header className="profilkopf">
        <span className="avatar gross" aria-hidden="true">{initialen}</span>
        <h1>{vorname} {nachname}</h1>
        <p className="profil-marken">
          {seit && <span>Mitglied seit {seit}</span>}
          {ich?.teams && <span>{ich.teams.name}</span>}
          {ich?.teams && ich.is_team_captain && <span>Mannschaftsführer</span>}
        </p>
      </header>

      <div className="konto-raster">
        <div>
          {/* --- Abrechnung ------------------------------------------------- */}
          {/* "Abrechnung" statt "Offene Forderungen": der laufende Getränkemonat
              steht hier als Normalfall ("läuft noch") und ist keine Schuld (U56). */}
          <section aria-labelledby="h-offen">
            <div className="sectionlabel"><h2 id="h-offen">Abrechnung</h2></div>
            {forderungenFehler && (
              <Fehlerzustand
                kompakt
                titel="Deine Abrechnung ließ sich nicht laden."
                text={translateDbError(forderungenFehler)}
              />
            )}
            {!forderungenFehler && zurueck.length > 0 && (
              <div className="hinweis fehler">
                {zurueck.length === 1 ? "Eine Lastschrift kam zurück" : `${zurueck.length} Lastschriften kamen zurück`}{" "}
                – die Beträge sind wieder offen. Bitte melde dich beim Verein, damit wir das klären können.
              </div>
            )}
            {!forderungenFehler && (
              <ul className="gruppe forderungen">
                {offen.map((f) => (
                  <li key={f.id} className="forderung">
                    <span className="was">
                      <b>
                        {CHARGE_KIND_LABEL[f.kind as ChargeKind] ?? f.kind}
                        {f.period_label ? ` ${f.period_label}` : ""}
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
            )}

            {frueher.length > 0 && (
              <details className="frueher">
                <summary>Frühere Posten ({frueher.length})</summary>
                <ul className="gruppe forderungen">
                  {frueher.map((f) => (
                    <li key={f.id} className="forderung">
                      <span className="was">
                        <b>
                          {CHARGE_KIND_LABEL[f.kind as ChargeKind] ?? f.kind}
                          {f.period_label ? ` ${f.period_label}` : ""}
                        </b>
                        <small>
                          {f.description}
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
          {dienstFehler && (
            <Fehlerzustand
              kompakt
              titel="Dein Arbeitsdienst ließ sich nicht laden."
              text={translateDbError(dienstFehler)}
            />
          )}
          {dienst && !dienstFehler && (
            <section className="karte arbeitsdienst-karte" aria-label="Arbeitsdienst">
              <div className="kopfzeile">
                <b className="kicker">Arbeitsdienst {dienst.year}</b>
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
              <Eintrag href="/konto/daten" titel="Meine Daten" />
              <Eintrag href="/konto/notfall" titel="Notfallkontakt" />
              <Eintrag href="/konto/tennis" titel="Tennis" text={tennisStand} />
              {mannschaftSichtbar && (
                <Eintrag
                  href="/konto/mannschaft"
                 
                  titel="Mannschaft"
                  text={mannschaftKurzfassung(mannschaft, offeneEinladungen)}
                />
              )}
              <Eintrag href="/konto/einwilligungen" titel="Einwilligungen" />
              <Eintrag href="/konto/bank" titel="Bankverbindung & Mandat" />
            </nav>
            <div className="erscheinungsbild">
              <p className="kicker">Erscheinungsbild</p>
              <ThemeUmschalter />
            </div>
          </section>

          {/* Entwurf: Rechtliches und Abmelden als eine Zeile Textlinks */}
          <div className="konto-fuss">
            <Link href="/datenschutz">Datenschutz</Link>
            <Link href="/impressum">Impressum</Link>
            <AbmeldeKnopf alsZeile />
          </div>

          {/* Abgesetzt, damit niemand sie beim Abmelden streift (U44). */}
          <p className="konto-kuendigen">
            <Link href="/konto/loeschen" className="gefahr-link">{KONTOLOESCHUNG_TEXT.titel}</Link>
          </p>
        </div>
      </div>
    </>
  );
}

function Eintrag({ href, titel, text }: { href: string; titel: string; text?: string }) {
  return (
    <Link href={href} className="gruppen-zeile eintrag">
      <span className="titel">{titel}</span>
      {text && <span className="wert">{text}</span>}
      <svg className="pfeil" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
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
