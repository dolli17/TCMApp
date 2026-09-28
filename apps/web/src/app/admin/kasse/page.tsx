import Link from "next/link";
import { formatCents } from "@tcm/core";
import { createServerSupabase } from "@/lib/supabase/server";
import { EinstellungsGruppe } from "@/components/EinstellungsGruppe";
import { KassenKennzahlen } from "@/components/KassenKennzahlen";
import { LaufListe, type LaufZeile } from "@/components/LaufListe";
import { BereichSegmente } from "@/components/BereichSegmente";
import { VerwaltungsKopf } from "@/components/VerwaltungsKopf";
import { AnkuendigungsKarte } from "@/components/AnkuendigungsKarte";
import { BeitragslaufKarte } from "@/components/BeitragslaufKarte";
import { BeitragsartenPflege, type BeitragsartZeile } from "@/components/BeitragsartenPflege";
import { ForderungsListe, type ForderungZeile } from "@/components/ForderungsListe";
import { GetraenkemonatKarte, type MonatZeile } from "@/components/GetraenkemonatKarte";

export const dynamic = "force-dynamic";

const ABSCHNITTE = [
  { wert: "forderungen", label: "Forderungen" },
  { wert: "lastschrift", label: "Lastschriften" },
  { wert: "getraenke", label: "Getränkemonate" },
  { wert: "lauf", label: "Beitragslauf" },
  { wert: "arten", label: "Beitragsarten" },
  { wert: "regeln", label: "Regeln" },
] as const;

/** Die drei Teile des Segment-Schalters (Regel 1); der Rest sind Unterseiten. */
const SEGMENTE = ["forderungen", "lastschrift", "getraenke"];

/**
 * Alles, was Geld betrifft, an einem Ort.
 *
 * Vorher hieß der Bereich „Beiträge" und konnte nur eine Vorschau zeigen. Der
 * Getränkemonat wurde nirgends geschlossen, Forderungen entstanden gar nicht,
 * und die Beitragspreise ließen sich nur direkt in der Datenbank ändern.
 *
 * Die Abschnitte folgen dem Ablauf eines Vereinsjahres: einmal im Januar der
 * Beitragslauf, monatlich die Getränke, dazwischen die Forderungsliste als
 * Antwort auf „wer schuldet uns noch was".
 */
