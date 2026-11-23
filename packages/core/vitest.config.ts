import { defineConfig } from "vitest/config";

// Die Buchungsregeln rechnen in Vereinszeit, und die Tests bauen ihre
// Zeitpunkte mit lokalen Uhrzeiten. Ohne feste Zeitzone scheitern sie überall,
// wo das System nicht auf Berlin steht (Cloud-Sitzungen und CI-Runner laufen
// in UTC). Die Arbeiter erben die Variable von diesem Prozess.
process.env.TZ = "Europe/Berlin";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
