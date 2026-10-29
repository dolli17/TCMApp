/**
 * Push an iPhones der nativen App, direkt über APNs.
 *
 * Apple spricht nur HTTP/2. Das fetch von Deno (und der Edge Runtime)
 * handelt HTTP/2 per ALPN aus, ein eigener Client ist nicht nötig.
 *
 * Angemeldet wird mit einem ES256-JWT aus dem .p8-Schlüssel. Apple lehnt ein
 * Token ab, das älter als eine Stunde ist, und drosselt, wer es öfter als alle
 * zwanzig Minuten erneuert. Also gilt eins fünfzig Minuten.
 */

import { jwtSignieren, schluesselLaden } from "./jwt.ts";
import type { Meldung, Zustellung } from "./zustellung.ts";

export interface ApnsKonfiguration {
  keyId: string;
  teamId: string;
  /** Inhalt der .p8-Datei */
  privateKey: string;
  /** apns-topic, die Bundle-ID der App */
  bundleId: string;
  umgebung: "production" | "sandbox";
}

const GUELTIG_MS = 50 * 60 * 1000;

/** Liest APNS_* aus der Umgebung; fehlt etwas, gibt es kein APNs. */
export function apnsKonfiguration(env: (name: string) => string | undefined): ApnsKonfiguration | null {
  const keyId = env("APNS_KEY_ID") ?? "";
  const teamId = env("APNS_TEAM_ID") ?? "";
  const privateKey = env("APNS_PRIVATE_KEY") ?? "";
  const bundleId = env("APNS_BUNDLE_ID") ?? "";
  if (!keyId || !teamId || !privateKey || !bundleId) return null;
  const umgebung = (env("APNS_UMGEBUNG") ?? "").toLowerCase() === "sandbox" ? "sandbox" : "production";
  return { keyId, teamId, privateKey, bundleId, umgebung };
}

/**
 * Antworten, nach denen das Gerät nicht mehr erreichbar ist.
 * DeviceTokenNotForTopic gehört bewusst nicht dazu: das meldet Apple auch,
 * wenn APNS_BUNDLE_ID falsch gesetzt ist, und dann wären alle Geräte weg.
 */
const TOT = new Set(["BadDeviceToken", "Unregistered"]);

export class Apns {
  private jwt: { wert: string; bis: number } | null = null;
  private schluessel: Promise<CryptoKey> | null = null;

  constructor(
    private readonly konf: ApnsKonfiguration,
    private readonly holen: typeof fetch = (e, i) => fetch(e, i),
    private readonly jetzt: () => number = Date.now,
  ) {}

  get host(): string {
    return this.konf.umgebung === "sandbox" ? "api.sandbox.push.apple.com" : "api.push.apple.com";
  }

  /** Das Anmeldetoken, fünfzig Minuten lang dasselbe. */
  async token(): Promise<string> {
    const jetzt = this.jetzt();
    if (this.jwt && jetzt < this.jwt.bis) return this.jwt.wert;
    this.schluessel ??= schluesselLaden(this.konf.privateKey, "ES256");
    const wert = await jwtSignieren(
      await this.schluessel,
      "ES256",
      { kid: this.konf.keyId },
      { iss: this.konf.teamId, iat: Math.floor(jetzt / 1000) },
    );
    this.jwt = { wert, bis: jetzt + GUELTIG_MS };
    return wert;
  }

  async senden(marke: string, meldung: Meldung): Promise<Zustellung> {
    let res: Response;
    try {
      res = await this.holen(`https://${this.host}/3/device/${encodeURIComponent(marke)}`, {
        method: "POST",
        headers: {
          authorization: `bearer ${await this.token()}`,
          "apns-topic": this.konf.bundleId,
          "apns-push-type": "alert",
          "apns-priority": "10",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          aps: {
            alert: { title: meldung.titel, body: meldung.text },
            sound: "default",
            badge: meldung.badge,
          },
          ...meldung.daten,
        }),
      });
    } catch (e) {
      return { ergebnis: "fehler", grund: e instanceof Error ? e.message : "Netzfehler" };
    }

    if (res.ok) {
      await res.body?.cancel();
      return { ergebnis: "gesendet" };
    }

    const grund = await res.json().then((k: { reason?: string }) => k?.reason ?? "", () => "");
    if (res.status === 410 || TOT.has(grund)) return { ergebnis: "tot", grund: `${res.status} ${grund}` };
    // Das Anmeldetoken passt nicht (mehr): beim nächsten Gerät ein neues.
    if (res.status === 403) this.jwt = null;
    if (res.status === 403 || res.status === 429 || res.status >= 500) {
      return { ergebnis: "fehler", grund: `${res.status} ${grund}` };
    }
    return { ergebnis: "abgelehnt", grund: `${res.status} ${grund}` };
  }
}
