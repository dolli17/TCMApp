import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { EinstellungsGruppe } from "@/components/EinstellungsGruppe";
import { FensterKnopf } from "@/components/FensterKnopf";
import { GetraenkFormular, GetraenkeVerwaltung, type GetraenkZeile } from "@/components/GetraenkeVerwaltung";
import { GetraenkemonatKarte, type MonatZeile } from "@/components/GetraenkemonatKarte";
import { VerwaltungsKopf } from "@/components/VerwaltungsKopf";

const MONAT = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" });

/**
 * Was bei der Abrechnung als Naechstes dran ist - abgelesen am Stand der
 * Monate (open -> closed -> charged -> angekuendigt), aeltester zuerst. Die
 * Knoepfe dazu stehen unveraendert in der Monatskarte.
 */
function naechsterSchritt(monate: MonatZeile[], heute: string): { titel: string; text: string } {
  const jetzt = Number(heute.slice(0, 4)) * 12 + Number(heute.slice(5, 7));
  const name = (m: MonatZeile) => MONAT.format(new Date(m.year, m.month - 1, 1));
  const aelteste = [...monate].sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month));
  for (const m of aelteste) {
    if (m.status === "open" && m.year * 12 + m.month < jetzt) {
      return { titel: `${name(m)} schließen`, text: "Der Monat ist vorbei. Schließen friert die Summe ein; danach nimmt die Theke für ihn nichts mehr an." };
    }
    if (m.status === "closed") {
      return { titel: `${name(m)} abrechnen`, text: "Die Summe steht fest. Das Abrechnen macht daraus Forderungen je Mitglied." };
    }
    if (m.status === "charged" && m.offen > 0) {
      return { titel: `${name(m)} ankündigen`, text: `${m.offen} Forderungen warten auf die Vorabankündigung. Ohne sie darf nicht eingezogen werden.` };
    }
  }
  return { titel: "Alles abgerechnet", text: "Der laufende Monat wird nach seinem Ende geschlossen und abgerechnet." };
}

export const dynamic = "force-dynamic";

/**
 * Die Getränkekarte und was dazugehört.
 *
 * Bis hierher war die Karte nur über die Datenbank zu pflegen - es gab
 * Einstellungen zu Getränken, aber keine Möglichkeit, ein Getränk anzulegen
 * oder einen Preis zu ändern.
 */
export default async function GetraenkeSeite() {
  const supabase = await createServerSupabase();

  const [karteRes, einstellungRes, monateRes, fristRes] = await Promise.all([
    supabase.rpc("drink_item_overview"),
    supabase
      .from("settings")
      .select("key, value, value_type, label, description, updated_at")
      .like("key", "drinks.%")
      .order("key"),
    supabase.rpc("billing_period_overview", { p_limit: 12 }),
    supabase.from("settings").select("value").eq("key", "sepa.prenotification_days").maybeSingle(),
  ]);

  const monate = (monateRes.data ?? []) as unknown as MonatZeile[];
  const heute = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
  const schritt = naechsterSchritt(monate, heute);

  return (
    <div className="verwaltung">
      <VerwaltungsKopf
        titel="Getränke"
        unterzeile="Die Karte an der Theke und die Regeln, nach denen abgerechnet wird."
      >
        <FensterKnopf titel="Getränk anlegen" knopf="Anlegen">
          <GetraenkFormular />
        </FensterKnopf>
      </VerwaltungsKopf>

      {karteRes.error && (
        <div className="hinweis fehler">
          Die Getränkekarte konnte nicht geladen werden. ({karteRes.error.message})
        </div>
      )}

      <section className="naechster-schritt quer" aria-labelledby="h-abrechnung">
        <div>
          <div className="kicker" id="h-abrechnung">Nächster Schritt · Abrechnung</div>
          <b className="titel">{schritt.titel}</b>
          <p>{schritt.text}</p>
        </div>
        <Link className="knopf auf-blau" href="#getraenkemonate">
          Zu den Getränkemonaten
        </Link>
      </section>

      <GetraenkeVerwaltung getraenke={(karteRes.data ?? []) as unknown as GetraenkZeile[]} />

      {monateRes.error ? (
        <div className="hinweis fehler">Die Getränkemonate konnten nicht geladen werden.</div>
      ) : (
        <GetraenkemonatKarte monate={monate} fristTage={Number(fristRes.data?.value ?? 14)} />
      )}

      <EinstellungsGruppe
        titel="Abrechnung"
        text="Storno-Fenster und Mindestbetrag."
        eintraege={einstellungRes.data ?? []}
      />
    </div>
  );
}
