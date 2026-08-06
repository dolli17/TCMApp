import Link from "next/link";
import { createServerSupabase, getCurrentMember, isAdmin } from "@/lib/supabase/server";
import { MitgliederKopf } from "@/components/MitgliederKopf";

export const dynamic = "force-dynamic";

const FILTER = [
  { wert: "aktiv", label: "Aktiv" },
  { wert: "alle", label: "Alle" },
  { wert: "ohne-login", label: "Ohne Login" },
  { wert: "admins", label: "Admins" },
  { wert: "trainer", label: "Trainer" },
  { wert: "archiviert", label: "Archiviert" },
];

export default async function MitgliederSeite({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string }>;
}) {
  const { q, filter } = await searchParams;
  const angemeldet = await getCurrentMember();

  if (!angemeldet || !isAdmin(angemeldet.roles)) {
    return <div className="hinweis fehler">Diese Seite ist Administratoren vorbehalten.</div>;
  }

  const gewaehlt = FILTER.some((f) => f.wert === filter) ? filter! : "aktiv";
  const suche = (q ?? "").trim().slice(0, 60);
  const supabase = await createServerSupabase();

  // Eine Abfrage statt drei verschachtelter: member_overview filtert, sortiert
  // und begrenzt in der Datenbank. Vorher setzte PostgREST die Liste aus
  // members plus zwei Unterabfragen zusammen, was bei 400 Mitgliedern mehrere
  // Sekunden dauerte.
  //
  // Der Suchbegriff geht als Parameter hinein und nicht in einen
  // Filterausdruck - ein Komma im Namen kann ihn deshalb nicht mehr zerlegen.
  const [{ data, error }, antraegeRes] = await Promise.all([
    supabase.rpc("member_overview", {
      p_filter: gewaehlt,
      p_query: suche || undefined,
      p_limit: 500,
    }),
    supabase
      .from("membership_applications")
      .select("id", { count: "exact", head: true })
      .eq("status", "new"),
  ]);

  const offeneAntraege = antraegeRes.count ?? 0;

  if (error) {
    return <div className="hinweis fehler">{error.message}</div>;
  }

  const mitglieder = data ?? [];
  const ohneLogin = mitglieder.filter((m) => !m.has_login).length;
  const minderjaehrig = mitglieder.filter((m) => {
    if (!m.birthday) return false;
    const alter = (Date.now() - new Date(m.birthday).getTime()) / 31_557_600_000;
    return alter < 18;
  }).length;

  /** Den Filter behalten, wenn die Suche abgeschickt wird. */
  function link(wert: string): string {
    const p = new URLSearchParams();
    p.set("filter", wert);
    if (suche) p.set("q", suche);
    return `/admin/mitglieder?${p.toString()}`;
  }

  return (
    <>
      <div className="detailkopf">
        <div>
          <h1 className="pagetitle">Mitglieder</h1>
          <p className="unterzeile">{mitglieder.length} Datensätze</p>
        </div>
        <div className="aktionen">
          <MitgliederKopf />
        </div>
      </div>

      <div className="kachel-reihe" style={{ marginBottom: "1.5rem" }}>
        <div className="kachel">
          <div className="titel">Angezeigt</div>
          <div className="wert">{mitglieder.length}</div>
        </div>
        <div className="kachel">
          <div className="titel">Ohne Login</div>
          <div className="wert">{ohneLogin}</div>
          <div className="titel">meist Kinder unter 14</div>
        </div>
        <div className="kachel">
          <div className="titel">Unter 18</div>
          <div className="wert">{minderjaehrig}</div>
        </div>
        {/* Die Kachel steht auch bei null da: sonst wüsste niemand, dass es
            die Anträge überhaupt gibt. */}
        <Link
          href="/admin/mitglieder/antraege"
          className="kachel"
          style={{ textDecoration: "none", color: "inherit" }}
        >
          <div className="titel">Offene Anträge</div>
          <div className="wert">{offeneAntraege}</div>
          <div className="titel">{offeneAntraege === 0 ? "nichts zu tun" : "warten auf Antwort"}</div>
        </Link>
      </div>

      <nav className="reiter" aria-label="Filter">
        {FILTER.map((f) => (
          <Link key={f.wert} href={link(f.wert)} aria-current={f.wert === gewaehlt ? "page" : undefined}>
            {f.label}
          </Link>
        ))}
      </nav>

      <form style={{ marginBottom: "1rem", maxWidth: 320 }}>
        <input type="hidden" name="filter" value={gewaehlt} />
        <input name="q" defaultValue={suche} placeholder="Name suchen…" aria-label="Name suchen" />
      </form>

      {mitglieder.length === 0 ? (
        <p className="leer">Keine Mitglieder gefunden.</p>
      ) : (
        <div className="tabellenhuelle">
          <table className="liste">
            <thead>
              <tr>
                <th>Nr.</th>
                <th>Name</th>
                <th>E-Mail</th>
                <th>Eintritt</th>
                <th>Rollen</th>
                <th>Login</th>
              </tr>
            </thead>
            <tbody>
              {mitglieder.map((m) => (
                <tr key={m.id}>
                  <td>{m.number ?? "—"}</td>
                  <td>
                    <Link href={`/admin/mitglieder/${m.id}`}>
                      {m.last_name}, {m.first_name}
                    </Link>
                    {m.is_paid_by && <span className="marke-klein grau"> fremdgezahlt</span>}
                    {m.status === "archived" && <span className="marke-klein rot"> archiviert</span>}
                    {m.status === "inactive" && <span className="marke-klein grau"> inaktiv</span>}
                  </td>
                  <td style={{ color: m.email ? undefined : "var(--muted)" }}>
                    {m.email ?? "keine"}
                  </td>
                  <td>
                    {m.started_on
                      ? new Intl.DateTimeFormat("de-DE").format(new Date(m.started_on))
                      : "—"}
                  </td>
                  <td>
                    {m.is_admin && <span className="marke-klein gold">Admin</span>}{" "}
                    {m.is_trainer && <span className="marke-klein">Trainer</span>}
                  </td>
                  <td>{m.has_login ? "ja" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
