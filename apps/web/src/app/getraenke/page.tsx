import { formatCents, sumOpenDrinks } from "@tcm/core";
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
  const summe = sumOpenDrinks(buchungen);
  const entnahmen = buchungen.filter((b) => !b.voided_at).length;
  const monat = new Intl.DateTimeFormat("de-DE", { month: "long", timeZone: "Europe/Berlin" }).format(new Date());

  return (
    <>
      <h1 className="pagetitle">Getränke</h1>

      {/* Der laufende Monat - Entwurf AppGetraenke */}
      <section className="monatskarte" aria-label={`Getränke im ${monat}`}>
        <svg className="platzlinien" viewBox="0 0 350 150" preserveAspectRatio="xMaxYMin slice" aria-hidden="true">
          <path d="M200 150 L250 0 M350 40 L260 150 M230 80 H350" />
        </svg>
        <div className="kicker">{monat} · läuft noch</div>
        <div className="summe dpl tnum">{formatCents(summe)}</div>
        <p>
          {entnahmen} {entnahmen === 1 ? "Entnahme" : "Entnahmen"} · wird mit der Monatsabrechnung
          eingezogen
        </p>
      </section>

      <Getraenkekarte
        artikel={karteRes.data ?? []}
        buchungen={buchungen}
        stornoFensterMinuten={stornoFenster}
      />
    </>
  );
}
