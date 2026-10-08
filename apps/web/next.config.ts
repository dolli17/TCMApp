import path from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  // @tcm/core wird als TypeScript-Quelle eingebunden, nicht als gebautes Paket.
  transpilePackages: ["@tcm/core"],

  // Fuer das Docker-Image (apps/web/Dockerfile): der Build legt einen
  // eigenstaendigen Server samt der tatsaechlich benoetigten node_modules ab.
  // Die Wurzel ist das Repo, weil @tcm/core und @tcm/ui im Workspace liegen.
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  reactStrictMode: true,

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
        destination: "/admin/kasse?abschnitt=lastschrift",
        permanent: true,
      },
      { source: "/admin/serien", destination: "/admin/plaetze", permanent: true },
      { source: "/admin/beitraege", destination: "/admin/kasse", permanent: true },
    ];
  },
};

export default config;
