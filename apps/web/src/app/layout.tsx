import "./globals.css";
import type { Metadata, Viewport } from "next";
import Image from "next/image";
import Link from "next/link";
import logo from "@tcm/ui/logo.png";
import { createServerSupabase, getCurrentMember, isAdmin } from "@/lib/supabase/server";
import { AbmeldeKnopf } from "@/components/AbmeldeKnopf";
import { Benachrichtigungen } from "@/components/Benachrichtigungen";
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

  // Nur der Zaehler, nicht die Liste: die Glocke steht auf jeder Seite, und
  // eine Zeilenzahl aus dem Teilindex notifications_unread_idx kostet
  // praktisch nichts. Den Inhalt holt die Glocke selbst, wenn jemand aufmacht.
  let ungelesen = 0;
  if (istMitglied) {
    const supabase = await createServerSupabase();
    const { count } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null);
    ungelesen = count ?? 0;
  }

  const eintraege: NavEintrag[] = [
    { href: "/plan", label: "Plätze", kurz: "Plätze", symbol: "platz" },
    { href: "/getraenke", label: "Getränke", kurz: "Getränke", symbol: "getraenk" },
    { href: "/konto", label: "Mein Konto", kurz: "Konto", symbol: "konto" },
  ];
  // Ein Eintrag statt fuenf. Vorher standen Plaetze, Serien, Mitglieder,
  // Beitraege und Einstellungen nebeneinander im Menue - acht Punkte insgesamt,
  // die am Telefon nur noch seitwaerts scrollend hineinpassten. Und "Plaetze"
  // gab es zweimal: einmal der Belegungsplan, einmal die Verwaltung.
  //
  // Die Bereiche stehen jetzt als Reiter innerhalb von /admin.
  if (isAdmin(rollen)) {
    eintraege.push({
      href: "/admin",
      label: "Verwaltung",
      kurz: "Verwaltung",
      symbol: "einstellung",
    });
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

              <Seitenmenue eintraege={eintraege}>
                <Benachrichtigungen ungelesen={ungelesen} label="Benachrichtigungen" />
              </Seitenmenue>

              <div className="fuss">
                <span>
                  {angemeldet?.member?.first_name} {angemeldet?.member?.last_name}
                </span>
                <AbmeldeKnopf />
              </div>
            </aside>

            <div className="inhalt">{children}</div>
            <Fussmenue eintraege={eintraege}>
              <Benachrichtigungen ungelesen={ungelesen} label="Nachrichten" />
            </Fussmenue>
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
