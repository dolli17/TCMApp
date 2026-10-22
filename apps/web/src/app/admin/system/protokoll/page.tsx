import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { VerwaltungsKopf } from "@/components/VerwaltungsKopf";
import { Fehlerzustand } from "@/components/Fehlerzustand";
import { Leerzustand } from "@/components/Leerzustand";
import { Listenzeile } from "@/components/Listenzeile";
import {
  berlinTagesbeginn,
  PROTOKOLL_BEREICHE,
  protokollBereich,
  protokollSatz,
  translateDbError,
  type ProtokollBereich,
} from "@tcm/core";

export const dynamic = "force-dynamic";

const JE_SEITE = 50;
const TAG = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;

const ZEIT = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  dateStyle: "short",
  timeStyle: "short",
});

/** "2026-10-24" -> "2026-10-25" */
function folgetag(tag: string): string {
  const d = new Date(`${tag}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Verwaltungsprotokoll (O25): wer hat in der Verwaltung was getan.
 *
 * Grundlage ist change_log; sehen dürfen es nur volle Rechte (RLS). Eigene
 * Buchungen, Getränke und Anmeldungen der Mitglieder stehen nicht darin,
 * Massenläufe als ein Sammeleintrag. Gefiltert wird über die Adresse, damit
 * ein Stand sich teilen und mit Zurück wiederfinden lässt.
 */
export default async function ProtokollSeite({
  searchParams,
}: {
  searchParams: Promise<{ bereich?: string; person?: string; von?: string; bis?: string; seite?: string }>;
}) {
  const roh = await searchParams;
  const bereich = roh.bereich && roh.bereich in PROTOKOLL_BEREICHE ? (roh.bereich as ProtokollBereich) : null;
  const person = roh.person && UUID.test(roh.person) ? roh.person : null;
  const von = roh.von && TAG.test(roh.von) ? roh.von : null;
  const bis = roh.bis && TAG.test(roh.bis) ? roh.bis : null;
  const seite = Math.max(1, Number(roh.seite) || 1);

  const supabase = await createServerSupabase();

  // Wer verwaltet: alle mit einer Rolle über "Mitglied" hinaus.
  const verwaltendeRes = await supabase
    .from("member_roles")
    .select("members!member_roles_member_id_fkey!inner(id, first_name, last_name)")
    .neq("role", "member");

  let abfrage = supabase
    .from("change_log")
    .select("id, table_name, row_id, member_id, action, ereignis, diff, kenn, changed_by, changed_at")
    .order("changed_at", { ascending: false })
    .order("id", { ascending: false })
    // Einer mehr, um zu wissen, ob es weitergeht, ohne alles zu zählen.
    .range((seite - 1) * JE_SEITE, seite * JE_SEITE);
  if (bereich) abfrage = abfrage.in("table_name", PROTOKOLL_BEREICHE[bereich].tabellen);
  if (person) abfrage = abfrage.eq("changed_by", person);
  if (von) abfrage = abfrage.gte("changed_at", berlinTagesbeginn(von));
  if (bis) abfrage = abfrage.lt("changed_at", berlinTagesbeginn(folgetag(bis)));

  const { data, error } = await abfrage;
  if (error) return <Fehlerzustand text={translateDbError(error)} />;

  const weiter = (data ?? []).length > JE_SEITE;
  const eintraege = (data ?? []).slice(0, JE_SEITE);

  // Namen zu allen Kennungen der Seite in einem Rutsch, nicht je Zeile.
  const ids = (felder: string[]) => {
    const menge = new Set<string>();
    for (const e of eintraege) {
      const k = (e.kenn ?? {}) as Record<string, unknown>;
      for (const f of felder) if (typeof k[f] === "string") menge.add(k[f] as string);
    }
    return [...menge];
  };
  const personen = [
    ...new Set(eintraege.flatMap((e) => [e.changed_by, e.member_id]).filter(Boolean) as string[]),
  ];
  const einzuege = [
    ...new Set([...ids(["batch_id"]), ...eintraege.filter((e) => e.action === "read").map((e) => e.row_id!)]),
  ];
  const lade = async (tabelle: string, spalte: string, menge: string[]) => {
    if (menge.length === 0) return [] as [string, string][];
    const { data: zeilen } = await supabase.from(tabelle as "courts").select(`id, ${spalte}`).in("id", menge);
    return ((zeilen ?? []) as unknown as Record<string, string>[]).map((z) => [z.id, z[spalte]] as [string, string]);
  };
  const [mitglieder, ...weitere] = await Promise.all([
    personen.length
      ? supabase.from("members").select("id, first_name, last_name").in("id", personen)
      : Promise.resolve({ data: [] as { id: string; first_name: string; last_name: string }[] }),
    lade("courts", "name", ids(["court_id"])),
    lade("fee_types", "name", ids(["fee_type_id"])),
    lade("drink_items", "name", ids(["drink_item_id"])),
    lade("member_attribute_types", "name", ids(["attribute_type_id"])),
    lade("debit_batches", "title", einzuege),
    lade("booking_series", "title", ids(["series_id"])),
  ]);
  const namen = new Map<string, string>([
    ...((mitglieder.data ?? []).map((m) => [m.id, `${m.first_name} ${m.last_name}`]) as [string, string][]),
    ...weitere.flat(),
  ]);
  const name = (id: string) => namen.get(id);

  const verwaltende = new Map<string, string>();
  for (const z of (verwaltendeRes.data ?? []) as unknown as {
    members: { id: string; first_name: string; last_name: string };
  }[]) {
    verwaltende.set(z.members.id, `${z.members.last_name}, ${z.members.first_name}`);
  }
  const auswahl = [...verwaltende.entries()].sort((a, b) => a[1].localeCompare(b[1], "de"));

  const gefiltert = Boolean(bereich || person || von || bis);
  function link(neueSeite: number): string {
    const p = new URLSearchParams();
    if (bereich) p.set("bereich", bereich);
    if (person) p.set("person", person);
    if (von) p.set("von", von);
    if (bis) p.set("bis", bis);
    if (neueSeite > 1) p.set("seite", String(neueSeite));
    const s = p.toString();
    return `/admin/system/protokoll${s ? `?${s}` : ""}`;
  }

  return (
    <div className="verwaltung">
      <VerwaltungsKopf
        titel="Protokoll"
        zurueck={{ href: "/admin/system", text: "System" }}
        unterzeile="Wer in der Verwaltung was getan hat. Eigene Buchungen und Käufe der Mitglieder stehen nicht darin, Läufe als ein Eintrag."
      />

      <form className="formraster eng protokoll-filter" aria-label="Protokoll filtern">
        <label>
          <span>Bereich</span>
          <select name="bereich" defaultValue={bereich ?? ""}>
            <option value="">Alle Bereiche</option>
            {Object.entries(PROTOKOLL_BEREICHE).map(([wert, b]) => (
              <option key={wert} value={wert}>
                {b.titel}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Person</span>
          <select name="person" defaultValue={person ?? ""}>
            <option value="">Alle Personen</option>
            {auswahl.map(([id, n]) => (
              <option key={id} value={id}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Von</span>
          <input type="date" name="von" defaultValue={von ?? ""} />
        </label>
        <label>
          <span>Bis</span>
          <input type="date" name="bis" defaultValue={bis ?? ""} />
        </label>
        <div className="formular-fuss">
          {gefiltert && (
            <Link className="knopf leise" href="/admin/system/protokoll">
              Zurücksetzen
            </Link>
          )}
          <button type="submit" className="knopf">
            Anzeigen
          </button>
        </div>
      </form>

      {eintraege.length === 0 ? (
        <Leerzustand
          text={gefiltert ? "Für diese Auswahl gibt es keine Einträge." : "Noch keine Einträge."}
          aktion={gefiltert ? { href: "/admin/system/protokoll", label: "Filter zurücksetzen" } : undefined}
        />
      ) : (
        <section aria-label="Protokolleinträge">
          {/* Eine Zeile je Eintrag statt Tabelle: der Satz braucht die Breite,
              am Telefon wäre eine Spalte dafür zu schmal. */}
          <ul className="liste-gruppe protokoll-liste">
            {eintraege.map((e) => {
              const b = protokollBereich(e.table_name);
              const wer = e.changed_by ? (namen.get(e.changed_by) ?? "Unbekannt") : "System";
              const kurz = e.changed_by
                ? wer.split(" ").map((t) => t[0] ?? "").join("").slice(0, 2)
                : "S";
              return (
                <li key={e.id}>
                  <Listenzeile
                    avatar={{ kurz, id: e.changed_by ?? "system" }}
                    titel={protokollSatz(e, wer, name)}
                    kontext={
                      <>
                        <time dateTime={e.changed_at}>{ZEIT.format(new Date(e.changed_at))}</time>
                        {b ? ` · ${PROTOKOLL_BEREICHE[b].titel}` : ""}
                      </>
                    }
                  />
                </li>
              );
            })}
          </ul>
          <div className="tabellenfuss">
            <span>Seite {seite}</span>
            {(seite > 1 || weiter) && (
              <div className="blaettern">
                {seite > 1 ? (
                  <Link className="knopf leise klein" href={link(seite - 1)}>
                    Zurück
                  </Link>
                ) : (
                  <span className="knopf leise klein" aria-disabled="true">
                    Zurück
                  </span>
                )}
                {weiter ? (
                  <Link className="knopf leise klein" href={link(seite + 1)}>
                    Weiter
                  </Link>
                ) : (
                  <span className="knopf leise klein" aria-disabled="true">
                    Weiter
                  </span>
                )}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
