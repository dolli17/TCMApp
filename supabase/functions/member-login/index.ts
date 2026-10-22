/**
 * Login-Verwaltung für Mitglieder.
 *
 * Jedes Mitglied hat einen Login (CHECK members_login_pflicht). Deshalb läuft
 * hier auch das Anlegen und das Annehmen eines Antrags (zuerst der Login, dann
 * das Mitglied), das Ändern der E-Mail (Mitglied und Login gleich halten) und
 * das Löschen bzw. Anonymisieren (der Login geht mit).
 *
 * Alles, was diese Funktion tut, könnte auch eine Server Action tun — bis auf
 * eines: Konten in `auth.users` anlegen, einladen, sperren und löschen geht nur
 * mit dem Service-Schlüssel. Und der darf die Serverseite nie verlassen, schon
 * gar nicht in ein Next.js-Bundle. Deshalb dieser eine, eng umrissene Ort.
 *
 * Die Reihenfolge ist wesentlich:
 *
 *   1. Das mitgeschickte Token an einen gewöhnlichen Anon-Client geben und
 *      `getUser()` aufrufen. Das prüft Signatur und Ablauf serverseitig. Ein
 *      selbst dekodiertes Token würde nichts beweisen.
 *   2. Mit demselben Client `am_i_admin()` aufrufen — die Berechtigung
 *      entscheidet die Datenbank, nicht eine Liste in dieser Datei.
 *   3. Erst danach den Service-Client erzeugen.
 *
 * Der Kommentar ist auf Deutsch wie der übrige App-Code; die Bezeichner sind
 * englisch wie überall an der Schnittstelle zur Infrastruktur.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
// Symlink auf packages/core/src/adresshinweis.ts, dort unter Test - wie
// mailvorlage.ts in notification-mails.
import { ADRESSHINWEIS_BETREFF, adresshinweisHtml, adresshinweisText } from "./adresshinweis.ts";

type Aktion =
  | "anlegen"
  | "antrag_annehmen"
  | "passwort_zuruecksetzen"
  | "login_deaktivieren"
  | "login_aktivieren"
  | "email_aendern"
  | "loeschen"
  | "einladung_erneut"
  | "einladung_status";

interface Anfrage {
  aktion: Aktion;
  /** Bei allen Aktionen außer `anlegen` und `antrag_annehmen`. */
  memberId?: string;
  /** `anlegen`: die Parameter für create_member. */
  daten?: Record<string, unknown>;
  /** `antrag_annehmen`: der Antrag und die Wahl des Vorstands. */
  antrag?: {
    id: string;
    nummer?: string;
    beitragsart?: string;
    eintritt?: string;
  };
  /** `email_aendern`: die neue Adresse. */
  email?: string;
  /** `loeschen`: endgültig löschen oder anonymisieren. */
  art?: "loeschen" | "anonymisieren";
  /** `loeschen` mit art `loeschen`: der Nachname als Bestätigung. */
  nachname?: string;
  /** `loeschen` mit art `anonymisieren`: der Grund fürs Protokoll. */
  grund?: string;
  /** `einladung_status`: die Mitglieder, deren Einladung interessiert. */
  memberIds?: string[];
}

/**
 * Was beim Anlegen an create_member durchgereicht wird. Alles andere im
 * Anfragekörper fällt weg, insbesondere p_auth_user_id: den Login legt diese
 * Funktion selbst an.
 */
const ANLEGE_PARAMETER = [
  "p_first_name",
  "p_last_name",
  "p_email",
  "p_birthday",
  "p_gender",
  "p_salutation",
  "p_title",
  "p_phone",
  "p_mobile",
  "p_street",
  "p_postcode",
  "p_city",
  "p_country_code",
  "p_notes",
  "p_number",
  "p_started_on",
  "p_fee_type_ids",
] as const;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = Deno.env.get("SITE_URL") ?? "http://localhost:3000";
// Derselbe Versandweg wie notification-mails: Auth verschickt beim Ändern der
// Adresse durch einen Admin selbst keinen Hinweis (adminUserUpdate).
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const MAIL_FROM = Deno.env.get("MAIL_FROM") ?? "TC Muckensturm <noreply@example.org>";

