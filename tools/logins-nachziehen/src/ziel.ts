/**
 * Zeigen SUPABASE_URL und SUPABASE_DB_URL auf dasselbe Projekt?
 *
 * Das Skript liest ueber die Datenbankverbindung und schreibt ueber die
 * Admin-API. Zeigen beide auf verschiedene Projekte, wuerden Konten fuer
 * Mitglieder aus dem falschen Bestand angelegt – deshalb wird das vor jedem
 * Lauf geprueft.
 */

const LOKAL = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export function istLokal(supabaseUrl: string): boolean {
  return LOKAL.has(new URL(supabaseUrl).hostname);
}

/** Projektkennung aus https://<ref>.supabase.co, sonst null. */
export function projektRef(supabaseUrl: string): string | null {
  const host = new URL(supabaseUrl).hostname;
  const treffer = /^([a-z0-9]+)\.supabase\.(co|in)$/.exec(host);
  return treffer?.[1] ?? null;
}

export function gleichesProjekt(supabaseUrl: string, dbUrl: string): boolean {
  const db = new URL(dbUrl);
  if (istLokal(supabaseUrl)) return LOKAL.has(db.hostname);

  const ref = projektRef(supabaseUrl);
  if (!ref) return false;
  // Direktverbindung: db.<ref>.supabase.co – Pooler: Benutzer postgres.<ref>
  return db.hostname === `db.${ref}.supabase.co` || decodeURIComponent(db.username) === `postgres.${ref}`;
}
