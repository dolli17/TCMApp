/**
 * Feld-Zuordnung eBuSy -> TCM
 *
 * Erstellt anhand der tatsaechlichen API-Antworten des Tenants, nicht anhand
 * der OpenAPI-Datei: die ist unvollstaendig. Sie kennt weder
 * membershipFeeTypes noch workServiceTypes, bookingCode oder invoiceRecipient,
 * obwohl die API all das liefert.
 *
 * Dieses Modul ist reine Umformung ohne Netzwerk und ohne Datenbank - deshalb
 * laesst es sich gegen Beispieldaten testen, lange bevor der Cutover ansteht.
 */

export interface EbusyPerson {
  id: number;
  title?: string | null;
  archived?: boolean;
  gender?: string | null;
  salutation?: string | null;
  firstname?: string | null;
  lastname?: string | null;
  pseudonym?: string | null;
  birthday?: string | null;
  company?: string | null;
  nationality?: string | null;
  nationalityCode?: string | null;
  address?: {
    street?: string | null;
    postcode?: string | null;
    city?: string | null;
    country?: string | null;
    countryCode?: string | null;
  } | null;
  contact?: {
    email?: string | null;
    phone?: string | null;
    phoneBusiness?: string | null;
    mobile?: string | null;
  } | null;
  bankAccount?: {
    holder?: string | null;
    number?: string | null;
    bank?: string | null;
  } | null;
  sepaMandate?: {
    date?: string | null;
    reference?: string | null;
    lastUsedDate?: string | null;
  } | null;
  code?: string | null;
  transponder?: string | null;
  customerId?: string | null;
  comment?: string | null;
  paidByInfo?: { id?: number } | null;
  user?: { id?: number; name?: string | null; enabled?: boolean } | null;
  attributes?: { name: string; value?: { name?: string } | null }[];
}

export interface EbusyMembership {
  id: number;
  personId: number;
  number?: string | null;
  status?: string | null;
  consideredActive?: boolean;
  begin?: string | null;
  end?: string | null;
  cancellationDate?: string | null;
  cancellationReason?: string | null;
  comment?: string | null;
  archived?: boolean;
  membershipFeeTypes?: { id: number; name: string }[];
  workServiceTypes?: { id: number; name: string }[];
}

export interface MappedMember {
  ebusy_person_id: number;
  first_name: string;
  last_name: string;
  title: string | null;
  gender: "female" | "male" | "diverse" | null;
  salutation: "female" | "male" | "none" | null;
  birthday: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  street: string | null;
  postcode: string | null;
  city: string | null;
  country_code: string | null;
  notes: string | null;
  status: "active" | "inactive" | "archived";
  source: "ebusy_import";
  legacy_data: Record<string, unknown>;
  /** Wird in einem zweiten Durchgang aufgeloest, wenn alle Ids bekannt sind. */
  ebusy_payer_id: number | null;
  import_notes: string | null;
}

export interface MappedBankAccount {
  ebusy_person_id: number;
  iban: string;
  holder: string;
  bank_name: string | null;
}

export interface MappedMandate {
  ebusy_person_id: number;
  reference: string;
  signed_on: string;
  last_used_on: string | null;
}

/** Adressen, hinter denen keine echte Person steht. */
const PLATZHALTER_MAILS = new Set(["fake@ebusy.de", "keine@ebusy.de", "-"]);

export function mapGender(value?: string | null): MappedMember["gender"] {
  switch (value) {
    case "FEMALE":
      return "female";
    case "MALE":
      return "male";
    case "DIVERSE":
      return "diverse";
    default:
      return null;
  }
}

export function mapSalutation(value?: string | null): MappedMember["salutation"] {
  switch (value) {
    case "FEMALE":
      return "female";
    case "MALE":
      return "male";
    case "NONE":
      return "none";
    default:
      return null;
  }
}

/** Leerstrings der eBuSy-API zu null vereinheitlichen. */
export function leerZuNull(value?: string | null): string | null {
  const v = value?.trim();
  return v ? v : null;
}

export function mapEmail(value?: string | null): string | null {
  const v = leerZuNull(value)?.toLowerCase() ?? null;
  if (!v) return null;
  return PLATZHALTER_MAILS.has(v) ? null : v;
}

export function mapPerson(p: EbusyPerson): MappedMember {
  const hinweise: string[] = [];

  const email = mapEmail(p.contact?.email);
  if (p.contact?.email && !email) {
    hinweise.push(`Platzhalter-Adresse "${p.contact.email}" verworfen`);
  }
  if (!p.birthday) hinweise.push("kein Geburtsdatum");

  // Felder ohne eigene Spalte gehen nicht verloren, sondern nach legacy_data.
  // Sonst waere der Import verlustbehaftet und nicht wiederholbar.
  const legacy: Record<string, unknown> = {};
  if (leerZuNull(p.code)) legacy.code = p.code;
  if (leerZuNull(p.customerId)) legacy.customerId = p.customerId;
  if (leerZuNull(p.transponder)) legacy.transponder = p.transponder;
  if (leerZuNull(p.nationality)) legacy.nationality = p.nationality;
  if (leerZuNull(p.company)) legacy.company = p.company;
  if (leerZuNull(p.pseudonym)) legacy.pseudonym = p.pseudonym;
  if (p.user?.name) legacy.ebusyUsername = p.user.name;
  if (p.attributes?.length) {
    legacy.attributes = p.attributes.map((a) => ({
      name: a.name,
      value: a.value?.name ?? null,
    }));
  }

  return {
    ebusy_person_id: p.id,
    first_name: leerZuNull(p.firstname) ?? "?",
    last_name: leerZuNull(p.lastname) ?? "?",
    title: leerZuNull(p.title),
    gender: mapGender(p.gender),
    salutation: mapSalutation(p.salutation),
    birthday: leerZuNull(p.birthday),
    email,
    phone: leerZuNull(p.contact?.phone),
    mobile: leerZuNull(p.contact?.mobile),
    street: leerZuNull(p.address?.street),
    postcode: leerZuNull(p.address?.postcode),
    city: leerZuNull(p.address?.city),
    country_code: leerZuNull(p.address?.countryCode) ?? "DE",
    notes: leerZuNull(p.comment),
    status: p.archived ? "archived" : "active",
    source: "ebusy_import",
    legacy_data: legacy,
    ebusy_payer_id: p.paidByInfo?.id ?? null,
    import_notes: hinweise.length > 0 ? hinweise.join("; ") : null,
  };
}

