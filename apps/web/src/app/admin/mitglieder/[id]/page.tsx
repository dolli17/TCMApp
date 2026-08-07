import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerSupabase, getCurrentMember } from "@/lib/supabase/server";
import { BankUndMandatKarte, type FinanzZeile } from "@/components/BankUndMandatKarte";
import { BeitragsartenKarte, type BeitragsZeile } from "@/components/BeitragsartenKarte";
import { GefahrenzoneKarte, type Loeschfolgen } from "@/components/GefahrenzoneKarte";
import { LoginKarte, type LoginZustand } from "@/components/LoginKarte";
import { MerkmaleKarte, type MerkmalZeile } from "@/components/MerkmaleKarte";
import { MitgliedschaftsKarte } from "@/components/MitgliedschaftsKarte";
import { Reiter } from "@/components/Reiter";
import { Stammdatenkarte, type Feld } from "@/components/Stammdatenkarte";
import { ZugehoerigkeitKarte } from "@/components/ZugehoerigkeitKarte";
import { stammdatenSpeichern } from "./aktionen";

export const dynamic = "force-dynamic";

const ABSCHNITTE = [
  { wert: "stammdaten", label: "Stammdaten" },
  { wert: "mitgliedschaft", label: "Mitgliedschaft" },
  { wert: "finanzen", label: "Finanzen" },
  { wert: "merkmale", label: "Merkmale" },
  { wert: "protokoll", label: "Änderungen" },
];

const STATUS_TEXT: Record<string, string> = {
  active: "aktiv",
  inactive: "inaktiv",
  archived: "archiviert",
};

const ANREDE = [
  { wert: "", label: "—" },
  { wert: "female", label: "Frau" },
  { wert: "male", label: "Herr" },
  { wert: "none", label: "keine" },
];

const GESCHLECHT = [
  { wert: "", label: "—" },
  { wert: "female", label: "weiblich" },
  { wert: "male", label: "männlich" },
  { wert: "diverse", label: "divers" },
];

const SPIELRECHT = [
  { wert: "none", label: "keine Teilnahme" },
  { wert: "own_club", label: "für unseren Verein" },
  { wert: "second_club", label: "Zweitverein" },
];

function datum(wert: string | null): string {
  return wert ? new Intl.DateTimeFormat("de-DE").format(new Date(wert)) : "—";
}

/** Deutsche Bezeichnung für die Feldnamen im Änderungsprotokoll. */
const FELD_LABEL: Record<string, string> = {
  first_name: "Vorname",
  last_name: "Nachname",
  title: "Titel",
  gender: "Geschlecht",
  salutation: "Anrede",
  birthday: "Geburtstag",
  email: "E-Mail",
  phone: "Telefon",
  mobile: "Mobil",
  street: "Straße",
  postcode: "PLZ",
  city: "Ort",
  country_code: "Land",
  notes: "Notizen",
  status: "Status",
  is_trainer: "Trainer",
  nationality_code: "Nationalität",
  tennis_lk: "Leistungsklasse",
  nuliga_id: "nuLiga-Id",
  playing_right: "Spielberechtigung",
  playing_right_since: "Spielberechtigt seit",
  emergency_contact_name: "Notfallkontakt",
  emergency_contact_phone: "Notfallnummer",
  emergency_contact_relation: "Verhältnis",
  billing_payer_id: "Zahler",
  auth_user_id: "Login",
  role: "Rolle",
  number: "Mitgliedsnummer",
  started_on: "Eintritt",
  ended_on: "Austritt",
  cancellation_reason: "Kündigungsgrund",
  iban_last4: "IBAN (letzte vier)",
  reference: "Mandatsreferenz",
  _aktion: "Vorgang",
};

/** Woran wurde etwas geändert? Der Tabellenname allein sagt es niemandem. */
const TABELLE_LABEL: Record<string, string> = {
  members: "Stammdaten",
  memberships: "Mitgliedschaft",
  member_roles: "Rolle",
  member_fees: "Beitragsart",
  bank_accounts: "Bankverbindung",
  sepa_mandates: "SEPA-Mandat",
  member_attribute_values: "Merkmal",
};

