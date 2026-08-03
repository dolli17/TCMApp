import { createServerSupabase, getCurrentMember, isBoard } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ROLLEN_TEXT: Record<string, string> = {
  member: "Mitglied",
  board: "Vorstand",
  treasurer: "Kassenwart",
  sports_officer: "Sportwart",
  trainer: "Trainer",
  bar_duty: "Thekendienst",
};

export default async function MitgliederSeite({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const angemeldet = await getCurrentMember();

  if (!angemeldet || !isBoard(angemeldet.roles)) {
    return <div className="hinweis fehler">Diese Seite ist dem Vorstand vorbehalten.</div>;
  }

  const supabase = await createServerSupabase();

  // Zwei Feinheiten in dieser Abfrage:
  //
  // 1. Der Select-String muss ein einziges Literal sein. Zusammengesetzt mit
  //    "+" sieht TypeScript nur noch "string" und kann die Spalten nicht
  //    ableiten - das Ergebnis waere untypisiert.
  // 2. member_roles hat zwei Fremdschluessel auf members (member_id und
  //    granted_by). Ohne den ausdruecklichen Namen der Beziehung weiss
  //    PostgREST nicht, welcher gemeint ist, und bricht ab.
  let abfrage = supabase
    .from("members")
    .select(
      "id, first_name, last_name, email, birthday, status, auth_user_id, billing_payer_id, memberships(number, started_on), member_roles!member_roles_member_id_fkey(role)",
    )
    .order("last_name")
    .limit(500);

  if (q?.trim()) {
    abfrage = abfrage.or(`last_name.ilike.%${q}%,first_name.ilike.%${q}%`);
  }

  const { data: mitglieder, error } = await abfrage;

  if (error) {
    return <div className="hinweis fehler">{error.message}</div>;
  }

  const ohneLogin = (mitglieder ?? []).filter((m) => !m.auth_user_id).length;
  const minderjaehrig = (mitglieder ?? []).filter((m) => {
    if (!m.birthday) return false;
    const alter = (Date.now() - new Date(m.birthday).getTime()) / 31_557_600_000;
    return alter < 18;
  }).length;

  return (
    <>
      <h1>Mitglieder</h1>
      <p className="unterzeile">{mitglieder?.length ?? 0} Datensätze</p>

      <div className="kachel-reihe" style={{ marginBottom: "1.5rem" }}>
        <div className="kachel">
          <div className="titel">Gesamt</div>
          <div className="wert">{mitglieder?.length ?? 0}</div>
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
      </div>

      <form style={{ marginBottom: "1rem", maxWidth: 320 }}>
        <input name="q" defaultValue={q ?? ""} placeholder="Name suchen…" />
      </form>

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
          {(mitglieder ?? []).map((m) => {
            const mitgliedschaft = Array.isArray(m.memberships) ? m.memberships[0] : null;
            const rollen = (Array.isArray(m.member_roles) ? m.member_roles : [])
              .map((r) => ROLLEN_TEXT[r.role] ?? r.role)
              .filter((r) => r !== "Mitglied");

            return (
              <tr key={m.id}>
                <td>{mitgliedschaft?.number ?? "—"}</td>
                <td>
                  {m.last_name}, {m.first_name}
                  {m.billing_payer_id && <span className="marke-klein"> fremdgezahlt</span>}
                </td>
                <td style={{ color: m.email ? undefined : "var(--text-leise)" }}>
                  {m.email ?? "keine"}
                </td>
                <td>
                  {mitgliedschaft?.started_on
                    ? new Intl.DateTimeFormat("de-DE").format(new Date(mitgliedschaft.started_on))
                    : "—"}
                </td>
                <td>
                  {rollen.map((r) => (
                    <span key={r} className="marke-klein" style={{ marginRight: 4 }}>
                      {r}
                    </span>
                  ))}
                </td>
                <td>{m.auth_user_id ? "ja" : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
