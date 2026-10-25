/**
 * Sitzung erneuern
 *
 * Supabase-Tokens laufen nach einer Stunde ab. Ohne diese Middleware wuerde ein
 * Mitglied mitten im Buchen abgemeldet. Hier wird das Token erneuert und die
 * Cookies werden weitergereicht.
 *
 * Ausserdem drei Weichen: ohne Anmeldung zur Loginseite, ohne Zugang
 * (ausgetreten, archiviert, gesperrt) abmelden und auf /kein-zugang, und
 * solange das Onboarding offen ist, auf /onboarding.
 *
 * Und die Content-Security-Policy mit einer Nonce je Anfrage
 * (lib/sicherheit.ts).
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { sichererWeiterPfad, zugangsGrund, type Database } from "@tcm/core";
import { AKTIV_COOKIE, istAbgelaufen } from "@/lib/inaktivitaet";
import { KEIN_ZUGANG, ONBOARDING, PFAD_KOPF } from "@/lib/pfad";
import { NONCE_KOPF, inhaltsRichtlinie, neueNonce } from "@/lib/sicherheit";

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
  // Satzung und Beitragsordnung: der Antrag und das Onboarding verweisen
  // darauf, und die App verlinkt sie ebenfalls.
  "/satzung",
  "/beitragsordnung",
  // Der Hinweis fuer Ausgeschiedene: sie sind dort schon abgemeldet.
  "/kein-zugang",
];

/**
 * Der Pfad fuer das Layout (lib/pfad.ts): Anmeldeseiten ohne Menue. Dazu die
 * Nonce: Next.js findet sie im CSP-Kopf der Anfrage, das Layout in NONCE_KOPF.
 * Beide werden hier ueberschrieben, ein Aufrufer kann sie nicht vorgeben.
 */
function weiter(request: NextRequest, nonce: string) {
  const richtlinie = inhaltsRichtlinie(nonce);
  const kopf = new Headers(request.headers);
  kopf.set(PFAD_KOPF, request.nextUrl.pathname);
  kopf.set(NONCE_KOPF, nonce);
  kopf.set("Content-Security-Policy", richtlinie);
  const response = NextResponse.next({ request: { headers: kopf } });
  response.headers.set("Content-Security-Policy", richtlinie);
  return response;
}

export async function middleware(request: NextRequest) {
  const nonce = neueNonce();
  let response = weiter(request, nonce);

  const pfad = request.nextUrl.pathname;
  const oeffentlich = OEFFENTLICH.some((p) => pfad === p || pfad.startsWith(p + "/"));

  // Ohne Supabase-Konfiguration laesst sich niemand pruefen. Dann bleiben nur
  // die oeffentlichen Seiten offen; alles andere wird abgewiesen statt
  // ungeprueft ausgeliefert (fail-closed). Geprueft wird erst hier zur
  // Laufzeit, der Build braucht die Variablen nicht.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    if (oeffentlich) return response;
    console.error("Middleware: NEXT_PUBLIC_SUPABASE_URL oder NEXT_PUBLIC_SUPABASE_ANON_KEY fehlt.");
    return new NextResponse("Der Dienst ist gerade nicht verfügbar.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = weiter(request, nonce);
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

  if (!user && !oeffentlich) {
    const ziel = request.nextUrl.clone();
    ziel.pathname = "/login";
    ziel.searchParams.set("weiter", sichererWeiterPfad(pfad));
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
    ziel.searchParams.set("weiter", sichererWeiterPfad(pfad));
    const umleitung = NextResponse.redirect(ziel);
    for (const c of response.cookies.getAll()) umleitung.cookies.set(c);
    umleitung.cookies.delete(AKTIV_COOKIE);
    return umleitung;
  }

  // Zugang und Onboarding in einem Aufruf (mein_zugang, B22). Faellt er aus,
  // geht es weiter wie ohne die Weichen - die Datenbank sperrt ohnehin selbst.
  if (!oeffentlich) {
    const { data: zugang } = await supabase.rpc("mein_zugang").maybeSingle();

    // Ausgetreten, archiviert oder gesperrt: die Datenbank liefert nichts
    // mehr, jede Seite waere leer. Stattdessen abmelden und sagen, warum.
    // Kiosk-Konten haben kein Mitglied und behalten den Zugang.
    if (zugang && !zugang.zugang) {
      await supabase.auth.signOut({ scope: "local" });
      const ziel = request.nextUrl.clone();
      ziel.pathname = KEIN_ZUGANG;
      ziel.search = "";
      ziel.searchParams.set("grund", zugangsGrund(zugang.grund));
      const umleitung = NextResponse.redirect(ziel);
      for (const c of response.cookies.getAll()) umleitung.cookies.set(c);
      umleitung.cookies.delete(AKTIV_COOKIE);
      return umleitung;
    }

    // Die Sperre bis zum Ende des Onboardings: alles ausser den oeffentlichen
    // Seiten und dem Onboarding selbst fuehrt dorthin. Die Datenbank sperrt
    // ohnehin (is_member() ist bis dahin false); das hier erspart leere Seiten
    // und Fehlermeldungen.
    const imOnboarding = pfad === ONBOARDING || pfad.startsWith(ONBOARDING + "/");
    if (zugang?.onboarding_offen && !imOnboarding) {
      const ziel = request.nextUrl.clone();
      ziel.pathname = ONBOARDING;
      ziel.search = "";
      const umleitung = NextResponse.redirect(ziel);
      // Ein erneuertes Token muss mit auf die Umleitung.
      for (const c of response.cookies.getAll()) umleitung.cookies.set(c);
      return umleitung;
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg)$).*)"],
};
