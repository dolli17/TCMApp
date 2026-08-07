import Link from "next/link";
import { formatCents } from "@tcm/core";
import { createServerSupabase } from "@/lib/supabase/server";
import { EinstellungsGruppe } from "@/components/EinstellungsGruppe";

export const dynamic = "force-dynamic";

export default async function BeitraegeSeite({
  searchParams,
}: {
  searchParams: Promise<{ jahr?: string }>;
}) {
  const { jahr: jahrParam } = await searchParams;

  // Das Rollenschloss steht im Layout - siehe app/admin/layout.tsx.
  const jahr = Number(jahrParam) || new Date().getFullYear();
  const supabase = await createServerSupabase();

  const [vorschauRes, einstellungRes] = await Promise.all([
    supabase.rpc("fee_run_preview", { p_year: jahr }),
    supabase
      .from("settings")
      .select("key, value, value_type, label, description, updated_at")
      .or("key.like.sepa.%,key.like.fees.%")
      .order("key"),
  ]);

  const einstellungen = einstellungRes.data ?? [];
  const zeilen = vorschauRes.data ?? [];
  const glaeubigerId = String(
    einstellungen.find((s) => s.key === "sepa.creditor_id")?.value ?? "",
  ).replace(/"/g, "");

  const summe = zeilen.reduce((s, z) => s + (z.amount_cents ?? 0), 0);
  const ohneMandat = zeilen.filter((z) => !z.has_mandate);
  const nurBeitraege = zeilen.filter((z) => z.has_mandate && z.mandate_scope === "fees_only");
  const schonBerechnet = zeilen.filter((z) => z.already_charged);

  return (
    <>
      <h1 className="pagetitle">Beitragslauf {jahr}</h1>
      <p className="unterzeile">
        Vorschau. Es wird nichts erzeugt, solange nichts bestätigt ist.
      </p>

      {/* Das Jahr stand bisher nur in der Adresse - wer ein anderes sehen
          wollte, musste sie von Hand ändern. */}
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "1rem" }}>
        <Link className="knopf leise klein" href={`/admin/beitraege?jahr=${jahr - 1}`}>
          ‹ {jahr - 1}
        </Link>
        <strong className="dpl tnum" style={{ minWidth: 70, textAlign: "center" }}>
          {jahr}
        </strong>
        <Link className="knopf leise klein" href={`/admin/beitraege?jahr=${jahr + 1}`}>
          {jahr + 1} ›
        </Link>
        {jahr !== new Date().getFullYear() && (
          <Link className="knopf leise klein" href="/admin/beitraege">
            Dieses Jahr
          </Link>
        )}
      </div>

      {!glaeubigerId && (
        <div className="hinweis fehler">
          Die Gläubiger-Identifikationsnummer fehlt noch. Sie steht im
          eBuSy-Backend und muss unverändert übernommen werden – nur dann bleiben
          die Bestandsmandate gültig. Ohne sie lässt sich keine Lastschriftdatei
          erzeugen.
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
          erscheinen nicht in der Lastschriftdatei und müssen separat angeschrieben
          werden – sonst rutschen sie unbemerkt durch:{" "}
          {ohneMandat.slice(0, 8).map((z) => z.member_name).join(", ")}
          {ohneMandat.length > 8 && ` und ${ohneMandat.length - 8} weitere`}.
        </div>
      )}

      {nurBeitraege.length > 0 && (
        <div className="hinweis">
          Bei {nurBeitraege.length} Mandaten deckt der Text nur Beiträge ab. Für den
          Beitragslauf reicht das; der monatliche Getränkeeinzug braucht bei
          diesen Mitgliedern ein eigenes Mandat.
        </div>
      )}

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
              <td className="zahl">{formatCents(z.amount_cents ?? 0)}</td>
              <td>
                {z.has_mandate ? (
                  <span className="marke-klein">
                    {z.mandate_scope === "all_payments" ? "alle Zahlungen" : "nur Beiträge"}
                  </span>
                ) : (
                  <span style={{ color: "var(--red)" }}>fehlt</span>
                )}
              </td>
              <td>
                {z.already_charged ? (
                  <span className="marke-klein">berechnet</span>
                ) : (
                  "offen"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>

      <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: "1rem" }}>
        Der Lauf wird bewusst nicht automatisch gestartet. Nach dem Erzeugen der
        Forderungen geht zuerst die Vorabankündigung mit Betrag und Fälligkeit an
        die Mitglieder; erst nach Ablauf der Frist darf eingezogen werden.
      </p>

      {/* Die Regeln stehen jetzt bei der Sache, die sie regeln: wer oben liest,
          dass die Vorabankündigung Pflicht ist, findet die Frist direkt hier
          darunter statt in einer allgemeinen Einstellungsliste. */}
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
  );
}
