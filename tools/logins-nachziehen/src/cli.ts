/**
 * Logins nachziehen
 *
 * Jedes Mitglied bekommt einen Login. Dieses Skript holt das fuer alle nach,
 * die noch keinen haben: Bestandsmitglieder aus der Zeit, als Mitglied und
 * Login getrennt waren, und spaeter der Bestand aus dem eBuSy-Import.
 *
 * Standardmaessig ein Probelauf: liest, teilt ein, berichtet – schreibt nichts.
 * Erst mit --ausfuehren werden Konten angelegt und Mails verschickt.
 *
 * Aufruf (Einzelheiten im README):
 *   pnpm --filter @tcm/logins-nachziehen start               # Probelauf
 *   pnpm --filter @tcm/logins-nachziehen start --ausfuehren  # echt
 *
 * Lesen geht ueber die Datenbankverbindung (SUPABASE_DB_URL), weil der
 * Service-Schluessel auf public.members bewusst kein SELECT hat. Geschrieben
 * wird wie in der Edge Function member-login: Konto ueber die Admin-API,
 * Verknuepfung ueber die RPC link_auth_user.
 */

import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import postgres from "postgres";
import {
  BESCHRIFTUNG,
  REIHENFOLGE,
  gruppiere,
  teileEin,
  type AuthKonto,
  type Massnahme,
  type MitgliedOhneLogin,
  type Verknuepfung,
} from "./einteilung";
import { gleichesProjekt, istLokal } from "./ziel";

const { values: optionen } = parseArgs({
  options: {
    ausfuehren: { type: "boolean", default: false },
    ja: { type: "boolean", default: false },
    // Pause nach jeder Einladungsmail. Supabase Auth begrenzt die Mails je
    // Stunde (Einstellung „Rate limit for sending emails“), Resend die je
    // Sekunde. Zwei Sekunden halten Resend sicher ein; das Stundenlimit
    // faengt --max bzw. der Abbruch bei 429 ab.
    pause: { type: "string", default: "2000" },
    // Hoechstens so viele Einladungsmails in diesem Lauf. Der Rest bleibt
    // fuer den naechsten Lauf liegen – das Skript ist wiederholbar.
    max: { type: "string" },
  },
});

const PAUSE_MAIL_MS = Number(optionen.pause);
const PAUSE_STILL_MS = 100;
const MAX_MAILS = optionen.max === undefined ? Infinity : Number(optionen.max);

function umgebung(name: string): string {
  const wert = process.env[name];
  if (!wert) {
    throw new Error(
      `${name} fehlt. Die Zugangsdaten kommen aus der Umgebung, niemals aus dem Repo (siehe README).`,
    );
  }
  return wert;
}

const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Die Admin-API liefert Seiten; geblaettert wird wie in findeBenutzer (member-login). */
async function alleKonten(dienst: SupabaseClient): Promise<AuthKonto[]> {
  const konten: AuthKonto[] = [];
  for (let seite = 1; ; seite++) {
    const { data, error } = await dienst.auth.admin.listUsers({ page: seite, perPage: 200 });
    if (error) throw new Error(`Konten lesen: ${error.message}`);
    konten.push(...data.users.map((u) => ({ id: u.id, email: u.email ?? null })));
    if (data.users.length < 200) return konten;
  }
}

/** Konto zu einer Adresse suchen – fuer den Fall, dass es zwischendurch entstanden ist. */
async function findeBenutzer(dienst: SupabaseClient, email: string): Promise<string | null> {
  const gesucht = email.trim().toLowerCase();
  const treffer = (await alleKonten(dienst)).find((k) => (k.email ?? "").toLowerCase() === gesucht);
  return treffer?.id ?? null;
}

async function verknuepfe(dienst: SupabaseClient, memberId: string, authUserId: string) {
  const { error } = await dienst.rpc("link_auth_user", {
    p_member_id: memberId,
    p_auth_user_id: authUserId,
  });
  if (error) throw new Error(`link_auth_user: ${error.message}`);
}

class Ratenlimit extends Error {}

function istRatenlimit(fehler: { status?: number | undefined; code?: string | undefined }): boolean {
  return fehler?.status === 429 || (fehler?.code ?? "").startsWith("over_");
}

