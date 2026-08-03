import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentMember, isBoard, isTreasurer, isSportsOfficer } from "@/lib/supabase/server";
import { AbmeldeKnopf } from "@/components/AbmeldeKnopf";

export const metadata: Metadata = {
  title: "TC Muckensturm",
  description: "Platzbuchung, Getränke und Mitgliederverwaltung des TC Muckensturm",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const angemeldet = await getCurrentMember();
  const rollen = angemeldet?.roles ?? [];
  const istMitglied = Boolean(angemeldet?.member);

  return (
    <html lang="de">
      <body>
        {istMitglied && (
          <header className="kopf">
            <div className="kopf-innen">
              <span className="marke">TC Muckensturm</span>
              <nav className="nav">
                <Link href="/plan">Plätze</Link>
                <Link href="/getraenke">Getränke</Link>
                <Link href="/konto">Mein Konto</Link>
                {isSportsOfficer(rollen) && <Link href="/admin/serien">Serien</Link>}
                {isBoard(rollen) && <Link href="/admin/mitglieder">Mitglieder</Link>}
                {isTreasurer(rollen) && <Link href="/admin/beitraege">Beiträge</Link>}
              </nav>
              <span style={{ color: "var(--text-leise)", fontSize: "0.9rem" }}>
                {angemeldet?.member?.first_name} {angemeldet?.member?.last_name}
              </span>
              <AbmeldeKnopf />
            </div>
          </header>
        )}
        <main>{children}</main>
      </body>
    </html>
  );
}
