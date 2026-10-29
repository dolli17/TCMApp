/**
 * Eine Edge Function ohne Supabase und ohne Netz aufrufen.
 *
 * Die Functions rufen beim Laden Deno.serve auf und sprechen danach nur über
 * fetch mit Auth, PostgREST und Resend. Beides fängt diese Attrappe ab:
 * Deno.serve merkt sich den Handler, statt einen Port zu öffnen, und fetch geht
 * an einen Router, der je Pfad eine vorbereitete Antwort gibt und jede Anfrage
 * mitschreibt. So bleibt die Function, wie sie ist - getestet wird genau der
 * Code, der ausgerollt wird.
 *
 * Der Ordner beginnt mit einem Unterstrich, damit "supabase functions deploy"
 * ihn nicht für eine Function hält.
 */

export const URL_ = "http://supabase.test";
export const ANON = "anon-schluessel";
export const DIENST = "dienst-schluessel";
/** Das Token eines angemeldeten Mitglieds, wie es das Web mitschickt. */
export const NUTZER = "Bearer nutzer-token";

/** Eine mitgeschriebene Anfrage, schon ausgelesen. */
export interface Aufruf {
  methode: string;
  /** Der Rechner, etwa api.push.apple.com. */
  host: string;
  pfad: string;
  suche: URLSearchParams;
  /** Wer gefragt hat: der apikey-Kopf. */
  schluessel: string | null;
  authorization: string | null;
  kopf: Headers;
  koerper: unknown;
}

type Antwort = Response | { status?: number; json: unknown };
type Route = {
  methode: string;
  pfad: string | RegExp;
  antwort: (a: Aufruf) => Antwort | Promise<Antwort>;
};

export class Router {
  aufrufe: Aufruf[] = [];
  private routen: Route[] = [];

  /** Spätere Routen gehen vor: ein Test überschreibt so die Vorgaben. */
  route(methode: string, pfad: string | RegExp, antwort: Route["antwort"]): this {
    this.routen.unshift({ methode, pfad, antwort });
    return this;
  }

  /** Eine RPC unter /rest/v1/rpc/<name>. */
  rpc(name: string, antwort: Route["antwort"]): this {
    return this.route("POST", `/rest/v1/rpc/${name}`, antwort);
  }

  /** Alle Aufrufe auf einen Pfad (ohne Suchteil). */
  an(pfad: string | RegExp, methode?: string): Aufruf[] {
    return this.aufrufe.filter(
      (a) => passt(pfad, a.pfad) && (!methode || a.methode === methode),
    );
  }

  /** Der Ersatz für globalThis.fetch. */
  fetch = async (eingabe: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const req = new Request(eingabe, init);
    const url = new URL(req.url);
    const text = await req.text();
    let koerper: unknown = null;
    try {
      koerper = text ? JSON.parse(text) : null;
    } catch {
      koerper = text;
    }
    const aufruf: Aufruf = {
      methode: req.method,
      host: url.host,
      pfad: url.pathname,
      suche: url.searchParams,
      schluessel: req.headers.get("apikey"),
      authorization: req.headers.get("Authorization"),
      kopf: req.headers,
      koerper,
    };
    this.aufrufe.push(aufruf);

    const route = this.routen.find((r) => r.methode === req.method && passt(r.pfad, url.pathname));
    if (!route) {
      return json({ message: `Keine Route für ${req.method} ${url.pathname}` }, 599);
    }
    const a = await route.antwort(aufruf);
    return a instanceof Response ? a : json(a.json, a.status ?? 200);
  };
}

function passt(muster: string | RegExp, pfad: string): boolean {
  return typeof muster === "string" ? muster === pfad : muster.test(pfad);
}

export function json(wert: unknown, status = 200): Response {
  return new Response(JSON.stringify(wert), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Ein Fehler, wie PostgREST ihn schickt. */
export function pgFehler(message: string, code = "P0001", status = 400): Antwort {
  return { status, json: { message, code, details: null, hint: null } };
}

/** Ein Fehler, wie Auth (GoTrue) ihn schickt. */
export function authFehler(msg: string, status = 422, error_code = "unexpected_failure"): Antwort {
  return { status, json: { code: status, error_code, msg } };
}

/** Ein Benutzer aus auth.users, so weit die Functions ihn lesen. */
export function benutzer(id: string, felder: Record<string, unknown> = {}) {
  return {
    id,
    aud: "authenticated",
    role: "authenticated",
    email: `${id}@tcm.test`,
    app_metadata: {},
    user_metadata: {},
    created_at: "2026-01-01T00:00:00Z",
    ...felder,
  };
}

type Handler = (req: Request) => Response | Promise<Response>;

let geladen = 0;

/**
 * Lädt die Function frisch und gibt ihren Handler.
 *
 * Die Umgebung wird vorher gesetzt, weil die Functions sie beim Laden in
 * Konstanten lesen. Jeder Aufruf lädt das Modul neu (Suchteil im Pfad), damit
 * eine andere Umgebung auch wirklich greift.
 */
export async function ladeFunction(
  modul: URL,
  router: Router,
  umgebung: Record<string, string> = {},
): Promise<Handler> {
  const env = {
    SUPABASE_URL: URL_,
    SUPABASE_ANON_KEY: ANON,
    SUPABASE_SERVICE_ROLE_KEY: DIENST,
    SITE_URL: "https://tcm.test",
    ...umgebung,
  };
  const vorher = [
    "RESEND_API_KEY",
    "MAIL_FROM",
    "MAILPIT_URL",
    "PUSH_AKTIV",
    "EXPO_ACCESS_TOKEN",
    "APNS_KEY_ID",
    "APNS_TEAM_ID",
    "APNS_PRIVATE_KEY",
    "APNS_BUNDLE_ID",
    "APNS_UMGEBUNG",
    "FCM_SERVICE_ACCOUNT",
  ];
  for (const name of vorher) Deno.env.delete(name);
  for (const [k, v] of Object.entries(env)) Deno.env.set(k, v);

  globalThis.fetch = router.fetch;

  let handler: Handler | null = null;
  const deno = Deno as unknown as { serve: unknown };
  const serve = deno.serve;
  deno.serve = (h: Handler) => {
    handler = h;
    return { finished: Promise.resolve(), shutdown: () => Promise.resolve() };
  };
  try {
    await import(`${modul.href}?laden=${++geladen}`);
  } finally {
    deno.serve = serve;
  }
  if (!handler) throw new Error("Die Function hat Deno.serve nicht aufgerufen.");
  return handler;
}

/** Eine POST-Anfrage an die Function. */
export function anfrage(
  koerper: unknown,
  { token = NUTZER, methode = "POST" }: { token?: string | null; methode?: string } = {},
): Request {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (token) headers.set("Authorization", token);
  return new Request("http://function.test/", {
    method: methode,
    headers,
    body: methode === "GET" ? undefined : typeof koerper === "string" ? koerper : JSON.stringify(koerper),
  });
}

/** Status und JSON-Körper einer Antwort. */
export async function lies(res: Response): Promise<{ status: number; koerper: Record<string, unknown> }> {
  return { status: res.status, koerper: await res.json() };
}
