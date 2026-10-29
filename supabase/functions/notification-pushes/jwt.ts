/**
 * JWTs signieren, nur mit Web Crypto.
 *
 * APNs will ein ES256-Token aus dem .p8-Schlüssel des Vereins, Google für FCM
 * ein RS256-Token aus dem privaten Schlüssel des Dienstkontos. Beides sind
 * PKCS#8-Schlüssel im PEM-Format, beides kann crypto.subtle ohne npm-Paket.
 */

/** base64url ohne Auffüllung, wie JWS es will. */
export function base64url(daten: Uint8Array | string): string {
  const bytes = typeof daten === "string" ? new TextEncoder().encode(daten) : daten;
  let binaer = "";
  for (const b of bytes) binaer += String.fromCharCode(b);
  return btoa(binaer).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Der Inhalt einer PEM-Datei als Bytes. Verträgt auch "\n" als Text aus einer Umgebungsvariable. */
export function pemBytes(pem: string): Uint8Array<ArrayBuffer> {
  const rumpf = pem
    .replace(/\\n/g, "\n")
    .replace(/-----(BEGIN|END)[^-]*-----/g, "")
    .replace(/\s+/g, "");
  const binaer = atob(rumpf);
  const bytes = new Uint8Array(binaer.length);
  for (let i = 0; i < binaer.length; i++) bytes[i] = binaer.charCodeAt(i);
  return bytes;
}

export type Verfahren = "ES256" | "RS256";

const PARAMETER = {
  ES256: {
    import: { name: "ECDSA", namedCurve: "P-256" },
    sign: { name: "ECDSA", hash: "SHA-256" },
  },
  RS256: {
    import: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    sign: { name: "RSASSA-PKCS1-v1_5" },
  },
} as const;

export function schluesselLaden(pem: string, verfahren: Verfahren): Promise<CryptoKey> {
  return crypto.subtle.importKey("pkcs8", pemBytes(pem), PARAMETER[verfahren].import, false, ["sign"]);
}

/**
 * Kopf und Nutzlast signieren. Web Crypto liefert bei ECDSA die Signatur
 * schon als r‖s (je 32 Byte), genau so, wie ES256 sie verlangt.
 */
export async function jwtSignieren(
  schluessel: CryptoKey,
  verfahren: Verfahren,
  kopf: Record<string, unknown>,
  nutzlast: Record<string, unknown>,
): Promise<string> {
  const eingabe = `${base64url(JSON.stringify({ alg: verfahren, typ: "JWT", ...kopf }))}.${
    base64url(JSON.stringify(nutzlast))
  }`;
  const signatur = await crypto.subtle.sign(
    PARAMETER[verfahren].sign,
    schluessel,
    new TextEncoder().encode(eingabe),
  );
  return `${eingabe}.${base64url(new Uint8Array(signatur))}`;
}
