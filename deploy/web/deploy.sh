#!/bin/bash
# Bringt den Stand von origin/main auf den Server und startet die Web-App neu.
#
#   ./deploy/web/deploy.sh
#
# Laeuft vom Mac aus (per SSH) oder direkt auf dem Server, etwa aus dem
# Claude-Agenten dort (Benutzer in der Gruppe docker).
#
# Gebaut wird auf dem Server aus dem GitHub-Repo - was nicht gepusht ist,
# kommt also nicht an. Deshalb bricht das Skript ab, wenn main lokal vor
# origin/main liegt.
set -euo pipefail

SERVER="${TCM_SERVER:-root@187.124.4.243}"
ZIEL=/docker/tcm-web

git fetch -q origin main
if [ -n "$(git rev-list origin/main..main)" ]; then
  echo "main enthaelt ungepushte Commits - erst pushen." >&2
  exit 1
fi
echo "Deploye $(git rev-parse --short origin/main): $(git log -1 --format=%s origin/main)"

# Auf dem Server selbst laeuft alles direkt, sonst per SSH.
if [ "$SERVER" = local ] || [ -d "$ZIEL/src" ]; then
  ausfuehren() { bash -s; }
else
  ausfuehren() { ssh "$SERVER" bash -s; }
fi

ausfuehren <<ENTFERNT
set -euo pipefail
cd $ZIEL/src
git fetch -q origin main
git reset -q --hard origin/main
cd $ZIEL
# Pfade in der Compose-Datei gelten relativ zu ihr selbst (Build-Kontext ist
# der Checkout), die Werte kommen aus der .env daneben.
docker compose --project-name tcm-web --env-file $ZIEL/.env \
  -f src/deploy/web/docker-compose.yml up -d --build --wait
docker image prune -f >/dev/null
grep ^APP_DOMAIN= $ZIEL/.env | cut -d= -f2 > /tmp/tcm-web-domain
ENTFERNT

DOMAIN="$(echo 'cat /tmp/tcm-web-domain' | ausfuehren)"
curl -fsS -o /dev/null -w "https://$DOMAIN/login -> %{http_code}\n" "https://$DOMAIN/login" \
  || echo "Achtung: https://$DOMAIN/login antwortet nicht." >&2
