import { formatCents } from "@tcm/core";
import { createServerSupabase } from "@/lib/supabase/server";
import { Getraenkekarte } from "@/components/Getraenkekarte";

export const dynamic = "force-dynamic";

export default async function GetraenkeSeite() {
  const supabase = await createServerSupabase();

  const [karteRes, buchungenRes, einstellungRes] = await Promise.all([
    supabase.rpc("drink_menu"),
    supabase.rpc("my_drink_purchases"),
    supabase.from("settings").select("key, value").in("key", ["drinks.void_window_minutes"]),
  ]);

  const stornoFenster = Number(
    einstellungRes.data?.find((s) => s.key === "drinks.void_window_minutes")?.value ?? 15,
  );

  const buchungen = buchungenRes.data ?? [];
  const summe = buchungen
    .filter((b) => !b.voided_at)
    .reduce((s, b) => s + (b.total_cents ?? 0), 0);

  const monat = new Intl.DateTimeFormat("de-DE", {
    month: "long",
    year: "numeric",
    timeZone: "Europe/Berlin",
  }).format(new Date());

  return (
    <>
      <h1>Getränke</h1>
      <p className="unterzeile">
        Jede Entnahme wird einzeln erfasst. Am Monatsende wird zusammengezählt.
      </p>

      <div className="kachel-reihe" style={{ marginBottom: "1.5rem" }}>
        <div className="kachel">
          <div className="titel">Offen im {monat}</div>
          <div className="wert">{formatCents(summe)}</div>
        </div>
        <div className="kachel">
          <div className="titel">Entnahmen</div>
          <div className="wert">{buchungen.filter((b) => !b.voided_at).length}</div>
        </div>
      </div>

      <Getraenkekarte
        artikel={karteRes.data ?? []}
        buchungen={buchungen}
        stornoFensterMinuten={stornoFenster}
      />
    </>
  );
}
