/**
 * Sitzung erneuern
 *
 * Supabase-Tokens laufen nach einer Stunde ab. Ohne diese Middleware wuerde ein
 * Mitglied mitten im Buchen abgemeldet. Hier wird das Token erneuert und die
 * Cookies werden weitergereicht.
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
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
  const oeffentlich = pfad.startsWith("/login") || pfad.startsWith("/_next");

  if (!user && !oeffentlich) {
    const ziel = request.nextUrl.clone();
    ziel.pathname = "/login";
    ziel.searchParams.set("weiter", pfad);
    return NextResponse.redirect(ziel);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg)$).*)"],
};
