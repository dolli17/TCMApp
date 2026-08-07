import { formatCents } from "@tcm/core";
import { createServerSupabase, getCurrentMember } from "@/lib/supabase/server";
import { MerkmaleKarte, type MerkmalZeile } from "@/components/MerkmaleKarte";
import { Stammdatenkarte, type Feld } from "@/components/Stammdatenkarte";
import { ThemeUmschalter } from "@/components/ThemeUmschalter";
import { eigeneDatenSpeichern, notfallkontaktSpeichern } from "./aktionen";

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
  guest: "Gastgebühr",
  misc: "Sonstiges",
};

export default async function KontoSeite() {
  const supabase = await createServerSupabase();
  const angemeldet = await getCurrentMember();
  const meineId = angemeldet?.member?.id;

  const [forderungenRes, arbeitsdienstRes, mandatRes, meineDatenRes, merkmaleRes] =
    await Promise.all([
    supabase.rpc("my_charges"),
    supabase.rpc("my_work_duty", {}),
    supabase.from("sepa_mandates").select("reference, signed_on, scope, status"),
    // Die eigenen Stammdaten. Sichtbar sind sie ohnehin über members_select;
    // die Spalten hier sind genau die, die der Spalten-Grant änderbar macht.
    meineId
      ? supabase
          .from("members")
          .select(
            "first_name, last_name, title, phone, mobile, street, postcode, city, email, birthday, emergency_contact_name, emergency_contact_phone, emergency_contact_relation",
          )
          .eq("id", meineId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    meineId
      ? supabase.rpc("member_attributes", { p_member_id: meineId })
      : Promise.resolve({ data: null }),
  ]);

  const forderungen = forderungenRes.data ?? [];
  const offen = forderungen
    .filter((f) => f.status === "open" || f.status === "notified")
    .reduce((s, f) => s + f.amount_cents, 0);
  const dienst = arbeitsdienstRes.data?.[0];
  const mandat = mandatRes.data?.[0];
  const ich = meineDatenRes.data;

  const eigeneFelder: Feld[] = ich
    ? [
        { name: "first_name", label: "Vorname", art: "text", wert: ich.first_name },
        { name: "last_name", label: "Nachname", art: "text", wert: ich.last_name },
        { name: "title", label: "Titel", art: "text", wert: ich.title },
        { name: "phone", label: "Telefon", art: "tel", wert: ich.phone },
        { name: "mobile", label: "Mobil", art: "tel", wert: ich.mobile },
        { name: "street", label: "Straße und Hausnummer", art: "text", wert: ich.street, breit: true },
        { name: "postcode", label: "PLZ", art: "text", wert: ich.postcode },
        { name: "city", label: "Ort", art: "text", wert: ich.city },
      ]
    : [];

  const notfallFelder: Feld[] = ich
    ? [
        { name: "emergency_contact_name", label: "Name", art: "text", wert: ich.emergency_contact_name },
        {
          name: "emergency_contact_phone",
          label: "Telefon",
          art: "tel",
          wert: ich.emergency_contact_phone,
        },
        {
          name: "emergency_contact_relation",
          label: "Verhältnis",
          art: "text",
          wert: ich.emergency_contact_relation,
          hinweis: "z. B. Mutter, Ehepartner",
        },
      ]
    : [];

  return (
    <>
      <h1 className="pagetitle">Mein Konto</h1>
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

      {ich && (
        <>
          <Stammdatenkarte
            titel="Meine Daten"
            text="Adresse und Rufnummern pflegst du selbst. E-Mail und Geburtsdatum ändert der Vorstand – sie hängen am Zugang und an den Beiträgen."
            felder={eigeneFelder}
            aktion={eigeneDatenSpeichern}
          />

          <Stammdatenkarte
            titel="Notfallkontakt"
            text="Wen sollen wir anrufen, wenn auf der Anlage etwas passiert?"
            felder={notfallFelder}
            aktion={notfallkontaktSpeichern}
          />

          <MerkmaleKarte
            mitgliedId={meineId!}
            zeilen={(merkmaleRes.data ?? []) as MerkmalZeile[]}
            titel="Einwilligungen"
            text="Du entscheidest, was der Verein darf. Jede Angabe lässt sich jederzeit widerrufen."
            nurSelbstpflege
          />

          <p className="beschreibung" style={{ marginTop: "-0.5rem", marginBottom: "1.5rem" }}>
            Jede Änderung wird protokolliert und ist für den Vorstand einsehbar.
          </p>
        </>
      )}

      <h2 className="dpl">Erscheinungsbild</h2>
      <ThemeUmschalter />

      <h2 className="dpl">Forderungen</h2>
      {forderungen.length === 0 ? (
        <p className="leer">Keine Forderungen vorhanden.</p>
      ) : (
        <div className="tabellenhuelle"><table className="liste">
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
        </table></div>
      )}
    </>
  );
}
