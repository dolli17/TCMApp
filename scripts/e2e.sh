#!/usr/bin/env bash
# Baut, startet und testet in einem Rutsch. Bricht ab, wenn der Build fehlschlaegt -
# sonst laufen die Tests gegen einen veralteten Server und melden Fehler, die
# es im aktuellen Stand gar nicht gibt.
set -euo pipefail
cd "20 20 12 61 79 80 81 98 264 701 33 100 204 250 395 398 399 400dirname "-e")/../apps/web"
set -a; source ../../.env; set +a

echo "== Build =="
pnpm build > /tmp/build.log 2>&1 || { tail -25 /tmp/build.log; exit 1; }
echo "Build ok"

echo "== Server neu starten =="
lsof -ti:3000 | xargs -r kill -9 2>/dev/null || true
sleep 1
nohup pnpm start > /tmp/tcmweb.log 2>&1 &
for i in $(seq 1 40); do
  curl -s -o /dev/null http://localhost:3000/login && { echo "bereit nach ${i}s"; break; }
  sleep 1
done

echo "== End-to-End =="
npx playwright test "$@"
