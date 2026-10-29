/**
 * Der API-Vertrag der App, maschinenlesbar (docs/native/app-api.json).
 *
 * Welche RPCs, Tabellen, Realtime-Kanaele und Auth-Aufrufe die Expo-App
 * benutzt, steht unten von Hand (NUTZUNG) - das ist die Liste, die die
 * nativen Apps abdecken muessen. Parameter, Rueckgaben und Spalten kommen
 * aus packages/core/src/database.types.ts, also aus dem Schema selbst.
 *
 * Der Test app-api.test.ts haelt beides fest: die JSON passt zu den Typen,
 * und die Liste passt zu dem, was apps/mobile wirklich aufruft. Die
 * menschenlesbare Fassung mit Fehlertexten steht in docs/native/app-api.md.
 *
 * Neu erzeugen mit: pnpm --filter @tcm/core build:app-api
 */

import ts from "typescript";

// ---------------------------------------------------------------------------
// Was die App benutzt
// ---------------------------------------------------------------------------

/** Wo eine RPC in der App aufgerufen wird: Datei unter apps/mobile/src/lib und Funktion. */
export const RPCS: Record<string, string[]> = {
  booking_settings: ["daten.ts ladeBuchungseinstellungen"],
  cancel_booking: ["daten.ts storniereBuchung", "daten.ts hebeSperreAuf"],
  cancel_series_occurrence: ["daten.ts sageSerienterminAb"],
  complete_onboarding: ["daten.ts schliesseOnboardingAb"],
  court_overview: ["verwaltung/plaetze.ts ladePlaetze"],
  create_blocking: ["daten.ts sperreStunde", "verwaltung/plaetze.ts sperre"],
  create_booking: ["daten.ts bucheplatz"],
  create_my_sepa_mandate: ["daten.ts erteileMandat"],
  create_series: ["verwaltung/plaetze.ts legeSerieAn"],
  day_schedule: ["daten.ts ladeTagesplan", "verwaltung/plaetze.ts ladePlaetze"],
  drink_menu: ["daten.ts ladeGetraenkekarte"],
  end_series: ["verwaltung/plaetze.ts beendeSerie"],
  event_abmelden: ["daten.ts meldeVonVeranstaltungAb"],
  event_anmelden: ["daten.ts meldeZuVeranstaltungAn"],
  event_anmeldung_aendern: ["daten.ts aendereVeranstaltungsAnmeldung"],
  event_mein_wartelistenplatz: ["daten.ts ladeVeranstaltung"],
  events_fuer_mitglied: ["daten.ts ladeVeranstaltungen", "daten.ts ladeVeranstaltung"],
  join_booking: ["daten.ts spieleMit"],
  konto_loeschung_beantragen: ["daten.ts beantrageKontoloeschung"],
  leave_booking: ["daten.ts verlasseBuchung"],
  mark_notifications_read: ["daten.ts markiereBenachrichtigungenGelesen"],
  mein_zugang: ["daten.ts ladeZugang"],
  member_attributes: ["daten.ts ladeMeineMerkmale"],
  member_directory: ["daten.ts ladeVerzeichnis"],
  move_booking: ["daten.ts setzeUm"],
  my_booking_quota: ["daten.ts ladeKontingent"],
  my_bookings: ["daten.ts ladeMeineBuchungen"],
  my_charges: ["daten.ts ladeMeineForderungen"],
  my_drink_purchases: ["daten.ts ladeEigeneGetraenke"],
  my_notifications: ["daten.ts ladeBenachrichtigungen"],
  my_onboarding: ["daten.ts ladeOnboarding"],
  my_unread_notification_count: ["daten.ts zaehleUngelesen"],
  my_work_duty: ["daten.ts ladeArbeitsdienst"],
  onboarding_accept_documents: ["daten.ts akzeptiereDokumente"],
  onboarding_save_guardian: ["daten.ts speichereErziehungsberechtigte"],
  onboarding_save_notfallkontakt: ["daten.ts speichereOnboardingNotfallkontakt"],
  onboarding_save_stammdaten: ["daten.ts speichereOnboardingStammdaten"],
  open_matches: ["daten.ts ladeOffeneSpiele"],
  preview_series: ["verwaltung/plaetze.ts vorschauSerie"],
  record_drink_purchase: ["daten.ts bucheGetraenk"],
  register_push_token: ["push.ts registriereGeraet"],
  remove_member_attribute: ["daten.ts entferneMerkmal"],
  remove_push_token: ["push.ts meldeGeraetAb"],
  save_my_tennis: ["daten.ts speichereTennis"],
  series_overview: ["verwaltung/plaetze.ts ladePlaetze"],
  set_member_attribute: ["daten.ts setzeMerkmal"],
  set_partner_wanted: ["daten.ts sucheMitspieler"],
  update_blocking: ["daten.ts aendereSperre"],
  update_booking_players: ["daten.ts aendereMitspieler"],
  update_series: ["verwaltung/plaetze.ts aendereSerie"],
  void_drink_purchase: ["daten.ts storniereGetraenk"],
};

