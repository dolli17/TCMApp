import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Die Edge Functions für den Testlauf bereitstellen (O18).
 *
 * Ohne `member-login` legt die Verwaltung kein Mitglied mehr an: Jedes
 * Mitglied bekommt beim Anlegen seinen Login, und das kann nur die Function.
 * Der Container `supabase_edge_runtime_…` fehlt aber oft:
 *
 * - Ein beendetes `supabase functions serve` nimmt ihn mit, und
 *   `supabase start` legt ihn bei laufendem Stack nicht neu an.
 * - Er bindet das functions-Verzeichnis des Checkouts ein, der ihn gestartet
 *   hat. Aus einem anderen Worktree liefe hier fremder, womöglich alter Code.
 *
 * Deshalb: Läuft er schon mit den Functions dieses Checkouts, bleibt er. Sonst
 * startet hier `supabase functions serve` für die Dauer des Laufs, und die
 * zurückgegebene Funktion beendet es wieder (Playwright ruft sie als Teardown).
 *
 * Nur gegen den lokalen Stack. Zeigt die URL woanders hin, passiert nichts.
 */

const WURZEL = resolve(__dirname, "../../..");

function containerName(): string {
  const config = readFileSync(join(WURZEL, "supabase", "config.toml"), "utf8");
  const projekt = /^project_id\s*=\s*"(.+)"/m.exec(config)?.[1] ?? "";
  return `supabase_edge_runtime_${projekt}`;
}

/** Ohne Token antwortet das Gateway mit 401, sobald die Runtime läuft. */
async function laeuft(adresse: string): Promise<boolean> {
  try {
    const antwort = await fetch(`${adresse}/functions/v1/member-login`, { method: "POST" });
    return antwort.status === 401;
  } catch {
    return false;
  }
}

/** Bindet der Container die Functions genau dieses Checkouts ein? */
function ausDiesemCheckout(container: string): boolean {
  const r = spawnSync("docker", ["inspect", container, "--format", "{{range .Mounts}}{{.Source}} {{end}}"], {
    encoding: "utf8",
  });
  return r.status === 0 && r.stdout.includes(join(WURZEL, "supabase", "functions"));
}

export default async function edgeFunctions(): Promise<(() => Promise<void>) | undefined> {
  const adresse = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(adresse)) return undefined;

  const container = containerName();
  if ((await laeuft(adresse)) && ausDiesemCheckout(container)) return undefined;

  // eslint-disable-next-line no-console
  console.log("Edge Functions: starte supabase functions serve …");
  const prozess: ChildProcess = spawn("npx", ["supabase", "functions", "serve"], {
    cwd: WURZEL,
    stdio: ["ignore", "ignore", "pipe"],
    detached: true,
  });
  let fehlerText = "";
  prozess.stderr?.on("data", (d: Buffer) => {
    fehlerText = (fehlerText + d.toString()).slice(-2000);
  });

  const beenden = async () => {
    if (prozess.exitCode !== null || !prozess.pid) return;
    // Die ganze Prozessgruppe: npx startet die CLI als Kindprozess.
    try {
      process.kill(-prozess.pid, "SIGTERM");
    } catch {
      // schon weg
    }
    await new Promise((fertig) => {
      const frist = setTimeout(fertig, 10_000);
      prozess.once("exit", () => {
        clearTimeout(frist);
        fertig(undefined);
      });
    });
  };

  for (let i = 0; i < 90; i++) {
    if (prozess.exitCode !== null) break;
    if ((await laeuft(adresse)) && ausDiesemCheckout(container)) {
      // eslint-disable-next-line no-console
      console.log(`Edge Functions: bereit nach ${i}s.`);
      return beenden;
    }
    await new Promise((weiter) => setTimeout(weiter, 1000));
  }

  await beenden();
  throw new Error(`Die Edge Functions starten nicht (supabase functions serve):\n${fehlerText}`);
}
