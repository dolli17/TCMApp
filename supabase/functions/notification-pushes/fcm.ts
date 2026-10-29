/**
 * Push an Android-Geräte der nativen App, über die FCM-HTTP-v1-API.
 *
 * Angemeldet wird mit einem OAuth2-Zugriffstoken des Dienstkontos: ein
 * RS256-JWT aus dessen privatem Schlüssel, getauscht bei Google gegen ein
 * Token, das eine Stunde gilt. Es bleibt bis fünf Minuten vor Ablauf im
 * Speicher, solange die Edge Runtime die Instanz warm hält.
 */

import { jwtSignieren, schluesselLaden } from "./jwt.ts";
import type { Meldung, Zustellung } from "./zustellung.ts";

export interface FcmKonfiguration {
  projektId: string;
  clientEmail: string;
  privateKey: string;
  tokenUri: string;
}

const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const TOKEN_URI = "https://oauth2.googleapis.com/token";
const PUFFER_MS = 5 * 60 * 1000;

/** Liest FCM_SERVICE_ACCOUNT (die JSON-Datei des Dienstkontos); fehlt oder hakt etwas, gibt es kein FCM. */
export function fcmKonfiguration(json: string | undefined): FcmKonfiguration | null {
  if (!json) return null;
  try {
    const konto = JSON.parse(json) as Record<string, string | undefined>;
    if (!konto.project_id || !konto.client_email || !konto.private_key) return null;
    return {
      projektId: konto.project_id,
      clientEmail: konto.client_email,
      privateKey: konto.private_key,
      tokenUri: konto.token_uri || TOKEN_URI,
    };
  } catch {
    return null;
  }
}

interface FcmFehler {
  error?: {
    code?: number;
    status?: string;
    message?: string;
    details?: { errorCode?: string; fieldViolations?: { field?: string }[] }[];
  };
}

export class Fcm {
  private zugriff: Promise<{ wert: string; bis: number }> | null = null;

  constructor(
    private readonly konf: FcmKonfiguration,
    private readonly holen: typeof fetch = (e, i) => fetch(e, i),
    private readonly jetzt: () => number = Date.now,
  ) {}

  /** Das Zugriffstoken; ein laufender Abruf wird geteilt, nicht verdoppelt. */
  async token(): Promise<string> {
    if (this.zugriff) {
      try {
        const z = await this.zugriff;
        if (this.jetzt() < z.bis) return z.wert;
      } catch {
        // Der letzte Abruf scheiterte: neu versuchen.
      }
    }
    this.zugriff = this.abrufen();
    return (await this.zugriff).wert;
  }

  private async abrufen(): Promise<{ wert: string; bis: number }> {
    const jetzt = this.jetzt();
    const iat = Math.floor(jetzt / 1000);
    const assertion = await jwtSignieren(
      await schluesselLaden(this.konf.privateKey, "RS256"),
      "RS256",
      {},
      { iss: this.konf.clientEmail, scope: SCOPE, aud: this.konf.tokenUri, iat, exp: iat + 3600 },
    );
    const res = await this.holen(this.konf.tokenUri, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }).toString(),
    });
    if (!res.ok) {
      await res.body?.cancel();
      throw new Error(`Google-Anmeldung antwortete mit ${res.status}`);
    }
    const k = await res.json() as { access_token: string; expires_in?: number };
    return { wert: k.access_token, bis: jetzt + (k.expires_in ?? 3600) * 1000 - PUFFER_MS };
  }

  async senden(marke: string, meldung: Meldung): Promise<Zustellung> {
    let res: Response;
    try {
      res = await this.holen(
        `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(this.konf.projektId)}/messages:send`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${await this.token()}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            message: {
              token: marke,
              notification: { title: meldung.titel, body: meldung.text },
              data: meldung.daten,
              android: {
                priority: "HIGH",
                notification: { sound: "default", notification_count: meldung.badge },
              },
            },
          }),
        },
      );
    } catch (e) {
      return { ergebnis: "fehler", grund: e instanceof Error ? e.message : "Netzfehler" };
    }

    if (res.ok) {
      await res.body?.cancel();
      return { ergebnis: "gesendet" };
    }

    const k = await res.json().then((k: FcmFehler) => k, () => ({} as FcmFehler));
    const details = k.error?.details ?? [];
    const code = details.find((d) => d.errorCode)?.errorCode ?? k.error?.status ?? "";
    const grund = `${res.status} ${code}`;

    if (res.status === 404 || code === "UNREGISTERED") return { ergebnis: "tot", grund };
    // INVALID_ARGUMENT heißt nur dann "Marke kaputt", wenn Google auf das Feld
    // token zeigt; sonst ist die Nachricht schuld, nicht das Gerät.
    const markeKaputt = details.some((d) => d.fieldViolations?.some((f) => f.field === "message.token")) ||
      /registration token/i.test(k.error?.message ?? "");
    if (code === "INVALID_ARGUMENT" && markeKaputt) return { ergebnis: "tot", grund };

    // Zugriffstoken abgelaufen oder entzogen: beim nächsten Gerät ein neues.
    if (res.status === 401) this.zugriff = null;
    if (res.status === 401 || res.status === 429 || res.status >= 500) return { ergebnis: "fehler", grund };
    return { ergebnis: "abgelehnt", grund };
  }
}