/** Fuehrt eine Massnahme aus. Liefert, was im Bericht stehen soll. */
async function fuehreAus(
  dienst: SupabaseClient,
  m: Massnahme,
  siteUrl: string | null,
): Promise<string> {
  switch (m.art) {
    case "verknuepfen":
      await verknuepfe(dienst, m.mitglied.id, m.authUserId);
      return "verknüpft";

    case "still_anlegen": {
      // Ohne Passwort: das Konto existiert, ist aber erst nach
      // „Passwort vergessen“ benutzbar. Keine Mail an die Testadresse.
      const { data, error } = await dienst.auth.admin.createUser({
        email: m.email,
        email_confirm: true,
        user_metadata: { member_id: m.mitglied.id },
      });
      if (error) {
        if (istRatenlimit(error)) throw new Ratenlimit(error.message);
        const vorhanden = await findeBenutzer(dienst, m.email);
        if (!vorhanden) throw new Error(error.message);
        await verknuepfe(dienst, m.mitglied.id, vorhanden);
        return "Konto gab es schon, verknüpft";
      }
      await verknuepfe(dienst, m.mitglied.id, data.user.id);
      return "still angelegt";
    }

    case "einladen": {
      const { data, error } = await dienst.auth.admin.inviteUserByEmail(m.email, {
        redirectTo: `${siteUrl}/passwort-setzen`,
        data: { member_id: m.mitglied.id },
      });
      if (error) {
        if (istRatenlimit(error)) throw new Ratenlimit(error.message);
        // Wie in member-login: gibt es das Konto schon, verbinden statt neu einladen.
        const vorhanden = await findeBenutzer(dienst, m.email);
        if (!vorhanden) throw new Error(error.message);
        await verknuepfe(dienst, m.mitglied.id, vorhanden);
        return "Konto gab es schon, verknüpft";
      }
      await verknuepfe(dienst, m.mitglied.id, data.user.id);
      return "eingeladen";
    }

    default:
      return "übersprungen";
  }
}

function zeile(m: Massnahme): string {
  const email = "email" in m ? m.email : "–";
  const zusatz = m.art === "vergeben" ? `  (Konto gehört ${m.anderesMitglied})` : "";
  return `    ${m.mitglied.name.padEnd(32)} ${email}${zusatz}`;
}

async function bestaetigt(ziel: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const antwort = await rl.question(
    `\nAusführen gegen ${ziel}? Es werden echte Mails verschickt. Zum Fortfahren „ja“ eingeben: `,
  );
  rl.close();
  return antwort.trim().toLowerCase() === "ja";
}

