import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { MitgliederSegmente } from "@/components/MitgliederSegmente";
import { VerwaltungsKopf } from "@/components/VerwaltungsKopf";
import { AntragsListe } from "@/components/AntragsListe";
import type { Antrag } from "@/components/AntragsFenster";
import { ladeBeitragsarten } from "@/lib/beitragsarten";
import { translateDbError } from "@tcm/core";
import { Fehlerzustand } from "@/components/Fehlerzustand";

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
  // Das Rollenschloss steht im Layout - siehe app/admin/layout.tsx.

  const gewaehlt = FILTER.some((f) => f.wert === filter) ? filter! : "offen";
  const supabase = await createServerSupabase();

  let abfrage = supabase
    .from("membership_applications")
    .select(
      "id, first_name, last_name, salutation, gender, birthday, email, phone, mobile, street, postcode, city, emergency_contact_name, emergency_contact_phone, guardian_name, guardian_email, desired_fee_type_id, attribute_choices, message, status, possible_duplicate, submitted_at",
    )
    .order("submitted_at", { ascending: false })
    .limit(200);

  if (gewaehlt === "offen") abfrage = abfrage.eq("status", "new");
  if (gewaehlt === "erledigt") abfrage = abfrage.neq("status", "new");

  const [antraegeRes, beitragsarten] = await Promise.all([abfrage, ladeBeitragsarten(supabase)]);

  if (antraegeRes.error) {
    return <Fehlerzustand text={translateDbError(antraegeRes.error)} />;
  }

  const antraege = (antraegeRes.data ?? []) as unknown as Antrag[];

  return (
    <div className="verwaltung">
      <VerwaltungsKopf
        kicker="Verwaltung · Mitglieder"
        titel="Aufnahmeanträge"
      />
      {/* Die Unterzeile steht unter dem Schalter: so sitzt er auf allen drei
          Teilen an derselben Stelle (U63). */}
      <MitgliederSegmente aktiv="/admin/mitglieder/antraege" />
      {/* Ist die Ansicht leer, sagt das der Leerzustand darunter. */}
      {antraege.length > 0 && (
        <p className="unterzeile">{antraege.length} Anträge in dieser Ansicht.</p>
      )}

      <nav className="filterchips" aria-label="Filter">
        {FILTER.map((f) => (
          <Link
            key={f.wert}
            href={`/admin/mitglieder/antraege?filter=${f.wert}`}
            aria-current={f.wert === gewaehlt ? "true" : undefined}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      <AntragsListe antraege={antraege} beitragsarten={beitragsarten} />

      <p className="beschreibung">
        Das öffentliche Formular steht unter <Link href="/antrag">/antrag</Link>. Wer dort einen
        Antrag stellt, taucht hier auf – angelegt wird erst mit der Aufnahme.
      </p>
    </div>
  );
}