/** Ein Bann, der praktisch nie abläuft – gesperrt bleibt gesperrt, bis jemand aufhebt. */
const BANN_DAUER = "876000h";

function antwort(
  ok: boolean,
  meldung: string,
  status = 200,
  zusatz: Record<string, unknown> = {},
): Response {
  return new Response(JSON.stringify({ ok, meldung, ...zusatz }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Ein Fehler aus einer RPC, die mit dem Token des Aufrufers lief. Code und
 * Details gehen mit, damit das Web sie wie einen direkten RPC-Fehler
 * übersetzen kann (translateDbError).
 */
function dbFehler(error: { message: string; code?: string; details?: string | null }): Response {
  return antwort(false, error.message, 400, { code: error.code, details: error.details });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return antwort(false, "Nur POST.", 405);
  }

  const token = req.headers.get("Authorization");
  if (!token) {
    return antwort(false, "Nicht angemeldet.", 401);
  }

  // 1. + 2.: Identität und Berechtigung prüfen – beides ohne Service-Schlüssel.
  const alsAufrufer = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: token } },
    auth: { persistSession: false },
  });

  const { data: benutzer, error: authFehler } = await alsAufrufer.auth.getUser();
  if (authFehler || !benutzer?.user) {
    return antwort(false, "Nicht angemeldet.", 401);
  }

  const { data: istAdmin, error: rolleFehler } = await alsAufrufer.rpc("am_i_admin");
  if (rolleFehler || istAdmin !== true) {
    return antwort(false, "Zugänge verwalten dürfen nur Administratoren.", 403);
  }

  let anfrage: Anfrage;
  try {
    anfrage = await req.json();
  } catch {
    return antwort(false, "Die Anfrage ist unvollständig.", 400);
  }

  const { aktion, memberId } = anfrage;
  if (!aktion) {
    return antwort(false, "Die Anfrage ist unvollständig.", 400);
  }

  // 3.: Ab hier mit Service-Schlüssel.
  const alsDienst = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  if (aktion === "einladung_status") {
    try {
      return await einladungStatus(alsDienst, anfrage.memberIds ?? []);
    } catch (fehler) {
      return antwort(false, fehler instanceof Error ? fehler.message : String(fehler), 400);
    }
  }

  // Anlegen und Annehmen haben noch kein Mitglied, das sich nachlesen ließe.
  if (aktion === "anlegen" || aktion === "antrag_annehmen") {
    try {
      return aktion === "anlegen"
        ? await anlegen(alsAufrufer, alsDienst, anfrage.daten ?? {})
        : await antragAnnehmen(alsAufrufer, alsDienst, anfrage.antrag);
    } catch (fehler) {
      return antwort(false, fehler instanceof Error ? fehler.message : String(fehler), 400);
    }
  }

  if (!memberId) {
    return antwort(false, "Die Anfrage ist unvollständig.", 400);
  }

  // Die E-Mail kommt aus der Datenbank, nie aus dem Anfragekörper: sonst
  // könnte ein Admin eine Einladung an eine beliebige Adresse schicken und
  // hätte damit einen Zugang zu einem fremden Mitgliedsdatensatz. (Beim
  // Ändern der Adresse schreibt die Funktion sie zuerst über update_member in
  // die Datenbank, mit den Rechten des Aufrufers.)
  //
  // Gelesen wird über eine RPC statt über die Tabelle: der Service-Schlüssel
  // hat auf `members` bewusst kein SELECT – die Rechtehärtung des Projekts
  // gibt neuen Tabellen erst einmal gar nichts frei. Die Funktion liefert
  // genau die vier Felder, die hier gebraucht werden.
  const mitglied = await mitgliedLesen(alsDienst, memberId);
  if (!mitglied) {
    return antwort(false, "Dieses Mitglied gibt es nicht.", 404);
  }

  try {
    switch (aktion) {
      case "passwort_zuruecksetzen": {
        if (!mitglied.auth_user_id || !mitglied.email) {
          return antwort(false, "Dieses Mitglied hat keinen Zugang.", 400);
        }
        if (await istTestadresse(alsDienst, mitglied.email)) {
          return antwort(false, TESTADRESSE, 400);
        }

        const { error } = await alsDienst.auth.resetPasswordForEmail(mitglied.email, {
          redirectTo: `${SITE_URL}/passwort-setzen`,
        });
        if (error) return antwort(false, error.message, 400);

        return antwort(true, `Der Link zum Zurücksetzen ging an ${mitglied.email}.`);
      }

      case "einladung_erneut": {
        if (!mitglied.auth_user_id || !mitglied.email) {
          return antwort(false, "Dieses Mitglied hat keinen Zugang.", 400);
        }
        if (await istTestadresse(alsDienst, mitglied.email)) {
          return antwort(false, TESTADRESSE, 400);
        }

        // Nur, solange das Onboarding offen ist. Danach ist das ein ganz
        // normales Konto, und für ein vergessenes Passwort gibt es
        // "Passwort zurücksetzen". Gelesen mit dem Token des Aufrufers: der
        // Service-Schlüssel hat auf members kein SELECT.
        const { data: zeile, error: leseFehler } = await alsAufrufer
          .from("members")
          .select("onboarding_completed_at")
          .eq("id", mitglied.id)
          .maybeSingle();
        if (leseFehler) return dbFehler(leseFehler);
        if ((zeile as { onboarding_completed_at: string | null } | null)?.onboarding_completed_at) {
          return antwort(
            false,
            "Dieses Mitglied hat sein Konto schon eingerichtet. Für ein neues Passwort gibt es „Passwort zurücksetzen lassen“.",
            400,
          );
        }

        const { data: konto, error: kontoFehler } = await alsDienst.auth.admin.getUserById(
          mitglied.auth_user_id,
        );
        if (kontoFehler || !konto?.user) {
          return antwort(false, kontoFehler?.message ?? "Den Login gibt es nicht mehr.", 400);
        }

        // Der Login bleibt, wie er ist (Login-Pflicht): kein Löschen und neu
        // Anlegen. Lokal mit Mailpit geprüft:
        //  - Unbestätigt (Link nie geöffnet): inviteUserByEmail schickt für
        //    den bestehenden Login eine neue Einladung. Der alte Link verfällt.
        //  - Bestätigt, aber nicht fertig (Link geöffnet, kein Passwort oder
        //    Onboarding abgebrochen): eine zweite Einladung lehnt Supabase ab
        //    ("already been registered"). Dann ein Recovery-Link, der auf
        //    dieselbe Seite /passwort-setzen führt.
        const bestaetigt = Boolean(konto.user.email_confirmed_at);
        const { error } = bestaetigt
          ? await alsDienst.auth.resetPasswordForEmail(mitglied.email, {
              redirectTo: `${SITE_URL}/passwort-setzen`,
            })
          : await alsDienst.auth.admin.inviteUserByEmail(mitglied.email, {
              redirectTo: `${SITE_URL}/passwort-setzen`,
            });
        if (error) return antwort(false, error.message, 400);

        return antwort(
          true,
          `Ein neuer Einladungslink ging an ${mitglied.email}. Der bisherige Link gilt nicht mehr.`,
        );
      }

      case "login_deaktivieren":
      case "login_aktivieren": {
        if (!mitglied.auth_user_id) {
          return antwort(false, "Dieses Mitglied hat keinen Zugang.", 400);
        }

        const sperren = aktion === "login_deaktivieren";
        if (sperren && !(await bleibtEinAdmin(alsAufrufer, mitglied.id))) {
          return antwort(false, LETZTER_ADMIN, 400);
        }

        // Gesperrt wird, nicht gelöscht: eine Sperre lässt sich zurücknehmen,
        // ein gelöschtes Konto nicht.
        const { error } = await alsDienst.auth.admin.updateUserById(mitglied.auth_user_id, {
          ban_duration: sperren ? BANN_DAUER : "none",
        });
        if (error) return antwort(false, error.message, 400);

        await rpc(alsDienst, "set_login_disabled", {
          p_member_id: mitglied.id,
          p_disabled: sperren,
        });

        return antwort(true, sperren ? "Zugang gesperrt." : "Zugang wieder freigegeben.");
      }

      case "email_aendern": {
        const neu = (anfrage.email ?? "").trim().toLowerCase();
        if (!neu) {
          return antwort(false, "Ohne E-Mail-Adresse geht es nicht.", 400);
        }
        if (neu === (mitglied.email ?? "").toLowerCase()) {
          return antwort(true, "Die E-Mail-Adresse ist unverändert.");
        }

        // Erst die Datenbank: dort sitzen Rechte, Eindeutigkeit und die
        // E-Mail-Pflicht. Was sie ablehnt, erreicht den Login gar nicht.
        const { error: dbError } = await alsAufrufer.rpc("update_member", {
          p_member_id: mitglied.id,
          p_patch: { email: neu },
        });
        if (dbError) return dbFehler(dbError);

        if (mitglied.auth_user_id) {
          const { error } = await alsDienst.auth.admin.updateUserById(mitglied.auth_user_id, {
            email: neu,
            email_confirm: true,
          });

          if (error) {
            // Zurück auf die alte Adresse, damit Mitglied und Login nicht
            // auseinanderlaufen – genau das soll diese Aktion verhindern.
            const { error: zurueckFehler } = await alsAufrufer.rpc("update_member", {
              p_member_id: mitglied.id,
              p_patch: { email: mitglied.email },
            });
            if (zurueckFehler) {
              // B20: Dann stimmen beide nicht mehr überein, und genau das
              // muss der Admin erfahren.
              return antwort(
                false,
                `Die neue Adresse steht jetzt beim Mitglied, die Anmeldung läuft aber weiter über die alte. ` +
                  `Bitte die Adresse noch einmal speichern. (${error.message}; ${zurueckFehler.message})`,
                400,
                { teilweise: true },
              );
            }
            return antwort(
              false,
              `Die Adresse ließ sich im Login nicht ändern, deshalb bleibt die alte: ${error.message}`,
              400,
            );
          }
        }

        // Ohne Login sind nur Archivierte: dort gibt es keine Anmeldung.
        const gespeichert = mitglied.auth_user_id
          ? "E-Mail-Adresse gespeichert, auch für die Anmeldung."
          : "E-Mail-Adresse gespeichert.";

        // S18: Die alte Adresse erfährt davon. Die Änderung selbst ist da schon
        // durch; scheitert nur der Hinweis, sagt die Meldung genau das (B20).
        const hinweis = await hinweisAnAlteAdresse(alsDienst, mitglied);
        if (hinweis === null) return antwort(true, gespeichert);
        return antwort(true, `${gespeichert} ${hinweis}`, 200, { teilweise: true, hinweis });
      }

      case "loeschen": {
        const anonymisieren = anfrage.art === "anonymisieren";
        if (!(await bleibtEinAdmin(alsAufrufer, mitglied.id))) {
          return antwort(false, LETZTER_ADMIN, 400);
        }

        // Die Datenbank entscheidet, ob das geht: Rechte, Bestätigung über den
        // Nachnamen, Buchhaltung. Erst danach geht der Login.
        const { error: dbError } = anonymisieren
          ? await alsAufrufer.rpc("anonymize_member", {
              p_member_id: mitglied.id,
              p_reason: anfrage.grund || undefined,
            })
          : await alsAufrufer.rpc("delete_member", {
              p_member_id: mitglied.id,
              p_confirm_name: anfrage.nachname ?? "",
            });
        if (dbError) return dbFehler(dbError);

        const erledigt = anonymisieren
          ? "Mitglied anonymisiert. Die Buchhaltung bleibt vollständig."
          : "Mitglied gelöscht.";

        if (mitglied.auth_user_id) {
          const { error } = await alsDienst.auth.admin.deleteUser(mitglied.auth_user_id);
          if (error) {
            return antwort(
              false,
              `${erledigt} Der Login ließ sich aber nicht löschen: ${error.message}`,
              400,
            );
          }
        }

        return antwort(true, erledigt);
      }

      default:
        return antwort(false, "Unbekannte Aktion.", 400);
    }
  } catch (fehler) {
    const meldung = fehler instanceof Error ? fehler.message : String(fehler);
    return antwort(false, meldung, 400);
  }
});