export interface Tabellenzugriff {
  /** Datei unter apps/mobile/src/lib und Funktion */
  wo: string;
  art: "select" | "update";
  /** Gelesene bzw. geschriebene Spalten, wie im Aufruf; "teams(name)" ist ein eingebetteter Fremdschluessel */
  spalten: string[];
  /** Filter in PostgREST-Schreibweise, Werte in <spitzen Klammern> kommen zur Laufzeit */
  filter: string[];
  sortierung?: string;
  limit?: number;
  einzeln?: boolean;
}

export interface Tabelle {
  zugriffe: Tabellenzugriff[];
  /** Alle direkten Tabellenzugriffe sollen RPC oder View werden - hier der Vorschlag. */
  vorschlag: string;
}

export const TABELLEN: Record<string, Tabelle> = {
  booking_types: {
    zugriffe: [
      {
        wo: "daten.ts ladeBuchungsarten",
        art: "select",
        spalten: ["code", "name", "duration_minutes", "requires_partner", "min_players", "max_players"],
        filter: ["active=eq.true", "applies_to=eq.booking"],
        sortierung: "sort_order",
      },
      {
        wo: "daten.ts ladeBlockungsarten",
        art: "select",
        spalten: ["code", "name"],
        filter: ["active=eq.true", "applies_to=eq.blocking"],
        sortierung: "sort_order",
      },
      {
        wo: "verwaltung/plaetze.ts ladePlaetze",
        art: "select",
        spalten: ["code", "name", "applies_to", "active"],
        filter: [],
        sortierung: "sort_order",
      },
    ],
    vorschlag:
      "RPC booking_types_aktiv(p_applies_to) mit code, name, Dauer und Spielerzahlen; " +
      "oder in booking_settings mitliefern, die der Plan ohnehin laedt.",
  },
  charges: {
    zugriffe: [
      {
        wo: "daten.ts ladeVeranstaltung",
        art: "select",
        spalten: ["amount_cents", "status"],
        filter: ["event_id=eq.<event>", "member_id=eq.<ich>", "status=neq.waived"],
        einzeln: true,
      },
    ],
    vorschlag:
      "Als Spalten meine_forderung_cents und meine_forderung_status in events_fuer_mitglied; " +
      "dann entfaellt auch die Abfrage der eigenen Mitglieds-Id davor.",
  },
  courts: {
    zugriffe: [
      {
        wo: "daten.ts ladePlaetze",
        art: "select",
        spalten: ["id", "name", "short_name"],
        filter: ["active=eq.true"],
        sortierung: "position",
      },
    ],
    vorschlag: "RPC courts_aktiv() oder View courts_app (id, name, short_name, position), nur aktive Plaetze.",
  },
  member_roles: {
    zugriffe: [
      {
        wo: "daten.ts ladeIchSelbst",
        art: "select",
        spalten: ["role"],
        filter: ["member_id=eq.<ich>"],
      },
    ],
    vorschlag:
      "RPC ich() mit member_id, Name, Rollen und den abgeleiteten Rechten (admin, platz_rechte) - " +
      "ersetzt zusammen mit members drei Abfragen beim Start.",
  },
  members: {
    zugriffe: [
      {
        wo: "daten.ts ladeIchSelbst",
        art: "select",
        spalten: ["id"],
        filter: ["auth_user_id=eq.<auth.uid>"],
        einzeln: true,
      },
      {
        wo: "daten.ts ladeVeranstaltung",
        art: "select",
        spalten: ["id"],
        filter: ["auth_user_id=eq.<auth.uid>"],
        einzeln: true,
      },
      {
        wo: "daten.ts ladeMeinenNamen",
        art: "select",
        spalten: ["first_name", "last_name"],
        filter: ["id=eq.<ich>"],
        einzeln: true,
      },
      {
        wo: "daten.ts ladeMeineStammdaten",
        art: "select",
        spalten: [
          "first_name", "last_name", "title", "phone", "mobile", "street", "postcode", "city",
          "emergency_contact_name", "emergency_contact_phone", "emergency_contact_relation",
        ],
        filter: ["id=eq.<ich>"],
        einzeln: true,
      },
      {
        wo: "daten.ts ladeMeineMannschaft",
        art: "select",
        spalten: ["is_team_captain", "teams(name)"],
        filter: ["id=eq.<ich>"],
        einzeln: true,
      },
      {
        wo: "daten.ts speichereStammdaten",
        art: "update",
        spalten: ["first_name", "last_name", "title", "phone", "mobile", "street", "postcode", "city"],
        filter: ["id=eq.<ich>"],
      },
      {
        wo: "daten.ts speichereNotfallkontakt",
        art: "update",
        spalten: ["emergency_contact_name", "emergency_contact_phone", "emergency_contact_relation"],
        filter: ["id=eq.<ich>"],
      },
    ],
    vorschlag:
      "Lesen: RPC mein_profil() mit Stammdaten, Notfallkontakt und Mannschaft in einem Zug. " +
      "Schreiben: RPC save_my_profile(...) und save_my_notfallkontakt(...), die nur geaenderte Felder " +
      "uebernehmen - heute erledigen das Policy, Spalten-Grant und Trigger guard_member_self_update.",
  },
  memberships: {
    zugriffe: [
      {
        wo: "daten.ts ladeMeineMitgliedschaft",
        art: "select",
        spalten: ["number", "started_on"],
        filter: ["member_id=eq.<ich>", "status=eq.active"],
        sortierung: "started_on.desc",
        limit: 1,
        einzeln: true,
      },
    ],
    vorschlag: "In mein_profil() mitliefern (Mitgliedsnummer, Mitglied seit).",
  },
  push_tokens: {
    zugriffe: [
      {
        wo: "push.ts istAngemeldet",
        art: "select",
        spalten: ["id"],
        filter: ["token=eq.<token>", "disabled_at=is.null"],
        einzeln: true,
      },
    ],
    vorschlag:
      "RPC push_token_aktiv(p_token) -> boolean; gehoert ohnehin zum Umbau auf APNs/FCM " +
      "(Spalte provider, siehe native-apps.md, Phase A).",
  },
  sepa_mandates: {
    zugriffe: [
      {
        wo: "daten.ts ladeMeinMandat",
        art: "select",
        spalten: ["reference", "signed_on", "status", "bank_accounts(holder, bank_name, iban_last4)"],
        filter: ["member_id=eq.<ich>", "status=eq.active"],
        sortierung: "signed_on.desc",
        limit: 1,
        einzeln: true,
      },
    ],
    vorschlag: "RPC mein_mandat() mit Referenz, Datum, Kontoinhaber, Bank und den letzten vier Stellen der IBAN.",
  },
  settings: {
    zugriffe: [
      {
        wo: "daten.ts ladeStornoFenster",
        art: "select",
        spalten: ["key", "value"],
        filter: ["key=eq.drinks.void_window_minutes"],
        einzeln: true,
      },
      {
        wo: "verwaltung/gemeinsam.ts ladeEinstellungen",
        art: "select",
        spalten: ["key", "value", "value_type", "label", "description", "updated_at"],
        filter: [],
        sortierung: "key",
      },
    ],
    vorschlag:
      "Das Stornofenster in drink_menu oder booking_settings mitliefern; Oeffnung und Schluss " +
      "kommen schon aus booking_settings. Die Verwaltung braucht dann keine eigene Abfrage mehr.",
  },
};

