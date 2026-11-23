#!/usr/bin/env bash
#
# Baut die Web-App, startet sie neu und laesst die End-to-End-Tests laufen,
# immer gegen den lokalen Supabase-Stack.
#
# Die Verkettung ist Absicht: einmal liefen die Tests gegen einen veralteten
# Server, weil der Build fehlgeschlagen war und der alte Prozess auf Port 3000
# weiterlief. Die gemeldeten Fehler existierten im aktuellen Stand gar nicht.
# Bricht der Build ab, laufen hier auch keine Tests.
#
#   pnpm e2e                      # alles
#   pnpm e2e --project=chromium   # Argumente gehen an Playwright weiter

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

# Logs und PID-Datei liegen im eigenen Worktree (tmp/ ist gitignored), nicht
# unter /tmp: dort ueberschrieben sich parallele Worktrees gegenseitig.
ABLAGE="$WURZEL/tmp/e2e"
mkdir -p "$ABLAGE"
BUILD_LOG="$ABLAGE/build.log"
WEB_LOG="$ABLAGE/web.log"
PID_DATEI="$ABLAGE/web.pid"

# Der Port ist fest: die lokale Auth (supabase/config.toml, site_url und
# additional_redirect_urls) kennt nur localhost:3000, die Links in den
# Einladungs- und Passwort-Mails zeigen dorthin.
PORT=3000

echo "== Alten Server beenden =="
# Nur den Server beenden, den ein frueherer Lauf aus DIESEM Worktree gestartet
# hat. Frueher stand hier "kill -9" auf alles an Port 3000 - das traf auch den
# Server einer anderen Sitzung in einem anderen Worktree.
lauscht() { lsof -ti:"$PORT" -sTCP:LISTEN 2>/dev/null | head -1 || true; }

if [ -f "$PID_DATEI" ]; then
  ALT="$(cat "$PID_DATEI")"
  if [ -n "$ALT" ] && [ "$(lauscht)" = "$ALT" ]; then
    kill "$ALT" 2>/dev/null || true
    for _ in $(seq 1 10); do
      [ -z "$(lauscht)" ] && break
      sleep 0.5
    done
    [ "$(lauscht)" = "$ALT" ] && kill -9 "$ALT" 2>/dev/null || true
  fi
  rm -f "$PID_DATEI"
fi

FREMD="$(lauscht)"
if [ -n "$FREMD" ]; then
  if [ "${E2E_PORT_FREIMACHEN:-}" = 1 ]; then
    echo "Port $PORT belegt von PID $FREMD - wird beendet (E2E_PORT_FREIMACHEN=1)."
    kill -9 "$FREMD" 2>/dev/null || true
    sleep 1
  else
    echo "Abbruch: Port $PORT ist belegt von einem Prozess, den dieser Worktree nicht gestartet hat:" >&2
    ps -o pid=,command= -p "$FREMD" >&2 || true
    echo "Den Prozess selbst beenden oder mit E2E_PORT_FREIMACHEN=1 erneut starten." >&2
    exit 1
  fi
fi

echo "== Build =="
if ! pnpm build > "$BUILD_LOG" 2>&1; then
  echo "Build fehlgeschlagen ($BUILD_LOG):"
  tail -25 "$BUILD_LOG"
  exit 1
fi
echo "Build ok"

echo "== Server starten =="
PORT="$PORT" nohup pnpm start > "$WEB_LOG" 2>&1 &

BEREIT=0
for i in $(seq 1 40); do
  if curl -s -o /dev/null "http://localhost:$PORT/login"; then
    echo "bereit nach ${i}s"
    BEREIT=1
    break
  fi
  sleep 1
done
if [ "$BEREIT" != 1 ]; then
  echo "Abbruch: der Server antwortet nach 40 s nicht ($WEB_LOG):" >&2
  tail -25 "$WEB_LOG" >&2
  exit 1
fi
# Die PID des Prozesses, der wirklich lauscht (next), nicht die von pnpm.
lauscht > "$PID_DATEI"

echo "== End-to-End =="
npx playwright test "$@"
