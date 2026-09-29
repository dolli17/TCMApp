import { getCurrentMember, isAdmin } from "@/lib/supabase/server";

/**
 * Die Klammer um alles, was der Vorstand verwaltet: das Rollenschloss.
 *
 * Vorher prüfte jede Adminseite selbst, ob der Aufrufer Administrator ist –
 * und die nächste Seite hätte es vergessen können. Hier gilt es für alles
 * unter /admin, auch für Seiten, die es noch nicht gibt.
 *
 * Das ist ausdrücklich nur die Oberfläche. Die eigentliche Absicherung liegt
 * unverändert in den RPCs, die selbst `private.is_admin()` prüfen – wer die
 * Adresse einer Server Action kennt, kommt an diesem Layout ohnehin vorbei.
 *
 * Navigation und Theme stehen nicht mehr hier (docs/design/clubhaus/
 * verwaltung, Regeln 1 und 2): die Seitenleiste bzw. der Admin-Tab führt,
 * und es gilt das Theme, das das Mitglied gewählt hat.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const angemeldet = await getCurrentMember();

  if (!angemeldet || !isAdmin(angemeldet.roles)) {
    return <div className="hinweis fehler">Diese Seite ist Administratoren vorbehalten.</div>;
  }

  return children;
}
