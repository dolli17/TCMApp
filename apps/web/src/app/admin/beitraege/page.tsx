import { formatCents } from "@tcm/core";
import { createServerSupabase, getCurrentMember, isAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function BeitraegeSeite({
  searchParams,
}: {
  searchParams: Promise<{ jahr?: string }>;
}) {
  const { jahr: jahrParam } = await searchParams;
  const angemeldet = await getCurrentMember();

  if (!angemeldet || !isAdmin(angemeldet.roles)) {
    return (
      <div className="hinweis fehler">
        Diese Seite ist Administratoren vorbehalten.
      </div>
    );
  }

  const jahr = Number(jahrParam) || new Date().getFullYear();
  const supabase = await createServerSupabase();

  const [vorschauRes, einstellungRes] = await Promise.all([
    supabase.rpc("fee_run_preview", { p_year: jahr }),
    supabase
      .from("settings")
      .select("key, value")
      .in("key", ["sepa.creditor_id", "sepa.pain_version", "sepa.prenotification_days"]),
  ]);

  const zeilen = vorschauRes.data ?? [];
  const glaeubigerId = String(
    einstellungRes.data?.find((s) => s.key === "sepa.creditor_id")?.value ?? "",
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
    </>
  );
}