interface Mitglied {
  id: string;
  email: string | null;
  auth_user_id: string | null;
  status: string;
  name: string;
}

async function mitgliedLesen(
  client: ReturnType<typeof createClient>,
  memberId: string,
): Promise<Mitglied | null> {
  const { data, error } = await client.rpc("member_for_login_admin", { p_member_id: memberId });
  if (error || !Array.isArray(data) || !data[0]) return null;
  return data[0] as Mitglied;
}

/**
 * Mitglied anlegen, und zwar nur zusammen mit seinem Login.
 *
 * Zuerst entsteht der Login, dann ruft die Funktion create_member mit dem
 * Token des Aufrufers und gibt den Login als p_auth_user_id mit. Rechte und
 * Prüfungen (Pflichtfelder, Eindeutigkeit, Login-Pflicht) bleiben so in der
 * Datenbank, und ein Mitglied ohne Login entsteht nie. Scheitert
 * create_member, wird ein hier neu angelegter Login wieder gelöscht.
 */
async function anlegen(
  alsAufrufer: ReturnType<typeof createClient>,
  alsDienst: ReturnType<typeof createClient>,
  daten: Record<string, unknown>,
): Promise<Response> {
  const parameter: Record<string, unknown> = {};
  for (const name of ANLEGE_PARAMETER) {
    if (daten[name] !== undefined && daten[name] !== null && daten[name] !== "") {
      parameter[name] = daten[name];
    }
  }

  // Was die Datenbank ohnehin ablehnen würde, prüfen wir vor der Einladung:
  // sonst ginge eine Mail für ein Mitglied raus, das es nie gibt.
  const email = String(parameter.p_email ?? "").trim().toLowerCase();
  if (!email) return antwort(false, "Ohne E-Mail-Adresse kann kein Mitglied angelegt werden.", 400);
  if (!String(parameter.p_first_name ?? "").trim() || !String(parameter.p_last_name ?? "").trim()) {
    return antwort(false, "Vor- und Nachname sind Pflicht.", 400);
  }
  parameter.p_email = email;

  let login: Login;
  try {
    login = await loginAnlegen(alsAufrufer, alsDienst, email);
  } catch (fehler) {
    const grund = fehler instanceof Error ? fehler.message : String(fehler);
    return antwort(false, `Das Mitglied wurde nicht angelegt, weil der Login nicht eingerichtet werden konnte: ${grund}`, 400);
  }

  const { data: id, error } = await alsAufrufer.rpc("create_member", {
    ...parameter,
    p_auth_user_id: login.id,
  });

  if (error || typeof id !== "string") {
    await loginVerwerfen(alsDienst, login);
    return error ? dbFehler(error) : antwort(false, "Das Mitglied wurde nicht angelegt.", 400);
  }

  return antwort(true, login.meldung, 200, { id });
}

