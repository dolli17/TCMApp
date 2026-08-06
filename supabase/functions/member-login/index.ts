/**
 * Login-Verwaltung für Mitglieder.
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

type Aktion =
  | "einladen"
  | "passwort_zuruecksetzen"
  | "login_deaktivieren"
  | "login_aktivieren"
  | "login_verknuepfen"
  | "login_entfernen";

interface Anfrage {
  aktion: Aktion;
  memberId: string;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = Deno.env.get("SITE_URL") ?? "http://localhost:3000";

/** Ein Bann, der praktisch nie abläuft – gesperrt bleibt gesperrt, bis jemand aufhebt. */
const BANN_DAUER = "876000h";

function antwort(ok: boolean, meldung: string, status = 200): Response {
  return new Response(JSON.stringify({ ok, meldung }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
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
  if (!aktion || !memberId) {
    return antwort(false, "Die Anfrage ist unvollständig.", 400);
  }

  // 3.: Ab hier mit Service-Schlüssel.
  const alsDienst = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // Die E-Mail kommt aus der Datenbank, nie aus dem Anfragekörper: sonst
  // könnte ein Admin eine Einladung an eine beliebige Adresse schicken und
  // hätte damit einen Zugang zu einem fremden Mitgliedsdatensatz.
  //
  // Gelesen wird über eine RPC statt über die Tabelle: der Service-Schlüssel
  // hat auf `members` bewusst kein SELECT – die Rechtehärtung des Projekts
  // gibt neuen Tabellen erst einmal gar nichts frei. Die Funktion liefert
  // genau die vier Felder, die hier gebraucht werden.
  const { data: gelesen, error: leseFehler } = await alsDienst.rpc("member_for_login_admin", {
    p_member_id: memberId,
  });

  const mitglied = Array.isArray(gelesen) ? gelesen[0] : null;

  if (leseFehler || !mitglied) {
    return antwort(false, "Dieses Mitglied gibt es nicht.", 404);
  }

  try {
    switch (aktion) {
      case "einladen": {
        if (!mitglied.email) {
          return antwort(
            false,
            "Dieses Mitglied hat keine E-Mail-Adresse. Ohne sie ist keine Einladung möglich; bei Kindern übernimmt das der Zahler.",
            400,
          );
        }
        if (mitglied.auth_user_id) {
          return antwort(false, "Dieses Mitglied hat bereits einen Zugang.", 400);
        }
        if (mitglied.status === "archived") {
          return antwort(false, "Archivierte Mitglieder bekommen keinen Zugang.", 400);
        }

        const { data, error } = await alsDienst.auth.admin.inviteUserByEmail(mitglied.email, {
          redirectTo: `${SITE_URL}/passwort-setzen`,
          data: { member_id: mitglied.id },
        });

        if (error) {
          // Gibt es das Konto schon, aber ohne Verknüpfung? Dann verbinden
          // statt neu einzuladen – das ist der häufigste Stolperstein beim
          // Umzug von eBuSy.
          const vorhanden = await findeBenutzer(alsDienst, mitglied.email);
          if (vorhanden) {
            await rpc(alsDienst, "link_auth_user", {
              p_member_id: mitglied.id,
              p_auth_user_id: vorhanden,
            });
            return antwort(
              true,
              "Zu dieser Adresse gab es bereits einen Zugang – er ist jetzt mit dem Mitglied verbunden.",
            );
          }
          return antwort(false, `Die Einladung konnte nicht verschickt werden: ${error.message}`, 400);
        }

        await rpc(alsDienst, "link_auth_user", {
          p_member_id: mitglied.id,
          p_auth_user_id: data.user.id,
        });

        return antwort(true, `Einladung an ${mitglied.email} verschickt.`);
      }

      case "passwort_zuruecksetzen": {
        if (!mitglied.auth_user_id || !mitglied.email) {
          return antwort(false, "Dieses Mitglied hat keinen Zugang.", 400);
        }

        const { error } = await alsDienst.auth.resetPasswordForEmail(mitglied.email, {
          redirectTo: `${SITE_URL}/passwort-setzen`,
        });
        if (error) return antwort(false, error.message, 400);

        return antwort(true, `Der Link zum Zurücksetzen ging an ${mitglied.email}.`);
      }

      case "login_deaktivieren":
      case "login_aktivieren": {
        if (!mitglied.auth_user_id) {
          return antwort(false, "Dieses Mitglied hat keinen Zugang.", 400);
        }

        const sperren = aktion === "login_deaktivieren";

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

      case "login_verknuepfen": {
        if (!mitglied.email) {
          return antwort(false, "Ohne E-Mail-Adresse lässt sich kein Zugang zuordnen.", 400);
        }

        const gefunden = await findeBenutzer(alsDienst, mitglied.email);
        if (!gefunden) {
          return antwort(false, "Zu dieser Adresse gibt es keinen Zugang.", 404);
        }

        await rpc(alsDienst, "link_auth_user", {
          p_member_id: mitglied.id,
          p_auth_user_id: gefunden,
        });

        return antwort(true, "Zugang verbunden.");
      }

      case "login_entfernen": {
        if (!mitglied.auth_user_id) {
          return antwort(false, "Dieses Mitglied hat keinen Zugang.", 400);
        }

        const alt = await rpc<string>(alsDienst, "unlink_auth_user", {
          p_member_id: mitglied.id,
        });

        if (alt) {
          const { error } = await alsDienst.auth.admin.deleteUser(alt);
          if (error) {
            return antwort(
              false,
              `Die Verknüpfung ist gelöst, das Konto ließ sich aber nicht löschen: ${error.message}`,
              400,
            );
          }
        }

        return antwort(true, "Zugang entfernt.");
      }

      default:
        return antwort(false, "Unbekannte Aktion.", 400);
    }
  } catch (fehler) {
    const meldung = fehler instanceof Error ? fehler.message : String(fehler);
    return antwort(false, meldung, 400);
  }
});

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
 * wenn ein Admin ausdrücklich verknüpft.
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
