/**
 * Weist sich der Aufrufer einer Edge Function mit dem Dienstschlüssel aus?
 *
 * Wie die Mailvorlage hier und nicht neben den Functions, damit es testbar
 * ist. Neben supabase/functions/notification-mails und notification-pushes
 * liegt je ein Symlink hierher. Keine Importe: die Functions laufen in Deno.
 *
 * Zwei Wege führen zu "ja":
 *
 *   1. Das Token ist wörtlich SUPABASE_SERVICE_ROLE_KEY aus der Umgebung der
 *      Function. Verglichen wird zeitkonstant, damit die Antwortzeit nichts
 *      über den Schlüssel verrät.
 *   2. Das Token behauptet die Rolle service_role, und Auth bestätigt das. Den
 *      Weg braucht es, weil Supabase die Schlüssel umstellt (alter
 *      JWT-Schlüssel neben neuen sb_secret_…): dann steht in der Umgebung der
 *      Function ein anderer gültiger Dienstschlüssel als im Vault des
 *      Zeitgebers. Die Rolle allein aus der Nutzlast zu lesen genügt nicht -
 *      die Signatur prüft hier niemand, und auf verify_jwt am Tor verlassen
 *      wir uns nicht (S3). Also prüft Auth die Signatur: die Admin-Schnittstelle
 *      antwortet nur einem echten Dienstschlüssel.
 */

/** Das Nötigste von fetch, damit der Test ohne Netz auskommt. */
export type Holen = (
  adresse: string,
  init: { method: string; headers: Record<string, string> },
) => Promise<{ ok: boolean }>;

export interface Dienstumgebung {
  /** SUPABASE_URL aus der Umgebung der Function */
  supabaseUrl: string;
  /** SUPABASE_SERVICE_ROLE_KEY aus der Umgebung der Function */
  dienstschluessel: string;
  holen: Holen;
}

/** Vergleich ohne frühen Abbruch: die Laufzeit hängt nicht davon ab, wo sich a und b unterscheiden. */
export function gleichZeitkonstant(a: string, b: string): boolean {
  let unterschied = a.length ^ b.length;
  const laenge = Math.max(a.length, b.length);
  for (let i = 0; i < laenge; i++) {
    unterschied |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return unterschied === 0;
}

/** Steht in der Nutzlast role = service_role? Ungeprüft - nur die Vorauswahl. */
export function behauptetDienstrolle(token: string): boolean {
  const teile = token.split(".");
  if (teile.length !== 3) return false;
  try {
    const teil = teile[1]!.replace(/-/g, "+").replace(/_/g, "/");
    const nutzlast = JSON.parse(atob(teil.padEnd(Math.ceil(teil.length / 4) * 4, "=")));
    return nutzlast?.role === "service_role";
  } catch {
    return false;
  }
}

export async function istDienstschluessel(token: string, umgebung: Dienstumgebung): Promise<boolean> {
  if (!token) return false;
  if (umgebung.dienstschluessel && gleichZeitkonstant(token, umgebung.dienstschluessel)) return true;

  // Ein Mitglieds-Token geht gar nicht erst zu Auth, das prüft die Function
  // danach über getUser() und am_i_admin. Ein neuer sb_secret_… ist kein JWT,
  // also gibt es nichts zu behaupten - auch ihn prüft Auth.
  if (!token.startsWith("sb_secret_") && !behauptetDienstrolle(token)) return false;

  try {
    const antwort = await umgebung.holen(
      `${umgebung.supabaseUrl.replace(/\/$/, "")}/auth/v1/admin/users?page=1&per_page=1`,
      { method: "GET", headers: { apikey: token, Authorization: `Bearer ${token}` } },
    );
    return antwort.ok;
  } catch {
    // Auth nicht erreichbar: lieber ein ausgefallener Lauf als ein offenes Tor.
    return false;
  }
}
