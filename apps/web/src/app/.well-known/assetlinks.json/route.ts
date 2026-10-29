import { androidFingerabdruecke, assetLinks } from "@tcm/core";

/**
 * App Links und Passwörter für die Android-App (Inhalt:
 * packages/core/src/applinks.ts).
 *
 * Die SHA-256-Fingerabdrücke der Signierschlüssel kommen zur Laufzeit aus
 * ANDROID_APP_FINGERPRINTS (kommagetrennt, siehe .env.example). Solange keiner
 * gesetzt ist, gibt es die Datei nicht (404) - eine leere Liste bestätigt
 * ohnehin keine App.
 */
export const dynamic = "force-dynamic";

export function GET() {
  const inhalt = assetLinks(androidFingerabdruecke(process.env.ANDROID_APP_FINGERPRINTS));
  if (!inhalt) {
    return new Response("Nicht gefunden.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  return Response.json(inhalt, { headers: { "Cache-Control": "public, max-age=3600" } });
}
