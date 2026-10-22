import path from "node:path";
import type { NextConfig } from "next";

/**
 * Feste Sicherheits-Header fuer jede Antwort (S4). Die CSP haengt an einer
 * Nonce je Anfrage und steht deshalb in der Middleware (src/lib/sicherheit.ts).
 *
 * Traefik setzt HSTS, nosniff, Referrer-Policy und X-Frame-Options auf dem
 * Server ebenfalls (deploy/web/docker-compose.yml) und ueberschreibt dabei
 * HSTS - beide Stellen muessen gleich lauten. Hier stehen sie, damit der
 * Container auch ohne Traefik vollstaendig antwortet.
 *
 * Die Permissions-Policy schaltet ab, was die Seite nicht braucht. Kommt
 * einmal etwas dazu (etwa die Kamera fuer einen Scanner), muss es hier frei.
 */
const SICHERHEITS_HEADER = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: [
      "accelerometer=()",
      "autoplay=()",
      "browsing-topics=()",
      "camera=()",
      "display-capture=()",
      "geolocation=()",
      "gyroscope=()",
      "magnetometer=()",
      "microphone=()",
      "midi=()",
      "payment=()",
      "usb=()",
    ].join(", "),
  },
];

const config: NextConfig = {
  // @tcm/core und @tcm/ui werden als TypeScript-Quelle eingebunden, nicht als gebaute Pakete.
  transpilePackages: ["@tcm/core", "@tcm/ui"],

  // Fuer das Docker-Image (apps/web/Dockerfile): der Build legt einen
  // eigenstaendigen Server samt der tatsaechlich benoetigten node_modules ab.
  // Die Wurzel ist das Repo, weil @tcm/core und @tcm/ui im Workspace liegen.
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  reactStrictMode: true,
  poweredByHeader: false,

  async headers() {
    return [{ source: "/:path*", headers: SICHERHEITS_HEADER }];
  },

  /**
   * Die Verwaltung wurde nach Themen neu geordnet. Wer ein Lesezeichen auf eine
   * der alten Adressen hat - und der Vorstand hat welche -, soll dort landen,
   * wo die Sache heute steht, statt auf einer Fehlerseite.
   *
   * Dauerhaft (308), weil die alten Adressen nicht wiederkommen.
   */
  async redirects() {
    return [
      { source: "/admin/einstellungen", destination: "/admin/system", permanent: true },
      {
        source: "/admin/einstellungen/merkmale",
        destination: "/admin/system/merkmale",
        permanent: true,
      },
      // Verwaltung v2 (docs/design/clubhaus/verwaltung): Merkmale gehören zu
      // System, der Arbeitsdienst ist ein eigener Bereich.
      { source: "/admin/mitglieder/merkmale", destination: "/admin/system/merkmale", permanent: true },
      { source: "/admin/mitglieder/arbeitsdienst", destination: "/admin/arbeitsdienst", permanent: true },
      // Die Läufe sind ein Segment der Kasse; die Seite eines Laufs bleibt.
      {
        source: "/admin/kasse/lastschriften",
        destination: "/admin/kasse?abschnitt=einzuege",
        permanent: true,
      },
      { source: "/admin/serien", destination: "/admin/plaetze", permanent: true },
      { source: "/admin/beitraege", destination: "/admin/kasse", permanent: true },
      // Getränke und Veranstaltungen stehen gemeinsam unter "Verein". Der
      // Kiosk hat seine eigene Adresse und bleibt, wo er ist.
      { source: "/getraenke", destination: "/verein/getraenke", permanent: true },
    ];
  },
};

export default config;
