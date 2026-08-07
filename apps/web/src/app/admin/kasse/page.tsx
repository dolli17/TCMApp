import Link from "next/link";
import { formatCents } from "@tcm/core";
import { createServerSupabase } from "@/lib/supabase/server";
import { EinstellungsGruppe } from "@/components/EinstellungsGruppe";
import { Reiter } from "@/components/Reiter";
import { BeitragslaufKarte } from "@/components/BeitragslaufKarte";
import { BeitragsartenPflege, type BeitragsartZeile } from "@/components/BeitragsartenPflege";
import { ForderungsListe, type ForderungZeile } from "@/components/ForderungsListe";
import { GetraenkemonatKarte, type MonatZeile } from "@/components/GetraenkemonatKarte";

export const dynamic = "force-dynamic";

const ABSCHNITTE = [
  { wert: "lauf", label: "Beitragslauf" },
  { wert: "getraenke", label: "Getränkemonate" },
  { wert: "forderungen", label: "Forderungen" },
  { wert: "arten", label: "Beitragsarten" },
  { wert: "regeln", label: "Regeln" },
] as const;

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
  const gewaehlt = ABSCHNITTE.some((a) => a.wert === abschnitt) ? abschnitt! : "lauf";
  const jahr = Number(jahrParam) || new Date().getFullYear();

  const supabase = await createServerSupabase();

  const [vorschauRes, einstellungRes, monateRes, forderungenRes, artenRes] = await Promise.all([
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
  ]);

  const einstellungen = einstellungRes.data ?? [];
  const glaeubigerId = String(
    einstellungen.find((s) => s.key === "sepa.creditor_id")?.value ?? "",
  ).replace(/"/g, "");

  return (
    <>
      <h1 className="pagetitle">Kasse</h1>
      <p className="unterzeile">
        Beiträge, Getränkeabrechnung und alles, was daraus an Forderungen entsteht.
      </p>

      <Reiter eintraege={[...ABSCHNITTE]} aktiv={gewaehlt} />

      {gewaehlt === "lauf" && (
        <Beitragslauf
          jahr={jahr}
          zeilen={(vorschauRes.data ?? []) as VorschauZeile[]}
          glaeubigerId={glaeubigerId}
          einstellungen={einstellungen}
        />
      )}

      {gewaehlt === "getraenke" && (
        <GetraenkemonatKarte monate={(monateRes.data ?? []) as unknown as MonatZeile[]} />
      )}

      {gewaehlt === "forderungen" && (
        <>
          <StandFilter aktiv={stand ?? ""} />
          <ForderungsListe
            forderungen={(forderungenRes.data ?? []) as unknown as ForderungZeile[]}
          />
        </>
      )}

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
    </>
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
  jahr, zeilen, glaeubigerId, einstellungen,
}: {
  jahr: number;
  zeilen: VorschauZeile[];
  glaeubigerId: string;
  einstellungen: { key: string; value: unknown }[];
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
      <h2 className="dpl">Beitragslauf {jahr}</h2>

      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "1rem" }}>
        <Link className="knopf leise klein" href={`/admin/kasse?abschnitt=lauf&jahr=${jahr - 1}`}>
          ‹ {jahr - 1}
        </Link>
        <strong className="dpl tnum" style={{ minWidth: 70, textAlign: "center" }}>
          {jahr}
        </strong>
        <Link className="knopf leise klein" href={`/admin/kasse?abschnitt=lauf&jahr=${jahr + 1}`}>
          {jahr + 1} ›
        </Link>
        {jahr !== new Date().getFullYear() && (
          <Link className="knopf leise klein" href="/admin/kasse?abschnitt=lauf">
            Dieses Jahr
          </Link>
        )}
      </div>

      {!glaeubigerId && (
        <div className="hinweis fehler">
          Die Gläubiger-Identifikationsnummer fehlt noch. Sie steht im eBuSy-Backend und muss
          unverändert übernommen werden – nur dann bleiben die Bestandsmandate gültig. Ohne sie
          lässt sich keine Lastschriftdatei erzeugen.
        </div>
      )}

      <div className="kachel-reihe" style={{ marginBottom: "1.5rem" }}>
        <div className="kachel">
          <div className="titel">Mitglieder</div>
          <div className="wert">{zeilen.length}</div>
        </div>
        <div className="kachel">
          <div className="titel">Summe</div>
          <div className="wert">{formatCents(summe)}</div>
        </div>
        <div className="kachel">
          <div className="titel">Ohne Mandat</div>
          <div className="wert">{ohneMandat.length}</div>
          <div className="titel">zahlen per Überweisung</div>
        </div>
        <div className="kachel">
          <div className="titel">Bereits berechnet</div>
          <div className="wert">{schonBerechnet.length}</div>
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

      <BeitragslaufKarte
        jahr={jahr}
        mitglieder={zeilen.length}
        summeCents={zeilen.filter((z) => !z.already_charged).reduce((s, z) => s + z.amount_cents, 0)}
        schonBerechnet={schonBerechnet.length}
        faelligAm={faellig}
      />

      <h2 className="dpl">Positionen</h2>
      <div className="tabellenhuelle"><table className="liste">
        <thead>
          <tr>
            <th>Mitglied</th>
            <th>Zahler</th>
            <th>Beitragsarten</th>
            <th className="zahl">Betrag</th>
            <th>Mandat</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {zeilen.map((z) => (
            <tr key={z.member_id}>
              <td>{z.member_name}</td>
              <td style={{ color: "var(--muted)" }}>{z.payer_name || "selbst"}</td>
              <td>{z.fee_types}</td>
              <td className="zahl tnum">{formatCents(z.amount_cents ?? 0)}</td>
              <td>
                {z.has_mandate ? (
                  <span className="marke-klein">
                    {z.mandate_scope === "all_payments" ? "alle Zahlungen" : "nur Beiträge"}
                  </span>
                ) : (
                  <span style={{ color: "var(--red)" }}>fehlt</span>
                )}
              </td>
              <td>{z.already_charged ? <span className="marke-klein">berechnet</span> : "offen"}</td>
            </tr>
          ))}
        </tbody>
      </table></div>

      <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: "1rem" }}>
        Nach dem Erzeugen der Forderungen geht zuerst die Vorabankündigung mit Betrag und
        Fälligkeit an die Mitglieder; erst nach Ablauf der Frist darf eingezogen werden.
      </p>
    </>
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
    <nav className="reiter" aria-label="Stand">
      {STAENDE.map((s) => (
        <Link
          key={s.wert || "alle"}
          href={`/admin/kasse?abschnitt=forderungen${s.wert ? `&stand=${s.wert}` : ""}`}
          aria-current={s.wert === aktiv ? "page" : undefined}
        >
          {s.label}
        </Link>
      ))}
    </nav>
  );
}
