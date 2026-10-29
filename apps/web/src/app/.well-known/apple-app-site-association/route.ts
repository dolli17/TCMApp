import { appleAppSiteAssociation } from "@tcm/core";

/**
 * Universal Links und Passwort-Autofill für die iOS-App (Inhalt:
 * packages/core/src/applinks.ts).
 *
 * Apple holt die Datei über sein CDN, ohne Anmeldung und ohne Umleitungen zu
 * folgen. Darum steht /.well-known in der Middleware unter OEFFENTLICH. Der
 * Pfad hat keine Endung, Apple verlangt trotzdem application/json.
 *
 * Damit die App die Links wirklich öffnet, fehlen noch (Stand Okt. 2026):
 * die Associated Domains in der nativen App (applinks: und webcredentials:
 * für app. und dev.tennisclub-muckensturm.de), die Redirect-Allowlist in
 * Supabase und die Mailvorlagen, die heute noch tcm:// verlinken.
 */
export function GET() {
  return Response.json(appleAppSiteAssociation(), {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
