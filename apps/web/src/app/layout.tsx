import "./globals.css";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import logo from "@tcm/ui/logo.png";
import logoWeiss from "@tcm/ui/logo-weiss.png";
import { createServerSupabase, getCurrentMember, isAdmin } from "@/lib/supabase/server";
import { OHNE_RAHMEN, PFAD_KOPF } from "@/lib/pfad";
import { AbmeldeKnopf } from "@/components/AbmeldeKnopf";
import { Benachrichtigungen } from "@/components/Benachrichtigungen";
import { Inaktivitaet } from "@/components/Inaktivitaet";
import { KontoWaechter } from "@/components/KontoWaechter";
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
  const pfad = (await headers()).get(PFAD_KOPF) ?? "";
  // Mit Menue nur fuer Mitglieder - und nicht auf den Anmeldeseiten.
  const mitRahmen = Boolean(angemeldet?.member) && !OHNE_RAHMEN.includes(pfad);
  const istMitglied = Boolean(angemeldet?.member);

  // Nur der Zaehler, nicht die Liste: die Glocke steht auf jeder Seite, und
  // eine Zeilenzahl aus dem Teilindex notifications_unread_idx kostet
  // praktisch nichts. Den Inhalt holt die Glocke selbst, wenn jemand aufmacht.
  // Ueber die RPC statt direkt auf der Tabelle: RLS zeigt Admins alle
  // Benachrichtigungen, gezaehlt werden sollen nur die eigenen.
  let ungelesen = 0;
  if (istMitglied) {
    const supabase = await createServerSupabase();
    const { data } = await supabase.rpc("my_unread_notification_count");
    ungelesen = data ?? 0;
  }

  const eintraege: NavEintrag[] = [
    { href: "/", label: "Home", kurz: "Home", symbol: "home" },
    { href: "/plan", label: "Belegungsplan", kurz: "Plätze", symbol: "platz" },
    { href: "/getraenke", label: "Getränke", kurz: "Getränke", symbol: "getraenk" },
    { href: "/konto", label: "Mein Konto", kurz: "Konto", symbol: "konto" },
  ];

  // Die Bereiche der Vorstandsverwaltung (docs/design/clubhaus/verwaltung,
  // Regel 1): in der Seitenleiste einzeln, am Telefon ein fuenfter Tab
  // "Admin", der auf die Uebersicht fuehrt. Bei den Mitgliedern steht die
  // Zahl der offenen Antraege.
  const admin = isAdmin(rollen);
  let offeneAntraege = 0;
  if (admin) {
    const supabase = await createServerSupabase();
    const { count } = await supabase
      .from("membership_applications")
      .select("id", { count: "exact", head: true })
      .eq("status", "new");
    offeneAntraege = count ?? 0;
  }
  const verwaltung: NavEintrag[] = admin
    ? [
        { href: "/admin", label: "Übersicht", kurz: "Übersicht", symbol: "uebersicht" },
        {
          href: "/admin/mitglieder", label: "Mitglieder", kurz: "Mitglieder", symbol: "mitglieder",
          zahl: offeneAntraege || undefined,
        },
        { href: "/admin/arbeitsdienst", label: "Arbeitsdienst", kurz: "Dienst", symbol: "dienst" },
        { href: "/admin/kasse", label: "Kasse", kurz: "Kasse", symbol: "kasse" },
        { href: "/admin/plaetze", label: "Plätze & Serien", kurz: "Plätze", symbol: "serie" },
        { href: "/admin/getraenke", label: "Getränke", kurz: "Getränke", symbol: "getraenk" },
        { href: "/admin/system", label: "System", kurz: "System", symbol: "system" },
      ]
    : [];
  const telefon: NavEintrag[] = admin
    ? [...eintraege, { href: "/admin", label: "Admin", kurz: "Admin", symbol: "admin", bereich: true }]
    : eintraege;

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
        {/* Ein Konto pro Browser (lib/konto-kanal.ts) - auch am Kiosk. Nicht
            auf den Anmeldeseiten: dort findet der Wechsel gerade statt. */}
        {angemeldet && !OHNE_RAHMEN.includes(pfad) && <KontoWaechter kontoId={angemeldet.user.id} />}
        {mitRahmen ? (
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
                <Inaktivitaet />
                <Link href="/konto" className="avatar" aria-label="Konto">
                  {initialen}
                </Link>
              </div>
              {children}
            </div>
            <Fussmenue eintraege={telefon} />
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
