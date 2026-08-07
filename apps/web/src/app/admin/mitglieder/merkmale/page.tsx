import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
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
    <>
      <Link href="/admin/mitglieder" className="zurueck">
        ← Mitglieder
      </Link>

      <h1 className="pagetitle">Merkmale</h1>
      <p className="unterzeile">
        Alles, was der Verein am Mitglied festhalten will, ohne dass jemand Code ändern muss –
        Einwilligungen, Ehrungen, eigene Kennzeichnungen. Fachlich Wichtiges wie Trainer oder
        Leistungsklasse steht dagegen fest in den Stammdaten.
      </p>

      <div className="tabellenhuelle">
        <table className="liste">
          <thead>
            <tr>
              <th>Name</th>
              <th>Schlüssel</th>
              <th>Art</th>
              <th>Wer setzt es</th>
              <th className="zahl">Vergeben</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {merkmale.length === 0 ? (
              <tr>
                <td colSpan={6} className="leer">
                  Noch keine Merkmale angelegt.
                </td>
              </tr>
            ) : (
              merkmale.map((m) => (
                <tr key={m.id}>
                  <td>
                    {m.name}
                    {!m.active && <span className="marke-klein grau"> stillgelegt</span>}
                    {m.in_application && <span className="marke-klein"> im Antrag</span>}
                  </td>
                  <td className="tnum">{m.code}</td>
                  <td>
                    {ART_TEXT[m.value_kind] ?? m.value_kind}
                    {m.multiple && <span className="marke-klein grau"> mehrfach</span>}
                  </td>
                  <td>{m.self_editable ? "Mitglied selbst" : "Vorstand"}</td>
                  <td className="zahl">{m.anzahl_werte}</td>
                  <td>
                    <Link href={`/admin/einstellungen/merkmale?bearbeiten=${m.code}`}>
                      bearbeiten
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <h2 className="dpl" style={{ marginTop: "2rem" }}>
        {inBearbeitung ? "Merkmal bearbeiten" : "Merkmal anlegen"}
      </h2>

      {/* Der Schlüssel im key sorgt dafür, dass das Formular beim Wechsel
          zwischen Bearbeiten und Anlegen neu aufgebaut wird. */}
      <MerkmalsFormular key={inBearbeitung?.code ?? "neu"} vorhanden={inBearbeitung} />

      {inBearbeitung && (
        <Link href="/admin/mitglieder/merkmale" className="knopf leise">
          Neues Merkmal anlegen
        </Link>
      )}
    </>
  );
}