export default async function KasseSeite({
  searchParams,
}: {
  searchParams: Promise<{ abschnitt?: string; jahr?: string; stand?: string }>;
}) {
  const { abschnitt, jahr: jahrParam, stand } = await searchParams;
  const gewaehlt = ABSCHNITTE.some((a) => a.wert === abschnitt) ? abschnitt! : "forderungen";
  const unterseite = SEGMENTE.includes(gewaehlt) ? null : ABSCHNITTE.find((a) => a.wert === gewaehlt)!;
  const jahr = Number(jahrParam) || new Date().getFullYear();

  const supabase = await createServerSupabase();

  const [
    vorschauRes, einstellungRes, monateRes, forderungenRes, artenRes, offenRes, laeufeRes,
  ] = await Promise.all([
    gewaehlt === "lauf"
      ? supabase.rpc("fee_run_preview", { p_year: jahr })
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("settings")
      .select("key, value, value_type, label, description, updated_at")
      .or("key.like.sepa.%,key.like.fees.%")
      .order("key"),
    gewaehlt === "getraenke"
      ? supabase.rpc("billing_period_overview", { p_limit: 18 })
      : Promise.resolve({ data: null, error: null }),
    gewaehlt === "forderungen"
      ? supabase.rpc("charge_overview", {
          p_status: (stand ?? undefined) as never,
          p_kind: undefined,
          p_limit: 500,
        })
      : Promise.resolve({ data: null, error: null }),
    gewaehlt === "arten"
      ? supabase.rpc("fee_type_overview", { p_year: jahr })
      : Promise.resolve({ data: null, error: null }),
    gewaehlt === "lauf"
      ? supabase.rpc("announceable_charges", { p_kind: "fee", p_period_label: String(jahr) })
      : Promise.resolve({ data: null, error: null }),
    gewaehlt === "lastschrift"
      ? supabase.rpc("debit_batch_overview", { p_limit: 6 })
      : Promise.resolve({ data: null, error: null }),
  ]);

  const einstellungen = einstellungRes.data ?? [];
  const glaeubigerId = String(
    einstellungen.find((s) => s.key === "sepa.creditor_id")?.value ?? "",
  ).replace(/"/g, "");
  const frist = Number(
    einstellungen.find((s) => s.key === "sepa.prenotification_days")?.value ?? 14,
  );

  return (
    <div className="verwaltung">
      {unterseite ? (
        <VerwaltungsKopf
          kicker="Verwaltung · Kasse"
          titel={unterseite.label}
          zurueck={{ href: "/admin/kasse", text: "Kasse" }}
        />
      ) : (
        <>
          <VerwaltungsKopf
            titel="Kasse"
            unterzeile="Beiträge, Getränkeabrechnung und alles, was daraus an Forderungen entsteht."
          />

          <KassenKennzahlen />

          <BereichSegmente
            label="Kasse"
            aktiv={`/admin/kasse?abschnitt=${gewaehlt}`}
            eintraege={SEGMENTE.map((wert) => ({
              href: `/admin/kasse?abschnitt=${wert}`,
              label: ABSCHNITTE.find((a) => a.wert === wert)!.label,
            }))}
          />
        </>
      )}

      {gewaehlt === "lauf" && (
        <Beitragslauf
          jahr={jahr}
          zeilen={(vorschauRes.data ?? []) as VorschauZeile[]}
          glaeubigerId={glaeubigerId}
          einstellungen={einstellungen}
          frist={frist}
          anzukuendigen={
            (offenRes.data ?? [])[0] ?? { anzahl: 0, summe_cents: 0, zahler: 0 }
          }
        />
      )}

      {gewaehlt === "getraenke" && (
        <GetraenkemonatKarte
          monate={(monateRes.data ?? []) as unknown as MonatZeile[]}
          fristTage={frist}
        />
      )}

      {gewaehlt === "forderungen" && (
        <>
          {/* Was man seltener braucht, steht als Unterseite darunter */}
          <nav className="gruppe" aria-label="Einrichtung der Kasse">
            {(["lauf", "arten", "regeln"] as const).map((wert) => (
              <Link key={wert} href={`/admin/kasse?abschnitt=${wert}`} className="gruppen-zeile">
                <span className="titel">{ABSCHNITTE.find((a) => a.wert === wert)!.label}</span>
                <span className="pfeil" aria-hidden="true">›</span>
              </Link>
            ))}
          </nav>
          <StandFilter aktiv={stand ?? ""} />
          <ForderungsListe
            forderungen={(forderungenRes.data ?? []) as unknown as ForderungZeile[]}
          />
        </>
      )}

      {gewaehlt === "lastschrift" && <Lastschriftband laeufe={laeufeRes.data ?? []} />}

      {gewaehlt === "arten" && (
        <BeitragsartenPflege
          arten={(artenRes.data ?? []) as unknown as BeitragsartZeile[]}
          jahr={jahr}
        />
      )}

      {gewaehlt === "regeln" && (
        <>
          <EinstellungsGruppe
            titel="Fälligkeit"
            text="Wann der Jahresbeitrag eingezogen wird."
            eintraege={einstellungen.filter((e) => e.key.startsWith("fees."))}
          />
          <EinstellungsGruppe
            titel="Lastschrift"
            text="Gläubiger-ID, Format und Vorabankündigung."
            eintraege={einstellungen.filter((e) => e.key.startsWith("sepa."))}
          />
        </>
      )}
    </div>
  );
}

interface VorschauZeile {
  member_id: string;
  member_name: string;
  payer_name: string;
  fee_types: string;
  amount_cents: number;
  has_mandate: boolean;
  mandate_scope: "fees_only" | "all_payments" | null;
  already_charged: boolean;
}

function Beitragslauf({
  jahr, zeilen, glaeubigerId, einstellungen, frist, anzukuendigen,
}: {
  jahr: number;
  zeilen: VorschauZeile[];
  glaeubigerId: string;
  einstellungen: { key: string; value: unknown }[];
  frist: number;
  anzukuendigen: { anzahl: number; summe_cents: number; zahler: number };
}) {
  const summe = zeilen.reduce((s, z) => s + (z.amount_cents ?? 0), 0);
  const ohneMandat = zeilen.filter((z) => !z.has_mandate);
  const nurBeitraege = zeilen.filter((z) => z.has_mandate && z.mandate_scope === "fees_only");
  const schonBerechnet = zeilen.filter((z) => z.already_charged);

  const zahl = (schluessel: string, ersatz: number) =>
    Number(einstellungen.find((e) => e.key === schluessel)?.value ?? ersatz);

  // Der Vorschlag kommt aus den Einstellungen; ändern lässt er sich trotzdem.
  const faellig = `${jahr}-${String(zahl("fees.annual_run_month", 1)).padStart(2, "0")}-${String(
    zahl("fees.annual_run_day", 15),
  ).padStart(2, "0")}`;

  return (
    <>
      <div className="abschnittskopf">
        <h2 className="dpl">Beitragslauf {jahr}</h2>
        <nav className="filterchips" aria-label="Jahr">
          <Link href={`/admin/kasse?abschnitt=lauf&jahr=${jahr - 1}`}>‹ {jahr - 1}</Link>
          <Link href={`/admin/kasse?abschnitt=lauf&jahr=${jahr}`} aria-current="true">
            {jahr}
          </Link>
          <Link href={`/admin/kasse?abschnitt=lauf&jahr=${jahr + 1}`}>{jahr + 1} ›</Link>
          {jahr !== new Date().getFullYear() && <Link href="/admin/kasse?abschnitt=lauf">Dieses Jahr</Link>}
        </nav>
      </div>

      {!glaeubigerId && (
        <div className="hinweis fehler">
          Die Gläubiger-Identifikationsnummer fehlt noch. Sie steht im eBuSy-Backend und muss
          unverändert übernommen werden – nur dann bleiben die Bestandsmandate gültig. Ohne sie
          lässt sich keine Lastschriftdatei erzeugen.
        </div>
      )}

      <div className="kennzahlen">
        <div className="kennzahl">
          <span className="label">Mitglieder</span>
          <span className="wert dpl tnum">{zeilen.length}</span>
          <span className="info">im Beitragslauf {jahr}</span>
        </div>
        <div className="kennzahl">
          <span className="label">Summe</span>
          <span className="wert dpl tnum">{formatCents(summe)}</span>
          <span className="info">alle Beitragsarten</span>
        </div>
        <div className="kennzahl">
          <span className="label">Ohne Mandat</span>
          <span className="wert dpl tnum">{ohneMandat.length}</span>
          <span className="info">zahlen per Überweisung</span>
        </div>
        <div className="kennzahl">
          <span className="label">Bereits berechnet</span>
          <span className="wert dpl tnum">{schonBerechnet.length}</span>
          <span className="info">Forderung erzeugt</span>
        </div>
      </div>

      {ohneMandat.length > 0 && (
        <div className="hinweis fehler">
          <strong>{ohneMandat.length} Mitglieder haben kein gültiges SEPA-Mandat.</strong> Sie
          erscheinen nicht in der Lastschriftdatei und müssen separat angeschrieben werden –
          sonst rutschen sie unbemerkt durch:{" "}
          {ohneMandat.slice(0, 8).map((z) => z.member_name).join(", ")}
          {ohneMandat.length > 8 && ` und ${ohneMandat.length - 8} weitere`}.
        </div>
      )}

      {nurBeitraege.length > 0 && (
        <div className="hinweis">
          Bei {nurBeitraege.length} Mandaten deckt der Text nur Beiträge ab. Für den Beitragslauf
          reicht das; der monatliche Getränkeeinzug braucht bei diesen Mitgliedern ein eigenes
          Mandat.
        </div>
      )}

      {/* Gezählt wird nur, was eine Forderung ergibt: beitragsbefreite
          Mitglieder stehen mit 0,00 € in der Vorschau, bekommen nie eine
          Forderung und würden den Knopf sonst für immer stehen lassen. */}
      <BeitragslaufKarte
        jahr={jahr}
        mitglieder={zeilen.filter((z) => z.amount_cents > 0).length}
        summeCents={zeilen.filter((z) => !z.already_charged).reduce((s, z) => s + z.amount_cents, 0)}
        schonBerechnet={schonBerechnet.length}
        faelligAm={faellig}
      />

      {/* Der zweite Schritt steht direkt darunter, nicht auf einer eigenen
          Seite: wer gerade Forderungen erzeugt hat, muss als Nächstes
          ankündigen — sonst darf gar nicht eingezogen werden. */}
      <AnkuendigungsKarte
        art="fee"
        zeitraum={String(jahr)}
        offen={anzukuendigen.anzahl}
        summeCents={anzukuendigen.summe_cents}
        fristTage={frist}
        faelligVorschlag={faellig}
      />

      <section className="karte tabellenkarte" aria-labelledby="h-positionen">
        <div className="kartenkopf">
          <h2 id="h-positionen">Positionen</h2>
        </div>
        <table className="liste">
          <thead>
            <tr>
              <th scope="col">Mitglied</th>
              <th scope="col">Zahler</th>
              <th scope="col">Beitragsarten</th>
              <th scope="col" className="zahl">Betrag</th>
              <th scope="col">Mandat</th>
              <th scope="col">Stand</th>
            </tr>
          </thead>
          <tbody>
            {zeilen.map((z) => (
              <tr key={z.member_id}>
                <td className="fett">{z.member_name}</td>
                <td data-label="Zahler" className="leiser">{z.payer_name || "selbst"}</td>
                <td data-label="Beitragsarten">{z.fee_types}</td>
                <td data-label="Betrag" className="zahl betrag dpl tnum">{formatCents(z.amount_cents ?? 0)}</td>
                <td data-label="Mandat">
                  {z.has_mandate ? (
                    <span className="statusmarke gruen">
                      {z.mandate_scope === "all_payments" ? "alle Zahlungen" : "nur Beiträge"}
                    </span>
                  ) : (
                    <span className="statusmarke rot">fehlt</span>
                  )}
                </td>
                <td data-label="Stand">
                  <span className={`statusmarke${z.already_charged ? " gruen" : ""}`}>
                    {z.already_charged ? "berechnet" : "offen"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="mit">
        Nach dem Erzeugen der Forderungen geht zuerst die Vorabankündigung mit Betrag und
        Fälligkeit an die Mitglieder; erst nach Ablauf der Frist darf eingezogen werden.
      </p>
    </>
  );
}

/**
 * Der Einstieg in die Lastschriftläufe.
 *
 * Bewusst nur ein Ausschnitt mit Weg dorthin: ein Lauf ist ein Vorgang über
 * mehrere Tage und braucht eine eigene Adresse, die man verlinken kann.
 */
function Lastschriftband({ laeufe }: { laeufe: LaufZeile[] }) {
  return (
    <section className="karte tabellenkarte" aria-labelledby="h-lastschrift">
      <div className="kartenkopf">
        <h2 id="h-lastschrift">Lastschriftläufe</h2>
        <Link href="/admin/kasse/lastschriften">Alle Läufe</Link>
      </div>
      <p className="unterzeile">Aus angekündigten Forderungen wird eine Datei fürs Onlinebanking.</p>
      <LaufListe laeufe={laeufe} />
    </section>
  );
}

const STAENDE = [
  { wert: "", label: "Alle" },
  { wert: "open", label: "Offen" },
  { wert: "notified", label: "Angekündigt" },
  { wert: "submitted", label: "Eingereicht" },
  { wert: "settled", label: "Bezahlt" },
  { wert: "returned", label: "Zurückgebucht" },
] as const;

function StandFilter({ aktiv }: { aktiv: string }) {
  return (
    <nav className="filterchips" aria-label="Stand">
      {STAENDE.map((s) => (
        <Link
          key={s.wert || "alle"}
          href={`/admin/kasse?abschnitt=forderungen${s.wert ? `&stand=${s.wert}` : ""}`}
          aria-current={s.wert === aktiv ? "true" : undefined}
        >
          {s.label}
        </Link>
      ))}
    </nav>
  );
}
