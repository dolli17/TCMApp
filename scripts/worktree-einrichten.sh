#!/bin/bash
# Richtet einen frischen Git-Worktree (z. B. aus "herdr worktree create") zum
# Arbeiten ein: kopiert die gitignorten Env-Dateien aus dem Haupt-Checkout und
# installiert die Abhängigkeiten.
#
#   scripts/worktree-einrichten.sh            # im Worktree aufrufen
#   scripts/worktree-einrichten.sh <pfad>     # oder mit Pfad zum Worktree
#
# Vorhandene Env-Dateien im Worktree werden nicht überschrieben.
set -euo pipefail

ZIEL="$(cd "${1:-.}" && git rev-parse --show-toplevel)"
# Der erste Eintrag von "git worktree list" ist immer der Haupt-Checkout.
HAUPT="$(git -C "$ZIEL" worktree list --porcelain | sed -n '1s/^worktree //p')"

if [ "$ZIEL" = "$HAUPT" ]; then
  echo "Das ist der Haupt-Checkout - hier gibt es nichts einzurichten." >&2
  exit 1
fi

echo "Worktree:      $ZIEL ($(git -C "$ZIEL" branch --show-current))"
echo "Env-Dateien aus $HAUPT"
for datei in .env apps/web/.env.local apps/mobile/.env; do
  if [ ! -f "$HAUPT/$datei" ]; then
    echo "  -  $datei fehlt auch im Haupt-Checkout"
  elif [ -f "$ZIEL/$datei" ]; then
    echo "  =  $datei schon vorhanden, bleibt"
  else
    cp "$HAUPT/$datei" "$ZIEL/$datei"
    echo "  +  $datei"
  fi
done

echo "Abhängigkeiten installieren ..."
(cd "$ZIEL" && pnpm install --frozen-lockfile --prefer-offline --reporter=silent)

cat <<'HINWEIS'

Fertig. Beim parallelen Arbeiten beachten (CONTRIBUTING.md, "Parallel arbeiten"):
  - Die lokale Supabase gibt es nur einmal für alle Worktrees: kein "db reset"
    oder pgTAP/E2E, während ein anderer Worktree die Datenbank nutzt.
  - Web und Expo brauchen eigene Ports: pnpm dev -- -p 3001, expo start --port 8082
HINWEIS
