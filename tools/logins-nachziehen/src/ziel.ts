/**
 * Laeuft das Skript gegen den lokalen Stack?
 *
 * Gegen ein Cloud-Projekt fragt das Skript vor dem Schreiben nach, lokal nicht.
 */

const LOKAL = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export function istLokal(supabaseUrl: string): boolean {
  return LOKAL.has(new URL(supabaseUrl).hostname);
}
