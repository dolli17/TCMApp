import Link from "next/link";
import { formatCents, memberCategory, type MemberCategory } from "@tcm/core";
import { createServerSupabase } from "@/lib/supabase/server";
import { MitgliederSegmente } from "@/components/MitgliederSegmente";
import { MitgliederKopf } from "@/components/MitgliederKopf";

export const dynamic = "force-dynamic";

/** Welche Datensaetze die Datenbank liefert (member_overview) */
const BESTAND = [
  { wert: "aktiv", label: "Aktuelle Mitglieder" },
  { wert: "ohne-login", label: "Ohne Zugang" },
  { wert: "trainer", label: "Trainer" },
  { wert: "admins", label: "Admins" },
  { wert: "archiviert", label: "Archiviert" },
  { wert: "alle", label: "Alle Datensätze" },
];

/** Die Chips des Entwurfs: nach Mitgliedschaft und Mandat */
const ARTEN: { wert: MemberCategory | "ohne-mandat" | ""; label: string }[] = [
  { wert: "", label: "Alle" },
  { wert: "aktiv", label: "Aktiv" },
  { wert: "jugend", label: "Jugend" },
  { wert: "passiv", label: "Passiv" },
  { wert: "ohne-mandat", label: "Ohne Mandat" },
];

const JE_SEITE = 50;

/**
 * Die Mitgliederliste (Entwurf AdminMitglieder, docs/design/clubhaus)
 *
 * Reiter zu den Unterseiten, Suche und Filter-Chips, darunter die Tabelle.
 * Unter 768 px wird jede Zeile zur Karte (nur CSS, dieselben Daten).
 *
 * Die Liste selbst kommt weiter aus member_overview; Mitgliedschaft,
 * Mannschaft, Mandat und offener Betrag werden daneben gelesen und hier nur
 * zusammengestellt.
 */
