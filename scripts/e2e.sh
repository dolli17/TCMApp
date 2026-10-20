#!/usr/bin/env bash
#
# Baut die Web-App, startet sie neu und laesst die End-to-End-Tests laufen,
# immer gegen den lokalen Supabase-Stack.
#
# Die Verkettung ist Absicht: einmal liefen die Tests gegen einen veralteten
# Server, weil der Build fehlgeschlagen war und der alte Prozess auf Port 3000
# weiterlief. Die gemeldeten Fehler existierten im aktuellen Stand gar nicht.
# Bricht der Build ab, laufen hier auch keine Tests.

set -euo pipefail

WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$WURZEL/apps/web"

# Nur der lokale Stack, nie Dev oder Prod (T1). Die Root-.env zeigt auf die
# Cloud und wird hier bewusst NICHT geladen. .env.local wird exportiert und
# ueberschreibt damit auch Cloud-Adressen, die in der Shell stehen.
ENV_LOKAL="$WURZEL/apps/web/.env.local"
if [ ! -f "$ENV_LOKAL" ]; then
  echo "Abbruch: $ENV_LOKAL fehlt (siehe scripts/worktree-einrichten.sh)." >&2
  exit 1
fi
# shellcheck disable=SC1090
set -a; source "$ENV_LOKAL"; set +a

case "${NEXT_PUBLIC_SUPABASE_URL:-}" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *)
    echo "Abbruch: NEXT_PUBLIC_SUPABASE_URL zeigt nicht auf den lokalen Stack:" >&2
    echo "  ${NEXT_PUBLIC_SUPABASE_URL:-(nicht gesetzt)}" >&2
    echo "E2E laeuft nur gegen 127.0.0.1/localhost, nie gegen Dev oder Prod." >&2
    exit 1
    ;;
esac

if ! curl -s -o /dev/null "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/health"; then
  echo "Abbruch: lokaler Stack unter $NEXT_PUBLIC_SUPABASE_URL antwortet nicht (pnpm db:start)." >&2
  exit 1
fi

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
