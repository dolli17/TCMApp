/**
 * Sicherheits-Header (S4)
 *
 * Die Content-Security-Policy hängt an einer Nonce, die die Middleware für
 * jede Anfrage neu würfelt. Next.js liest sie aus dem CSP-Kopf der Anfrage und
 * hängt sie an seine eigenen Skripte; das Root-Layout gibt sie dem
 * Theme-Skript mit (NONCE_KOPF). Was diese Skripte nachladen, ist über
 * 'strict-dynamic' erlaubt - sonst nichts.
 *
 * Das setzt dynamisches Rendering voraus: eine beim Build vorgerenderte Seite
 * hat keine Nonce, und der Browser blockierte ihre Skripte - die Seite stünde
 * da, reagierte aber auf nichts. Dynamisch ist heute jede Seite, weil das
 * Root-Layout headers() liest (Pfad, Nonce). Wer das ändert, muss die Seiten
 * auf andere Weise dynamisch halten; e2e/sicherheit.spec.ts prüft es.
 *
 * Die festen Header (HSTS, Permissions-Policy, ...) stehen in next.config.ts.
 */

/** Die Nonce der Anfrage, von der Middleware gesetzt, vom Layout gelesen. */
export const NONCE_KOPF = "x-tcm-nonce";

/** 16 Zufallsbytes, Base64 - läuft in der Edge-Laufzeit der Middleware. */
export function neueNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Die Richtlinie für eine Seite.
 *
 * - connect-src: Supabase per fetch (REST, Auth, Functions) und per
 *   WebSocket (Realtime im Belegungsplan, components/PlanAbo.tsx).
 * - Bilder und Schriften kommen vom eigenen Server (next/image, @fontsource).
 * - style-src braucht 'unsafe-inline': React schreibt style-Attribute ins
 *   HTML (Balken, Zeitleiste). Das öffnet keine Skripte.
 * - Im Entwicklungsserver braucht React 'unsafe-eval' für seine Fehlerhilfen.
 */
export function inhaltsRichtlinie(
  nonce: string,
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  entwicklung = process.env.NODE_ENV === "development",
): string {
  const supabase = supabaseUrl.replace(/\/+$/, "");
  const realtime = supabase.replace(/^http/, "ws");

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${entwicklung ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${supabase ? ` ${supabase} ${realtime}` : ""}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}
