import { createServerSupabase } from "@/lib/supabase/server";
import { EinstellungsGruppe } from "@/components/EinstellungsGruppe";
import { GetraenkeVerwaltung, type GetraenkZeile } from "@/components/GetraenkeVerwaltung";

export const dynamic = "force-dynamic";

/**
 * Die Getränkekarte und was dazugehört.
 *
 * Bis hierher war die Karte nur über die Datenbank zu pflegen - es gab
 * Einstellungen zu Getränken, aber keine Möglichkeit, ein Getränk anzulegen
 * oder einen Preis zu ändern.
 */
export default async function GetraenkeSeite() {
  const supabase = await createServerSupabase();

  const [karteRes, einstellungRes] = await Promise.all([
    supabase.rpc("drink_item_overview"),
    supabase
      .from("settings")
      .select("key, value, value_type, label, description, updated_at")
      .like("key", "drinks.%")
      .order("key"),
  ]);

  return (
    <>
      <h1 className="pagetitle">Getränke</h1>
      <p className="unterzeile">
        Die Karte an der Theke und die Regeln, nach denen abgerechnet wird.
      </p>

      {karteRes.error && (
        <div className="hinweis fehler">
          Die Getränkekarte konnte nicht geladen werden. ({karteRes.error.message})
        </div>
      )}

      <GetraenkeVerwaltung getraenke={(karteRes.data ?? []) as unknown as GetraenkZeile[]} />

      <EinstellungsGruppe
        titel="Abrechnung"
        text="Storno-Fenster und Mindestbetrag."
        eintraege={einstellungRes.data ?? []}
      />
    </>
  );
}