/**
 * Einen Mitgliedsantrag annehmen, samt Login.
 *
 * Dieselbe Reihenfolge wie beim Anlegen: zuerst der Login, dann
 * accept_membership_application mit p_auth_user_id. Die RPC läuft in einer
 * Transaktion. Scheitert sie, bleibt der Antrag offen, es gibt kein Mitglied
 * und keine übertragenen Einwilligungen, und der Login wird wieder gelöscht.
 */
async function antragAnnehmen(
  alsAufrufer: ReturnType<typeof createClient>,
  alsDienst: ReturnType<typeof createClient>,
  antrag: Anfrage["antrag"],
): Promise<Response> {
  if (!antrag?.id) return antwort(false, "Die Anfrage ist unvollständig.", 400);

  // Die Adresse kommt aus dem Antrag in der Datenbank, nicht aus der Anfrage.
  // Gelesen mit dem Token des Aufrufers (RLS: nur Administratoren). Ein schon
  // bearbeiteter Antrag fällt hier auf, bevor irgendeine Mail rausgeht.
  const { data: gelesen, error: leseFehler } = await alsAufrufer
    .from("membership_applications")
    .select("email, status")
    .eq("id", antrag.id)
    .maybeSingle();
  if (leseFehler) return dbFehler(leseFehler);
  const offen = gelesen as { email: string | null; status: string } | null;
  if (!offen) return antwort(false, "Diesen Antrag gibt es nicht.", 404);
  if (offen.status !== "new") return antwort(false, "Dieser Antrag wurde bereits bearbeitet.", 400);
  const email = String(offen.email ?? "").trim().toLowerCase();
  if (!email) return antwort(false, "Der Antrag hat keine E-Mail-Adresse.", 400);

  let login: Login;
  try {
    login = await loginAnlegen(alsAufrufer, alsDienst, email);
  } catch (fehler) {
    const grund = fehler instanceof Error ? fehler.message : String(fehler);
    return antwort(
      false,
      `Der Antrag wurde nicht angenommen, weil der Login nicht eingerichtet werden konnte: ${grund}. Der Antrag bleibt offen.`,
      400,
    );
  }

  const { data, error } = await alsAufrufer.rpc("accept_membership_application", {
    p_application_id: antrag.id,
    p_number: antrag.nummer || undefined,
    // Ein leeres Array heißt „später festlegen“, ohne Angabe nähme die RPC den Wunsch aus dem Antrag.
    p_fee_type_ids: antrag.beitragsart ? [antrag.beitragsart] : [],
    p_started_on: antrag.eintritt || undefined,
    p_auth_user_id: login.id,
  });

  const zeile = Array.isArray(data) ? data[0] : null;
  if (error || !zeile?.member_id) {
    await loginVerwerfen(alsDienst, login);
    return error ? dbFehler(error) : antwort(false, "Der Antrag wurde nicht angenommen.", 400);
  }

  return antwort(
    true,
    `Aufgenommen unter der Nummer ${zeile.membership_number ?? "—"}. ${login.meldung}`,
    200,
    { id: zeile.member_id },
  );
}

