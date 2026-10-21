/**
 * Was der Link aus der E-Mail mitbringt
 *
 * Einladung und "Passwort vergessen" kommen als ?token_hash=…&type=… an (siehe
 * supabase/templates). Die App loest den Hash selbst mit verifyOtp ein. Eine
 * fertige Sitzung im Fragment (#access_token=…) nimmt sie bewusst nicht mehr
 * an: Einen solchen Link kann jeder mit seinem eigenen Konto bauen und einem
 * anderen unterschieben, der dann unbemerkt in fremdem Namen angemeldet ist.
 */

import type { EmailOtpType } from "@supabase/supabase-js";

/** Nur diese beiden Mails fuehren nach passwort-setzen. */
const TYPEN = ["invite", "recovery"] as const satisfies readonly EmailOtpType[];
export type LinkTyp = (typeof TYPEN)[number];

export type LinkInhalt =
  | { art: "token"; tokenHash: string; typ: LinkTyp }
  | { art: "ungueltig" }
  | { art: "ohne" };

type Parameter = Record<string, string | string[] | undefined>;

function einzeln(wert: string | string[] | undefined): string | undefined {
  return Array.isArray(wert) ? wert[0] : wert;
}

export function linkAuswerten(parameter: Parameter): LinkInhalt {
  const tokenHash = einzeln(parameter.token_hash);
  const typ = einzeln(parameter.type);

  if (tokenHash) {
    if (typ && (TYPEN as readonly string[]).includes(typ)) {
      return { art: "token", tokenHash, typ: typ as LinkTyp };
    }
    return { art: "ungueltig" };
  }
  // Supabase meldet Fehler wie einen abgelaufenen Link als Abfrage.
  if (einzeln(parameter.error) || einzeln(parameter.error_code)) return { art: "ungueltig" };
  return { art: "ohne" };
}

/** Bricht ab, wenn das Netz nicht antwortet - sonst dreht der Ladekreis ewig. */
export function mitFrist<T>(versprechen: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const uhr = setTimeout(() => reject(new Error("Zeitueberschreitung")), ms);
    versprechen.then(
      (wert) => {
        clearTimeout(uhr);
        resolve(wert);
      },
      (fehler) => {
        clearTimeout(uhr);
        reject(fehler);
      },
    );
  });
}
