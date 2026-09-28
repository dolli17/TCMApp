import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";

const BEREICHE = [
  { href: "/admin/mitglieder", label: "Liste" },
  { href: "/admin/mitglieder/antraege", label: "Anträge" },
  { href: "/admin/mitglieder/mannschaften", label: "Mannschaften" },
  { href: "/admin/mitglieder/merkmale", label: "Merkmale" },
  { href: "/admin/mitglieder/arbeitsdienst", label: "Arbeitsdienst" },
] as const;

/**
 * Die Reiter der Mitgliederverwaltung (Entwurf AdminMitglieder), auf der
 * Liste und allen Unterseiten. Bei den Anträgen steht die Zahl der offenen.
 */
export async function MitgliederBereiche({ aktiv }: { aktiv: (typeof BEREICHE)[number]["href"] }) {
  const supabase = await createServerSupabase();
  const { count } = await supabase
    .from("membership_applications")
    .select("id", { count: "exact", head: true })
    .eq("status", "new");
  const offen = count ?? 0;

  return (
    <nav className="reiter unterreiter" aria-label="Bereiche Mitglieder">
      {BEREICHE.map((b) => (
        <Link key={b.href} href={b.href} aria-current={b.href === aktiv ? "page" : undefined}>
          {b.label}
          {b.href === "/admin/mitglieder/antraege" && offen > 0 && (
            <span className="zaehler" aria-label={`${offen} offen`}>{offen}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}
