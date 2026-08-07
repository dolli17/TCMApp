import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Der Einstieg in die Verwaltung.
 *
 * Bewusst keine Bedienelemente, sondern Zahlen mit Sprungzielen: Wer die
 * Verwaltung öffnet, will meist nicht „irgendwas einstellen", sondern hat eine
 * konkrete Frage — liegt ein Antrag? Steht ein Platz still? Fehlt jemandem das
 * Mandat? Die Kacheln beantworten genau diese Fragen und führen dorthin, wo man
 * etwas tun kann.
 */
export default async function VerwaltungSeite() {
  const supabase = await createServerSupabase();

  const [antraegeRes, mitgliederRes, plaetzeRes, buchungenRes] = await Promise.all([
    supabase
      .from("membership_applications")
      .select("id", { count: "exact", head: true })
      .eq("status", "new"),
    supabase
      .from("members")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    supabase.rpc("court_overview"),
    supabase.rpc("day_schedule", { p_date: heuteInBerlin() }),
  ]);

  const offeneAntraege = antraegeRes.count ?? 0;
  const mitglieder = mitgliederRes.count ?? 0;
  const plaetze = plaetzeRes.data ?? [];
  const stillgelegt = plaetze.filter((p) => !p.active).length;
  const heuteBelegt = (buchungenRes.data ?? []).length;

  return (
    <>
      <h1 className="pagetitle">Verwaltung</h1>
      <p className="unterzeile">
        Alles, was der Vorstand pflegt – nach Themen sortiert. Die Reiter oben führen in die
        einzelnen Bereiche.
      </p>

      <div className="kachel-reihe" style={{ marginBottom: "1.5rem" }}>
        <Link href="/admin/mitglieder/antraege" className="kachel" style={KACHEL_LINK}>
          <div className="titel">Offene Anträge</div>
          <div className="wert">{offeneAntraege}</div>
          <div className="titel">
            {offeneAntraege === 0 ? "nichts zu tun" : "warten auf Antwort"}
          </div>
        </Link>

        <Link href="/admin/mitglieder" className="kachel" style={KACHEL_LINK}>
          <div className="titel">Aktive Mitglieder</div>
          <div className="wert">{mitglieder}</div>
          <div className="titel">zur Liste</div>
        </Link>

        <Link href="/admin/plaetze" className="kachel" style={KACHEL_LINK}>
          <div className="titel">Plätze</div>
          <div className="wert">{plaetze.length - stillgelegt}</div>
          <div className="titel">
            {stillgelegt === 0 ? "alle im Plan" : `${stillgelegt} stillgelegt`}
          </div>
        </Link>

        <Link href="/plan" className="kachel" style={KACHEL_LINK}>
          <div className="titel">Heute belegt</div>
          <div className="wert">{heuteBelegt}</div>
          <div className="titel">zum Belegungsplan</div>
        </Link>
      </div>

      <section className="karte">
        <h2 className="dpl">Was wo steht</h2>
        <p className="unterzeile">
          Die Regeln stehen seit diesem Umbau bei ihrem Gegenstand – wer die Öffnungszeit sucht,
          findet sie bei den Plätzen, nicht in einer allgemeinen Einstellungsliste.
        </p>
        <ul className="wegweiser">
          <li>
            <Link href="/admin/mitglieder">Mitglieder</Link> – Liste, Anträge, Merkmale und
            Einwilligungen
          </li>
          <li>
            <Link href="/admin/plaetze">Plätze</Link> – sperren, Serien, Plätze und Buchungsarten,
            dazu Zeiten, Raster, Kontingent und Gastgebühr
          </li>
          <li>
            <Link href="/admin/getraenke">Getränke</Link> – Karte und Preise, Storno-Fenster,
            Mindestbetrag
          </li>
          <li>
            <Link href="/admin/beitraege">Beiträge</Link> – Beitragslauf, Fälligkeit und alles zur
            Lastschrift
          </li>
          <li>
            <Link href="/admin/system">System</Link> – Benachrichtigungen, Arbeitsdienst,
            Aufbewahrungsfristen
          </li>
        </ul>
      </section>
    </>
  );
}

const KACHEL_LINK = { textDecoration: "none", color: "inherit" } as const;

function heuteInBerlin(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
}
