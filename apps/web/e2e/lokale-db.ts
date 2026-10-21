import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * SQL direkt im Datenbank-Container des lokalen Stacks ausführen, als postgres.
 *
 * Für Testvorbereitung, die an RLS und den Dienstschlüssel vorbei muss: der
 * hat auf members bewusst kein SELECT. Nur gegen den lokalen Stack; zeigt
 * NEXT_PUBLIC_SUPABASE_URL woanders hin, passiert nichts.
 */

const WURZEL = resolve(__dirname, "../../..");

export function istLokalerStack(): boolean {
  const adresse = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(adresse);
}

export function sqlLokal(sql: string, zweck: string): void {
  const config = readFileSync(join(WURZEL, "supabase", "config.toml"), "utf8");
  const projekt = /^project_id\s*=\s*"(.+)"/m.exec(config)?.[1] ?? "";

  const r = spawnSync(
    "docker",
    ["exec", "-i", `supabase_db_${projekt}`, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-q"],
    { input: sql, encoding: "utf8" },
  );
  if (r.status !== 0) {
    throw new Error(`${zweck}: ${r.stderr || r.error?.message}`);
  }
}
