import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  berlinDay,
  formatCents,
  isoDateLabel,
  PROTOKOLL_BEREICHE,
  protokollBereich,
  protokollVorgang,
  rollenLabel,
  rollenMarken,
  translateDbError,
} from "@tcm/core";
import { createServerSupabase, getCurrentMember } from "@/lib/supabase/server";
import { BankUndMandatKarte, type FinanzZeile } from "@/components/BankUndMandatKarte";
import { BeitragsartenKarte, type BeitragsZeile } from "@/components/BeitragsartenKarte";
import { GefahrenzoneKarte, type Loeschfolgen } from "@/components/GefahrenzoneKarte";
import { LoginKarte, type LoginZustand } from "@/components/LoginKarte";
import { ladeEinladungsstatus } from "@/lib/einladungen";
import { MerkmaleKarte, type MerkmalZeile } from "@/components/MerkmaleKarte";
import { MitgliedschaftsKarte } from "@/components/MitgliedschaftsKarte";
import { Gruppenkopf, Listenzeile } from "@/components/Listenzeile";
import { Stammdatenkarte, type Feld } from "@/components/Stammdatenkarte";
import { ZugehoerigkeitKarte } from "@/components/ZugehoerigkeitKarte";
import { MannschaftKarte } from "@/components/MannschaftKarte";
import { MitgliedUebersicht, type MitgliedTeil } from "@/components/MitgliedUebersicht";
import { stammdatenSpeichern } from "./aktionen";
import { Fehlerzustand } from "@/components/Fehlerzustand";

export const dynamic = "force-dynamic";

/** Die Unterseiten eines Mitglieds (docs/design/clubhaus/verwaltung, Regel 6) */
const TEILE: Record<MitgliedTeil, string> = {
  stammdaten: "Stammdaten",
  mitgliedschaft: "Mitgliedschaft",
  beitraege: "Beitragsarten",
  forderungen: "Forderungen",
  bank: "Bank & Mandat",
  merkmale: "Merkmale & Einwilligungen",
  zugang: "Zugang",
  protokoll: "Änderungsprotokoll",
  austritt: "Austritt & Datensatz",
};

/** Die Reiter von früher (?abschnitt=…) führen auf die neuen Unterseiten. */
const ALT: Record<string, MitgliedTeil> = {
  stammdaten: "stammdaten",
  mitgliedschaft: "mitgliedschaft",
  finanzen: "bank",
  bank: "bank",
  forderungen: "forderungen",
  merkmale: "merkmale",
  zugang: "zugang",
  protokoll: "protokoll",
};

const FORDERUNG_STAND: Record<string, { text: string; ton: string }> = {
  open: { text: "offen", ton: "gelb" },
  notified: { text: "angekündigt", ton: "gelb" },
  submitted: { text: "im Einzug", ton: "" },
  settled: { text: "bezahlt", ton: "gruen" },
  returned: { text: "zurückgebucht", ton: "rot" },
  waived: { text: "erlassen", ton: "" },
};

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
  team_id: "Mannschaft",
  is_team_captain: "Mannschaftsführer",
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

