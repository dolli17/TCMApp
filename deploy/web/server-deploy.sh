#!/bin/bash
# Baut einen bestimmten Commit der Web-App auf dem Server und startet sie neu.
#
#   server-deploy.sh dev|prod <commit-sha>
#
# Liegt auf dem Server als /usr/local/bin/tcm-deploy und ist dort der
# Forced-Command des Deploy-Schlüssels von GitHub Actions:
#
#   command="/usr/local/bin/tcm-deploy",restrict ssh-ed25519 AAAA... github-actions
#
# Die Argumente kommen dann aus SSH_ORIGINAL_COMMAND. Mehr als Umgebung und
# Commit nimmt das Skript nicht an - der Schlüssel kann also nichts anderes
# auslösen. Vom Mac aus ruft deploy/web/deploy.sh es ebenfalls auf.
set -euo pipefail

if [ -n "${SSH_ORIGINAL_COMMAND:-}" ]; then
  # shellcheck disable=SC2086 # bewusst an Leerzeichen aufteilen
  set -- $SSH_ORIGINAL_COMMAND
fi

UMGEBUNG="${1:-}"
SHA="${2:-}"

# Verzeichnis und Compose-Projekt je Umgebung. Dev ist bis zum Umzug
# (docs/goLive.md, Schritt 4) der bisherige Container unter /docker/tcm-web.
case "$UMGEBUNG" in
  dev)  ZIEL=/docker/tcm-web;      PROJEKT=tcm-web ;;
  prod) ZIEL=/docker/tcm-web-prod; PROJEKT=tcm-web-prod ;;
  *) echo "Umgebung muss dev oder prod sein, nicht '$UMGEBUNG'." >&2; exit 2 ;;
esac
if ! [[ "$SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Zweites Argument muss ein vollständiger Commit-SHA sein." >&2
  exit 2
fi
if [ ! -d "$ZIEL/src" ] || [ ! -f "$ZIEL/.env" ]; then
  echo "$ZIEL ist nicht eingerichtet (src/ und .env fehlen)." >&2
  exit 1
fi

cd "$ZIEL/src"
git fetch -q origin
git checkout -q --detach "$SHA"
echo "$UMGEBUNG: baue $(git log -1 --format='%h %s')"

cd "$ZIEL"
# Pfade in der Compose-Datei gelten relativ zu ihr selbst (Build-Kontext ist
# der Checkout), die Werte kommen aus der .env daneben.
docker compose --project-name "$PROJEKT" --env-file "$ZIEL/.env" \
  -f src/deploy/web/docker-compose.yml up -d --build --wait
docker image prune -f >/dev/null
echo "$UMGEBUNG läuft mit $SHA."