export function mapBankAccount(p: EbusyPerson): MappedBankAccount | null {
  const iban = leerZuNull(p.bankAccount?.number)?.replace(/\s/g, "");
  if (!iban) return null;

  return {
    ebusy_person_id: p.id,
    iban,
    holder:
      leerZuNull(p.bankAccount?.holder) ??
      `${leerZuNull(p.firstname) ?? ""} ${leerZuNull(p.lastname) ?? ""}`.trim(),
    bank_name: leerZuNull(p.bankAccount?.bank),
  };
}

export function mapMandate(p: EbusyPerson): MappedMandate | null {
  const referenz = leerZuNull(p.sepaMandate?.reference);
  const datum = leerZuNull(p.sepaMandate?.date);
  if (!referenz || !datum) return null;

  return {
    ebusy_person_id: p.id,
    reference: referenz,
    signed_on: datum,
    // Nie benutzte Mandate behalten null: die 36-Monats-Frist laeuft dann ab
    // dem Unterschriftsdatum, nicht ab einem erfundenen Zeitpunkt.
    last_used_on: leerZuNull(p.sepaMandate?.lastUsedDate),
  };
}

/**
 * Findet Mandatsreferenzen, die mehrfach vorkommen.
 *
 * Im Bestand betrifft das 113 von 375 Mandaten - 17 mal allein "SEPA-0005".
 * Der Import laesst sie durch und markiert sie, damit der Kassenwart sie
 * nacharbeiten kann; blockieren wuerde den Umzug unnoetig aufhalten.
 */
export function findeReferenzKonflikte(mandate: readonly MappedMandate[]): Set<string> {
  const zaehler = new Map<string, number>();
  for (const m of mandate) {
    const key = m.reference.trim().toUpperCase();
    zaehler.set(key, (zaehler.get(key) ?? 0) + 1);
  }
  return new Set([...zaehler.entries()].filter(([, n]) => n > 1).map(([k]) => k));
}

/**
 * E-Mail-Adressen, die sich mehrere Personen teilen.
 *
 * auth.users.email ist eindeutig - jede Dublette bedeutet, dass hoechstens
 * eine der betroffenen Personen einen Login bekommen kann.
 */
export function findeMailKonflikte(
  mitglieder: readonly MappedMember[],
): Map<string, MappedMember[]> {
  const nach = new Map<string, MappedMember[]>();
  for (const m of mitglieder) {
    if (!m.email) continue;
    const liste = nach.get(m.email) ?? [];
    liste.push(m);
    nach.set(m.email, liste);
  }
  return new Map([...nach.entries()].filter(([, l]) => l.length > 1));
}

export function istMinderjaehrig(birthday: string | null, stichtag = new Date()): boolean {
  if (!birthday) return false;
  const geb = new Date(birthday);
  const alter =
    (stichtag.getTime() - geb.getTime()) / (365.2425 * 24 * 60 * 60 * 1000);
  return alter < 18;
}

export interface MappedMembership {
  ebusy_id: number;
  ebusy_person_id: number;
  number: string;
  started_on: string;
  ended_on: string | null;
  cancellation_date: string | null;
  cancellation_reason: string | null;
  status: "active" | "requested" | "declined" | "ended";
  notes: string | null;
  fee_type_names: string[];
  work_duty_names: string[];
}

export function mapMembership(m: EbusyMembership): MappedMembership {
  return {
    ebusy_id: m.id,
    ebusy_person_id: m.personId,
    number: leerZuNull(m.number) ?? String(m.id),
    started_on: leerZuNull(m.begin) ?? "1970-01-01",
    ended_on: leerZuNull(m.end),
    cancellation_date: leerZuNull(m.cancellationDate),
    cancellation_reason: leerZuNull(m.cancellationReason),
    status:
      m.status === "REQUESTED"
        ? "requested"
        : m.status === "DECLINED"
          ? "declined"
          : leerZuNull(m.end)
            ? "ended"
            : "active",
    notes: leerZuNull(m.comment),
    // Die Beitragsart steht in eBuSy an der Mitgliedschaft, nicht an der
    // Person - und es koennen mehrere sein (Beitrag plus Schluesselpfand).
    fee_type_names: (m.membershipFeeTypes ?? []).map((f) => f.name),
    work_duty_names: (m.workServiceTypes ?? []).map((f) => f.name),
  };
}
