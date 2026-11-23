#!/usr/bin/env bash
#
# Fährt den Supabase-Stack in einer Cloud-Sitzung hoch und wartet, bis er
# läuft. Lokal nimmt man "pnpm db:start"; dieses Skript ist für Sitzungen mit
# CLAUDE_CODE_REMOTE=true gedacht.
#
#   bash scripts/claude/stack-cloud.sh
#
# Warum nicht "pnpm db:start": Das startet die Edge Runtime mit, und die
# scheitert in der Cloud-Sandbox am Limit für offene Dateien ("error setting
# rlimit"). Die Dienstliste hier ist die des CI-Jobs "verify".
#
# Das Skript darf beliebig oft laufen:
#   - Läuft der Stack schon, meldet es das und endet.
#   - Läuft gerade ein anderer Aufruf (etwa der vom Sitzungsstart), wartet es
#     auf dessen Ergebnis, statt einen zweiten Start danebenzusetzen. Zwei
#     Starts zugleich streiten sich um dieselben Ports.
#   - Scheitert ein Start, räumt es die halb gestarteten Container ab und
#     versucht es erneut. Beim Probelauf am 23.11.2026 lieferte die Registry
#     mehrfach "Data limit exceeded", und der folgende Versuch scheiterte an
#     Port 54322, den der abgebrochene noch hielt.
#
# Ausgabe: eine Zeile mit dem Ergebnis, Einzelheiten in tmp/stack-cloud.log.
# Exit 0, wenn der Stack läuft, sonst 1.

set -uo pipefail

WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$WURZEL" || exit 1
mkdir -p tmp
LOG="$WURZEL/tmp/stack-cloud.log"
SPERRE="$WURZEL/tmp/stack-cloud.sperre"
AUSSER="studio,imgproxy,logflare,vector,mailpit,supavisor,edge-runtime"
VERSUCHE="${STACK_VERSUCHE:-3}"
WARTEN_HOECHSTENS="${STACK_WARTEN_SEKUNDEN:-600}"

laeuft() {
  pnpm exec supabase status -o env 2>/dev/null | grep -q '^API_URL='
}

if laeuft; then
  echo "Der Supabase-Stack läuft."
  exit 0
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker läuft nicht. Ohne Docker geht nur 'pnpm verify:schnell'." >&2
  exit 1
fi

# Sperre: mkdir gelingt nur einem. Wer sie nicht bekommt, wartet auf den, der
# sie hält. Eine Sperre, deren Prozess nicht mehr lebt, wird übernommen.
if ! mkdir "$SPERRE" 2>/dev/null; then
  ANDERER="$(cat "$SPERRE/pid" 2>/dev/null || true)"
  if [ -n "$ANDERER" ] && kill -0 "$ANDERER" 2>/dev/null; then
    echo "Ein anderer Start läuft bereits (PID $ANDERER), warte auf sein Ergebnis ..."
    GEWARTET=0
    while kill -0 "$ANDERER" 2>/dev/null && [ "$GEWARTET" -lt "$WARTEN_HOECHSTENS" ]; do
      sleep 5
      GEWARTET=$((GEWARTET + 5))
    done
    if laeuft; then
      echo "Der Supabase-Stack läuft."
      exit 0
    fi
    if kill -0 "$ANDERER" 2>/dev/null; then
      echo "Der andere Start läuft nach ${WARTEN_HOECHSTENS} s noch. Siehe tmp/stack-cloud.log." >&2
      exit 1
    fi
    echo "Der andere Start ist gescheitert, neuer Versuch."
  fi
  rm -rf "$SPERRE"
  mkdir "$SPERRE" 2>/dev/null || { echo "Sperre tmp/stack-cloud.sperre lässt sich nicht anlegen." >&2; exit 1; }
fi
echo "$$" > "$SPERRE/pid"
trap 'rm -rf "$SPERRE"' EXIT

for NR in $(seq 1 "$VERSUCHE"); do
  echo "=== Versuch $NR von $VERSUCHE: $(date '+%H:%M:%S') ===" >> "$LOG"
  if pnpm exec supabase start -x "$AUSSER" >> "$LOG" 2>&1 && laeuft; then
    echo "Der Supabase-Stack läuft (ohne Edge Runtime, Versuch $NR)."
    exit 0
  fi
  # Halb gestartete Container halten ihre Ports fest. Erst abräumen, dann neu.
  pnpm exec supabase stop --no-backup >> "$LOG" 2>&1 || true
  sleep 5
done

echo "Der Supabase-Stack ist nach $VERSUCHE Versuchen nicht gestartet. Letzte Zeilen aus tmp/stack-cloud.log:" >&2
tail -n 5 "$LOG" >&2
exit 1