/** Für Tabellen außerhalb der Stammdaten: der Bereich des Verwaltungsprotokolls. */
function bereichTitel(tabelle: string): string {
  const b = protokollBereich(tabelle);
  return b ? PROTOKOLL_BEREICHE[b].titel : tabelle;
}

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
  searchParams: Promise<{ abschnitt?: string; teil?: string; jahr?: string }>;
}) {
  const { id } = await params;
  const { abschnitt: alt, teil: gewaehlt, jahr: jahrParam } = await searchParams;
  if (alt && ALT[alt]) {
    redirect(`/admin/mitglieder/${id}?teil=${ALT[alt]}${jahrParam ? `&jahr=${jahrParam}` : ""}`);
  }
  const teil = gewaehlt && gewaehlt in TEILE ? (gewaehlt as MitgliedTeil) : null;

  // Ohne Unterseite: das Mitglied als Übersicht, aufgebaut wie das eigene Konto.
  if (!teil) {
    return (
      <div className="verwaltung mitglied-detail">
        <div className="kopfleiste">
          <Link href="/admin/mitglieder" className="zurueck">‹ Mitglieder</Link>
          <Link href={`/admin/mitglieder/${id}?teil=stammdaten`} className="zurueck">Bearbeiten</Link>
        </div>
        <MitgliedUebersicht id={id} />
      </div>
    );
  }

  // Das Rollenschloss steht im Layout - siehe app/admin/layout.tsx. Wer
  // angemeldet ist, wird hier trotzdem gebraucht: ein Admin darf sich selbst
  // nicht die Rechte entziehen, und dafuer muss die Seite ihn erkennen.
  const angemeldet = await getCurrentMember();
  const supabase = await createServerSupabase();

  // Fünf unabhängige Abfragen statt einer gebündelten RPC: sie sind über
  // database.types.ts typisiert, und RLS gilt für jede einzeln.
  const [
    mitgliedRes,
    mitgliedschaftenRes,
    rollenRes,
    adminZahlRes,
    mannschaftenRes,
    notizenRes,
  ] =
    await Promise.all([
      supabase
        .from("members")
        .select(
          "id, first_name, last_name, title, gender, salutation, birthday, email, phone, mobile, street, postcode, city, country_code, status, is_trainer, nationality_code, tennis_lk, nuliga_id, playing_right, playing_right_since, emergency_contact_name, emergency_contact_phone, emergency_contact_relation, auth_user_id, invited_at, login_disabled_at, source, team_id, is_team_captain, teams(name)",
        )
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("memberships")
        .select("id, number, started_on, ended_on, cancellation_reason, notes, status")
        .eq("member_id", id)
        .order("started_on", { ascending: false }),
      supabase.from("member_roles").select("role").eq("member_id", id),
      supabase.from("member_roles").select("member_id").in("role", ["admin", "board"]),
      supabase.from("teams").select("id, name, active").order("sort_order").order("name"),
      // Die Notizen liest ein Client nicht direkt aus members (S17).
      supabase.rpc("member_notes", { p_member_id: id }),
    ]);

  const m = mitgliedRes.data ? { ...mitgliedRes.data, notes: notizenRes.data ?? null } : null;
  if (!m) notFound();

  const mitgliedschaften = mitgliedschaftenRes.data ?? [];
  const laufend = mitgliedschaften.find((s) => !s.ended_on) ?? null;
  const rollen = (rollenRes.data ?? []).map((r) => r.role as string);
  // Wer außer diesem Mitglied hat noch volle Rechte (Vorstand oder App Admin)?
  const andereMitVollenRechten = new Set(
    (adminZahlRes.data ?? []).map((r) => r.member_id).filter((mid) => mid !== id),
  );
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
    <div className="verwaltung mitglied-detail">
      <header className="unterseite-kopf">
        <Link href={`/admin/mitglieder/${id}`} className="zurueck">
          ‹ {m.first_name} {m.last_name}
        </Link>
        <h1 className="pagetitle">{TEILE[teil]}</h1>
        {/* Die Marken bleiben sichtbar: wer hier etwas ändert, sieht, an wem */}
        <div className="marken-reihe">
          <span className={`statusmarke ${m.status === "active" ? "gruen" : m.status === "archived" ? "rot" : ""}`}>
            {STATUS_TEXT[m.status] ?? m.status}
          </span>
          {laufend && <span className="statusmarke">Nr. {laufend.number}</span>}
          {rollenMarken({ roles: rollen, is_trainer: m.is_trainer })
            .map((r) => (
              <span key={r} className="statusmarke gelb">
                {r}
              </span>
            ))}
          {m.teams && (
            <span className={`statusmarke${m.is_team_captain ? " gelb" : ""}`}>
              {m.teams.name}
              {m.is_team_captain ? " · Mannschaftsführer" : ""}
            </span>
          )}
        </div>
      </header>

      {teil === "stammdaten" && (
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
            text="Leistungsklasse und Spielberechtigung für die Verbandsmeldung. Trainer steht unter Mitgliedschaft bei den Rollen."
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

      {teil === "mitgliedschaft" && (
        <>
          

          <ZugehoerigkeitKarte
            mitgliedId={id}
            vorname={m.first_name}
            hatLogin={Boolean(m.auth_user_id)}
            rollen={rollen}
            istTrainer={m.is_trainer}
            mannschaft={m.teams ? { name: m.teams.name, kapitaen: m.is_team_captain } : null}
            einzigeVolleRechte={andereMitVollenRechten.size === 0}
            selbst={istSelbst}
          />

          <MannschaftKarte
            mitgliedId={id}
            mannschaften={mannschaftenRes.data ?? []}
            mannschaftId={m.team_id}
            mannschaftsfuehrer={m.is_team_captain}
            archiviert={m.status === "archived"}
          />

          {mitgliedschaften.length > 1 && (
            <section className="liste-abschnitt" aria-label="Frühere Mitgliedschaften">
              <Gruppenkopf titel="Verlauf" />
              <ul className="liste-gruppe">
                {mitgliedschaften.map((s) => (
                  <li key={s.id}>
                    <Listenzeile
                      titel={`Nr. ${s.number}`}
                      kontext={`${datum(s.started_on)} – ${s.ended_on ? datum(s.ended_on) : "heute"}${
                        s.cancellation_reason ? ` · ${s.cancellation_reason}` : ""
                      }`}
                      hinweis={s.ended_on ? "beendet" : "laufend"}
                      hinweisTon={s.ended_on ? "leise" : "gruen"}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}

        </>
      )}

      {teil === "austritt" && (
        <>
          <MitgliedschaftsKarte
            mitgliedId={id}
            laufend={laufend}
            letzte={mitgliedschaften[0] ?? null}
            archiviert={m.status === "archived"}
          />
          <Gefahrenzone
            id={id}
            nachname={m.last_name}
            archiviert={m.status === "archived"}
            anonymisiert={!m.auth_user_id && m.last_name.startsWith("Mitglied #")}
            selbst={istSelbst}
          />
        </>
      )}

      {teil === "bank" && <BankUndMandat id={id} />}

      {teil === "beitraege" && (
        <Beitraege id={id} jahr={Number(jahrParam) || Number(berlinDay(new Date()).slice(0, 4))} />
      )}

      {teil === "forderungen" && <Forderungen id={id} />}

      {teil === "merkmale" && <Merkmale id={id} />}

      {teil === "zugang" && <Zugang id={id} vorname={m.first_name} selbst={istSelbst} />}

      {teil === "protokoll" && <Protokoll id={id} />}
    </div>
  );
}

async function Zugang({ id, vorname, selbst }: { id: string; vorname: string; selbst: boolean }) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("member_login_state", { p_member_id: id });

  if (error) return <Fehlerzustand text={translateDbError(error)} />;

  const zustand = data?.[0];
  if (!zustand) return null;

  // Offenes Onboarding: Stand der Einladung, und erneut senden geht (O24).
  const { data: ob } = await supabase.from("members").select("onboarding_completed_at").eq("id", id).maybeSingle();
  const einladung = ob && !ob.onboarding_completed_at ? (await ladeEinladungsstatus([id])).get(id) ?? null : null;

  return (
    <LoginKarte
      mitgliedId={id}
      vorname={vorname}
      zustand={zustand as LoginZustand}
      selbst={selbst}
      einladung={einladung}
    />
  );
}

/** Bankverbindung und SEPA-Mandat: ohne Bankverbindung kein Mandat. */
async function BankUndMandat({ id }: { id: string }) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("member_finances", { p_member_id: id });

  if (error) return <Fehlerzustand text={translateDbError(error)} />;

  return <BankUndMandatKarte mitgliedId={id} zeilen={(data ?? []) as FinanzZeile[]} />;
}

/** Die Beitragsarten des Jahres */
async function Beitraege({ id, jahr }: { id: string; jahr: number }) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("member_fee_overview", { p_member_id: id, p_year: jahr });
  if (error) return <Fehlerzustand text={translateDbError(error)} />;
  return <BeitragsartenKarte mitgliedId={id} jahr={jahr} zeilen={(data ?? []) as BeitragsZeile[]} />;
}

/** Was an Forderungen für dieses Mitglied entstanden ist. Jedes Mitglied zahlt selbst. */
async function Forderungen({ id }: { id: string }) {
  const supabase = await createServerSupabase();
  const forderungenRes = await supabase
    .from("charges")
    .select("id, description, amount_cents, status, due_date, created_at")
    .eq("member_id", id)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <>
      <section className="liste-abschnitt" aria-labelledby="h-forderungen">
        <Gruppenkopf titel="Forderungen" id="h-forderungen" />
        {forderungenRes.error ? (
          <Fehlerzustand text={translateDbError(forderungenRes.error)} />
        ) : (forderungenRes.data ?? []).length === 0 ? (
          <p className="leer-klein">Noch keine Forderung.</p>
        ) : (
          <ul className="liste-gruppe" aria-label="Forderungen">
            {(forderungenRes.data ?? []).map((f) => {
              const stand = FORDERUNG_STAND[f.status] ?? { text: f.status, ton: "" };
              return (
                <li key={f.id}>
                  <Listenzeile
                    titel={f.description}
                    kontext={f.due_date ? `fällig ${isoDateLabel(f.due_date)}` : undefined}
                    neben={
                      <span className="neben">
                        <span className="betrag tnum">{formatCents(f.amount_cents)}</span>
                        <span className={`statusmarke ${stand.ton}`}>{stand.text}</span>
                      </span>
                    }
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

async function Merkmale({ id }: { id: string }) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("member_attributes", { p_member_id: id });

  if (error) return <Fehlerzustand text={translateDbError(error)} />;

  return (
    <>
      <MerkmaleKarte
        mitgliedId={id}
        zeilen={(data ?? []) as MerkmalZeile[]}
        text="Frei definierbare Angaben. Neue Merkmale legt der Vorstand unter Einstellungen an."
      />
      <p className="beschreibung">
        <Link href="/admin/system/merkmale">Merkmale verwalten →</Link>
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
  anonymisiert: boolean;
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
    can_delete: true,
    reason: null,
  }) as Loeschfolgen;

  return (
    <GefahrenzoneKarte
      mitgliedId={props.id}
      nachname={props.nachname}
      archiviert={props.archiviert}
      anonymisiert={props.anonymisiert}
      selbst={props.selbst}
      folgen={folgen}
    />
  );
}

async function Protokoll({ id }: { id: string }) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("change_log")
    .select("id, table_name, row_id, member_id, action, ereignis, diff, kenn, changed_at, changed_by")
    .eq("member_id", id)
    .order("changed_at", { ascending: false })
    .limit(200);

  if (error) return <Fehlerzustand text={translateDbError(error)} />;

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
  const vorgang = (e: (typeof eintraege)[number]) => {
    const satz = protokollVorgang(e, (id) => namen.get(id) ?? mannschaftsnamen.get(id));
    return satz.charAt(0).toUpperCase() + satz.slice(1);
  };

  // Mannschaften stehen im Protokoll als Kennung; der Name sagt mehr. Auch
  // geloeschte Mannschaften sollen lesbar bleiben, deshalb nur, was es noch
  // gibt - der Rest zeigt die Kennung.
  const { data: mannschaften } = await supabase.from("teams").select("id, name");
  const mannschaftsnamen = new Map((mannschaften ?? []).map((t) => [t.id, t.name]));
  const zeige = (feld: string, wert: unknown) =>
    feld === "team_id" && typeof wert === "string"
      ? (mannschaftsnamen.get(wert) ?? zeigeWert(wert))
      : feld === "role" && typeof wert === "string"
        ? rollenLabel(wert)
        : zeigeWert(wert);

  return (
    <section className="karte protokoll" aria-label="Änderungsprotokoll">
      <h2 className="dpl">Änderungen</h2>
      <p className="unterzeile">
        Jede Änderung an diesem Mitglied und alles, was die Verwaltung für es getan hat – Stammdaten auch dann, wenn es sie selbst geändert hat.
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
                  <td>{TABELLE_LABEL[e.table_name] ?? bereichTitel(e.table_name)}</td>
                  <td>
                    {/* Alles außerhalb der Stammdaten (Forderungen, Buchungen,
                        Stunden, Zugang) als Satz wie im Verwaltungsprotokoll. */}
                    {e.action === "event" || !(e.table_name in TABELLE_LABEL) ? (
                      vorgang(e)
                    ) : // Beim Anlegen stehen sämtliche Felder im Diff. Sie alle
                    // aufzuführen macht das Protokoll unlesbar und sagt nichts
                    // – der Datensatz sieht danach ja genau so aus wie in den
                    // Stammdaten. Ein Satz genügt.
                    e.action === "insert" ? (
                      <span className="marke-klein gruen">angelegt</span>
                    ) : e.action === "delete" ? (
                      <span className="marke-klein rot">gelöscht</span>
                    ) : (
                      Object.entries(diff).map(([feld, wechsel]) => (
                        <div key={feld}>
                          <span className="feld">{FELD_LABEL[feld] ?? feld}</span>:{" "}
                          <span className="alt">{zeige(feld, wechsel?.alt)}</span>{" "}
                          <span className="neu">{zeige(feld, wechsel?.neu)}</span>
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