/** Ueber Fremdschluessel mitgelesene Tabellen (select mit "tabelle(spalten)") */
export const EINGEBETTET = ["teams", "bank_accounts"] as const;

export const REALTIME = [
  {
    wo: "app/(tabs)/plaetze/index.tsx",
    kanal: "plan-<datum>",
    art: "postgres_changes",
    event: "*",
    schema: "public",
    tabelle: "bookings",
    zweck:
      "Belegungsplan neu laden, hoechstens einmal pro Sekunde; beim Zurueckkehren in die App " +
      "wird ohnehin neu geladen, weil der Kanal im Schlaf nichts sieht.",
  },
];

export const AUTH = [
  { aufruf: "signInWithPassword", wo: "daten.ts anmelden", zweck: "Anmelden mit E-Mail und Passwort" },
  { aufruf: "signOut", wo: "daten.ts abmelden", zweck: "Abmelden" },
  {
    aufruf: "signOut({ scope: 'local' })",
    wo: "app/passwort-setzen.tsx",
    zweck: "Alte Sitzung verwerfen, bevor ein Passwort-Link eingeloest wird",
  },
  { aufruf: "resetPasswordForEmail", wo: "daten.ts passwortLinkAnfordern", zweck: "Passwort-Link anfordern" },
  { aufruf: "updateUser({ password })", wo: "daten.ts passwortSetzen", zweck: "Neues Passwort setzen" },
  {
    aufruf: "verifyOtp({ token_hash, type })",
    wo: "app/passwort-setzen.tsx",
    zweck: "Link aus der Mail (Einladung, Wiederherstellung) mit token_hash einloesen",
  },
  {
    aufruf: "setSession({ access_token, refresh_token })",
    wo: "app/passwort-setzen.tsx",
    zweck: "Link im alten Format mit Tokens im Fragment einloesen",
  },
  { aufruf: "getSession", wo: "app/index.tsx, app/passwort-setzen.tsx", zweck: "Gibt es eine Sitzung?" },
  { aufruf: "onAuthStateChange", wo: "app/index.tsx", zweck: "Weiche bei An- und Abmelden" },
  { aufruf: "getUser", wo: "daten.ts ladeIchSelbst, ladeVeranstaltung", zweck: "auth.uid fuer members.auth_user_id" },
];

