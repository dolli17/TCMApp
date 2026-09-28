import "./globals.css";
import type { Metadata, Viewport } from "next";
import Image from "next/image";
import Link from "next/link";
import logo from "@tcm/ui/logo.png";
import logoWeiss from "@tcm/ui/logo-weiss.png";
import { createServerSupabase, getCurrentMember, isAdmin } from "@/lib/supabase/server";
import { AbmeldeKnopf } from "@/components/AbmeldeKnopf";
import { Benachrichtigungen } from "@/components/Benachrichtigungen";
import { Fussmenue, Seitenmenue, Symbol, type NavEintrag } from "@/components/Navigation";
import { THEME_SKRIPT } from "@/components/ThemeUmschalter";

export const metadata: Metadata = {
  title: "TC Muckensturm",
  description: "Platzbuchung, Getränke und Mitgliederverwaltung des TC Muckensturm",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F3F5F8" },
    { media: "(prefers-color-scheme: dark)", color: "#07111D" },
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
    { href: "/", label: "Home", kurz: "Home", symbol: "home" },
    { href: "/plan", label: "Belegungsplan", kurz: "Plätze", symbol: "platz" },
    { href: "/getraenke", label: "Getränke", kurz: "Getränke", symbol: "getraenk" },
    { href: "/konto", label: "Mein Konto", kurz: "Konto", symbol: "konto" },
  ];

  // Die Bereiche der Vorstandsverwaltung - in der Seitenleiste einzeln. Am
  // Telefon fuehrt eine Karte auf der Konto-Seite hinein. Reihenfolge wie im Entwurf; die
  // Reiter innerhalb von /admin (AdminReiter) bleiben daneben bestehen.
  const admin = isAdmin(rollen);
  const verwaltung: NavEintrag[] = admin
    ? [
        { href: "/admin", label: "Übersicht", kurz: "Übersicht", symbol: "uebersicht" },
        { href: "/admin/mitglieder", label: "Mitglieder", kurz: "Mitglieder", symbol: "mitglieder" },
        { href: "/admin/kasse", label: "Kasse", kurz: "Kasse", symbol: "kasse" },
        { href: "/admin/plaetze", label: "Plätze & Serien", kurz: "Plätze", symbol: "serie" },
        { href: "/admin/getraenke", label: "Getränke", kurz: "Getränke", symbol: "getraenk" },
        { href: "/admin/system", label: "System", kurz: "System", symbol: "system" },
      ]
    : [];

  const vorname = angemeldet?.member?.first_name ?? "";
  const nachname = angemeldet?.member?.last_name ?? "";
  const initialen = (vorname.charAt(0) + nachname.charAt(0)).toUpperCase();

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
              {/* Zwei Logos, die CSS zeigt das passende: auf dunklem Grund die
                  weisse Variante mit gelbem Ball. */}
              <Link href="/" className="marke">
                <Image src={logo} alt="TC Muckensturm" height={34} priority className="logo-hell" />
                <Image src={logoWeiss} alt="TC Muckensturm" height={34} priority className="logo-dunkel" />
              </Link>

              <Link href="/plan" className="knopf gold block buchen-gross">
                <Symbol name="plus" />
                Platz buchen
              </Link>

              <Seitenmenue eintraege={eintraege} verwaltung={verwaltung} />

              <div className="nutzerkarte">
                <span className="avatar" aria-hidden="true">{initialen}</span>
                <span className="wer">
                  <span className="name">
                    {vorname} {nachname}
                  </span>
                  <span className="rolle">{admin ? "Admin" : "Mitglied"}</span>
                </span>
                <AbmeldeKnopf />
              </div>
            </aside>

            <div className="inhalt">
              {/* Glocke und - am Telefon - der Avatar stehen im Kopf der Seite,
                  nicht mehr im Menue. Ein Exemplar fuer alle Breiten. */}
              <div className="seitenkopf">
                <Benachrichtigungen ungelesen={ungelesen} label="Benachrichtigungen" />
                <Link href="/konto" className="avatar" aria-label="Konto">
                  {initialen}
                </Link>
              </div>
              {children}
            </div>
            <Fussmenue eintraege={eintraege} />
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
