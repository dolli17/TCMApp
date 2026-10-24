import Link from "next/link";
import { berlinDay } from "@tcm/core";
import { createServerSupabase } from "@/lib/supabase/server";
import { VerwaltungsKopf } from "@/components/VerwaltungsKopf";
import { Leerzustand } from "@/components/Leerzustand";
import { LiveSuche } from "@/components/LiveSuche";
import {
  ArbeitsdienstListe, type DienstZeile, type SollZeile,
} from "@/components/ArbeitsdienstListe";

export const dynamic = "force-dynamic";

const JE_SEITE = 50;

/** Wer noch etwas tun muss und wer nicht – wie die Stand-Chips in der Kasse. */
const STAENDE = [
  { wert: "", label: "Alle" },
  { wert: "offen", label: "Offen" },
  { wert: "erledigt", label: "Erledigt" },
] as const;

/**
 * Der Arbeitsdienst.
 *
 * Unter „Mitglieder", nicht unter „Kasse": die tägliche Arbeit ist „wer war da,
 * wie viele Stunden" — eine Personenliste. Erst der Jahresausgleich macht
 * daraus Geld, und die Forderung taucht dann in der Kasse auf.
 *
 * Bis hierher gab es drei Tabellen, eine getestete Rechenlogik und genau eine
 * lesende Funktion. Niemand konnte je eine Stunde eintragen; der Stand jedes
 * Mitglieds stand dauerhaft auf null.
 */
export default async function ArbeitsdienstSeite({
  searchParams,
}: {
  searchParams: Promise<{ jahr?: string; q?: string; stand?: string; seite?: string }>;
}) {
  const { jahr: jahrParam, q, stand: standParam, seite } = await searchParams;
  const suche = (q ?? "").trim().slice(0, 60);
  const stand = STAENDE.find((s) => s.wert === standParam)?.wert ?? "";
  const aktuell = Number(berlinDay(new Date()).slice(0, 4));
  const jahr = Number(jahrParam) || aktuell;

  const supabase = await createServerSupabase();

  const [standRes, artenRes, satzRes, namenRes] = await Promise.all([
    supabase.rpc("work_duty_overview", { p_year: jahr }),
    supabase.rpc("fee_type_overview", { p_year: jahr }),
    supabase.from("settings").select("value").eq("key", "work_duty.hourly_rate_cents").maybeSingle(),
    // Vor- und Nachname getrennt, für "Nachname, Vorname" wie in der Mitgliederliste (U48)
    supabase.from("members").select("id, first_name, last_name"),
  ]);

  const satz = Number(satzRes.data?.value ?? 1500);

  const namen = new Map((namenRes.data ?? []).map((m) => [m.id, m]));
  const zeilen = ((standRes.data ?? []) as unknown as DienstZeile[])
    .map((z) => {
      const m = namen.get(z.member_id);
      return { ...z, member_name: m ? `${m.last_name}, ${m.first_name}` : z.member_name };
    })
    .sort((a, b) => a.member_name.localeCompare(b.member_name, "de"));

  // Offen heißt: es fehlen Stunden und das Jahr ist dafür nicht abgerechnet.
  const offen = (z: DienstZeile) => !z.abgerechnet && Number(z.missing_hours) > 0;
  const nadel = suche.toLocaleLowerCase("de");
  const gefiltert = zeilen.filter((z) => {
    if (stand === "offen" && !offen(z)) return false;
    if (stand === "erledigt" && offen(z)) return false;
    if (!nadel) return true;
    const m = namen.get(z.member_id);
    const name = m ? `${m.first_name} ${m.last_name} ${m.last_name}, ${m.first_name}` : z.member_name;
    return name.toLocaleLowerCase("de").includes(nadel);
  });
  const seiten = Math.max(1, Math.ceil(gefiltert.length / JE_SEITE));
  const seiteNr = Math.min(seiten, Math.max(1, Number(seite) || 1));
  const sichtbar = gefiltert.slice((seiteNr - 1) * JE_SEITE, seiteNr * JE_SEITE);

  /** Jahr, Stand und Suche behalten, wenn eines davon wechselt. */
  function link(aenderung: { stand?: string; seite?: number }): string {
    const p = new URLSearchParams();
    const st = aenderung.stand ?? stand;
    if (jahr !== aktuell) p.set("jahr", String(jahr));
    if (st) p.set("stand", st);
    if (suche) p.set("q", suche);
    if (aenderung.seite && aenderung.seite > 1) p.set("seite", String(aenderung.seite));
    const s = p.toString();
    return `/admin/arbeitsdienst${s ? `?${s}` : ""}`;
  }

  return (
    <div className="verwaltung">
      <VerwaltungsKopf
        kicker="Verwaltung"
        titel="Arbeitsdienst"
        unterzeile="Wer wie viele Stunden schuldet, was geleistet wurde und was am Jahresende offen bleibt."
      />

      <nav className="filterchips" aria-label="Jahr">
        <Link href={`/admin/arbeitsdienst?jahr=${jahr - 1}`}>‹ {jahr - 1}</Link>
        <Link href={`/admin/arbeitsdienst?jahr=${jahr}`} aria-current="true">
          {jahr}
        </Link>
        <Link href={`/admin/arbeitsdienst?jahr=${jahr + 1}`}>{jahr + 1} ›</Link>
        {jahr !== aktuell && <Link href="/admin/arbeitsdienst">Dieses Jahr</Link>}
      </nav>

      <ArbeitsdienstListe
        jahr={jahr}
        zeilen={zeilen}
        liste={sichtbar}
        filter={
          <div key="filter" className="suchleiste">
            <form className="mitglieder-suche" role="search">
              {jahr !== aktuell && <input type="hidden" name="jahr" value={jahr} />}
              {stand && <input type="hidden" name="stand" value={stand} />}
              <label className="suchfeld">
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <LiveSuche defaultValue={suche} placeholder="Name" aria-label="Arbeitsdienst durchsuchen" />
              </label>
            </form>
            <nav className="filterchips" aria-label="Stand">
              {STAENDE.map((s) => (
                <Link key={s.label} href={link({ stand: s.wert })} aria-current={s.wert === stand ? "true" : undefined}>
                  {s.label}
                </Link>
              ))}
            </nav>
          </div>
        }
        fuss={
          <div key="fuss" className="tabellenfuss">
            <span>
              {gefiltert.length} Mitglieder · {sichtbar.length} angezeigt
            </span>
            {seiten > 1 && (
              <div className="blaettern">
                {seiteNr > 1 ? (
                  <Link className="knopf leise klein" href={link({ seite: seiteNr - 1 })}>Zurück</Link>
                ) : (
                  <span className="knopf leise klein" aria-disabled="true">Zurück</span>
                )}
                {seiteNr < seiten ? (
                  <Link className="knopf leise klein" href={link({ seite: seiteNr + 1 })}>Weiter</Link>
                ) : (
                  <span className="knopf leise klein" aria-disabled="true">Weiter</span>
                )}
              </div>
            )}
          </div>
        }
        leer={
          suche || stand ? (
            <Leerzustand
              key="leer"
              text="Niemand passt zu dieser Suche."
              aktion={{
                href: jahr !== aktuell ? `/admin/arbeitsdienst?jahr=${jahr}` : "/admin/arbeitsdienst",
                label: "Filter zurücksetzen",
              }}
            />
          ) : null
        }
        arten={((artenRes.data ?? []) as unknown as SollZeile[]).filter((a) => a.id)}
        stundensatzCents={satz}
        abrechenbar={jahr < aktuell}
      />
    </div>
  );
}