async function main() {
  const supabaseUrl = umgebung("SUPABASE_URL");
  const dienstSchluessel = umgebung("SUPABASE_SERVICE_ROLE_KEY");
  const dbUrl = umgebung("SUPABASE_DB_URL");
  const ziel = new URL(supabaseUrl).host;

  if (!gleichesProjekt(supabaseUrl, dbUrl)) {
    throw new Error(
      "SUPABASE_URL und SUPABASE_DB_URL zeigen auf verschiedene Projekte. Abbruch, es wurde nichts geschrieben.",
    );
  }
  if (!Number.isFinite(PAUSE_MAIL_MS) || PAUSE_MAIL_MS < 0) throw new Error("--pause braucht Millisekunden.");
  if (Number.isNaN(MAX_MAILS) || MAX_MAILS < 0) throw new Error("--max braucht eine Anzahl.");

  console.warn(
    optionen.ausfuehren
      ? `Logins nachziehen gegen ${ziel}. AUSFÜHREN.\n`
      : `Logins nachziehen gegen ${ziel}. Probelauf, es wird nichts geschrieben.\n`,
  );

  const sql = postgres(dbUrl, { max: 1, onnotice: () => {} });
  let mitglieder: MitgliedOhneLogin[];
  let verknuepfungen: Verknuepfung[];
  try {
    // Archivierte bleiben aussen vor – sie bekommen keinen Zugang (wie in member-login).
    mitglieder = await sql<MitgliedOhneLogin[]>`
      select m.id,
             m.first_name || ' ' || m.last_name as name,
             m.email::text as email,
             coalesce(public.ist_testadresse(m.email::text), false) as "istTestadresse"
        from public.members m
       where m.auth_user_id is null
         and m.status <> 'archived'
       order by m.last_name, m.first_name`;
    verknuepfungen = await sql<Verknuepfung[]>`
      select m.id as "memberId",
             m.first_name || ' ' || m.last_name as name,
             m.auth_user_id as "authUserId"
        from public.members m
       where m.auth_user_id is not null`;
  } finally {
    await sql.end();
  }

  const dienst = createClient(supabaseUrl, dienstSchluessel, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const konten = await alleKonten(dienst);

  const massnahmen = teileEin(mitglieder, konten, verknuepfungen);
  const gruppen = gruppiere(massnahmen);

  console.warn(`Mitglieder ohne Login (nicht archiviert): ${mitglieder.length}`);
  console.warn(`Konten in auth.users:                     ${konten.length}\n`);
  for (const art of REIHENFOLGE) {
    console.warn(`  ${BESCHRIFTUNG[art].padEnd(44)} ${gruppen[art].length}`);
  }

  if (!optionen.ausfuehren) {
    for (const art of REIHENFOLGE) {
      if (gruppen[art].length === 0) continue;
      console.warn(`\n  ${BESCHRIFTUNG[art]}:`);
      for (const m of gruppen[art]) console.warn(zeile(m));
    }
    console.warn("\nProbelauf beendet. Mit --ausfuehren werden Konten angelegt und Einladungen verschickt.");
    return;
  }

  // Ab hier wird geschrieben.
  let siteUrl: string | null = null;
  if (gruppen.einladen.length > 0) {
    siteUrl = umgebung("SITE_URL").replace(/\/+$/, "");
    console.warn(`\n  Einladungslinks führen auf ${siteUrl}/passwort-setzen`);
  }

  if (!istLokal(supabaseUrl) && !optionen.ja && !(await bestaetigt(ziel))) {
    console.warn("Abgebrochen, es wurde nichts geschrieben.");
    return;
  }

  const erledigt: string[] = [];
  const fehler: string[] = [];
  let liegenGeblieben: Massnahme[] = [];
  let mails = 0;

  const abzuarbeiten = [...gruppen.verknuepfen, ...gruppen.still_anlegen, ...gruppen.einladen];
  for (const [i, m] of abzuarbeiten.entries()) {
    if (m.art === "einladen" && mails >= MAX_MAILS) {
      liegenGeblieben = abzuarbeiten.slice(i);
      break;
    }
    try {
      const ergebnis = await fuehreAus(dienst, m, siteUrl);
      erledigt.push(`${zeile(m)}  → ${ergebnis}`);
    } catch (e) {
      if (e instanceof Ratenlimit) {
        console.error(`\nRatenlimit erreicht (${e.message}). Der Rest bleibt für den nächsten Lauf.`);
        liegenGeblieben = abzuarbeiten.slice(i);
        break;
      }
      fehler.push(`${zeile(m)}  → ${e instanceof Error ? e.message : String(e)}`);
    }
    if (m.art === "einladen") {
      mails++;
      await warte(PAUSE_MAIL_MS);
    } else {
      await warte(PAUSE_STILL_MS);
    }
  }

  console.warn(`\nBericht`);
  console.warn(`  erledigt          ${erledigt.length}`);
  console.warn(`  fehlgeschlagen    ${fehler.length}`);
  console.warn(`  liegen geblieben  ${liegenGeblieben.length}`);
  console.warn(`  von Hand          ${gruppen.vergeben.length + gruppen.ohne_email.length}`);

  if (erledigt.length) console.warn(`\n  Erledigt:\n${erledigt.join("\n")}`);
  if (fehler.length) console.warn(`\n  Fehlgeschlagen (nächster Lauf versucht es erneut):\n${fehler.join("\n")}`);
  if (liegenGeblieben.length) {
    console.warn(`\n  Liegen geblieben (nächster Lauf):\n${liegenGeblieben.map(zeile).join("\n")}`);
  }
  if (gruppen.vergeben.length) {
    console.warn(
      `\n  Adresse gehört schon zu anderem Mitglied – Vorstand muss eine eigene Adresse eintragen:\n` +
        gruppen.vergeben.map(zeile).join("\n"),
    );
  }
  if (gruppen.ohne_email.length) {
    console.warn(
      `\n  Ohne E-Mail – Vorstand muss eine Adresse nachpflegen, dann erneut laufen lassen:\n` +
        gruppen.ohne_email.map(zeile).join("\n"),
    );
  }

  if (fehler.length) process.exitCode = 1;
}

main().catch((fehler: unknown) => {
  console.error(fehler instanceof Error ? fehler.message : fehler);
  process.exit(1);
});
