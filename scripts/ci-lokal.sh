#!/usr/bin/env bash
#
# Alle Prüfungen des CI-Jobs "verify", lokal wie in der CI:
#
#   pnpm verify:ci
#
# .github/workflows/ci.yml ruft genau dieses Skript auf. Was hier steht, ist
# also die eine Liste dessen, was vor dem Merge grün sein muss - eine neue
# Prüfung gehört hierher, nicht in die Workflow-Datei.
#
# Braucht den lokalen Supabase-Stack (pnpm db:start). Der Stand der lokalen
# Datenbank muss zu den Migrationen passen, sonst schlägt die Typen-Prüfung
# fehl: vorher "pnpm db:reset".
#
# Achtung: Der letzte Schritt baut das Web (next build) und überschreibt
# apps/web/.next. Ein "pnpm dev" im selben Worktree vorher beenden.
#
# Umgebung (setzt die CI, lokal reichen die Vorgaben):
#   ZIEL    Branch, gegen den der PR geht      (Vorgabe: origin/main)
#   QUELLE  Name des eigenen Branches          (Vorgabe: der ausgecheckte)

set -euo pipefail

WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$WURZEL"

# Die Buchungsregeln rechnen in Vereinszeit; in UTC scheitern sonst die Tests
# zu Öffnungszeiten.
export TZ="${TZ:-Europe/Berlin}"

ZIEL="${ZIEL:-origin/main}"
QUELLE="${QUELLE:-$(git branch --show-current)}"

# In GitHub Actions je Abschnitt eine einklappbare Gruppe, lokal eine Überschrift.
OFFEN=0
abschnitt() {
  if [ -n "${GITHUB_ACTIONS:-}" ]; then
    [ "$OFFEN" = 1 ] && echo "::endgroup::"
    echo "::group::$1"
    OFFEN=1
  else
    printf '\n== %s ==\n' "$1"
  fi
}

# --- 1. Zeitstempel neuer Migrationen ---------------------------------------
# Neue Migrationen müssen jünger sein als alles, was im Ziel-Branch schon
# liegt - sonst lehnt "supabase db push" sie in Dev/Prod ab, weil sie vor
# einer bereits eingespielten Migration einsortiert würden. Passiert, wenn
# zwei Branches parallel Migrationen anlegen.
# Ausnahme: die Hotfix-Rückführung production -> main. Deren Migrationen
# laufen schon in Prod und lassen sich nicht mehr umbenennen.
abschnitt "Zeitstempel neuer Migrationen (gegen $ZIEL)"
if [ "$QUELLE" = production ]; then
  echo "Rückführung von production - übersprungen."
elif ! git rev-parse --verify --quiet "$ZIEL" >/dev/null; then
  echo "Abbruch: $ZIEL gibt es hier nicht (git fetch origin)." >&2
  exit 1
else
  LETZTE="$(git ls-tree --name-only "$ZIEL" supabase/migrations/ | sed 's#.*/##' | cut -d_ -f1 | sort | tail -1)"
  FEHLER=0
  for f in $(git diff --name-only --diff-filter=A "$ZIEL"...HEAD -- supabase/migrations/); do
    V="$(basename "$f" | cut -d_ -f1)"
    if [[ ! "$V" > "$LETZTE" ]]; then
      echo "::error file=$f::$V ist nicht jünger als die neueste Migration in $ZIEL ($LETZTE). Datei mit aktuellem Zeitstempel umbenennen."
      FEHLER=1
    fi
  done
  [ "$FEHLER" = 0 ] || exit 1
  echo "ok"
fi

# --- 2. Lokaler Stack --------------------------------------------------------
abschnitt "Lokaler Supabase-Stack"
# Der Exit-Code von "supabase status" taugt nicht als Signal: sind Dienste
# bewusst aus (in der CI z. B. Studio), meldet die CLI das je nach Version als
# Fehler. Entscheidend ist, ob sie Adresse und Schlüssel der API nennt.
API_URL=""
ANON_KEY=""
eval "$(pnpm exec supabase status -o env 2>/dev/null | grep -E '^(API_URL|ANON_KEY)=' || true)"
if [ -z "$API_URL" ] || [ -z "$ANON_KEY" ]; then
  if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ]; then
    echo "Abbruch: der lokale Stack läuft nicht (bash scripts/claude/stack-cloud.sh)." >&2
  else
    echo "Abbruch: der lokale Stack läuft nicht (pnpm db:start)." >&2
  fi
  exit 1
fi
echo "ok ($API_URL)"

# --- 3. database.types.ts passt zu den Migrationen ---------------------------
# Wer eine Migration anlegt und "pnpm db:types" vergisst, bekäme sonst einen
# grünen Typecheck gegen veraltete Typen. Die CLI kommt aus dem Lockfile,
# lokal und in der CI erzeugt also dieselbe Version die Datei.
abschnitt "database.types.ts passt zu den Migrationen"
TYPEN="$(mktemp)"
trap 'rm -f "$TYPEN"' EXIT
pnpm exec supabase gen types typescript --local > "$TYPEN"
if ! diff -u packages/core/src/database.types.ts "$TYPEN"; then
  echo "::error file=packages/core/src/database.types.ts::Die Typen passen nicht zu den Migrationen. Lokal 'pnpm db:reset && pnpm db:types' ausführen und die Datei einchecken (danach 'pnpm --filter @tcm/core build:app-api')."
  exit 1
fi
echo "ok"

# --- Bash-Wächter der Agenten ------------------------------------------------
# scripts/claude/bash-waechter.mjs hält Agenten von Befehlen gegen Dev und
# Prod ab. Seine Fälle laufen hier mit, damit er nicht unbemerkt kaputtgeht.
abschnitt "Bash-Wächter (scripts/claude)"
node scripts/claude/bash-waechter.test.mjs

# --- 4. Typecheck, Lint, Vitest, pgTAP ---------------------------------------
abschnitt "pnpm verify (Typecheck, Lint, Vitest, pgTAP)"
pnpm verify

# --- 5. Edge Functions --------------------------------------------------------
# Unter Deno, ohne Stack: Deno.serve und fetch sind abgefangen
# (supabase/functions/_tests/attrappe.ts).
abschnitt "Edge Functions (Deno)"
pnpm test:functions

# --- 6. Web bauen -------------------------------------------------------------
abschnitt "Web bauen"
NEXT_PUBLIC_SUPABASE_URL="$API_URL" \
NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY" \
  pnpm --filter @tcm/web build

[ "$OFFEN" = 1 ] && echo "::endgroup::"
printf '\nAlles grün.\n'
