import { expect } from "@playwright/test";

/**
 * Das Postfach des lokalen Stacks lesen (T7).
 *
 * Lokal und in der CI fängt Mailpit jede Mail ab, die Auth verschickt
 * (supabase/config.toml, [inbucket]). Über seine HTTP-Schnittstelle lassen
 * sich Einladung und „Passwort vergessen“ bis zum Klick auf den Link prüfen,
 * ohne ein echtes Postfach. Gegen Dev oder Prod gibt es kein Mailpit; die
 * E2E laufen dort ohnehin nicht (nur-lokal.ts).
 */

const MAILPIT = (process.env.MAILPIT_URL ?? "http://127.0.0.1:54324").replace(/\/$/, "");

export interface Mail {
  id: string;
  betreff: string;
  html: string;
  text: string;
}

async function holeJson<T>(pfad: string, init?: RequestInit): Promise<T> {
  const antwort = await fetch(`${MAILPIT}${pfad}`, init);
  if (!antwort.ok) throw new Error(`Mailpit ${pfad}: ${antwort.status}`);
  return (await antwort.json()) as T;
}

/** Die Kennungen aller Mails an eine Adresse, die jüngste zuerst. */
async function kennungen(email: string): Promise<string[]> {
  const suche = await holeJson<{ messages?: { ID: string }[] }>(
    `/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
  );
  return (suche.messages ?? []).map((m) => m.ID);
}

/** Alle Mails an eine Adresse, die jüngste zuerst. */
export async function mailsAn(email: string): Promise<Mail[]> {
  const mails: Mail[] = [];
  for (const id of await kennungen(email)) {
    const m = await holeJson<{ Subject: string; HTML: string; Text: string }>(`/api/v1/message/${id}`);
    mails.push({ id, betreff: m.Subject, html: m.HTML ?? "", text: m.Text ?? "" });
  }
  return mails;
}

/**
 * Wartet, bis mindestens `anzahl` Mails an die Adresse da sind, und gibt alle
 * zurück, die jüngste zuerst. Auth verschickt asynchron; ein sofortiger Blick
 * ins Postfach fände oft noch nichts.
 */
export async function warteAufMails(email: string, anzahl = 1): Promise<Mail[]> {
  let mails: Mail[] = [];
  await expect
    .poll(
      async () => {
        mails = await mailsAn(email);
        return mails.length;
      },
      { timeout: 20_000, message: `Mails an ${email} in Mailpit` },
    )
    .toBeGreaterThanOrEqual(anzahl);
  return mails;
}

/** Leert das Postfach einer Adresse, damit ein Test bei null beginnt. */
export async function leerePostfach(email: string): Promise<void> {
  const ids = await kennungen(email);
  if (ids.length === 0) return;
  await fetch(`${MAILPIT}/api/v1/messages`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ IDs: ids }),
  });
}

/**
 * Der Link aus einer Mail von Auth. Die Vorlagen verlinken direkt auf
 * /passwort-setzen?token_hash=…&type=invite bzw. type=recovery (S20).
 */
export function mailLink(mail: Mail, typ: "invite" | "recovery"): string {
  const links = [...mail.html.matchAll(/href="([^"]*token_hash=[^"]*)"/g)].map((t) =>
    t[1]!.replace(/&amp;/g, "&"),
  );
  const link = links.find((l) => new URL(l).searchParams.get("type") === typ);
  if (!link) throw new Error(`Kein ${typ}-Link in der Mail „${mail.betreff}“: ${links.join(", ") || "keiner"}`);
  return link;
}
