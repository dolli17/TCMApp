import { formatCents } from "@tcm/core";
import { createServerSupabase, getCurrentMember } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const STATUS_TEXT: Record<string, string> = {
  open: "offen",
  notified: "angekündigt",
  submitted: "eingereicht",
  settled: "bezahlt",
  returned: "zurückgebucht",
  waived: "erlassen",
};

const ART_TEXT: Record<string, string> = {
  fee: "Mitgliedsbeitrag",
  drinks: "Getränke",
  deposit: "Pfand",
  work_duty: "Arbeitsdienst",
  misc: "Sonstiges",
};

export default async function KontoSeite() {
  const supabase = await createServerSupabase();
  const angemeldet = await getCurrentMember();

  const [forderungenRes, arbeitsdienstRes, mandatRes] = await Promise.all([
    supabase.rpc("my_charges"),
    supabase.rpc("my_work_duty", {}),
    supabase.from("sepa_mandates").select("reference, signed_on, scope, status"),
  ]);

  const forderungen = forderungenRes.data ?? [];
  const offen = forderungen
    .filter((f) => f.status === "open" || f.status === "notified")
    .reduce((s, f) => s + f.amount_cents, 0);
  const dienst = arbeitsdienstRes.data?.[0];
  const mandat = mandatRes.data?.[0];

  return (
    <>
      <h1>Mein Konto</h1>
      <p className="unterzeile">
        {angemeldet?.member?.first_name} {angemeldet?.member?.last_name}
      </p>

      <div className="kachel-reihe">
        <div className="kachel">
          <div className="titel">Offene Forderungen</div>
          <div className="wert">{formatCents(offen)}</div>
        </div>
        {dienst && (
          <div className="kachel">
            <div className="titel">Arbeitsdienst {dienst.year}</div>
            <div className="wert">
              {Number(dienst.completed_hours)} / {Number(dienst.required_hours)} h
            </div>
            {Number(dienst.missing_hours) > 0 && (
              <div className="titel">noch {Number(dienst.missing_hours)} Stunden offen</div>
            )}
          </div>
        )}
        <div className="kachel">
          <div className="titel">SEPA-Mandat</div>
          <div className="wert" style={{ fontSize: "1.1rem" }}>
            {mandat ? mandat.reference : "keins"}
          </div>
          <div className="titel">
            {mandat
              ? mandat.scope === "all_payments"
                ? "für alle Zahlungen"
                : "nur für Beiträge"
              : "Zahlung per Überweisung"}
          </div>
        </div>
      </div>

      <h2>Forderungen</h2>
      {forderungen.length === 0 ? (
        <p className="leer">Keine Forderungen vorhanden.</p>
      ) : (
        <table className="liste">
          <thead>
            <tr>
              <th>Zeitraum</th>
              <th>Art</th>
              <th>Beschreibung</th>
              <th>Für</th>
              <th className="zahl">Betrag</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {forderungen.map((f) => (
              <tr key={f.id}>
                <td>{f.period_label ?? "—"}</td>
                <td>{ART_TEXT[f.kind] ?? f.kind}</td>
                <td>{f.description}</td>
                <td>{f.is_for_other ? f.member_name : "mich"}</td>
                <td className="zahl">{formatCents(f.amount_cents)}</td>
                <td>
                  <span className="marke-klein">{STATUS_TEXT[f.status] ?? f.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