// ---------------------------------------------------------------------------
// Typen aus database.types.ts
// ---------------------------------------------------------------------------

/**
 * Ein Typ, wie er in der JSON steht: einfache Typen als Text ("string",
 * "number", "boolean", "Json", "null", "enum:booking_kind", auch
 * "string | null"), sonst { liste }, { objekt } oder { oder }. In einem
 * Objekt markiert ein "?" am Feldnamen ein optionales Feld.
 */
export type ApiTyp = string | { liste: ApiTyp } | { objekt: Record<string, ApiTyp> } | { oder: ApiTyp[] };

function eigenschaft(knoten: ts.TypeLiteralNode, name: string): ts.TypeNode | undefined {
  for (const m of knoten.members) {
    if (ts.isPropertySignature(m) && m.name.getText() === name) return m.type;
  }
  return undefined;
}

function alsLiteral(knoten: ts.TypeNode | undefined, wo: string): ts.TypeLiteralNode {
  if (!knoten || !ts.isTypeLiteralNode(knoten)) throw new Error(`${wo} ist kein Objekttyp`);
  return knoten;
}

function typ(knoten: ts.TypeNode): ApiTyp {
  switch (knoten.kind) {
    case ts.SyntaxKind.StringKeyword:
      return "string";
    case ts.SyntaxKind.NumberKeyword:
      return "number";
    case ts.SyntaxKind.BooleanKeyword:
      return "boolean";
    case ts.SyntaxKind.UndefinedKeyword:
      return "undefined";
    case ts.SyntaxKind.UnknownKeyword:
      return "unknown";
  }
  if (ts.isLiteralTypeNode(knoten)) {
    if (knoten.literal.kind === ts.SyntaxKind.NullKeyword) return "null";
    return knoten.literal.getText();
  }
  if (ts.isParenthesizedTypeNode(knoten)) return typ(knoten.type);
  if (ts.isArrayTypeNode(knoten)) return { liste: typ(knoten.elementType) };
  if (ts.isTypeReferenceNode(knoten)) return knoten.typeName.getText();
  if (ts.isIndexedAccessTypeNode(knoten)) {
    // Database["public"]["Enums"]["booking_kind"]
    const m = /\["Enums"\]\["([a-z_0-9]+)"\]$/.exec(knoten.getText());
    if (m) return `enum:${m[1]}`;
    throw new Error(`Unbekannter Typverweis: ${knoten.getText()}`);
  }
  if (ts.isTypeLiteralNode(knoten)) {
    const objekt: Record<string, ApiTyp> = {};
    for (const m of knoten.members) {
      if (!ts.isPropertySignature(m) || !m.type) continue;
      objekt[m.name.getText() + (m.questionToken ? "?" : "")] = typ(m.type);
    }
    return { objekt };
  }
  if (ts.isUnionTypeNode(knoten)) {
    const teile = knoten.types.map(typ);
    if (teile.every((t) => typeof t === "string")) return teile.join(" | ");
    return { oder: teile };
  }
  throw new Error(`Unbekannter Typ: ${knoten.getText()}`);
}

