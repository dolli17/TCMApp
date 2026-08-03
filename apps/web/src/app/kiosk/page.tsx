import { createServerSupabase } from "@/lib/supabase/server";
import { KioskOberflaeche } from "@/components/KioskOberflaeche";

export const dynamic = "force-dynamic";

/**
 * Kiosk-Ansicht für das Tablet an der Theke.
 *
 * Das Gerät ist mit einem eigenen Account angemeldet, der kein Mitglied ist.
 * Es sieht deshalb weder Buchungen noch Beitragsdaten - nur die Namensliste
 * und die Getränkekarte, beides über Funktionen, die genau das herausgeben und
 * sonst nichts.
 */
export default async function KioskSeite() {
  const supabase = await createServerSupabase();

  const [mitgliederRes, karteRes] = await Promise.all([
    supabase.rpc("member_directory", { p_query: "" }),
    supabase.rpc("drink_menu"),
  ]);

  if (mitgliederRes.error || karteRes.error) {
    return (
      <div className="hinweis fehler">
        Dieses Gerät ist nicht als Kiosk freigeschaltet. Ein Administrator muss es
        unter Kiosk-Geräte eintragen.
      </div>
    );
  }

  return (
    <KioskOberflaeche
      mitglieder={mitgliederRes.data ?? []}
      artikel={karteRes.data ?? []}
    />
  );
}
