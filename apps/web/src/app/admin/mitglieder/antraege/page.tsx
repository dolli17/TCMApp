import Link from "next/link";
import { createServerSupabase, getCurrentMember, isAdmin } from "@/lib/supabase/server";
import { AntragsListe } from "@/components/AntragsListe";
import type { Antrag, Beitragsart } from "@/components/AntragsFenster";

export const dynamic = "force-dynamic";

const FILTER = [
  { wert: "offen", label: "Offen" },
  { wert: "alle", label: "Alle" },
  { wert: "erledigt", label: "Erledigt" },
];

export default async function AntraegeSeite({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  const angemeldet = await getCurrentMember();

  if (!angemeldet || !isAdmin(angemeldet.roles)) {
    return <div className="hinweis fehler">Diese Seite ist Administratoren vorbehalten.</div>;
  }

  const gewaehlt = FILTER.some((f) => f.wert === filter) ? filter! : "offen";
  const supabase = await createServerSupabase();

  let abfrage = supabase
    .from("membership_applications")
    .select(
      "id, first_name, last_name, salutation, birthday, email, phone, mobile, street, postcode, city, emergency_contact_name, emergency_contact_phone, guardian_name, guardian_email, desired_fee_type_id, attribute_choices, message, status, possible_duplicate, submitted_at",
    )
    .order("submitted_at", { ascending: false })
    .limit(200);

  if (gewaehlt === "offen") abfrage = abfrage.eq("status", "new");
  if (gewaehlt === "erledigt") abfrage = abfrage.neq("status", "new");

  const [antraegeRes, artenRes] = await Promise.all([
    abfrage,
    supabase.from("fee_types").select("id, name, fee_prices(amount_cents)").eq("active", true).order("sort_order"),
  ]);

  if (antraegeRes.error) {
    return <div className="hinweis fehler">{antraegeRes.error.message}</div>;
  }

  const beitragsarten: Beitragsart[] = (artenRes.data ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    // Der jüngste hinterlegte Preis genügt für die Anzeige im Fenster; für die
    // Abrechnung rechnet ohnehin die Datenbank.
    preis_cents:
      (Array.isArray(a.fee_prices) ? a.fee_prices : [])
        .map((p) => p.amount_cents)
        .sort((x, y) => y - x)[0] ?? null,
  }));

  const antraege = (antraegeRes.data ?? []) as unknown as Antrag[];
  const offene = antraege.filter((a) => a.status === "new").length;

  return (
    <>
      <Link href="/admin/mitglieder" className="zurueck">
        ← Mitglieder
      </Link>

      <h1 className="pagetitle">Aufnahmeanträge</h1>
      <p className="unterzeile">
        {gewaehlt === "offen" && offene === 0
          ? "Zurzeit liegt nichts vor."
          : `${antraege.length} Anträge in dieser Ansicht.`}
      </p>

      <nav className="reiter" aria-label="Filter">
        {FILTER.map((f) => (
          <Link
            key={f.wert}
            href={`/admin/mitglieder/antraege?filter=${f.wert}`}
            aria-current={f.wert === gewaehlt ? "page" : undefined}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      <AntragsListe antraege={antraege} beitragsarten={beitragsarten} />

      <p className="beschreibung" style={{ marginTop: "1.5rem" }}>
        Das öffentliche Formular steht unter <Link href="/antrag">/antrag</Link>. Wer dort einen
        Antrag stellt, taucht hier auf – angelegt wird erst mit der Aufnahme.
      </p>
    </>
  );
}