/**
 * Wo die Einladung der genannten Mitglieder steht: bestätigt, letzte
 * Anmeldung und wann der letzte Link (Einladung oder Recovery) rausging.
 * Das steht nur in auth.users, und dorthin kommt nur der Service-Schlüssel.
 * Die Verwaltung fragt das nur für Mitglieder mit offenem Onboarding ab -
 * im Alltag eine Handvoll.
 */
async function einladungStatus(
  alsDienst: ReturnType<typeof createClient>,
  memberIds: string[],
): Promise<Response> {
  if (!Array.isArray(memberIds) || memberIds.length > 200) {
    return antwort(false, "Die Anfrage ist unvollständig.", 400);
  }
  const status: Record<
    string,
    { bestaetigt: boolean; angemeldet_am: string | null; gesendet_am: string | null }
  > = {};

  await Promise.all(
    memberIds.map(async (id) => {
      const mitglied = await mitgliedLesen(alsDienst, id);
      if (!mitglied?.auth_user_id) return;
      const { data } = await alsDienst.auth.admin.getUserById(mitglied.auth_user_id);
      const u = data?.user;
      if (!u) return;
      const zeiten = [u.invited_at, u.recovery_sent_at, u.confirmation_sent_at].filter(
        (z): z is string => Boolean(z),
      );
      status[id] = {
        bestaetigt: Boolean(u.email_confirmed_at),
        angemeldet_am: u.last_sign_in_at ?? null,
        gesendet_am: zeiten.sort().at(-1) ?? null,
      };
    }),
  );

  return antwort(true, "Erledigt.", 200, { status });
}

