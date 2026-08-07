import type { NextConfig } from "next";

const config: NextConfig = {
  // @tcm/core wird als TypeScript-Quelle eingebunden, nicht als gebautes Paket.
  transpilePackages: ["@tcm/core"],
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
        destination: "/admin/mitglieder/merkmale",
        permanent: true,
      },
      { source: "/admin/serien", destination: "/admin/plaetze", permanent: true },
      { source: "/admin/beitraege", destination: "/admin/kasse", permanent: true },
    ];
  },
};

export default config;
