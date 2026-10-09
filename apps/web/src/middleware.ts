/**
 * Sitzung erneuern
 *
 * Supabase-Tokens laufen nach einer Stunde ab. Ohne diese Middleware wuerde ein
 * Mitglied mitten im Buchen abgemeldet. Hier wird das Token erneuert und die
 * Cookies werden weitergereicht.
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { AKTIV_COOKIE, istAbgelaufen } from "@/lib/inaktivitaet";
import { PFAD_KOPF } from "@/lib/pfad";

/**
 * Seiten, die ohne Anmeldung erreichbar sind.
 *
 * Bewusst eine kurze, ausdrückliche Liste statt einer Regel: wer hier etwas
 * einträgt, öffnet die Seite für das offene Netz und soll das auch merken.
 * Der Mitgliedsantrag steht darauf, weil ein künftiges Mitglied naturgemäß
 * noch keinen Login hat; die beiden Passwortseiten, weil man sonst einen
 * Login bräuchte, um an seinen Login zu kommen.
 */
const OEFFENTLICH = [
  "/login",
  "/_next",
  "/antrag",
  "/passwort-setzen",
  "/passwort-vergessen",
  // Datenschutz und Impressum stehen in App Store Connect und im Konto-Tab der
  // App - sie muessen fuer jeden lesbar sein, auch fuer Apples Pruefer.
  "/datenschutz",
  "/impressum",
];

/** Der Pfad fuer das Layout (lib/pfad.ts): Anmeldeseiten ohne Menue. */
function weiter(request: NextRequest) {
  const kopf = new Headers(request.headers);
  kopf.set(PFAD_KOPF, request.nextUrl.pathname);
  return NextResponse.next({ request: { headers: kopf } });
}

export async function middleware(request: NextRequest) {
  let response = weiter(request);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = weiter(request);
        for (const { name, value, options } of list) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Ruft den Benutzer ab und erneuert dabei das Token.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pfad = request.nextUrl.pathname;
  const oeffentlich = OEFFENTLICH.some((p) => pfad === p || pfad.startsWith(p + "/"));

  if (!user && !oeffentlich) {
    const ziel = request.nextUrl.clone();
    ziel.pathname = "/login";
    ziel.searchParams.set("weiter", pfad);
    return NextResponse.redirect(ziel);
  }

  // Ohne Sitzung gilt ein alter Aktivitaetsstempel nichts mehr - er wuerde
  // sonst den naechsten Login gleich wieder abmelden.
  if (!user) {
    if (request.cookies.has(AKTIV_COOKIE)) response.cookies.delete(AKTIV_COOKIE);
    return response;
  }

  // Zu lange nichts getan (lib/inaktivitaet.ts): abmelden, bevor eine Seite
  // gerendert wird. signOut schreibt die geleerten Auth-Cookies ueber setAll
  // in response; die muessen auf die Umleitung mit.
  if (!oeffentlich && istAbgelaufen(request.cookies.get(AKTIV_COOKIE)?.value, Date.now())) {
    // Nur dieser Browser - die App auf dem Telefon bleibt angemeldet.
    await supabase.auth.signOut({ scope: "local" });
    const ziel = request.nextUrl.clone();
    ziel.pathname = "/login";
    ziel.search = "";
    ziel.searchParams.set("grund", "inaktiv");
    ziel.searchParams.set("weiter", pfad);
    const umleitung = NextResponse.redirect(ziel);
    for (const c of response.cookies.getAll()) umleitung.cookies.set(c);
    umleitung.cookies.delete(AKTIV_COOKIE);
    return umleitung;
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg)$).*)"],
};
