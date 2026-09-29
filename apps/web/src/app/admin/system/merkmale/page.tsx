import { createServerSupabase } from "@/lib/supabase/server";
import { FensterKnopf } from "@/components/FensterKnopf";
import { Listenzeile } from "@/components/Listenzeile";
import { VerwaltungsKopf } from "@/components/VerwaltungsKopf";
import { MerkmalsFormular, type MerkmalsDefinition } from "@/components/MerkmalsFormular";

export const dynamic = "force-dynamic";

const ART_TEXT: Record<string, string> = {
  list: "Auswahl",
  boolean: "Ja/Nein",
  text: "Freitext",
  date: "Datum",
  number: "Zahl",
};

export default async function MerkmaleSeite({
  searchParams,
}: {
  searchParams: Promise<{ bearbeiten?: string }>;
}) {
  const { bearbeiten } = await searchParams;
  // Das Rollenschloss steht im Layout - siehe app/admin/layout.tsx.

  const supabase = await createServerSupabase();

  const [typenRes, optionenRes, werteRes] = await Promise.all([
    supabase
      .from("member_attribute_types")
      .select(
        "id, code, name, description, value_kind, multiple, self_editable, in_application, active, sort_order",
      )
      .order("sort_order")
      .order("name"),
    supabase
      .from("member_attribute_options")
      .select("attribute_type_id, value, label, sort_order, active")
      .eq("active", true)
      .order("sort_order"),
    supabase.from("member_attribute_values").select("attribute_type_id"),
  ]);

  if (typenRes.error) {
    return <div className="hinweis fehler">{typenRes.error.message}</div>;
  }

  const zaehler = new Map<string, number>();
  for (const w of werteRes.data ?? []) {
    zaehler.set(w.attribute_type_id, (zaehler.get(w.attribute_type_id) ?? 0) + 1);
  }

  const merkmale: MerkmalsDefinition[] = (typenRes.data ?? []).map((t) => ({
    ...t,
    optionen: (optionenRes.data ?? [])
      .filter((o) => o.attribute_type_id === t.id)
      .map((o) => ({ value: o.value, label: o.label })),
    anzahl_werte: zaehler.get(t.id) ?? 0,
  }));

  const inBearbeitung = merkmale.find((m) => m.code === bearbeiten);

  return (
    <div className="verwaltung">
      <VerwaltungsKopf
        kicker="Verwaltung · System"
        titel="Merkmale"
        zurueck={{ href: "/admin/system", text: "System" }}
        unterzeile="Alles, was der Verein am Mitglied festhalten will, ohne dass jemand Code ändern muss – Einwilligungen, Ehrungen, eigene Kennzeichnungen. Fachlich Wichtiges wie Trainer oder Leistungsklasse steht dagegen fest in den Stammdaten."
      >
        <FensterKnopf titel="Merkmal anlegen" knopf="Merkmal anlegen" breit>
          <MerkmalsFormular key="neu" />
        </FensterKnopf>
      </VerwaltungsKopf>

      {merkmale.length === 0 ? (
        <p className="leer-klein">Noch keine Merkmale angelegt.</p>
      ) : (
        <ul className="liste-gruppe" aria-label="Merkmale">
          {merkmale.map((m) => (
            <li key={m.id}>
              <Listenzeile
                href={`/admin/system/merkmale?bearbeiten=${m.code}`}
                titel={m.name}
                kontext={[
                  m.code,
                  `${ART_TEXT[m.value_kind] ?? m.value_kind}${m.multiple ? ", mehrfach" : ""}`,
                  m.self_editable ? "Mitglied selbst" : "Vorstand",
                  m.in_application ? "im Antrag" : null,
                  m.active ? null : "stillgelegt",
                ].filter(Boolean).join(" · ")}
                hinweis={`${m.anzahl_werte} vergeben`}
              />
            </li>
          ))}
        </ul>
      )}

      {inBearbeitung && (
        // Der Schlüssel im key baut das Formular beim Wechsel neu auf.
        <FensterKnopf
          key={inBearbeitung.code}
          titel="Merkmal bearbeiten"
          offen
          zurueck="/admin/system/merkmale"
          breit
        >
          <MerkmalsFormular vorhanden={inBearbeitung} />
        </FensterKnopf>
      )}
    </div>
  );
}
