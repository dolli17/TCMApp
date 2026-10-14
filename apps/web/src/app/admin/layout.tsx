import { headers } from "next/headers";
import { darfPlaetze, getCurrentMember, isAdmin } from "@/lib/supabase/server";
import { PFAD_KOPF } from "@/lib/pfad";

/** Was der Platzwart unter /admin sehen darf: Plaetze & Serien. */
const PLATZ_BEREICH = "/admin/plaetze";

/**
 * Die Klammer um alles, was der Vorstand verwaltet: das Rollenschloss.
 *
 * Vorher prüfte jede Adminseite selbst, ob der Aufrufer Administrator ist –
 * und die nächste Seite hätte es vergessen können. Hier gilt es für alles
 * unter /admin, auch für Seiten, die es noch nicht gibt.
 *
 * Volle Rechte (Vorstand, App Admin) öffnen alles. Mit Platzrechten allein
 * (Platzwart) bleibt nur /admin/plaetze offen; welcher Pfad gerade
 * angefragt ist, setzt die Middleware als Kopfzeile (lib/pfad.ts).
 *
 * Das ist ausdrücklich nur die Oberfläche. Die eigentliche Absicherung liegt
 * unverändert in den RPCs, die selbst `private.is_admin()` bzw.
 * `private.darf_plaetze()` prüfen – wer die Adresse einer Server Action
 * kennt, kommt an diesem Layout ohnehin vorbei.
 *
 * Navigation und Theme stehen nicht mehr hier (docs/design/clubhaus/
 * verwaltung, Regeln 1 und 2): die Seitenleiste bzw. der Admin-Tab führt,
 * und es gilt das Theme, das das Mitglied gewählt hat.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const angemeldet = await getCurrentMember();
  const rollen = angemeldet?.roles ?? [];

  if (angemeldet && isAdmin(rollen)) return children;

  const pfad = (await headers()).get(PFAD_KOPF) ?? "";
  const imPlatzBereich = pfad === PLATZ_BEREICH || pfad.startsWith(`${PLATZ_BEREICH}/`);
  if (angemeldet && darfPlaetze(rollen) && imPlatzBereich) return children;

  return <div className="hinweis fehler">Diese Seite ist Administratoren vorbehalten.</div>;
}
