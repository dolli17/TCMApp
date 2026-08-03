import "./globals.css";
import type { Metadata, Viewport } from "next";
import Image from "next/image";
import Link from "next/link";
import logo from "@tcm/ui/logo.png";
import { getCurrentMember, isAdmin } from "@/lib/supabase/server";
import { AbmeldeKnopf } from "@/components/AbmeldeKnopf";
import { Fussmenue, Seitenmenue, type NavEintrag } from "@/components/Navigation";
import { THEME_SKRIPT } from "@/components/ThemeUmschalter";

export const metadata: Metadata = {
  title: "TC Muckensturm",
  description: "Platzbuchung, Getränke und Mitgliederverwaltung des TC Muckensturm",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#EBEFF3" },
    { media: "(prefers-color-scheme: dark)", color: "#091622" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const angemeldet = await getCurrentMember();
  const rollen = angemeldet?.roles ?? [];
  const istMitglied = Boolean(angemeldet?.member);

  const eintraege: NavEintrag[] = [
    { href: "/plan", label: "Plätze", kurz: "Plätze", symbol: "platz" },
    { href: "/getraenke", label: "Getränke", kurz: "Getränke", symbol: "getraenk" },
    { href: "/konto", label: "Mein Konto", kurz: "Konto", symbol: "konto" },
  ];
  // Ein Admin sieht alles. Zwischenrollen gibt es nicht mehr, deshalb genuegt
  // ein Block statt vier gestaffelter Pruefungen.
  if (isAdmin(rollen)) {
    eintraege.push(
      { href: "/admin/serien", label: "Serien", kurz: "Serien", symbol: "serie" },
      { href: "/admin/mitglieder", label: "Mitglieder", kurz: "Mitglieder", symbol: "mitglieder" },
      { href: "/admin/beitraege", label: "Beiträge", kurz: "Beiträge", symbol: "beitrag" },
      { href: "/admin/einstellungen", label: "Einstellungen", kurz: "Setup", symbol: "einstellung" },
    );
  }

  return (
    <html lang="de" suppressHydrationWarning>
      <head>
        {/* Muss vor dem ersten Zeichnen laufen, sonst blitzt das helle Theme auf. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SKRIPT }} />
      </head>
      <body>
        {istMitglied ? (
          <div className="huelle">
            <aside className="seitenleiste">
              <Link href="/plan" className="marke">
                <Image src={logo} alt="TC Muckensturm" height={30} priority />
              </Link>

              <Seitenmenue eintraege={eintraege} />

              <div className="fuss">
                <span>
                  {angemeldet?.member?.first_name} {angemeldet?.member?.last_name}
                </span>
                <AbmeldeKnopf />
              </div>
            </aside>

            <div className="inhalt">{children}</div>
            <Fussmenue eintraege={eintraege} />
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