function zeigeWert(wert: unknown): string {
  if (wert === null || wert === undefined) return "leer";
  if (typeof wert === "boolean") return wert ? "ja" : "nein";
  const text = String(wert);
  return text.length > 60 ? text.slice(0, 60) + "…" : text;
}

export default async function MitgliedSeite({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ abschnitt?: string; jahr?: string }>;
}) {
  const { id } = await params;
  const { abschnitt: gewaehlt, jahr: jahrParam } = await searchParams;
  const abschnitt = ABSCHNITTE.some((a) => a.wert === gewaehlt) ? gewaehlt! : "stammdaten";

  // Das Rollenschloss steht im Layout - siehe app/admin/layout.tsx. Wer
  // angemeldet ist, wird hier trotzdem gebraucht: ein Admin darf sich selbst
  // nicht die Rechte entziehen, und dafuer muss die Seite ihn erkennen.
  const angemeldet = await getCurrentMember();
  const supabase = await createServerSupabase();

  // Sechs unabhängige Abfragen statt einer gebündelten RPC: sie sind über
  // database.types.ts typisiert, und RLS gilt für jede einzeln.
  const [mitgliedRes, mitgliedschaftenRes, rollenRes, zahltFuerRes, verzeichnisRes, adminZahlRes] =
    await Promise.all([
      supabase
        .from("members")
        .select(
          "id, first_name, last_name, title, gender, salutation, birthday, email, phone, mobile, street, postcode, city, country_code, notes, status, is_trainer, nationality_code, tennis_lk, nuliga_id, playing_right, playing_right_since, emergency_contact_name, emergency_contact_phone, emergency_contact_relation, billing_payer_id, auth_user_id, invited_at, login_disabled_at, source",
        )
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("memberships")
        .select("id, number, started_on, ended_on, cancellation_reason, notes, status")
        .eq("member_id", id)
        .order("started_on", { ascending: false }),
      supabase.from("member_roles").select("role").eq("member_id", id),
      supabase.from("members").select("id, first_name, last_name").eq("billing_payer_id", id),
      supabase.rpc("member_directory", { p_query: "" }),
      supabase.from("member_roles").select("member_id").eq("role", "admin"),
    ]);

  const m = mitgliedRes.data;
  if (!m) notFound();

  const mitgliedschaften = mitgliedschaftenRes.data ?? [];
  const laufend = mitgliedschaften.find((s) => !s.ended_on) ?? null;
  const rollen = (rollenRes.data ?? []).map((r) => r.role as string);
  const admins = (adminZahlRes.data ?? []).map((r) => r.member_id);
  const istSelbst = angemeldet?.member?.id === id;

  const stammfelder: Feld[] = [
    { name: "first_name", label: "Vorname", art: "text", wert: m.first_name },
    { name: "last_name", label: "Nachname", art: "text", wert: m.last_name },
    { name: "title", label: "Titel", art: "text", wert: m.title },
    { name: "salutation", label: "Anrede", art: "auswahl", wert: m.salutation ?? "", optionen: ANREDE },
    { name: "gender", label: "Geschlecht", art: "auswahl", wert: m.gender ?? "", optionen: GESCHLECHT },
    { name: "birthday", label: "Geburtstag", art: "datum", wert: m.birthday },
    { name: "email", label: "E-Mail", art: "email", wert: m.email },
    { name: "phone", label: "Telefon", art: "tel", wert: m.phone },
    { name: "mobile", label: "Mobil", art: "tel", wert: m.mobile },
    { name: "street", label: "Straße und Hausnummer", art: "text", wert: m.street, breit: true },
    { name: "postcode", label: "PLZ", art: "text", wert: m.postcode },
    { name: "city", label: "Ort", art: "text", wert: m.city },
    { name: "country_code", label: "Land", art: "text", wert: m.country_code },
  ];

  const notfallfelder: Feld[] = [
    { name: "emergency_contact_name", label: "Name", art: "text", wert: m.emergency_contact_name },
    { name: "emergency_contact_phone", label: "Telefon", art: "tel", wert: m.emergency_contact_phone },
    {
      name: "emergency_contact_relation",
      label: "Verhältnis",
      art: "text",
      wert: m.emergency_contact_relation,
      hinweis: "z. B. Mutter, Ehepartner",
    },
  ];

  const sportfelder: Feld[] = [
    { name: "is_trainer", label: "Trainer", art: "schalter", wert: m.is_trainer },
    { name: "tennis_lk", label: "Leistungsklasse", art: "text", wert: m.tennis_lk, hinweis: "z. B. LK12.3" },
    { name: "nuliga_id", label: "nuLiga-Id", art: "text", wert: m.nuliga_id },
    {
      name: "playing_right",
      label: "Spielberechtigung",
      art: "auswahl",
      wert: m.playing_right,
      optionen: SPIELRECHT,
    },
    { name: "playing_right_since", label: "Berechtigt seit", art: "datum", wert: m.playing_right_since },
    {
      name: "nationality_code",
      label: "Nationalität",
      art: "text",
      wert: m.nationality_code,
      hinweis: "Zwei Buchstaben, z. B. DE",
    },
  ];

  const internfelder: Feld[] = [
    { name: "notes", label: "Notizen", art: "text", wert: m.notes, breit: true },
  ];

  return (
    <>
      <Link href="/admin/mitglieder" className="zurueck">
        ← Alle Mitglieder
      </Link>

      <div className="detailkopf">
        <div>
          <h1 className="pagetitle">
            {m.last_name}, {m.first_name}
          </h1>
          <div className="marken-reihe">
            <span className={`marke-klein ${m.status === "active" ? "gruen" : m.status === "archived" ? "rot" : "grau"}`}>
              {STATUS_TEXT[m.status] ?? m.status}
            </span>
            {laufend && <span className="marke-klein">Nr. {laufend.number}</span>}
            {rollen.includes("admin") && <span className="marke-klein gold">Administrator</span>}
            {m.is_trainer && <span className="marke-klein gold">Trainer</span>}
            {m.auth_user_id ? (
              <span className="marke-klein grau">Login vorhanden</span>
            ) : (
              <span className="marke-klein grau">kein Login</span>
            )}
            {m.source === "ebusy_import" && <span className="marke-klein grau">aus eBuSy</span>}
          </div>
        </div>
      </div>

      <Reiter eintraege={ABSCHNITTE} aktiv={abschnitt} />

      {abschnitt === "stammdaten" && (
        <>
          <Stammdatenkarte
            titel="Person und Kontakt"
            felder={stammfelder}
            versteckt={{ mitglied: id }}
            aktion={stammdatenSpeichern}
          />
          <Stammdatenkarte
            titel="Notfallkontakt"
            text="Wen rufen wir an, wenn auf der Anlage etwas passiert? Bei Kindern die Erziehungsberechtigten."
            felder={notfallfelder}
            versteckt={{ mitglied: id }}
            aktion={stammdatenSpeichern}
          />
          <Stammdatenkarte
            titel="Sport"
            text="Trainer, Leistungsklasse und Spielberechtigung für die Verbandsmeldung."
            felder={sportfelder}
            versteckt={{ mitglied: id }}
            aktion={stammdatenSpeichern}
          />
          <Stammdatenkarte
            titel="Intern"
            text="Nur für den Vorstand sichtbar."
            felder={internfelder}
            versteckt={{ mitglied: id }}
            aktion={stammdatenSpeichern}
          />
        </>
      )}

      {abschnitt === "mitgliedschaft" && (
        <>
          <MitgliedschaftsKarte
            mitgliedId={id}
            laufend={laufend}
            letzte={mitgliedschaften[0] ?? null}
            archiviert={m.status === "archived"}
          />

          <ZugehoerigkeitKarte
            mitgliedId={id}
            hatLogin={Boolean(m.auth_user_id)}
            istAdmin={rollen.includes("admin")}
            zahler={m.billing_payer_id}
            zahltFuer={(zahltFuerRes.data ?? []).map((z) => ({
              id: z.id,
              name: `${z.first_name} ${z.last_name}`,
            }))}
            verzeichnis={verzeichnisRes.data ?? []}
            einzigerAdmin={admins.length <= 1}
            selbst={istSelbst}
          />

          {mitgliedschaften.length > 1 && (
            <section className="karte" aria-label="Frühere Mitgliedschaften">
              <h2 className="dpl">Verlauf</h2>
              <div className="tabellenhuelle">
                <table className="liste">
                  <thead>
                    <tr>
                      <th>Nr.</th>
                      <th>Eintritt</th>
                      <th>Austritt</th>
                      <th>Grund</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mitgliedschaften.map((s) => (
                      <tr key={s.id}>
                        <td>{s.number}</td>
                        <td>{datum(s.started_on)}</td>
                        <td>{datum(s.ended_on)}</td>
                        <td>{s.cancellation_reason ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <Zugang id={id} selbst={istSelbst} />

          <Gefahrenzone id={id} nachname={m.last_name} archiviert={m.status === "archived"} selbst={istSelbst} />
        </>
      )}

      {abschnitt === "finanzen" && (
        <Finanzen id={id} jahr={Number(jahrParam) || new Date().getFullYear()} />
      )}

      {abschnitt === "merkmale" && <Merkmale id={id} />}

      {abschnitt === "protokoll" && <Protokoll id={id} />}
    </>
  );
}

async function Zugang({ id, selbst }: { id: string; selbst: boolean }) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("member_login_state", { p_member_id: id });

  if (error) return <div className="hinweis fehler">{error.message}</div>;

  const zustand = data?.[0];
  if (!zustand) return null;

  return <LoginKarte mitgliedId={id} zustand={zustand as LoginZustand} selbst={selbst} />;
}

/**
 * Bank, Mandat und Beiträge.
 *
 * Beides in einem Abschnitt, weil es zusammengehört: ohne Bankverbindung kein
 * Mandat, ohne Mandat kein Einzug – und ohne Beitragsart nichts einzuziehen.
 */
async function Finanzen({ id, jahr }: { id: string; jahr: number }) {
  const supabase = await createServerSupabase();

  const [finanzenRes, beitraegeRes] = await Promise.all([
    supabase.rpc("member_finances", { p_member_id: id }),
    supabase.rpc("member_fee_overview", { p_member_id: id, p_year: jahr }),
  ]);

  if (finanzenRes.error) return <div className="hinweis fehler">{finanzenRes.error.message}</div>;
  if (beitraegeRes.error) return <div className="hinweis fehler">{beitraegeRes.error.message}</div>;

  return (
    <>
      <BeitragsartenKarte
        mitgliedId={id}
        jahr={jahr}
        zeilen={(beitraegeRes.data ?? []) as BeitragsZeile[]}
      />
      <BankUndMandatKarte mitgliedId={id} zeilen={(finanzenRes.data ?? []) as FinanzZeile[]} />
    </>
  );
}

async function Merkmale({ id }: { id: string }) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("member_attributes", { p_member_id: id });

  if (error) return <div className="hinweis fehler">{error.message}</div>;

  return (
    <>
      <MerkmaleKarte
        mitgliedId={id}
        zeilen={(data ?? []) as MerkmalZeile[]}
        text="Frei definierbare Angaben. Neue Merkmale legt der Vorstand unter Einstellungen an."
      />
      <p className="beschreibung">
        <Link href="/admin/mitglieder/merkmale">Merkmale verwalten →</Link>
      </p>
    </>
  );
}

/**
 * Die Löschvorschau ist eine eigene Abfrage, weil sie zählt statt liest –
 * sie soll die Detailseite nicht ausbremsen, wenn niemand sie braucht.
 */
async function Gefahrenzone(props: {
  id: string;
  nachname: string;
  archiviert: boolean;
  selbst: boolean;
}) {
  const supabase = await createServerSupabase();
  const { data } = await supabase.rpc("member_delete_impact", { p_member_id: props.id });
  const folgen = (data?.[0] ?? {
    charges: 0,
    drink_purchases: 0,
    bookings: 0,
    booking_players: 0,
    work_duty_entries: 0,
    mandates: 0,
    bank_accounts: 0,
    payees: 0,
    can_delete: true,
    reason: null,
  }) as Loeschfolgen;

  return (
    <GefahrenzoneKarte
      mitgliedId={props.id}
      nachname={props.nachname}
      archiviert={props.archiviert}
      selbst={props.selbst}
      folgen={folgen}
    />
  );
}

async function Protokoll({ id }: { id: string }) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("change_log")
    .select("id, table_name, action, diff, changed_at, changed_by")
    .eq("member_id", id)
    .order("changed_at", { ascending: false })
    .limit(200);

  if (error) return <div className="hinweis fehler">{error.message}</div>;

  const eintraege = data ?? [];
  if (eintraege.length === 0) {
    return <p className="leer">Noch keine Änderungen aufgezeichnet.</p>;
  }

  // Die Namen der Ändernden in einem Rutsch nachladen statt je Zeile.
  const urheber = [...new Set(eintraege.map((e) => e.changed_by).filter(Boolean))] as string[];
  const { data: personen } = urheber.length
    ? await supabase.from("members").select("id, first_name, last_name").in("id", urheber)
    : { data: [] };
  const namen = new Map((personen ?? []).map((p) => [p.id, `${p.first_name} ${p.last_name}`]));

  return (
    <section className="karte protokoll" aria-label="Änderungsprotokoll">
      <h2 className="dpl">Änderungen</h2>
      <p className="unterzeile">
        Jede Änderung an diesem Mitglied – auch die, die es selbst vorgenommen hat.
      </p>

      <div className="tabellenhuelle">
        <table className="liste">
          <thead>
            <tr>
              <th>Wann</th>
              <th>Wer</th>
              <th>Wo</th>
              <th>Was</th>
            </tr>
          </thead>
          <tbody>
            {eintraege.map((e) => {
              const diff = (e.diff ?? {}) as Record<string, { alt?: unknown; neu?: unknown }>;
              return (
                <tr key={e.id}>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {new Intl.DateTimeFormat("de-DE", {
                      dateStyle: "short",
                      timeStyle: "short",
                    }).format(new Date(e.changed_at))}
                  </td>
                  <td>{e.changed_by ? (namen.get(e.changed_by) ?? "—") : "System"}</td>
                  <td>{TABELLE_LABEL[e.table_name] ?? e.table_name}</td>
                  <td>
                    {/* Beim Anlegen stehen sämtliche Felder im Diff. Sie alle
                        aufzuführen macht das Protokoll unlesbar und sagt nichts
                        – der Datensatz sieht danach ja genau so aus wie in den
                        Stammdaten. Ein Satz genügt. */}
                    {e.action === "insert" ? (
                      <span className="marke-klein gruen">angelegt</span>
                    ) : e.action === "delete" ? (
                      <span className="marke-klein rot">gelöscht</span>
                    ) : (
                      Object.entries(diff).map(([feld, wechsel]) => (
                        <div key={feld}>
                          <span className="feld">{FELD_LABEL[feld] ?? feld}</span>:{" "}
                          <span className="alt">{zeigeWert(wechsel?.alt)}</span>{" "}
                          <span className="neu">{zeigeWert(wechsel?.neu)}</span>
                        </div>
                      ))
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
