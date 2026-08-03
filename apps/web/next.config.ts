import type { NextConfig } from "next";

const config: NextConfig = {
  // @tcm/core wird als TypeScript-Quelle eingebunden, nicht als gebautes Paket.
  transpilePackages: ["@tcm/core"],
  reactStrictMode: true,
};

export default config;
