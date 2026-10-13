/**
 * Rollen im Verein
 *
 * Zwei Arten, eine Darstellung: Vorstand, App Admin und Platzwart stehen in
 * member_roles, Trainer und Mannschaftsfuehrer sind Eigenschaften am Mitglied
 * (members.is_trainer, members.is_team_captain). Der Mannschaftsfuehrer haengt
 * an seiner Mannschaft und wird dort gesetzt, nicht hier.
 *
 * Reine Darstellung. Was eine Rolle darf, entscheidet die Datenbank
 * (private.is_admin).
 */

import type { Database } from "./database.types";

export type AppRole = Database["public"]["Enums"]["app_role"];

export interface RollenInfo {
  rolle: AppRole;
  label: string;
  beschreibung: string;
  /** Sieht und aendert alles. */
  vollRechte: boolean;
  /** Ohne Login sinnlos, die Datenbank lehnt es ab. */
  brauchtLogin: boolean;
}

/** Die vergebbaren Rollen in der Reihenfolge, in der die Oberflaeche sie zeigt. */
export const ROLLEN: readonly RollenInfo[] = [
  {
    rolle: "board",
    label: "Vorstand",
    beschreibung: "Volle Rechte: Mitglieder, Beiträge, Serien, Einstellungen und jede fremde Buchung.",
    vollRechte: true,
    brauchtLogin: true,
  },
  {
    rolle: "admin",
    label: "App Admin",
    beschreibung: "Volle Rechte wie der Vorstand, für die technische Betreuung der App.",
    vollRechte: true,
    brauchtLogin: true,
  },
  {
    rolle: "groundskeeper",
    label: "Platzwart",
    beschreibung: "Kümmert sich um die Plätze. Eigene Rechte folgen.",
    vollRechte: false,
    brauchtLogin: false,
  },
];

const VOLL: readonly AppRole[] = ROLLEN.filter((r) => r.vollRechte).map((r) => r.rolle);

/** Vorstand oder App Admin: darf alles. */
export function hatVolleRechte(roles: readonly string[]): boolean {
  return roles.some((r) => (VOLL as readonly string[]).includes(r));
}

export function rollenLabel(rolle: string): string {
  if (rolle === "member") return "Spieler";
  return ROLLEN.find((r) => r.rolle === rolle)?.label ?? rolle;
}

/**
 * Alle Rollen eines Mitglieds als Marken, ohne das selbstverstaendliche
 * "Spieler". Reihenfolge wie in ROLLEN, dann Trainer und Mannschaftsfuehrer.
 */
export function rollenMarken(m: {
  roles?: readonly string[] | null;
  is_trainer?: boolean | null;
  is_team_captain?: boolean | null;
}): string[] {
  const roles = m.roles ?? [];
  const marken = ROLLEN.filter((r) => roles.includes(r.rolle)).map((r) => r.label);
  if (m.is_trainer) marken.push("Trainer");
  if (m.is_team_captain) marken.push("Mannschaftsführer");
  return marken;
}