/** Alle Mitglieder eines Objekttyps als Name -> Knoten */
function mitglieder(knoten: ts.TypeLiteralNode): Map<string, ts.TypeNode> {
  const out = new Map<string, ts.TypeNode>();
  for (const m of knoten.members) {
    if (ts.isPropertySignature(m) && m.type) out.set(m.name.getText().replace(/"/g, ""), m.type);
  }
  return out;
}

interface Schema {
  tabellen: Map<string, ts.TypeNode>;
  funktionen: Map<string, ts.TypeNode>;
  enums: Map<string, ts.TypeNode>;
}

function leseSchema(quelltext: string): Schema {
  const datei = ts.createSourceFile("database.types.ts", quelltext, ts.ScriptTarget.ES2022, true);
  let database: ts.TypeLiteralNode | undefined;
  datei.forEachChild((k) => {
    if (ts.isTypeAliasDeclaration(k) && k.name.text === "Database" && ts.isTypeLiteralNode(k.type)) {
      database = k.type;
    }
  });
  if (!database) throw new Error("type Database fehlt in database.types.ts");
  const publicSchema = alsLiteral(eigenschaft(database, "public"), "Database.public");
  return {
    tabellen: mitglieder(alsLiteral(eigenschaft(publicSchema, "Tables"), "public.Tables")),
    funktionen: mitglieder(alsLiteral(eigenschaft(publicSchema, "Functions"), "public.Functions")),
    enums: mitglieder(alsLiteral(eigenschaft(publicSchema, "Enums"), "public.Enums")),
  };
}

/** Args und Returns einer Funktion; mit Ueberladungen eine Liste von Varianten. */
function signatur(knoten: ts.TypeNode, name: string): { args: ApiTyp; returns: ApiTyp }[] {
  const varianten = ts.isUnionTypeNode(knoten) ? knoten.types : [knoten];
  return varianten.map((v) => {
    const literal = alsLiteral(v, `Funktion ${name}`);
    const args = eigenschaft(literal, "Args");
    const returns = eigenschaft(literal, "Returns");
    if (!args || !returns) throw new Error(`Funktion ${name} ohne Args oder Returns`);
    // "Args: never" heisst: keine Parameter
    return { args: args.kind === ts.SyntaxKind.NeverKeyword ? { objekt: {} } : typ(args), returns: typ(returns) };
  });
}

/** Alle enum:<name>, die in einem Typ vorkommen */
function enumsIn(t: ApiTyp, out: Set<string>): void {
  if (typeof t === "string") {
    for (const m of t.matchAll(/enum:([a-z_0-9]+)/g)) out.add(m[1]!);
  } else if ("liste" in t) enumsIn(t.liste, out);
  else if ("objekt" in t) Object.values(t.objekt).forEach((x) => enumsIn(x, out));
  else t.oder.forEach((x) => enumsIn(x, out));
}

export function appApi(databaseTypes: string): unknown {
  const schema = leseSchema(databaseTypes);
  const enums = new Set<string>();

  const rpcs = Object.fromEntries(
    Object.entries(RPCS)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, wo]) => {
        const knoten = schema.funktionen.get(name);
        if (!knoten) throw new Error(`RPC ${name} fehlt in database.types.ts`);
        const sig = signatur(knoten, name);
        sig.forEach((s) => (enumsIn(s.args, enums), enumsIn(s.returns, enums)));
        const eintrag = sig.length === 1 ? { ...sig[0] } : { varianten: sig };
        return [name, { ...eintrag, genutztIn: wo }];
      }),
  );

  const zeile = (name: string) => {
    const knoten = schema.tabellen.get(name);
    if (!knoten) throw new Error(`Tabelle ${name} fehlt in database.types.ts`);
    const row = eigenschaft(alsLiteral(knoten, `Tabelle ${name}`), "Row");
    if (!row) throw new Error(`Tabelle ${name} ohne Row`);
    const t = typ(row);
    enumsIn(t, enums);
    return t;
  };

  const tabellen = Object.fromEntries(
    Object.entries(TABELLEN)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, t]) => [name, { sollRpcOderViewWerden: true, vorschlag: t.vorschlag, zugriffe: t.zugriffe, row: zeile(name) }]),
  );
  const eingebettet = Object.fromEntries(EINGEBETTET.map((name) => [name, { row: zeile(name) }]));

  const enumWerte = Object.fromEntries(
    [...enums].sort().map((name) => {
      const knoten = schema.enums.get(name);
      if (!knoten) throw new Error(`Enum ${name} fehlt in database.types.ts`);
      const t = typ(knoten);
      if (typeof t !== "string") throw new Error(`Enum ${name} ist keine Aufzaehlung`);
      return [name, t.split(" | ").map((w) => JSON.parse(w) as string)];
    }),
  );

  return {
    $kommentar:
      "ERZEUGT von packages/core/scripts/app-api.ts aus packages/core/src/database.types.ts - " +
      "NICHT VON HAND AENDERN. Neu erzeugen mit: pnpm --filter @tcm/core build:app-api. " +
      "Lesefassung mit Fehlertexten: docs/native/app-api.md",
    typen:
      "Einfache Typen als Text (string, number, boolean, Json, null, undefined, enum:<name>, auch mit ' | '), " +
      "sonst {liste}, {objekt} oder {oder}. Ein '?' am Feldnamen heisst optional. " +
      "Rueckgabe {liste: {objekt}} ist eine Tabelle (setof), undefined heisst void.",
    rpcs,
    tabellen,
    eingebettet,
    realtime: REALTIME,
    auth: AUTH,
    enums: enumWerte,
  };
}

export function appApiJson(databaseTypes: string): string {
  return JSON.stringify(appApi(databaseTypes), null, 2) + "\n";
}
