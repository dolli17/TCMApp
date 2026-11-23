#!/usr/bin/env node
/**
 * PreToolUse-Hook für Bash (eingebunden in .claude/settings.json).
 *
 * Fängt Befehle ab, die ein Agent in diesem Repo nicht aus Versehen ausführen
 * soll: Schreibzugriffe auf Dev oder Prod, Pushes auf main/production, Tags
 * und Releases. Die Deny-Regeln in settings.json greifen nur, wenn ein Befehl
 * genau so beginnt; dieser Hook sieht den ganzen Befehl, also auch
 * "cd x && supabase db push" oder "sh -c '…'".
 *
 * Zwei Stufen:
 *   verboten  - der Befehl läuft nicht, Claude bekommt die Begründung.
 *   nachfragen - der Nutzer entscheidet im Einzelfall (z. B. PR mergen).
 *
 * Das ist ein Netz gegen Versehen, keine Sicherheitsgrenze: Wer es umgehen
 * will, schafft das. Die harten Grenzen sind die Rechte der Tokens, die
 * Rulesets und die Environments in GitHub.
 *
 * Eingabe: JSON auf stdin, der Befehl steht in tool_input.command.
 * Testen:  node scripts/claude/bash-waechter.test.mjs
 */

import process from "node:process";

export const VERBOTEN = [
  [/\bsupabase\s+(link|db\s+push|functions\s+deploy|secrets|config\s+push|migration\s+repair)\b/,
    "Schreibzugriff auf ein Supabase-Cloud-Projekt. Ausrollen tut der Deploy-Workflow."],
  [/\bsupabase\s+db\s+(reset|dump|pull)\b[^|;&]*(--linked|--db-url)/,
    "Datenbank-Befehl gegen ein Cloud-Projekt. Lokal ohne --linked/--db-url arbeiten."],
  [/\bgit\s+push\b[^|;&]*[\s:](main|production)(?![\w./-])/,
    "Push auf main oder production. Änderungen gehen über einen PR."],
  [/\bgit\s+push\b[^|;&]*(--tags|\brefs\/tags\/|\sv\d+\.\d+)/,
    "Tags entstehen beim Release durch den Deploy-Workflow."],
  [/\bgit\s+tag\s+(-a\s+|-s\s+|-f\s+)*v?\d/,
    "Tags entstehen beim Release durch den Deploy-Workflow."],
  [/(^|[\s;&|(])(ssh|scp|rsync)\s+[^|;&]*@/,
    "Zugriff auf einen Server. Deployt wird über GitHub Actions."],
  [/deploy\/web\/deploy\.sh/,
    "Das Notfall-Deploy vom Mac führt der Nutzer selbst aus."],
  [/\bgh\s+(secret|variable)\s+(set|delete|remove)\b/,
    "Secrets und Variablen in GitHub ändert der Nutzer."],
  [/\bgh\s+release\s+(create|delete|edit|upload)\b/,
    "Releases entstehen durch den Deploy-Workflow."],
  [/\bgh\s+repo\s+(edit|delete|rename|archive)\b/,
    "Einstellungen des Repos ändert der Nutzer. (Privat stellen schaltet Rulesets und die Prod-Freigabe ab.)"],
];

export const NACHFRAGEN = [
  [/\bgh\s+pr\s+merge\b/, "Ein Merge nach main deployt nach Dev."],
  [/\bgh\s+(workflow\s+run|run\s+rerun)\b/, "Startet einen Workflow, möglicherweise einen Deploy."],
  [/\bgh\s+api\b[^|;&]*(-X|--method)\s*(POST|PUT|PATCH|DELETE)\b/i, "Schreibender Aufruf der GitHub-API."],
  [/\bgh\s+api\b[^|;&]*\s(-f|-F|--field|--raw-field|--input)\s/, "Schreibender Aufruf der GitHub-API."],
  [/\bsupabase\b[^|;&]*(--project-ref|--linked|--db-url)/, "Befehl gegen ein Supabase-Cloud-Projekt."],
  [/\bgit\s+push\b[^|;&]*(--force\b|--force-with-lease\b|\s-f\b)/, "Force-Push überschreibt den Branch auf GitHub."],
];

/**
 * Text, der nur zitiert wird, soll nichts auslösen: eine Commit-Nachricht oder
 * ein PR-Text, der "supabase db push" erwähnt, ist kein Aufruf. Deshalb fallen
 * Heredocs und Zeichenketten in Anführungszeichen vor der Prüfung weg - außer
 * der Befehl reicht Text an eine Shell weiter (sh -c, eval), dann zählt alles.
 */
export function ohneZitate(befehl) {
  if (/\b(ba|z)?sh\s+-[a-z]*c\b|\beval\b/.test(befehl)) return befehl;
  return befehl
    .replace(/<<-?\s*(['"]?)(\w+)\1[\s\S]*?\n\s*\2\b/g, " ")
    .replace(/'[^']*'/g, " ")
    .replace(/"(?:[^"\\]|\\.)*"/g, " ");
}

/** Liefert { stufe: "verboten" | "nachfragen", grund } oder null. */
export function pruefe(roh) {
  const befehl = ohneZitate(roh);
  for (const [muster, grund] of VERBOTEN) if (muster.test(befehl)) return { stufe: "verboten", grund };
  for (const [muster, grund] of NACHFRAGEN) if (muster.test(befehl)) return { stufe: "nachfragen", grund };
  return null;
}

async function haupt() {
  let roh = "";
  for await (const stueck of process.stdin) roh += stueck;
  let befehl = "";
  try {
    befehl = JSON.parse(roh)?.tool_input?.command ?? "";
  } catch {
    return; // Unlesbare Eingabe: nicht im Weg stehen.
  }
  const treffer = pruefe(befehl);
  if (!treffer) return;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: treffer.stufe === "verboten" ? "deny" : "ask",
      permissionDecisionReason: `${treffer.grund} (scripts/claude/bash-waechter.mjs)`,
    },
  }));
}

if (import.meta.url === `file://${process.argv[1]}`) await haupt();
