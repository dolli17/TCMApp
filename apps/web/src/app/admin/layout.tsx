import { getCurrentMember, isAdmin } from "@/lib/supabase/server";
import { AdminReiter } from "@/components/AdminReiter";

/**
 * Die Klammer um alles, was der Vorstand verwaltet.
 *
 * Zwei Dinge stehen hier, damit sie nicht mehr in jeder Seite einzeln stehen:
 *
 * 1. **Das Rollenschloss.** Vorher prüfte jede der acht Adminseiten selbst, ob
 *    der Aufrufer Administrator ist — achtmal derselbe Block, und die neunte
 *    Seite hätte ihn vergessen können. Hier gilt er für alles unter /admin,
 *    auch für Seiten, die es noch nicht gibt.
 *
 *    Das ist ausdrücklich nur die Oberfläche. Die eigentliche Absicherung
 *    liegt unverändert in den RPCs, die selbst `private.is_admin()` prüfen —
 *    wer die Adresse einer Server Action kennt, kommt an diesem Layout ohnehin
 *    vorbei.
 *
 * 2. **Das Reiterband.** Vorher hatte der Vorstand fünf Menüeinträge nebeneinander,
 *    und zusammengehörende Dinge lagen an verschiedenen Orten: die Buchungsregeln
 *    in den Einstellungen, die Buchungsarten bei den Plätzen. Jetzt ein Menüpunkt,
 *    sechs Bereiche, und jede Einstellung steht bei ihrem Gegenstand.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const angemeldet = await getCurrentMember();

  if (!angemeldet || !isAdmin(angemeldet.roles)) {
    return <div className="hinweis fehler">Diese Seite ist Administratoren vorbehalten.</div>;
  }

  return (
    <>
      <AdminReiter />
      {children}
    </>
  );
}
