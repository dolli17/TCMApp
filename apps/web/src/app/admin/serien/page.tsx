import { createServerSupabase, getCurrentMember, isTrainer } from "@/lib/supabase/server";
import { SerienFormular } from "@/components/SerienFormular";

export const dynamic = "force-dynamic";

const WOCHENTAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

export default async function SerienSeite() {
  const angemeldet = await getCurrentMember();

  if (!angemeldet || !isTrainer(angemeldet.roles)) {
    return (
      <div className="hinweis fehler">
        Serien können nur Trainer, Sportwart oder Vorstand anlegen.
      </div>
    );
  }

  const supabase = await createServerSupabase();

  const [plaetzeRes, artenRes, serienRes] = await Promise.all([
    supabase.from("courts").select("id, name").eq("active", true).order("position"),
    supabase
      .from("booking_types")
      .select("code, name")
      .eq("applies_to", "blocking")
      .eq("active", true)
      .order("sort_order"),
    supabase
      .from("booking_series")
      .select("id, title, weekday, start_time, end_time, valid_from, valid_to, courts(name)")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return (
    <>
      <h1 className="pagetitle">Serien-Blockungen</h1>
      <p className="unterzeile">
        Training und Verbandsspiele. Bestehende Buchungen werden verdrängt – die
        Vorschau zeigt vorher, wen es trifft.
      </p>

      <SerienFormular
        plaetze={plaetzeRes.data ?? []}
        arten={artenRes.data ?? []}
        istSportwart={angemeldet.roles.includes("sports_officer") || angemeldet.roles.includes("board")}
      />

      <h2 className="dpl">Angelegte Serien</h2>
      {(serienRes.data ?? []).length === 0 ? (
        <p className="leer">Noch keine Serien angelegt.</p>
      ) : (
        <div className="tabellenhuelle"><table className="liste">
          <thead>
            <tr>
              <th>Titel</th>
              <th>Platz</th>
              <th>Wann</th>
              <th>Zeitraum</th>
            </tr>
          </thead>
          <tbody>
            {(serienRes.data ?? []).map((s) => (
              <tr key={s.id}>
                <td>{s.title}</td>
                <td>{(s.courts as { name: string } | null)?.name ?? "—"}</td>
                <td>
                  {WOCHENTAGE[s.weekday]}, {String(s.start_time).slice(0, 5)}–
                  {String(s.end_time).slice(0, 5)}
                </td>
                <td>
                  {new Intl.DateTimeFormat("de-DE").format(new Date(s.valid_from))} bis{" "}
                  {new Intl.DateTimeFormat("de-DE").format(new Date(s.valid_to))}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </>
  );
}
