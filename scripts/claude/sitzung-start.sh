#!/usr/bin/env bash
#
# SessionStart-Hook (eingebunden in .claude/settings.json).
#
# Lokal tut er nichts: dort richtet scripts/worktree-einrichten.sh den
# Worktree ein, und den Stack startet man selbst (pnpm db:start).
#
# In einer Cloud-Sitzung (CLAUDE_CODE_REMOTE=true) bereitet er vor, was
# "pnpm verify:ci" braucht:
#   - Docker-Daemon starten (läuft dort nicht von allein),
#   - Abhängigkeiten installieren,
#   - den Supabase-Stack im Hintergrund hochfahren, mit derselben Dienstliste
#     wie der CI-Job "verify". Die Edge Runtime ist nicht dabei: sie verlangt
#     mehr offene Dateien, als die Sandbox erlaubt. E2E läuft dort deshalb
#     nicht, das Ergebnis kommt aus der CI.
#
# Was der Hook ausgibt, bekommt Claude als Kontext. Er bricht die Sitzung nie
# ab: geht etwas schief, steht es in der Ausgabe.

set -uo pipefail

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

WURZEL="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$WURZEL" || exit 0
mkdir -p tmp
LOG="$WURZEL/tmp/sitzung-start.log"
: > "$LOG"

# Vereinszeit für alles, was in dieser Sitzung läuft.
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo 'export TZ=Europe/Berlin' >> "$CLAUDE_ENV_FILE"
fi

echo "Cloud-Sitzung: Umgebung wird vorbereitet (Log: tmp/sitzung-start.log)."

if ! docker info >/dev/null 2>&1; then
  (nohup dockerd >> "$LOG" 2>&1 &)
  for _ in $(seq 1 30); do
    docker info >/dev/null 2>&1 && break
    sleep 1
  done
fi
if docker info >/dev/null 2>&1; then
  echo "- Docker läuft."
else
  echo "- Docker ließ sich nicht starten. Ohne Docker geht nur 'pnpm verify:schnell'."
fi

if pnpm install --frozen-lockfile --prefer-offline >> "$LOG" 2>&1; then
  echo "- Abhängigkeiten installiert."
else
  echo "- 'pnpm install' ist gescheitert, siehe tmp/sitzung-start.log."
fi

if docker info >/dev/null 2>&1; then
  (nohup pnpm exec supabase start \
    -x studio,imgproxy,logflare,vector,mailpit,supavisor,edge-runtime >> "$LOG" 2>&1 &)
  echo "- Der Supabase-Stack startet im Hintergrund (ein bis zwei Minuten, ohne Edge Runtime)."
  echo "  Bereit, sobald 'pnpm exec supabase status' die API-Adresse nennt. Dann läuft 'pnpm verify:ci'."
fi

echo "- E2E läuft in Cloud-Sitzungen nicht. Das Ergebnis kommt aus dem CI-Job 'e2e' des PRs."
exit 0
