/**
 * Was der Link aus der E-Mail mitbringt
 *
 * Einladung und "Passwort vergessen" kommen als ?token_hash=…&type=… an (siehe
 * supabase/templates). Die App loest den Hash selbst mit verifyOtp ein.
 *
 * Uebergang: Solange die Cloud-Vorlagen noch {{ .ConfirmationURL }} schicken,
 * kommt die fertige Sitzung im Fragment (#access_token=…&refresh_token=…).
 * Die nimmt die App vorerst weiter an, genau wie das Web - sonst brechen die
 * Links, je nachdem ob zuerst der Build oder die Vorlage wechselt. Einen
 * solchen Link kann aber jeder mit seinem eigenen Konto bauen und einem
 * anderen unterschieben (Login-CSRF, Befund S20). Sobald die Cloud-Vorlagen
 * umgestellt sind, faellt der Zweig in App und Web gemeinsam weg
 * (docs/goLive.md).
 */

import type { EmailOtpType } from "@supabase/supabase-js";

/** Nur diese beiden Mails fuehren nach passwort-setzen. */
const TYPEN = ["invite", "recovery"] as const satisfies readonly EmailOtpType[];
export type LinkTyp = (typeof TYPEN)[number];

export type LinkInhalt =
  | { art: "token"; tokenHash: string; typ: LinkTyp }
  | { art: "fragment"; accessToken: string; refreshToken: string }
  | { art: "ungueltig" }
  | { art: "ohne" };

type Parameter = Record<string, string | string[] | undefined>;

function einzeln(wert: string | string[] | undefined): string | undefined {
  return Array.isArray(wert) ? wert[0] : wert;
}

/** Das Fragment einer Adresse, ohne "#". */
function fragmentAus(adresse: string | null | undefined): string {
  if (!adresse?.includes("#")) return "";
  return adresse.slice(adresse.indexOf("#") + 1);
}

/**
 * Expo Router legt das Fragment unter dem Parameter "#" ab. Kommt es dort
 * nicht an, hilft die rohe Adresse aus expo-linking.
 */
export function linkAuswerten(parameter: Parameter, adresse?: string | null): LinkInhalt {
  const tokenHash = einzeln(parameter.token_hash);
  const typ = einzeln(parameter.type);

  if (tokenHash) {
    if (typ && (TYPEN as readonly string[]).includes(typ)) {
      return { art: "token", tokenHash, typ: typ as LinkTyp };
    }
    return { art: "ungueltig" };
  }

  const fragment = new URLSearchParams(einzeln(parameter["#"]) || fragmentAus(adresse));
  const accessToken = fragment.get("access_token");
  const refreshToken = fragment.get("refresh_token");
  if (accessToken && refreshToken) return { art: "fragment", accessToken, refreshToken };

  // Supabase meldet Fehler wie einen abgelaufenen Link als Abfrage oder im Fragment.
  if (einzeln(parameter.error) || einzeln(parameter.error_code) || fragment.get("error")) {
    return { art: "ungueltig" };
  }
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