interface Login {
  id: string;
  /** Neu angelegt (und damit beim Scheitern wieder zu löschen)? */
  neu: boolean;
  meldung: string;
}

/**
 * Den Login zu einer Adresse anlegen.
 *
 * Echte Adressen bekommen eine Einladung. An Testadressen (z. B.
 * @example.org) geht keine Mail: dort entsteht das Konto still und bestätigt,
 * ohne Passwort. So lässt sich auch lokal und mit dem Seed jedes Mitglied
 * anlegen, ohne dass die Rücklaufquote beim Mailversand leidet.
 *
 * Gibt es zur Adresse schon ein Konto, wird es übernommen, sofern es kein
 * Kiosk-Gerät ist (O25). Ob es schon einem anderen Mitglied gehört, prüft
 * create_member. Wirft, wenn kein Login zustande kommt.
 */
async function loginAnlegen(
  alsAufrufer: ReturnType<typeof createClient>,
  alsDienst: ReturnType<typeof createClient>,
  email: string,
): Promise<Login> {
  const test = await istTestadresse(alsDienst, email);

  const { data, error } = test
    ? await alsDienst.auth.admin.createUser({ email, email_confirm: true })
    : await alsDienst.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${SITE_URL}/passwort-setzen`,
      });

  if (!error && data?.user) {
    return {
      id: data.user.id,
      neu: true,
      meldung: test
        ? `Zugang für ${email} eingerichtet. Das ist eine Testadresse, deshalb ging keine Einladung raus.`
        : `Einladung an ${email} verschickt.`,
    };
  }

  // Gibt es das Konto schon, aber ohne Mitglied? Dann übernehmen statt neu
  // einzuladen – das ist der häufigste Stolperstein beim Umzug von eBuSy.
  const vorhanden = await findeBenutzer(alsDienst, email);
  if (vorhanden) {
    if (await istKiosk(alsAufrufer, vorhanden)) {
      throw new Error("Zu dieser Adresse gibt es ein Kiosk-Konto. Es lässt sich keinem Mitglied zuordnen.");
    }
    return {
      id: vorhanden,
      neu: false,
      meldung: "Zu dieser Adresse gab es bereits einen Zugang – er ist jetzt mit dem Mitglied verbunden.",
    };
  }

  throw new Error(`Die Einladung konnte nicht verschickt werden: ${error?.message ?? "unbekannt"}`);
}

/** Einen Login wieder löschen, aber nur, wenn er eben erst entstanden ist. */
async function loginVerwerfen(
  alsDienst: ReturnType<typeof createClient>,
  login: Login,
): Promise<void> {
  if (login.neu) await alsDienst.auth.admin.deleteUser(login.id);
}

/**
 * Gehört das Konto einem Kiosk-Gerät? (O25) Gelesen mit dem Token des
 * Aufrufers: Administratoren sehen die Geräte, der Service-Schlüssel hat auf
 * public-Tabellen bewusst kein SELECT. link_auth_user und create_member
 * weisen Kiosk-Konten zusätzlich selbst ab.
 */
async function istKiosk(
  alsAufrufer: ReturnType<typeof createClient>,
  authUserId: string,
): Promise<boolean> {
  const { data, error } = await alsAufrufer
    .from("kiosk_devices")
    .select("id")
    .eq("auth_user_id", authUserId)
    .limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

const LETZTER_ADMIN = "Es muss mindestens ein Admin bleiben.";

/**
 * Bleibt nach dem Sperren oder Entfernen dieses Mitglieds noch jemand, der
 * den Verein verwalten kann? (S18) Gezählt wird, wer volle Rechte hat
 * (admin oder board, wie private.has_full_rights) und sich auch anmelden
 * kann: mit Login, nicht gesperrt, nicht archiviert. Ist das Mitglied selbst
 * keiner davon, ändert sich an der Zahl nichts.
 *
 * Gelesen mit dem Token des Aufrufers: Administratoren sehen Rollen und
 * Mitglieder, der Service-Schlüssel hat auf public-Tabellen kein SELECT.
 * Fehler werfen, statt im Zweifel zu sperren.
 */
async function bleibtEinAdmin(
  alsAufrufer: ReturnType<typeof createClient>,
  memberId: string,
): Promise<boolean> {
  const { data: rollen, error: rollenFehler } = await alsAufrufer
    .from("member_roles")
    .select("member_id")
    .in("role", ["admin", "board"]);
  if (rollenFehler) throw new Error(rollenFehler.message);

  const ids = [...new Set((rollen ?? []).map((r) => (r as { member_id: string }).member_id))];
  if (!ids.includes(memberId)) return true;

  const { data: aktive, error } = await alsAufrufer
    .from("members")
    .select("id")
    .in("id", ids)
    .not("auth_user_id", "is", null)
    .is("login_disabled_at", null)
    .neq("status", "archived");
  if (error) throw new Error(error.message);

  const zugang = (aktive ?? []).map((m) => (m as { id: string }).id);
  if (!zugang.includes(memberId)) return true;
  return zugang.some((id) => id !== memberId);
}

/**
 * Der Hinweis an die bisherige Adresse, dass sie nicht mehr gilt (S18).
 * Gibt null zurück, wenn er rausging oder nicht nötig war, sonst den Satz
 * für die Meldung an den Admin. Wirft nie: die Adresse ist da schon geändert.
 */
async function hinweisAnAlteAdresse(
  alsDienst: ReturnType<typeof createClient>,
  mitglied: Mitglied,
): Promise<string | null> {
  const alt = (mitglied.email ?? "").trim();
  if (!alt) return null;

  try {
    if (await istTestadresse(alsDienst, alt)) return null;

    if (!RESEND_API_KEY) {
      // Trockenlauf wie in notification-mails: lokal geht nichts raus.
      console.warn(`Trockenlauf: Hinweis zur geänderten Adresse an ${alt}`);
      return "Der Hinweis an die alte Adresse ging nicht raus: Der Mailversand ist nicht eingerichtet.";
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: MAIL_FROM,
        to: [alt],
        subject: ADRESSHINWEIS_BETREFF,
        html: adresshinweisHtml(mitglied.name, SITE_URL),
        text: adresshinweisText(mitglied.name, SITE_URL),
      }),
    });
    if (!res.ok) throw new Error(`Resend antwortete mit ${res.status}: ${await res.text()}`);
    return null;
  } catch (fehler) {
    const grund = fehler instanceof Error ? fehler.message : String(fehler);
    console.error("Hinweis an die alte Adresse gescheitert:", grund);
    return `Der Hinweis an die alte Adresse ${alt} ließ sich nicht verschicken. Bitte das Mitglied selbst informieren.`;
  }
}

const TESTADRESSE =
  "Das ist eine Testadresse (z. B. @example.org) – dorthin wird keine Mail verschickt. " +
  "Bitte zuerst eine echte E-Mail-Adresse beim Mitglied eintragen.";

/**
 * Geht an diese Adresse keine Mail? Dieselbe Regel wie beim Versand der
 * Benachrichtigungen (public.ist_testadresse, Migration 20260812130000):
 * Mails an reservierte Test-Domains kommen garantiert zurück, und eine hohe
 * Rücklaufquote gefährdet das Absenderkonto bei Resend.
 */
async function istTestadresse(
  client: ReturnType<typeof createClient>,
  email: string,
): Promise<boolean> {
  return (await rpc<boolean>(client, "ist_testadresse", { p_email: email })) === true;
}

/** Ruft eine RPC auf und wirft, wenn sie einen Fehler meldet. */
async function rpc<T = unknown>(
  client: ReturnType<typeof createClient>,
  name: string,
  args: Record<string, unknown>,
): Promise<T | null> {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(error.message);
  return (data ?? null) as T | null;
}

/**
 * Einen Zugang über seine E-Mail-Adresse finden.
 *
 * Die Admin-API hat keinen direkten Filter dafür; sie liefert Seiten. Bei
 * dreihundert Mitgliedern reichen wenige davon, und der Aufruf passiert nur,
 * wenn das Anlegen eines Logins scheitert.
 */
async function findeBenutzer(
  client: ReturnType<typeof createClient>,
  email: string,
): Promise<string | null> {
  const gesucht = email.trim().toLowerCase();

  for (let seite = 1; seite <= 20; seite++) {
    const { data, error } = await client.auth.admin.listUsers({ page: seite, perPage: 200 });
    if (error || !data?.users?.length) return null;

    const treffer = data.users.find((u) => (u.email ?? "").toLowerCase() === gesucht);
    if (treffer) return treffer.id;

    if (data.users.length < 200) return null;
  }
  return null;
}