export default async function MitgliederSeite({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string; art?: string; seite?: string }>;
}) {
  const { q, filter, art, seite } = await searchParams;
  // Das Rollenschloss steht im Layout - siehe app/admin/layout.tsx.
  const gewaehlt = BESTAND.some((f) => f.wert === filter) ? filter! : "aktiv";
  const artWahl = ARTEN.find((a) => a.wert === art)?.wert ?? "";
  const suche = (q ?? "").trim().slice(0, 60);
  const jahr = Number(new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin", year: "numeric" }).format(new Date()));
  const supabase = await createServerSupabase();

  // Eine Abfrage statt drei verschachtelter: member_overview filtert, sortiert
  // und begrenzt in der Datenbank. Der Suchbegriff geht als Parameter hinein
  // und nicht in einen Filterausdruck - ein Komma im Namen kann ihn deshalb
  // nicht zerlegen.
  const [{ data, error }, beitraegeRes, zuordnungRes, mannschaftenRes, mandateRes, offenRes] =
    await Promise.all([
      supabase.rpc("member_overview", {
        p_filter: gewaehlt,
        p_query: suche || undefined,
        p_limit: 1000,
      }),
      supabase.from("member_fees").select("member_id, fee_types(code, name, sort_order)").eq("year", jahr),
      supabase.from("members").select("id, team_id, billing_payer_id"),
      supabase.from("teams").select("id, name"),
      supabase.from("sepa_mandates").select("member_id").eq("status", "active"),
      supabase
        .from("charges")
        .select("member_id, amount_cents")
        .in("status", ["open", "notified", "returned"]),
    ]);

  if (error) {
    return <div className="hinweis fehler">{error.message}</div>;
  }

  // Mehrere Beitragsarten je Jahr sind moeglich, etwa Beitrag und Pfand.
  const beitrag = new Map<string, { code: string; name: string; sort_order: number }[]>();
  for (const b of beitraegeRes.data ?? []) {
    if (b.fee_types) beitrag.set(b.member_id, [...(beitrag.get(b.member_id) ?? []), b.fee_types]);
  }
  const zuordnung = new Map((zuordnungRes.data ?? []).map((m) => [m.id, m]));
  const mannschaft = new Map((mannschaftenRes.data ?? []).map((t) => [t.id, t.name]));
  const mitMandat = new Set((mandateRes.data ?? []).map((m) => m.member_id));
  const offen = new Map<string, number>();
  for (const c of offenRes.data ?? []) offen.set(c.member_id, (offen.get(c.member_id) ?? 0) + c.amount_cents);
  const nebenFehler = beitraegeRes.error ?? zuordnungRes.error ?? mannschaftenRes.error ?? mandateRes.error ?? offenRes.error;

  const zeilen = (data ?? []).map((m) => {
    const fees = (beitrag.get(m.id) ?? []).sort((a, b) => a.sort_order - b.sort_order);
    const z = zuordnung.get(m.id);
    // Das Mandat haengt am Zahler: ein Kind, das die Eltern bezahlen, hat
    // eines, wenn die Eltern eines haben.
    const zahler = z?.billing_payer_id ?? m.id;
    return {
      ...m,
      beitragsart: fees.map((f) => f.name).join(" + ") || null,
      kategorie: memberCategory(fees),
      mannschaft: z?.team_id ? mannschaft.get(z.team_id) ?? null : null,
      mandat: mitMandat.has(zahler),
      offenCents: offen.get(m.id) ?? 0,
    };
  });

  const gefiltert = zeilen.filter((z) =>
    artWahl === "" ? true : artWahl === "ohne-mandat" ? !z.mandat : z.kategorie === artWahl,
  );
  const seiten = Math.max(1, Math.ceil(gefiltert.length / JE_SEITE));
  const seiteNr = Math.min(seiten, Math.max(1, Number(seite) || 1));
  const sichtbar = gefiltert.slice((seiteNr - 1) * JE_SEITE, seiteNr * JE_SEITE);

  /** Filter, Art und Suche behalten, wenn eines davon wechselt. */
  function link(aenderung: { filter?: string; art?: string; seite?: number }): string {
    const p = new URLSearchParams();
    const f = aenderung.filter ?? gewaehlt;
    const a = aenderung.art ?? artWahl;
    if (f !== "aktiv") p.set("filter", f);
    if (a) p.set("art", a);
    if (suche) p.set("q", suche);
    if (aenderung.seite && aenderung.seite > 1) p.set("seite", String(aenderung.seite));
    const s = p.toString();
    return `/admin/mitglieder${s ? `?${s}` : ""}`;
  }

  return (
    <div className="verwaltung mitglieder">
      <header className="verwaltung-kopf">
        <div>
          <div className="kicker">Verwaltung</div>
          <h1 className="pagetitle">Mitglieder</h1>
        </div>
        <div className="aktionen">
          <MitgliederKopf />
        </div>
      </header>

      <MitgliederSegmente aktiv="/admin/mitglieder" />

      <div className="suchleiste">
        <form className="suchfeld" role="search">
          {gewaehlt !== "aktiv" && <input type="hidden" name="filter" value={gewaehlt} />}
          {artWahl && <input type="hidden" name="art" value={artWahl} />}
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input type="search" name="q" defaultValue={suche} placeholder="Name" aria-label="Mitglieder durchsuchen" />
        </form>
        <nav className="filterchips" aria-label="Mitgliedschaft">
          {ARTEN.map((a) => (
            <Link key={a.label} href={link({ art: a.wert })} aria-current={a.wert === artWahl ? "true" : undefined}>
              {a.label}
            </Link>
          ))}
        </nav>
      </div>
      <nav className="filterchips leise" aria-label="Bestand">
        {BESTAND.map((f) => (
          <Link key={f.wert} href={link({ filter: f.wert })} aria-current={f.wert === gewaehlt ? "true" : undefined}>
            {f.label}
          </Link>
        ))}
      </nav>

      {nebenFehler && (
        <div className="hinweis fehler">
          Mitgliedschaft, Mandat oder offene Beträge konnten nicht vollständig geladen werden.
        </div>
      )}

      {sichtbar.length === 0 ? (
        <p className="leer">Keine Mitglieder gefunden.</p>
      ) : (
        <div className="karte tabellenkarte">
          <table className="liste">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Mitgliedschaft</th>
                <th scope="col">Mannschaft</th>
                <th scope="col">SEPA-Mandat</th>
                <th scope="col">Offen</th>
                <th scope="col">App</th>
              </tr>
            </thead>
            <tbody>
              {sichtbar.map((m) => (
                <tr key={m.id}>
                  <td>
                    <div className="person">
                      <span className={`avatar ton-${ton(m.id)}`} aria-hidden="true">
                        {(m.first_name[0] ?? "") + (m.last_name[0] ?? "")}
                      </span>
                      <div>
                        <Link href={`/admin/mitglieder/${m.id}`}>
                          {m.last_name}, {m.first_name}
                        </Link>
                        <small>{m.email ?? "keine E-Mail"}</small>
                        {(m.is_admin || m.is_trainer || m.is_paid_by || m.status !== "active") && (
                          <span className="marken-zeile">
                            {m.is_admin && <span className="marke-klein gold">Admin</span>}
                            {m.is_trainer && <span className="marke-klein">Trainer</span>}
                            {m.is_paid_by && <span className="marke-klein grau">fremdgezahlt</span>}
                            {m.status === "archived" && <span className="marke-klein rot">archiviert</span>}
                            {m.status === "inactive" && <span className="marke-klein grau">inaktiv</span>}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td data-label="Mitgliedschaft">{m.beitragsart ?? "–"}</td>
                  <td data-label="Mannschaft" className="leiser">{m.mannschaft ?? "–"}</td>
                  <td data-label="SEPA-Mandat">
                    <span className={`statusmarke ${m.mandat ? "gruen" : "rot"}`}>
                      {m.mandat ? "liegt vor" : "fehlt"}
                    </span>
                  </td>
                  <td data-label="Offen" className="betrag dpl tnum">
                    {m.offenCents > 0 ? formatCents(m.offenCents) : <span className="nichts">–</span>}
                  </td>
                  <td data-label="App">
                    <span className={`zugang${m.has_login ? " aktiv" : ""}`}>
                      {m.has_login ? "Zugang aktiv" : "kein Zugang"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="tabellenfuss">
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
        </div>
      )}
    </div>
  );
}

/** Eine von vier Blautoenen fuer den Avatar, fest je Mitglied. */
function ton(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 4;
}
