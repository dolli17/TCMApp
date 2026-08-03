#!/usr/bin/env bash
#
# Baut die Web-App, startet sie neu und laesst die End-to-End-Tests laufen.
#
# Die Verkettung ist Absicht: einmal liefen die Tests gegen einen veralteten
# Server, weil der Build fehlgeschlagen war und der alte Prozess auf Port 3000
# weiterlief. Die gemeldeten Fehler existierten im aktuellen Stand gar nicht.
# Bricht der Build ab, laufen hier auch keine Tests.

set -euo pipefail

WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$WURZEL/apps/web"

# shellcheck disable=SC1091
set -a; source "$WURZEL/.env"; set +a

echo "== Build =="
if ! pnpm build > /tmp/tcm-build.log 2>&1; then
  echo "Build fehlgeschlagen:"
  tail -25 /tmp/tcm-build.log
  exit 1
fi
echo "Build ok"

echo "== Server neu starten =="
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
sleep 1
nohup pnpm start > /tmp/tcm-web.log 2>&1 &

for i in $(seq 1 40); do
  if curl -s -o /dev/null http://localhost:3000/login; then
    echo "bereit nach ${i}s"
    break
  fi
  sleep 1
done

echo "== End-to-End =="
npx playwright test "$@"
