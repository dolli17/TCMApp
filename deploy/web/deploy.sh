#!/bin/bash
# Bringt den Stand von origin/main auf den Server und startet die Web-App neu.
#
#   ./deploy/web/deploy.sh
#
# Gebaut wird auf dem Server aus dem oeffentlichen GitHub-Repo - was nicht
# gepusht ist, kommt also nicht an. Deshalb bricht das Skript ab, wenn main
# lokal vor origin/main liegt.
set -euo pipefail

SERVER="${TCM_SERVER:-root@187.124.4.243}"
ZIEL=/docker/tcm-web

git fetch -q origin main
if [ -n "$(git rev-list origin/main..main)" ]; then
  echo "main enthaelt ungepushte Commits - erst pushen." >&2
  exit 1
fi
echo "Deploye $(git rev-parse --short origin/main): $(git log -1 --format=%s origin/main)"

ssh "$SERVER" bash -s <<ENTFERNT
set -euo pipefail
cd $ZIEL/src
git fetch -q origin main
git reset -q --hard origin/main
cd $ZIEL
docker compose --project-name tcm-web --project-directory $ZIEL \
  -f src/deploy/web/docker-compose.yml up -d --build --wait
docker image prune -f >/dev/null
ENTFERNT

DOMAIN="$(ssh "$SERVER" "grep ^APP_DOMAIN= $ZIEL/.env | cut -d= -f2")"
curl -fsS -o /dev/null -w "https://$DOMAIN/login -> %{http_code}\n" "https://$DOMAIN/login" \
  || echo "Achtung: https://$DOMAIN/login antwortet nicht (DNS schon umgestellt?)" >&2
